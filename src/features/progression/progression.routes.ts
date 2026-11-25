import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { dailyActivities, learningPreferences, profiles, userAchievements, userProgress } from "../../db/schema";
import type { AppEnv } from "../../shared/types";
import { calculateStreak, getActivityDate, getRecentDates, isValidTimeZone } from "./progression.logic";
import { effectiveXpReward, resolveProgressionPolicy } from "./progression.policy";
import { ensureLearningPreferences, ensureUserProgress, listDailyActivities } from "./progression.service";

export const progressionRoutes = new OpenAPIHono<AppEnv>();

const errorResponse = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

export const preferencesSchema = z.object({
  dailyXpGoal: z.number().int().min(1).max(500),
  timezone: z.string().min(1).max(80).refine(isValidTimeZone, "Timezone must be a valid IANA timezone"),
}).openapi("LearningPreferences");

const preferencesResponseSchema = z.object({
  success: z.literal(true),
  data: preferencesSchema.extend({ updatedAt: z.string() }),
}).openapi("LearningPreferencesResponse");

const progressResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    totalXp: z.number().int(),
    level: z.number().int(),
    currentStreak: z.number().int(),
    longestStreak: z.number().int(),
    lastActivityDate: z.string().nullable(),
    dailyGoal: z.object({
      targetXp: z.number().int(),
      earnedXp: z.number().int(),
      remainingXp: z.number().int(),
      completed: z.boolean(),
      activityDate: z.string(),
      timezone: z.string(),
    }),
    policyStatus: z.enum(["provisional", "approved"]),
  }),
}).openapi("LearningProgressResponse");

const activityResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    date: z.string(), xpEarned: z.number().int(), submissionsCompleted: z.number().int(),
  })),
}).openapi("DailyActivityHistoryResponse");

const achievementResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    code: z.string(), title: z.string(), description: z.string(), metric: z.string(),
    threshold: z.number().int(), unlocked: z.boolean(), unlockedAt: z.string().nullable(),
  })),
}).openapi("AchievementsResponse");

const policyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(["provisional", "approved"]),
    xpRewards: z.record(z.string(), z.number().int()),
    activeXpRewards: z.record(z.string(), z.number().int()),
    defaultTimezone: z.string(),
    defaultDailyXpGoal: z.number().int(),
    minimumDailyXpGoal: z.number().int(),
    maximumDailyXpGoal: z.number().int(),
    streakGraceDays: z.number().int(),
    levelThresholds: z.array(z.number().int()),
    achievements: z.array(z.object({
      code: z.string(), title: z.string(), description: z.string(), metric: z.string(), threshold: z.number().int(),
    })),
  }),
}).openapi("ProgressionPolicyResponse");

function getPolicy(c: { env: AppEnv["Bindings"] }) {
  return resolveProgressionPolicy(c.env.PROGRESSION_POLICY_JSON);
}

async function ensureProfile(db: AppEnv["Variables"]["db"], userId: string) {
  await db.insert(profiles).values({ id: userId }).onConflictDoNothing();
}

progressionRoutes.openapi(createRoute({
  method: "get",
  path: "/progression/policy",
  tags: ["Learning Progress"],
  summary: "Read the current learning progression rules and provisional values",
  responses: {
    200: { description: "Progression rules; provisional rewards are not active", content: { "application/json": { schema: policyResponseSchema } } },
  },
}), (c) => {
  const policy = getPolicy(c);
  const activeXpRewards = Object.fromEntries(Object.keys(policy.xpRewards).map((key) => [key, effectiveXpReward(policy, key)]));
  return c.json({ success: true as const, data: {
    status: policy.status,
    xpRewards: policy.xpRewards,
    activeXpRewards,
    defaultTimezone: policy.defaultTimezone,
    defaultDailyXpGoal: policy.defaultDailyXpGoal,
    minimumDailyXpGoal: policy.minimumDailyXpGoal,
    maximumDailyXpGoal: policy.maximumDailyXpGoal,
    streakGraceDays: policy.streakGraceDays,
    levelThresholds: policy.levelThresholds,
    achievements: policy.achievements,
  } }, 200);
});

progressionRoutes.openapi(createRoute({
  method: "get",
  path: "/me/learning-preferences",
  tags: ["Learning Progress"],
  summary: "Get the authenticated user's daily XP goal and timezone",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "Learning preferences", content: { "application/json": { schema: preferencesResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const policy = getPolicy(c);
  await ensureProfile(c.get("db"), userId);
  const preferences = await ensureLearningPreferences(c.get("db"), userId, policy);
  return c.json({ success: true as const, data: {
    dailyXpGoal: preferences.dailyXpGoal,
    timezone: preferences.timezone,
    updatedAt: preferences.updatedAt.toISOString(),
  } }, 200);
});

progressionRoutes.openapi(createRoute({
  method: "put",
  path: "/me/learning-preferences",
  tags: ["Learning Progress"],
  summary: "Update the authenticated user's daily XP goal and timezone",
  security: [{ BearerAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: preferencesSchema } } } },
  responses: {
    200: { description: "Learning preferences updated", content: { "application/json": { schema: preferencesResponseSchema } } },
    400: { description: "Invalid preference values", content: { "application/json": { schema: errorResponse } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const policy = getPolicy(c);
  const body = c.req.valid("json");
  if (body.dailyXpGoal < policy.minimumDailyXpGoal || body.dailyXpGoal > policy.maximumDailyXpGoal) {
    return c.json({ success: false as const, error: {
      code: "DAILY_GOAL_OUT_OF_RANGE",
      message: `Daily XP goal must be between ${policy.minimumDailyXpGoal} and ${policy.maximumDailyXpGoal}.`,
    } }, 400);
  }
  const db = c.get("db");
  await ensureProfile(db, userId);
  await db.insert(learningPreferences).values({ userId, ...body })
    .onConflictDoUpdate({
      target: learningPreferences.userId,
      set: { ...body, updatedAt: new Date() },
    });
  const [preferences] = await db.select().from(learningPreferences)
    .where(eq(learningPreferences.userId, userId)).limit(1);
  return c.json({ success: true as const, data: {
    dailyXpGoal: preferences.dailyXpGoal,
    timezone: preferences.timezone,
    updatedAt: preferences.updatedAt.toISOString(),
  } }, 200);
});

progressionRoutes.openapi(createRoute({
  method: "get",
  path: "/me/progress",
  tags: ["Learning Progress"],
  summary: "Get XP, level, streak and daily goal progress",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "Learning progress snapshot", content: { "application/json": { schema: progressResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const policy = getPolicy(c);
  const db = c.get("db");
  await ensureProfile(db, userId);
  const preferences = await ensureLearningPreferences(db, userId, policy);
  const progress = await ensureUserProgress(db, userId);
  const activityDate = getActivityDate(new Date(), preferences.timezone);
  const [today] = await db.select().from(dailyActivities).where(and(
    eq(dailyActivities.userId, userId), eq(dailyActivities.activityDate, activityDate),
  )).limit(1);
  const activityDays = await db.select({ activityDate: dailyActivities.activityDate })
    .from(dailyActivities).where(eq(dailyActivities.userId, userId));
  const streak = calculateStreak(activityDays.map((day) => day.activityDate), activityDate, policy.streakGraceDays);
  const earnedXp = today?.xpEarned ?? 0;
  return c.json({ success: true as const, data: {
    totalXp: progress.totalXp,
    level: progress.level,
    currentStreak: streak.current,
    longestStreak: Math.max(progress.longestStreak, streak.longest),
    lastActivityDate: progress.lastActivityDate,
    dailyGoal: {
      targetXp: preferences.dailyXpGoal,
      earnedXp,
      remainingXp: Math.max(0, preferences.dailyXpGoal - earnedXp),
      completed: earnedXp >= preferences.dailyXpGoal,
      activityDate,
      timezone: preferences.timezone,
    },
    policyStatus: policy.status,
  } }, 200);
});

progressionRoutes.openapi(createRoute({
  method: "get",
  path: "/me/activity",
  tags: ["Learning Progress"],
  summary: "Get timezone-aware daily practice activity history",
  security: [{ BearerAuth: [] }],
  request: { query: z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }) },
  responses: {
    200: { description: "Daily activity history", content: { "application/json": { schema: activityResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const userId = c.get("user").id;
  const policy = getPolicy(c);
  const db = c.get("db");
  await ensureProfile(db, userId);
  const preferences = await ensureLearningPreferences(db, userId, policy);
  const today = getActivityDate(new Date(), preferences.timezone);
  const dates = getRecentDates(today, c.req.valid("query").days);
  const rows = await listDailyActivities(db, userId, dates[0], dates.at(-1) ?? today);
  const byDate = new Map(rows.map((row) => [row.activityDate, row]));
  return c.json({ success: true as const, data: dates.map((date) => ({
    date,
    xpEarned: byDate.get(date)?.xpEarned ?? 0,
    submissionsCompleted: byDate.get(date)?.submissionsCompleted ?? 0,
  })) }, 200);
});

progressionRoutes.openapi(createRoute({
  method: "get",
  path: "/me/achievements",
  tags: ["Learning Progress"],
  summary: "List the authenticated user's unlocked and available achievements",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "Achievement catalogue and unlock state", content: { "application/json": { schema: achievementResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const policy = getPolicy(c);
  const unlockedRows = await c.get("db").select().from(userAchievements)
    .where(eq(userAchievements.userId, c.get("user").id));
  const unlocked = new Map(unlockedRows.map((row) => [row.achievementCode, row.unlockedAt.toISOString()]));
  return c.json({ success: true as const, data: policy.achievements.map((achievement) => ({
    ...achievement,
    unlocked: unlocked.has(achievement.code),
    unlockedAt: unlocked.get(achievement.code) ?? null,
  })) }, 200);
});
