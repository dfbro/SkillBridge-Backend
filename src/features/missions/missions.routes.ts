import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { missions, rubricCriteria, rubricVersions } from "../../db/schema";
import type { AppEnv } from "../../shared/types";

export const missionsRoutes = new OpenAPIHono<AppEnv>();
const missionSummary = z.object({
  id: z.string().uuid(), slug: z.string(), title: z.string(), summary: z.string(), status: z.string(),
}).openapi("MissionSummary");
const missionListResponse = z.object({ success: z.literal(true), data: z.array(missionSummary) }).openapi("MissionListResponse");
const missionDetailResponse = z.object({
  success: z.literal(true),
  data: missionSummary.extend({
    instructions: z.string(),
    rubric: z.object({ version: z.number(), criteria: z.array(z.object({ key: z.string(), title: z.string(), description: z.string(), maxScore: z.number(), weight: z.number() })) }).nullable(),
  }),
}).openapi("MissionDetailResponse");
const errorResponse = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });

missionsRoutes.openapi(createRoute({
  method: "get", path: "/missions", tags: ["Missions"], summary: "List published missions",
  request: { query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) },
  responses: { 200: { description: "Published missions", content: { "application/json": { schema: missionListResponse } } } },
}), async (c) => {
  const { limit } = c.req.valid("query");
  const rows = await c.get("db").select({ id: missions.id, slug: missions.slug, title: missions.title, summary: missions.summary, status: missions.status })
    .from(missions).where(eq(missions.status, "published")).orderBy(desc(missions.createdAt)).limit(limit);
  return c.json({ success: true as const, data: rows }, 200);
});

missionsRoutes.openapi(createRoute({
  method: "get", path: "/missions/{missionId}", tags: ["Missions"], summary: "Get a published mission and its current rubric",
  request: { params: z.object({ missionId: z.string().uuid() }) },
  responses: {
    200: { description: "Mission detail", content: { "application/json": { schema: missionDetailResponse } } },
    404: { description: "Mission not found", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const { missionId } = c.req.valid("param");
  const [mission] = await c.get("db").select().from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.status, "published"))).limit(1);
  if (!mission) return c.json({ success: false as const, error: { code: "MISSION_NOT_FOUND", message: "Published mission not found." } }, 404);
  const [version] = await c.get("db").select().from(rubricVersions)
    .where(and(eq(rubricVersions.missionId, missionId), eq(rubricVersions.status, "published")))
    .orderBy(desc(rubricVersions.version)).limit(1);
  const criteria = version ? await c.get("db").select().from(rubricCriteria).where(eq(rubricCriteria.rubricVersionId, version.id)) : [];
  return c.json({ success: true as const, data: {
    id: mission.id, slug: mission.slug, title: mission.title, summary: mission.summary, status: mission.status,
    instructions: mission.instructions,
    rubric: version ? { version: version.version, criteria: criteria.map((item) => ({ key: item.criterionKey, title: item.title, description: item.description, maxScore: item.maxScore, weight: item.weight })) } : null,
  } }, 200);
});
