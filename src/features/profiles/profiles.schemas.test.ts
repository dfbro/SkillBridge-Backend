import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./profiles.schemas";

describe("updateProfileSchema", () => {
  it("accepts a valid partial profile update", () => {
    expect(updateProfileSchema.safeParse({ displayName: "Vale" }).success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid avatar URL", () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: "not-a-url" }).success).toBe(false);
  });
});
