import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION_POLICY,
  effectiveXpReward,
  progressionPolicySchema,
  resolveProgressionPolicy,
} from "./progression.policy";

describe("progression policy", () => {
  it("keeps proposed XP rewards inactive until explicit approval", () => {
    expect(DEFAULT_PROGRESSION_POLICY.status).toBe("provisional");
    expect(effectiveXpReward(DEFAULT_PROGRESSION_POLICY, "submission.created")).toBe(0);
  });

  it("activates only the configured reward after policy approval", () => {
    const approved = progressionPolicySchema.parse({
      ...DEFAULT_PROGRESSION_POLICY,
      status: "approved",
      xpRewards: { "submission.created": 12 },
    });

    expect(effectiveXpReward(approved, "submission.created")).toBe(12);
    expect(effectiveXpReward(approved, "unknown.event")).toBe(0);
  });

  it("rejects non-monotonic level thresholds and duplicate achievements", () => {
    expect(progressionPolicySchema.safeParse({
      ...DEFAULT_PROGRESSION_POLICY,
      levelThresholds: [0, 100, 90],
    }).success).toBe(false);

    expect(progressionPolicySchema.safeParse({
      ...DEFAULT_PROGRESSION_POLICY,
      achievements: [DEFAULT_PROGRESSION_POLICY.achievements[0], DEFAULT_PROGRESSION_POLICY.achievements[0]],
    }).success).toBe(false);
  });

  it("rejects an invalid default timezone", () => {
    expect(progressionPolicySchema.safeParse({
      ...DEFAULT_PROGRESSION_POLICY,
      defaultTimezone: "Mars/Olympus",
    }).success).toBe(false);
  });

  it("parses environment overrides using the same validated contract", () => {
    const policy = resolveProgressionPolicy(JSON.stringify({
      ...DEFAULT_PROGRESSION_POLICY,
      defaultDailyXpGoal: 30,
    }));
    expect(policy.defaultDailyXpGoal).toBe(30);
  });
});
