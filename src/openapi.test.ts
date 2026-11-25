import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./index";

describe("generated OpenAPI contract", () => {
  it("contains the implemented feature paths and methods", () => {
    const document = getOpenApiDocument();
    expect(document.paths["/api/v1/me"]).toHaveProperty("get");
    expect(document.paths["/api/v1/me"]).toHaveProperty("patch");
    expect(document.paths["/api/v1/me/career-goals"]).toHaveProperty("get");
    expect(document.paths["/api/v1/me/career-goals"]).toHaveProperty("put");
    expect(document.paths["/api/v1/me/career-goals/{goalId}"]).toHaveProperty("delete");
    expect(document.paths["/api/v1/missions/{missionId}/submissions"]).toHaveProperty("post");
    expect(document.paths["/api/v1/me/learning-preferences"]).toHaveProperty("get");
    expect(document.paths["/api/v1/me/learning-preferences"]).toHaveProperty("put");
    expect(document.paths["/api/v1/me/progress"]).toHaveProperty("get");
    expect(document.paths["/api/v1/me/activity"]).toHaveProperty("get");
    expect(document.paths["/api/v1/me/achievements"]).toHaveProperty("get");
    expect(document.paths["/api/v1/progression/policy"]).toHaveProperty("get");
  });

  it("declares the Bearer JWT security scheme", () => {
    const document = getOpenApiDocument();
    expect(document.components?.securitySchemes).toHaveProperty("BearerAuth");
  });
});
