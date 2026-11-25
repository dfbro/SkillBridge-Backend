import { z } from "zod";
import { isValidTimeZone } from "./progression.logic";

const achievementMetricSchema = z.enum(["submissions", "currentStreak", "longestStreak", "totalXp"]);

export const progressionPolicySchema = z.object({
  status: z.enum(["provisional", "approved"]).default("provisional"),
  defaultTimezone: z.string().min(1).max(80).refine(isValidTimeZone, "Default timezone must be a valid IANA timezone").default("Asia/Jakarta"),
  defaultDailyXpGoal: z.number().int().min(10).max(100).default(20),
  minimumDailyXpGoal: z.number().int().min(10).max(100).default(10),
  maximumDailyXpGoal: z.number().int().min(10).max(100).default(100),
  streakGraceDays: z.number().int().min(0).max(1).default(1),
  levelThresholds: z.array(z.number().int().nonnegative()).min(1).max(50)
    .refine((values) => values[0] === 0 && values.every((value, index) => index === 0 || value > values[index - 1]), "Level thresholds must start at zero and increase"),
  xpRewards: z.record(z.string().min(1).max(80), z.number().int().min(0).max(10000)),
  achievements: z.array(z.object({
    code: z.string().regex(/^[a-z0-9_-]{2,60}$/),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    metric: achievementMetricSchema,
    threshold: z.number().int().positive(),
  })).max(50),
}).superRefine((policy, context) => {
  if (policy.minimumDailyXpGoal > policy.defaultDailyXpGoal) {
    context.addIssue({ code: "custom", path: ["defaultDailyXpGoal"], message: "Default goal must not be below the minimum" });
  }
  if (policy.defaultDailyXpGoal > policy.maximumDailyXpGoal) {
    context.addIssue({ code: "custom", path: ["defaultDailyXpGoal"], message: "Default goal must not exceed the maximum" });
  }
  const codes = policy.achievements.map((item) => item.code);
  if (new Set(codes).size !== codes.length) {
    context.addIssue({ code: "custom", path: ["achievements"], message: "Achievement codes must be unique" });
  }
});

export type ProgressionPolicy = z.infer<typeof progressionPolicySchema>;

// These defaults make the feature testable; reward/level/achievement values remain provisional until product sign-off.
export const DEFAULT_PROGRESSION_POLICY: ProgressionPolicy = {
  status: "provisional",
  defaultTimezone: "Asia/Jakarta",
  defaultDailyXpGoal: 20,
  minimumDailyXpGoal: 10,
  maximumDailyXpGoal: 100,
  streakGraceDays: 1,
  levelThresholds: [0, 100, 250, 500, 1000],
  xpRewards: { "submission.created": 10 },
  achievements: [
    { code: "first_practice", title: "First Practice", description: "Submit your first mission response.", metric: "submissions", threshold: 1 },
    { code: "three_day_streak", title: "Three-day streak", description: "Practice on three consecutive local calendar days.", metric: "longestStreak", threshold: 3 },
    { code: "seven_day_streak", title: "Seven-day streak", description: "Practice on seven consecutive local calendar days.", metric: "longestStreak", threshold: 7 },
    { code: "ten_practices", title: "Ten practices", description: "Submit ten mission responses.", metric: "submissions", threshold: 10 },
  ],
};

export function resolveProgressionPolicy(raw?: string): ProgressionPolicy {
  if (!raw) return DEFAULT_PROGRESSION_POLICY;
  return progressionPolicySchema.parse(JSON.parse(raw));
}

export function effectiveXpReward(policy: ProgressionPolicy, eventType: string): number {
  if (policy.status !== "approved") return 0;
  return policy.xpRewards[eventType] ?? 0;
}
