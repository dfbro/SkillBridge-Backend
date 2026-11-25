import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { assessmentRuns, missions, profiles, rubricVersions, submissions } from "../../db/schema";
import { DEFAULT_PROGRESSION_POLICY } from "../progression/progression.policy";
import { getStudentDashboard } from "./dashboard.service";

const connectionString = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!connectionString);

suite("getStudentDashboard (PostgreSQL integration)", () => {
  const client = new Client({ connectionString });
  const db = drizzle(client, { schema });
  const userId = randomUUID();
  const missionId = randomUUID();
  const rubricVersionId = randomUUID();
  const submissionId = randomUUID();

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    await db.delete(missions).where(eq(missions.id, missionId));
    await client.end();
  });

  it("aggregates the learner's mission, submission, assessment and progression source records", async () => {
    const now = new Date("2026-11-24T18:30:00.000Z");
    await client.query("INSERT INTO auth.users (id) VALUES ($1)", [userId]);
    await db.insert(profiles).values({ id: userId });
    await db.insert(missions).values({
      id: missionId,
      slug: `dashboard-test-${missionId.slice(0, 8)}`,
      title: "Dashboard integration mission",
      summary: "Mission used to test a student practice dashboard",
      instructions: "Submit a short text response.",
      status: "published",
    });
    await db.insert(rubricVersions).values({
      id: rubricVersionId,
      missionId,
      version: 1,
      status: "published",
    });
    await db.insert(submissions).values({
      id: submissionId,
      userId,
      missionId,
      rubricVersionId,
      content: "Integration test submission",
      status: "assessment_pending",
    });
    await db.insert(assessmentRuns).values({
      submissionId,
      status: "draft_ready",
      isFinal: false,
      provider: "test",
    });

    const dashboard = await getStudentDashboard(db, userId, DEFAULT_PROGRESSION_POLICY, now);

    expect(dashboard.summary.publishedMissionsAvailable).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.startedMissions).toBe(1);
    expect(dashboard.summary.completedMissions).toBe(0);
    expect(dashboard.summary.totalSubmissions).toBe(1);
    expect(dashboard.summary.submissionStatuses.assessmentPending).toBe(1);
    expect(dashboard.summary.assessments).toEqual({ total: 1, provisional: 1, finalized: 0, failed: 0 });
    expect(dashboard.progression).toMatchObject({
      totalXp: 0,
      level: 1,
      policyStatus: "provisional",
      dailyGoal: { targetXp: 20, earnedXp: 0, remainingXp: 20, completed: false, activityDate: "2026-11-25", timezone: "Asia/Jakarta" },
    });
    expect(dashboard.recentSubmissions[0]).toMatchObject({
      id: submissionId,
      mission: { id: missionId, title: "Dashboard integration mission" },
      status: "assessment_pending",
      assessment: { status: "draft_ready", isFinal: false },
    });
  });
});
