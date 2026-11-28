import { describe, expect, it } from "vitest";
import app from "./app";

const env = {
  SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  SUPABASE_ISSUER: "https://example.supabase.co/auth/v1",
} as never;

describe("student API route authentication coverage", () => {
  it("requires authentication for parameterized career-goal deletion", async () => {
    const response = await app.request(
      "/api/v1/me/career-goals/00000000-0000-4000-8000-000000000001",
      { method: "DELETE" },
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it.each([
    ["/api/v1/me/career-goals", "GET"],
    ["/api/v1/me/submissions", "GET"],
    ["/api/v1/me/learning-preferences", "GET"],
    ["/api/v1/me/progress", "GET"],
    ["/api/v1/me/activity", "GET"],
    ["/api/v1/me/achievements", "GET"],
    ["/api/v1/me/dashboard", "GET"],
    ["/api/v1/me/recommendations", "GET"],
  ])("requires authentication for %s", async (path, method) => {
    const response = await app.request(path, { method }, env);
    expect(response.status).toBe(401);
  });
});
