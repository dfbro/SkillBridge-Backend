import { describe, expect, it } from "vitest";
import { preferencesSchema } from "./progression.routes";

describe("learning preferences request schema", () => {
  it("accepts an IANA timezone with a daily goal", () => {
    expect(preferencesSchema.safeParse({ dailyXpGoal: 25, timezone: "Asia/Jakarta" }).success).toBe(true);
  });

  it("rejects invalid timezones and non-integer goals", () => {
    expect(preferencesSchema.safeParse({ dailyXpGoal: 25, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ dailyXpGoal: 20.5, timezone: "Asia/Jakarta" }).success).toBe(false);
  });

  it("bounds the request value before applying the active policy range", () => {
    expect(preferencesSchema.safeParse({ dailyXpGoal: 0, timezone: "Asia/Jakarta" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ dailyXpGoal: 501, timezone: "Asia/Jakarta" }).success).toBe(false);
  });
});
