import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import {
  dailyActivities,
  learningPreferences,
  userAchievements,
  userProgress,
  xpEvents,
} from "../../db/schema";
import type { AppEnv } from "../../shared/types";
import { calculateLevel, calculateStreak, getActivityDate } from "./progression.logic";
import { effectiveXpReward, type ProgressionPolicy } from "./progression.policy";

type Database = AppEnv["Variables"]["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function ensureLearningPreferences(db: Database, userId: string, policy: ProgressionPolicy) {
  await db.insert(learningPreferences).values({
    userId,
    dailyXpGoal: policy.defaultDailyXpGoal,
    timezone: policy.defaultTimezone,
  }).onConflictDoNothing();

  const [preferences] = await db.select().from(learningPreferences)
    .where(eq(learningPreferences.userId, userId)).limit(1);
  if (!preferences) throw new Error("Learning preferences could not be initialized");
  return preferences;
}

export async function ensureUserProgress(db: Database, userId: string) {
  await db.insert(userProgress).values({ userId }).onConflictDoNothing();
  const [progress] = await db.select().from(userProgress).where(eq(userProgress.userId, userId)).limit(1);
  if (!progress) throw new Error("User progress could not be initialized");
  return progress;
}

export async function recordSubmissionPracticeInTransaction(
  tx: Transaction,
  userId: string,
  submissionId: string,
  policy: ProgressionPolicy,
  now = new Date(),
) {
    const [preferences] = await tx.select().from(learningPreferences)
      .where(eq(learningPreferences.userId, userId)).limit(1);
    const timezone = preferences?.timezone ?? policy.defaultTimezone;
    const activityDate = getActivityDate(now, timezone);
    const points = effectiveXpReward(policy, "submission.created");

    const [event] = await tx.insert(xpEvents).values({
      userId,
      sourceType: "submission.created",
      sourceId: submissionId,
      points,
      metadata: { policyStatus: policy.status },
    }).onConflictDoNothing().returning({ id: xpEvents.id });

    if (!event) return { recorded: false, points: 0, activityDate };

    await tx.insert(dailyActivities).values({
      userId,
      activityDate,
      timezone,
      xpEarned: points,
      submissionsCompleted: 1,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [dailyActivities.userId, dailyActivities.activityDate],
      set: {
        timezone,
        xpEarned: sql`${dailyActivities.xpEarned} + ${points}`,
        submissionsCompleted: sql`${dailyActivities.submissionsCompleted} + 1`,
        updatedAt: now,
      },
    });

    await tx.insert(userProgress).values({ userId }).onConflictDoNothing();
    const [current] = await tx.select().from(userProgress)
      .where(eq(userProgress.userId, userId)).for("update").limit(1);
    if (!current) throw new Error("User progress could not be initialized");

    const days = await tx.select({ activityDate: dailyActivities.activityDate, submissionsCompleted: dailyActivities.submissionsCompleted })
      .from(dailyActivities).where(eq(dailyActivities.userId, userId)).orderBy(asc(dailyActivities.activityDate));
    const dates = days.map((day) => day.activityDate);
    const streak = calculateStreak(dates, activityDate, policy.streakGraceDays);
    const totalXp = current.totalXp + points;
    const latestActivityDate = dates.at(-1) ?? activityDate;

    await tx.update(userProgress).set({
      totalXp,
      level: calculateLevel(totalXp, policy.levelThresholds),
      currentStreak: streak.current,
      longestStreak: Math.max(current.longestStreak, streak.longest),
      lastActivityDate: latestActivityDate,
      updatedAt: now,
    }).where(eq(userProgress.userId, userId));

    const totalSubmissions = days.reduce((total, day) => total + day.submissionsCompleted, 0);
    const achievementMetrics = {
      submissions: totalSubmissions,
      currentStreak: streak.current,
      longestStreak: Math.max(current.longestStreak, streak.longest),
      totalXp,
    };

    const unlocked = policy.status === "approved"
      ? policy.achievements
        .filter((achievement) => achievementMetrics[achievement.metric] >= achievement.threshold)
        .map((achievement) => ({ userId, achievementCode: achievement.code }))
      : [];

    if (unlocked.length > 0) {
      await tx.insert(userAchievements).values(unlocked).onConflictDoNothing();
    }

    return { recorded: true, points, activityDate, ...achievementMetrics };
}

export async function recordSubmissionPractice(
  db: Database,
  userId: string,
  submissionId: string,
  policy: ProgressionPolicy,
  now = new Date(),
) {
  return db.transaction((tx) => recordSubmissionPracticeInTransaction(tx, userId, submissionId, policy, now));
}

export async function listDailyActivities(db: Database, userId: string, from: string, to: string) {
  return db.select().from(dailyActivities).where(and(
    eq(dailyActivities.userId, userId),
    gte(dailyActivities.activityDate, from),
    lte(dailyActivities.activityDate, to),
  )).orderBy(asc(dailyActivities.activityDate));
}
