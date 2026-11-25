import { describe, expect, it } from "vitest";
import {
  calculateLevel,
  calculateStreak,
  getActivityDate,
  isValidTimeZone,
  previousDate,
} from "./progression.logic";

describe("progression date and level rules", () => {
  it("converts an instant into the learner's local calendar date", () => {
    const instant = new Date("2026-11-24T18:30:00.000Z");

    expect(getActivityDate(instant, "Asia/Jakarta")).toBe("2026-11-25");
    expect(getActivityDate(instant, "America/Los_Angeles")).toBe("2026-11-24");
  });

  it("validates IANA time zones and computes a previous calendar date", () => {
    expect(isValidTimeZone("Asia/Jakarta")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
  });

  it("derives the current streak from consecutive activity dates", () => {
    expect(calculateStreak(["2026-11-25", "2026-11-24", "2026-11-22"], "2026-11-25"))
      .toEqual({ current: 2, longest: 2 });
    expect(calculateStreak(["2026-11-24", "2026-11-23"], "2026-11-25"))
      .toEqual({ current: 2, longest: 2 });
    expect(calculateStreak(["2026-11-24", "2026-11-23"], "2026-11-25", 0))
      .toEqual({ current: 0, longest: 2 });
    expect(calculateStreak(["2026-11-22"], "2026-11-25"))
      .toEqual({ current: 0, longest: 1 });
  });

  it("uses the greatest reached level threshold without changing competency scores", () => {
    const thresholds = [0, 100, 250, 500, 1000];

    expect(calculateLevel(0, thresholds)).toBe(1);
    expect(calculateLevel(249, thresholds)).toBe(2);
    expect(calculateLevel(250, thresholds)).toBe(3);
    expect(calculateLevel(1400, thresholds)).toBe(5);
  });
});
