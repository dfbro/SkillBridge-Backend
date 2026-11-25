import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { missions, profiles, rubricVersions, submissions } from "../../db/schema";
import type { AppEnv } from "../../shared/types";

export const submissionsRoutes = new OpenAPIHono<AppEnv>();

const submissionResponse = z.object({
  id: z.string().uuid(), missionId: z.string().uuid(), rubricVersionId: z.string().uuid(),
  content: z.string(), status: z.string(), createdAt: z.string(),
}).openapi("Submission");
const submissionCreated = z.object({ success: z.literal(true), data: submissionResponse }).openapi("SubmissionCreatedResponse");
const submissionList = z.object({ success: z.literal(true), data: z.array(submissionResponse) }).openapi("SubmissionListResponse");
const errorResponse = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });
export const createSubmission = z.object({ content: z.string().trim().min(1).max(20000) }).openapi("CreateSubmissionRequest");

submissionsRoutes.openapi(createRoute({
  method: "post", path: "/missions/{missionId}/submissions", tags: ["Submissions"],
  summary: "Submit text work for a published mission", security: [{ BearerAuth: [] }],
  request: {
    params: z.object({ missionId: z.string().uuid() }),
    body: { required: true, content: { "application/json": { schema: createSubmission } } },
  },
  responses: {
    201: { description: "Submission created", content: { "application/json": { schema: submissionCreated } } },
    400: { description: "Invalid submission", content: { "application/json": { schema: errorResponse } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    404: { description: "Mission or active rubric not found", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const { missionId } = c.req.valid("param");
  const { content } = c.req.valid("json");
  const db = c.get("db");
  const [mission] = await db.select({ id: missions.id }).from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.status, "published"))).limit(1);
  if (!mission) return c.json({ success: false as const, error: { code: "MISSION_NOT_FOUND", message: "Published mission not found." } }, 404);
  const [rubric] = await db.select({ id: rubricVersions.id }).from(rubricVersions)
    .where(and(eq(rubricVersions.missionId, missionId), eq(rubricVersions.status, "published")))
    .orderBy(desc(rubricVersions.version)).limit(1);
  if (!rubric) return c.json({ success: false as const, error: { code: "RUBRIC_NOT_FOUND", message: "This mission has no published rubric." } }, 404);

  await db.insert(profiles).values({ id: userId }).onConflictDoNothing();
  const [row] = await db.insert(submissions).values({ userId, missionId, rubricVersionId: rubric.id, content }).returning();
  return c.json({ success: true as const, data: {
    id: row.id, missionId: row.missionId, rubricVersionId: row.rubricVersionId,
    content: row.content, status: row.status, createdAt: row.createdAt.toISOString(),
  } }, 201);
});

submissionsRoutes.openapi(createRoute({
  method: "get", path: "/me/submissions", tags: ["Submissions"],
  summary: "List the authenticated user's submissions", security: [{ BearerAuth: [] }],
  request: { query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) },
  responses: {
    200: { description: "Submission history", content: { "application/json": { schema: submissionList } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const rows = await c.get("db").select().from(submissions)
    .where(eq(submissions.userId, c.get("user").id)).orderBy(desc(submissions.createdAt))
    .limit(c.req.valid("query").limit);
  return c.json({ success: true as const, data: rows.map((row) => ({
    id: row.id, missionId: row.missionId, rubricVersionId: row.rubricVersionId,
    content: row.content, status: row.status, createdAt: row.createdAt.toISOString(),
  })) }, 200);
});
