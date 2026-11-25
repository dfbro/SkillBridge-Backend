import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { careerGoals } from "../../db/schema";
import type { AppEnv } from "../../shared/types";

const goalInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  isPrimary: z.boolean().default(false),
});
export const goalsInput = z.array(goalInput).min(1).max(5).refine((goals) => goals.filter((goal) => goal.isPrimary).length === 1, "Exactly one career goal must be primary").openapi("ReplaceCareerGoalsRequest");
const goalResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const goalsResponse = z.object({ success: z.literal(true), data: z.array(goalResponse) }).openapi("CareerGoalsResponse");
const errorResponse = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });

export const careerGoalsRoutes = new OpenAPIHono<AppEnv>();

careerGoalsRoutes.openapi(createRoute({
  method: "get",
  path: "/me/career-goals",
  tags: ["Career Goals"],
  summary: "List the authenticated user's career goals",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "Career goals", content: { "application/json": { schema: goalsResponse } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const rows = await c.get("db").select().from(careerGoals).where(eq(careerGoals.userId, c.get("user").id)).orderBy(careerGoals.createdAt);
  return c.json({ success: true as const, data: rows.map((row) => ({
    id: row.id, title: row.title, description: row.description, isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  })) }, 200);
});

careerGoalsRoutes.openapi(createRoute({
  method: "delete",
  path: "/me/career-goals/{goalId}",
  tags: ["Career Goals"],
  summary: "Delete a non-primary career goal",
  security: [{ BearerAuth: [] }],
  request: { params: z.object({ goalId: z.string().uuid() }) },
  responses: {
    200: { description: "Career goal deleted", content: { "application/json": { schema: z.object({ success: z.literal(true), data: z.object({ id: z.string().uuid() }) }) } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    404: { description: "Career goal not found", content: { "application/json": { schema: errorResponse } } },
    409: { description: "Primary goal must be replaced through PUT before deletion", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const { goalId } = c.req.valid("param");
  const userId = c.get("user").id;
  const [goal] = await c.get("db").select().from(careerGoals)
    .where(and(eq(careerGoals.id, goalId), eq(careerGoals.userId, userId))).limit(1);
  if (!goal) return c.json({ success: false as const, error: { code: "CAREER_GOAL_NOT_FOUND", message: "Career goal not found." } }, 404);
  if (goal.isPrimary) return c.json({ success: false as const, error: { code: "PRIMARY_GOAL_REQUIRES_REPLACEMENT", message: "Replace the career goal list through PUT before deleting the primary goal." } }, 409);
  await c.get("db").delete(careerGoals).where(and(eq(careerGoals.id, goalId), eq(careerGoals.userId, userId)));
  return c.json({ success: true as const, data: { id: goalId } }, 200);
});

careerGoalsRoutes.openapi(createRoute({
  method: "put",
  path: "/me/career-goals",
  tags: ["Career Goals"],
  summary: "Replace the authenticated user's career goals",
  security: [{ BearerAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: goalsInput } } } },
  responses: {
    200: { description: "Career goals replaced", content: { "application/json": { schema: goalsResponse } } },
    400: { description: "Invalid career goals", content: { "application/json": { schema: errorResponse } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const goals = c.req.valid("json");
  const result = await c.get("db").transaction(async (tx) => {
    await tx.delete(careerGoals).where(eq(careerGoals.userId, userId));
    return tx.insert(careerGoals).values(goals.map((goal) => ({ ...goal, userId }))).returning();
  });
  return c.json({ success: true as const, data: result.map((row) => ({
    id: row.id, title: row.title, description: row.description, isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  })) }, 200);
});
