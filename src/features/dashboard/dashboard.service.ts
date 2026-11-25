import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  assessmentRuns,
  dailyActivities,
  learningPreferences,
  missions,
  profiles,
  submissions,
} from "../../db/schema";
import type { AppEnv } from "../../shared/types";
import { calculateStreak, getActivityDate } from "../progression/progression.logic";
import { ensureLearningPreferences, ensureUserProgress } from "../progression/progression.service";
import type { ProgressionPolicy } from "../progression/progression.policy";

type Database = AppEnv["Variables"]["db"];

export async function getStudentDashboard(db: Database, userId: string, policy: ProgressionPolicy, now = new Date()) {
  await db.insert(profiles).values({ id: userId }).onConflictDoNothing();
  const preferences = await ensureLearningPreferences(db, userId, policy);
  const progress = await ensureUserProgress(db, userId);

  const [missionCount] = await db.select({ total: count() }).from(missions).where(eq(missions.status, "published"));

  const [submissionStats] = await db.select({
    total: count(),
    startedMissions: sql<number>`count(distinct ${submissions.missionId})::int`,
    completedMissions: sql<number>`count(distinct case when ${submissions.status} = 'completed' then ${submissions.missionId} end)::int`,
    submitted: sql<number>`count(*) filter (where ${submissions.status} = 'submitted')::int`,
    assessmentPending: sql<number>`count(*) filter (where ${submissions.status} = 'assessment_pending')::int`,
    needsReview: sql<number>`count(*) filter (where ${submissions.status} = 'needs_review')::int`,
    completed: sql<number>`count(*) filter (where ${submissions.status} = 'completed')::int`,
    assessmentFailed: sql<number>`count(*) filter (where ${submissions.status} = 'assessment_failed')::int`,
  }).from(submissions).where(eq(submissions.userId, userId));

  const assessmentRows = await db.select({ status: assessmentRuns.status, isFinal: assessmentRuns.isFinal })
    .from(assessmentRuns)
    .innerJoin(submissions, eq(assessmentRuns.submissionId, submissions.id))
    .where(eq(submissions.userId, userId));
  const assessmentSummary = {
    total: assessmentRows.length,
    provisional: assessmentRows.filter((row) => !row.isFinal && row.status !== "failed").length,
    finalized: assessmentRows.filter((row) => row.isFinal).length,
    failed: assessmentRows.filter((row) => row.status === "failed").length,
  };

  const recentRows = await db.select({
    id: submissions.id,
    missionId: missions.id,
    missionSlug: missions.slug,
    missionTitle: missions.title,
    status: submissions.status,
    submittedAt: submissions.createdAt,
  }).from(submissions)
    .innerJoin(missions, eq(submissions.missionId, missions.id))
    .where(eq(submissions.userId, userId))
    .orderBy(desc(submissions.createdAt))
    .limit(10);

  const recentIds = recentRows.map((row) => row.id);
  const recentAssessments = recentIds.length
    ? await db.select({ submissionId: assessmentRuns.submissionId, status: assessmentRuns.status, isFinal: assessmentRuns.isFinal, createdAt: assessmentRuns.createdAt })
      .from(assessmentRuns)
      .where(inArray(assessmentRuns.submissionId, recentIds))
      .orderBy(desc(assessmentRuns.createdAt))
    : [];
  const latestAssessmentBySubmission = new Map<string, { status: string; isFinal: boolean }>();
  for (const assessment of recentAssessments) {
    if (!latestAssessmentBySubmission.has(assessment.submissionId)) {
      latestAssessmentBySubmission.set(assessment.submissionId, { status: assessment.status, isFinal: assessment.isFinal });
    }
  }

  const activityDate = getActivityDate(now, preferences.timezone);
  const [todayActivity] = await db.select({ xpEarned: dailyActivities.xpEarned })
    .from(dailyActivities)
    .where(and(eq(dailyActivities.userId, userId), eq(dailyActivities.activityDate, activityDate)))
    .limit(1);
  const activityRows = await db.select({ activityDate: dailyActivities.activityDate })
    .from(dailyActivities).where(eq(dailyActivities.userId, userId));
  const streak = calculateStreak(activityRows.map((row) => row.activityDate), activityDate, policy.streakGraceDays);
  const earnedXp = todayActivity?.xpEarned ?? 0;

  return {
    generatedAt: now.toISOString(),
    summary: {
      publishedMissionsAvailable: missionCount?.total ?? 0,
      startedMissions: submissionStats?.startedMissions ?? 0,
      completedMissions: submissionStats?.completedMissions ?? 0,
      totalSubmissions: submissionStats?.total ?? 0,
      submissionStatuses: {
        submitted: submissionStats?.submitted ?? 0,
        assessmentPending: submissionStats?.assessmentPending ?? 0,
        needsReview: submissionStats?.needsReview ?? 0,
        completed: submissionStats?.completed ?? 0,
        assessmentFailed: submissionStats?.assessmentFailed ?? 0,
      },
      assessments: assessmentSummary,
    },
    progression: {
      totalXp: progress.totalXp,
      level: progress.level,
      currentStreak: streak.current,
      longestStreak: Math.max(progress.longestStreak, streak.longest),
      policyStatus: policy.status,
      dailyGoal: {
        targetXp: preferences.dailyXpGoal,
        earnedXp,
        remainingXp: Math.max(0, preferences.dailyXpGoal - earnedXp),
        completed: earnedXp >= preferences.dailyXpGoal,
        activityDate,
        timezone: preferences.timezone,
      },
    },
    recentSubmissions: recentRows.map((row) => ({
      id: row.id,
      mission: { id: row.missionId, slug: row.missionSlug, title: row.missionTitle },
      status: row.status,
      submittedAt: row.submittedAt.toISOString(),
      assessment: latestAssessmentBySubmission.get(row.id) ?? null,
    })),
  };
}
