import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { profiles, dailyActivities, userAchievements, userProgress, xpEvents } from "../../db/schema";
import { DEFAULT_PROGRESSION_POLICY } from "./progression.policy";
import { recordSubmissionPractice } from "./progression.service";

const connectionString = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!connectionString);

suite("recordSubmissionPractice (PostgreSQL integration)", () => {
  const client = new Client({ connectionString });
  const db = drizzle(client, { schema });
  const userIds: string[] = [];

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    for (const userId of userIds) {
      await client.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    }
    await client.end();
  });

  it("records a practice day and awards XP exactly once for an approved policy", async () => {
    const userId = randomUUID();
    const submissionId = randomUUID();
    userIds.push(userId);
    await client.query("INSERT INTO auth.users (id) VALUES ($1)", [userId]);
    await db.insert(profiles).values({ id: userId });

    const policy = {
      ...DEFAULT_PROGRESSION_POLICY,
      status: "approved" as const,
      xpRewards: { "submission.created": 15 },
    };
    const instant = new Date("2026-11-24T18:30:00.000Z");
    const first = await recordSubmissionPractice(db, userId, submissionId, policy, instant);
    const retry = await recordSubmissionPractice(db, userId, submissionId, policy, instant);

    expect(first).toMatchObject({ recorded: true, points: 15, activityDate: "2026-11-25", submissions: 1, totalXp: 15, currentStreak: 1 });
    expect(retry).toMatchObject({ recorded: false, points: 0 });

    const [event] = await db.select().from(xpEvents).where(eq(xpEvents.userId, userId));
    const [activity] = await db.select().from(dailyActivities).where(eq(dailyActivities.userId, userId));
    const [progress] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
    const achievements = await db.select().from(userAchievements).where(eq(userAchievements.userId, userId));

    expect(event.points).toBe(15);
    expect(activity.submissionsCompleted).toBe(1);
    expect(activity.xpEarned).toBe(15);
    expect(progress.totalXp).toBe(15);
    expect(progress.currentStreak).toBe(1);
    expect(achievements.map((item) => item.achievementCode)).toContain("first_practice");
  });

  it("records practice activity but awards no XP or achievements while policy is provisional", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    await client.query("INSERT INTO auth.users (id) VALUES ($1)", [userId]);
    await db.insert(profiles).values({ id: userId });

    const result = await recordSubmissionPractice(
      db,
      userId,
      randomUUID(),
      DEFAULT_PROGRESSION_POLICY,
      new Date("2026-11-24T18:30:00.000Z"),
    );

    const [progress] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
    const [activity] = await db.select().from(dailyActivities).where(eq(dailyActivities.userId, userId));
    const achievements = await db.select().from(userAchievements).where(eq(userAchievements.userId, userId));

    expect(result).toMatchObject({ recorded: true, points: 0, submissions: 1, totalXp: 0 });
    expect(progress.totalXp).toBe(0);
    expect(activity.xpEarned).toBe(0);
    expect(activity.submissionsCompleted).toBe(1);
    expect(achievements).toHaveLength(0);
  });
});
