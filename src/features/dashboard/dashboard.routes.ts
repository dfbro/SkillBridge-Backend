import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getStudentDashboard } from "./dashboard.service";
import type { AppEnv } from "../../shared/types";
import { resolveProgressionPolicy } from "../progression/progression.policy";

export const dashboardRoutes = new OpenAPIHono<AppEnv>();

const errorResponse = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

const dashboardResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    generatedAt: z.string(),
    summary: z.object({
      publishedMissionsAvailable: z.number().int(),
      startedMissions: z.number().int(),
      completedMissions: z.number().int(),
      totalSubmissions: z.number().int(),
      submissionStatuses: z.object({
        submitted: z.number().int(),
        assessmentPending: z.number().int(),
        needsReview: z.number().int(),
        completed: z.number().int(),
        assessmentFailed: z.number().int(),
      }),
      assessments: z.object({ total: z.number().int(), provisional: z.number().int(), finalized: z.number().int(), failed: z.number().int() }),
    }),
    progression: z.object({
      totalXp: z.number().int(),
      level: z.number().int(),
      currentStreak: z.number().int(),
      longestStreak: z.number().int(),
      policyStatus: z.enum(["provisional", "approved"]),
      dailyGoal: z.object({ targetXp: z.number().int(), earnedXp: z.number().int(), remainingXp: z.number().int(), completed: z.boolean(), activityDate: z.string(), timezone: z.string() }),
    }),
    recentSubmissions: z.array(z.object({
      id: z.string().uuid(),
      mission: z.object({ id: z.string().uuid(), slug: z.string(), title: z.string() }),
      status: z.string(),
      submittedAt: z.string(),
      assessment: z.object({ status: z.string(), isFinal: z.boolean() }).nullable(),
    })),
  }),
}).openapi("StudentDashboardResponse");

dashboardRoutes.openapi(createRoute({
  method: "get",
  path: "/me/dashboard",
  tags: ["Student Dashboard"],
  summary: "Get a source-backed student practice and progression summary",
  description: "Aggregates the authenticated user's submissions, assessment statuses, published mission count and learning progression. XP/level are displayed separately from rubric competency results.",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "Student dashboard", content: { "application/json": { schema: dashboardResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const data = await getStudentDashboard(
    c.get("db"),
    c.get("user").id,
    resolveProgressionPolicy(c.env.PROGRESSION_POLICY_JSON),
  );
  return c.json({ success: true as const, data }, 200);
});
