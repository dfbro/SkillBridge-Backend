import { describe, expect, it } from "vitest";
import { createSubmission } from "./submissions.routes";

describe("submission input validation", () => {
  it("accepts non-empty text within the size limit", () => {
    expect(createSubmission.safeParse({ content: "Build a small API and document it." }).success).toBe(true);
  });

  it("rejects blank content and oversized content", () => {
    expect(createSubmission.safeParse({ content: "   " }).success).toBe(false);
    expect(createSubmission.safeParse({ content: "x".repeat(20001) }).success).toBe(false);
  });
});
