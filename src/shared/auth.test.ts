import { describe, expect, it } from "vitest";
import { resolveUserRole } from "./auth";

describe("resolveUserRole", () => {
  it("defaults authenticated users without an app_metadata role to student", () => {
    expect(resolveUserRole(undefined)).toBe("student");
    expect(resolveUserRole({})).toBe("student");
  });

  it("accepts the only supported MVP role", () => {
    expect(resolveUserRole({ role: "student" })).toBe("student");
  });

  it.each(["reviewer", "admin", "owner", ""])("rejects unsupported role %s", (role) => {
    expect(resolveUserRole({ role })).toBeNull();
  });

  it("rejects malformed role metadata instead of granting student access", () => {
    expect(resolveUserRole({ role: null })).toBeNull();
    expect(resolveUserRole({ role: 7 })).toBeNull();
    expect(resolveUserRole(null)).toBeNull();
    expect(resolveUserRole([])).toBeNull();
  });
});
