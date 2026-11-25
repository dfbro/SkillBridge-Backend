import { and, desc, eq } from "drizzle-orm";
import { assessmentRuns, missions, rubricVersions, submissions } from "../../db/schema";
import type { AppEnv } from "../../shared/types";

type Database = AppEnv["Variables"]["db"];
type AssessmentRun = typeof assessmentRuns.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type AssessmentStatus = "queued" | "processing" | "draft_ready" | "needs_review" | "finalized" | "failed";

export type AssessmentRequestResult =
  | { kind: "not_found" }
  | { kind: "invalid_state" }
  | { kind: "finalized"; run: AssessmentRun | null }
  | { kind: "reused"; run: AssessmentRun }
  | { kind: "created"; run: AssessmentRun };

async function requestAssessmentInTransaction(
  tx: Transaction,
  userId: string,
  submissionId: string,
): Promise<AssessmentRequestResult> {
  const [submission] = await tx.select({ id: submissions.id, status: submissions.status })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
    .for("update")
    .limit(1);

  if (!submission) return { kind: "not_found" };

  const [latest] = await tx.select().from(assessmentRuns)
    .where(eq(assessmentRuns.submissionId, submissionId))
    .orderBy(desc(assessmentRuns.createdAt))
    .limit(1);

  if (submission.status === "completed" || latest?.isFinal || latest?.status === "finalized") {
    return { kind: "finalized", run: latest ?? null };
  }

  if (!latest && !["submitted", "assessment_pending", "assessment_failed"].includes(submission.status)) {
    return { kind: "invalid_state" };
  }

  if (latest && latest.status !== "failed") {
    return { kind: "reused", run: latest };
  }

  const now = new Date();
  const [run] = await tx.insert(assessmentRuns).values({
    submissionId,
    status: "queued",
    isFinal: false,
    createdAt: now,
    updatedAt: now,
  }).returning();

  await tx.update(submissions)
    .set({ status: "assessment_pending", updatedAt: now })
    .where(eq(submissions.id, submissionId));

  return { kind: "created", run };
}

export function requestAssessment(db: Database, userId: string, submissionId: string) {
  return db.transaction((tx) => requestAssessmentInTransaction(tx, userId, submissionId));
}

export async function getOwnedSubmission(db: Database, userId: string, submissionId: string) {
  const [submission] = await db.select({
    id: submissions.id,
    content: submissions.content,
    status: submissions.status,
    submittedAt: submissions.createdAt,
    mission: {
      id: missions.id,
      slug: missions.slug,
      title: missions.title,
      summary: missions.summary,
    },
    rubricVersion: {
      id: rubricVersions.id,
      version: rubricVersions.version,
    },
  }).from(submissions)
    .innerJoin(missions, eq(submissions.missionId, missions.id))
    .innerJoin(rubricVersions, eq(submissions.rubricVersionId, rubricVersions.id))
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
    .limit(1);

  if (!submission) return null;

  const [latest] = await db.select({
    id: assessmentRuns.id,
    status: assessmentRuns.status,
    isFinal: assessmentRuns.isFinal,
    createdAt: assessmentRuns.createdAt,
    updatedAt: assessmentRuns.updatedAt,
  }).from(assessmentRuns)
    .where(eq(assessmentRuns.submissionId, submissionId))
    .orderBy(desc(assessmentRuns.createdAt))
    .limit(1);

  return {
    ...submission,
    submittedAt: submission.submittedAt.toISOString(),
    latestAssessment: latest ? {
      ...latest,
      status: latest.status as AssessmentStatus,
      createdAt: latest.createdAt.toISOString(),
      updatedAt: latest.updatedAt.toISOString(),
    } : null,
  };
}

export async function getOwnedAssessment(db: Database, userId: string, submissionId: string) {
  const [submission] = await db.select({ id: submissions.id }).from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
    .limit(1);
  if (!submission) return { kind: "not_found" as const };

  const [assessment] = await db.select({
    id: assessmentRuns.id,
    submissionId: assessmentRuns.submissionId,
    status: assessmentRuns.status,
    isFinal: assessmentRuns.isFinal,
    createdAt: assessmentRuns.createdAt,
    updatedAt: assessmentRuns.updatedAt,
  }).from(assessmentRuns)
    .where(eq(assessmentRuns.submissionId, submissionId))
    .orderBy(desc(assessmentRuns.createdAt))
    .limit(1);

  return assessment ? { kind: "found" as const, assessment } : { kind: "not_requested" as const };
}
