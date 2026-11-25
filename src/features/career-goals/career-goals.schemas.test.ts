import { describe, expect, it } from "vitest";
import { goalsInput } from "./career-goals.routes";

describe("career goal validation", () => {
  it("requires exactly one primary goal", () => {
    expect(goalsInput.safeParse([{ title: "Cloud Engineer", isPrimary: true }]).success).toBe(true);
    expect(goalsInput.safeParse([{ title: "Cloud Engineer" }]).success).toBe(false);
    expect(goalsInput.safeParse([
      { title: "Cloud Engineer", isPrimary: true },
      { title: "DevOps Engineer", isPrimary: true },
    ]).success).toBe(false);
  });

  it("limits the number of goals", () => {
    const values = Array.from({ length: 6 }, (_, index) => ({ title: `Goal ${index}`, isPrimary: index === 0 }));
    expect(goalsInput.safeParse(values).success).toBe(false);
  });
});
