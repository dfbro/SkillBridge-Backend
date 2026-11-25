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
  });

  it("declares the Bearer JWT security scheme", () => {
    const document = getOpenApiDocument();
    expect(document.components?.securitySchemes).toHaveProperty("BearerAuth");
  });
});
