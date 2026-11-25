import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { assessmentRuns, missions, profiles, rubricVersions, submissions } from "../../db/schema";
import { getOwnedAssessment, getOwnedSubmission, requestAssessment } from "./assessments.service";

const connectionString = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!connectionString);

suite("assessment request/status service (PostgreSQL integration)", () => {
  const client = new Client({ connectionString });
  const db = drizzle(client, { schema });
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const missionId = randomUUID();
  const rubricVersionId = randomUUID();
  const submissionId = randomUUID();
  const draftSubmissionId = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query("INSERT INTO auth.users (id) VALUES ($1), ($2)", [userId, otherUserId]);
    await db.insert(profiles).values([{ id: userId }, { id: otherUserId }]);
    await db.insert(missions).values({
      id: missionId,
      slug: `assessment-test-${missionId.slice(0, 8)}`,
      title: "Assessment request test mission",
      summary: "Mission for assessment request lifecycle tests",
      instructions: "Submit a short text response.",
      status: "published",
    });
    await db.insert(rubricVersions).values({ id: rubricVersionId, missionId, version: 1, status: "published" });
    await db.insert(submissions).values({
      id: submissionId,
      userId,
      missionId,
      rubricVersionId,
      content: "Assessment request fixture",
      status: "submitted",
    });
    await db.insert(submissions).values({
      id: draftSubmissionId,
      userId,
      missionId,
      rubricVersionId,
      content: "Draft submission must not be assessed",
      status: "draft",
    });
  });

  afterAll(async () => {
    await client.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[userId, otherUserId]]);
    await db.delete(missions).where(eq(missions.id, missionId));
    await client.end();
  });

  it("records an assessment request once and reuses the existing active run on retry", async () => {
    const first = await requestAssessment(db, userId, submissionId);
    const retry = await requestAssessment(db, userId, submissionId);

    expect(first.kind).toBe("created");
    expect(retry.kind).toBe("reused");
    if (first.kind !== "created" || retry.kind !== "reused") throw new Error("Expected a created run followed by a reused active run");
    expect(first.run).toMatchObject({ status: "queued", isFinal: false, provider: null });
    expect(retry.run.id).toBe(first.run.id);

    const runs = await db.select().from(assessmentRuns).where(eq(assessmentRuns.submissionId, submissionId));
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    expect(runs).toHaveLength(1);
    expect(submission.status).toBe("assessment_pending");
  });

  it("allows a new request after the previous run failed", async () => {
    await db.update(assessmentRuns).set({ status: "failed" }).where(eq(assessmentRuns.submissionId, submissionId));
    await db.update(submissions).set({ status: "assessment_failed" }).where(eq(submissions.id, submissionId));

    const retry = await requestAssessment(db, userId, submissionId);
    const runs = await db.select().from(assessmentRuns).where(eq(assessmentRuns.submissionId, submissionId));

    expect(retry.kind).toBe("created");
    expect(runs).toHaveLength(2);
    expect(runs.filter((run) => run.status === "queued")).toHaveLength(1);
  });

  it("prevents a new assessment request once a run is finalized", async () => {
    await db.update(assessmentRuns).set({ status: "finalized", isFinal: true })
      .where(and(eq(assessmentRuns.submissionId, submissionId), eq(assessmentRuns.status, "queued")));

    const result = await requestAssessment(db, userId, submissionId);

    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") expect(result.run?.isFinal).toBe(true);
  });

  it("returns submission details only to the owner", async () => {
    expect(await getOwnedSubmission(db, userId, submissionId)).not.toBeNull();
    expect(await getOwnedSubmission(db, otherUserId, submissionId)).toBeNull();
    expect(await getOwnedAssessment(db, otherUserId, submissionId)).toEqual({ kind: "not_found" });
  });

  it("rejects assessment requests for a draft submission", async () => {
    expect(await requestAssessment(db, userId, draftSubmissionId)).toEqual({ kind: "invalid_state" });
    expect(await getOwnedAssessment(db, userId, draftSubmissionId)).toEqual({ kind: "not_requested" });
  });

  it("returns the latest assessment status without exposing score or feedback fields", async () => {
    const result = await getOwnedAssessment(db, userId, submissionId);

    expect(result.kind).toBe("found");
    if (result.kind !== "found") throw new Error("Expected an assessment run");
    expect(result.assessment).toMatchObject({ status: "finalized", isFinal: true });
    expect(result.assessment).not.toHaveProperty("totalScore");
    expect(result.assessment).not.toHaveProperty("feedback");
  });
});
