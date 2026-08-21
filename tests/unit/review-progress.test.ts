import { describe, it, expect } from "vitest";
import { REVIEW_START_COMMENT, formatReviewCompleteComment } from "../../src/cli/review-progress.js";

describe("review progress comments", () => {
  it("uses a visible start marker", () => {
    expect(REVIEW_START_COMMENT).toMatch(/Review starting/);
    expect(REVIEW_START_COMMENT).toContain("🔍");
  });

  it("posts a success complete comment", () => {
    expect(formatReviewCompleteComment("success")).toMatch(/Review completed/);
    expect(formatReviewCompleteComment("success")).toContain("✅");
  });

  it("posts a warning complete comment on failure", () => {
    expect(formatReviewCompleteComment("failure")).toMatch(/Review completed/);
    expect(formatReviewCompleteComment("failure")).toContain("⚠️");
  });
});
