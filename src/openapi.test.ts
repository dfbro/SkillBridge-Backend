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
    expect(document.paths["/api/v1/me/dashboard"]).toHaveProperty("get");
    expect(document.paths["/api/v1/me/recommendations"]).toHaveProperty("get");
    expect(document.paths["/api/v1/submissions/{submissionId}"]).toHaveProperty("get");
    expect(document.paths["/api/v1/submissions/{submissionId}/assessment"]).toHaveProperty("get");
    expect(document.paths["/api/v1/submissions/{submissionId}/assessment"]).toHaveProperty("post");
    expect(document.paths["/api/v1/submissions/{submissionId}"]).toHaveProperty("get");
    expect(document.paths["/api/v1/submissions/{submissionId}/assessment"]).toHaveProperty("get");
    expect(document.paths["/api/v1/submissions/{submissionId}/assessment"]).toHaveProperty("post");
  });

  it("declares the Bearer JWT security scheme", () => {
    const document = getOpenApiDocument();
    expect(document.components?.securitySchemes).toHaveProperty("BearerAuth");
  });

  it("documents the student-only role rejection on protected routes", () => {
    const document = getOpenApiDocument();
    const protectedOperations = [
      document.paths["/api/v1/me"]?.get,
      document.paths["/api/v1/me"]?.patch,
      document.paths["/api/v1/missions/{missionId}/submissions"]?.post,
      document.paths["/api/v1/submissions/{submissionId}/assessment"]?.post,
    ];

    for (const operation of protectedOperations) {
      expect(operation?.responses).toHaveProperty("403");
    }
    expect(document.paths["/api/v1/progression/policy"]?.get?.responses).not.toHaveProperty("403");
  });
});
