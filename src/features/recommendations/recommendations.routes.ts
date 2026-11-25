import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { careerGoals, missions, submissions } from "../../db/schema";
import type { AppEnv } from "../../shared/types";
import { buildMissionRecommendations } from "./recommendations.logic";

export const recommendationsRoutes = new OpenAPIHono<AppEnv>();

const errorResponse = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });
const recommendationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    generatedAt: z.string(),
    method: z.literal("career_goal_keyword_overlap_with_catalog_fallback"),
    note: z.string(),
    recommendations: z.array(z.object({
      missionId: z.string().uuid(),
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      basis: z.enum(["career_goal_match", "catalog_exploration"]),
      careerGoal: z.string().nullable(),
      matchedTerms: z.array(z.string()),
      reason: z.string(),
    })),
  }),
}).openapi("MissionRecommendationsResponse");

recommendationsRoutes.openapi(createRoute({
  method: "get",
  path: "/me/recommendations",
  tags: ["Mission Recommendations"],
  summary: "Recommend published missions with explainable rule-based reasons",
  description: "Uses career-goal keyword overlap and a published-catalog exploration fallback. This is an optional practice suggestion, not a career-fit or employment prediction.",
  security: [{ BearerAuth: [] }],
  request: { query: z.object({ limit: z.coerce.number().int().min(1).max(10).default(5) }) },
  responses: {
    200: { description: "Explainable published mission recommendations", content: { "application/json": { schema: recommendationResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const limit = c.req.valid("query").limit;
  const db = c.get("db");

  const goals = await db.select({
    id: careerGoals.id,
    title: careerGoals.title,
    description: careerGoals.description,
    isPrimary: careerGoals.isPrimary,
  }).from(careerGoals)
    .where(eq(careerGoals.userId, userId))
    .orderBy(desc(careerGoals.isPrimary), careerGoals.createdAt);

  const publishedMissions = await db.select({
    id: missions.id,
    slug: missions.slug,
    title: missions.title,
    summary: missions.summary,
    createdAt: missions.createdAt,
  }).from(missions)
    .where(eq(missions.status, "published"))
    .orderBy(desc(missions.createdAt))
    .limit(200);

  const attemptedRows = await db.selectDistinct({ missionId: submissions.missionId })
    .from(submissions).where(eq(submissions.userId, userId));
  const attemptedMissionIds = new Set(attemptedRows.map((row) => row.missionId));
  const recommendations = buildMissionRecommendations(publishedMissions, goals, attemptedMissionIds, limit);

  return c.json({ success: true as const, data: {
    generatedAt: new Date().toISOString(),
    method: "career_goal_keyword_overlap_with_catalog_fallback" as const,
    note: "These are optional practice suggestions based on published mission descriptions and your saved goals. They are not career-fit or employment predictions.",
    recommendations,
  } }, 200);
});
