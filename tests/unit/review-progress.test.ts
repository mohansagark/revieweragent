import { describe, it, expect } from "vitest";
import {
  REVIEW_START_COMMENT,
  formatReviewCompleteComment,
  summaryWithVerdict,
  verdictFor,
} from "../../src/cli/review-progress.js";

describe("review progress comments", () => {
  it("uses a visible start marker", () => {
    expect(REVIEW_START_COMMENT).toMatch(/Review starting/);
    expect(REVIEW_START_COMMENT).toContain("🔍");
  });

  it("always includes an explicit verdict", () => {
    expect(verdictFor("PASS")).toBe("PASS");
    expect(verdictFor("BLOCK")).toBe("BLOCK");
    expect(verdictFor("availability-skip")).toBe("SKIPPED");
    expect(verdictFor("fail-closed-infra")).toBe("FAILED");
  });

  it("posts PASS on the completed comment and the review body", () => {
    const comment = formatReviewCompleteComment("PASS", "Looks good");
    expect(comment).toContain("✅");
    expect(comment).toContain("**Verdict: PASS**");
    expect(comment).toContain("Looks good");
    expect(summaryWithVerdict("PASS", "Looks good")).toBe("**Verdict: PASS**\n\nLooks good");
  });

  it("posts BLOCK even in advisory (findings, not infra failure)", () => {
    const comment = formatReviewCompleteComment("BLOCK", "SQL injection");
    expect(comment).toContain("⚠️");
    expect(comment).toContain("**Verdict: BLOCK**");
  });

  it("posts SKIPPED and FAILED as verdicts", () => {
    expect(formatReviewCompleteComment("availability-skip", "too large")).toContain("**Verdict: SKIPPED**");
    expect(formatReviewCompleteComment("fail-closed-infra", "missing config")).toContain("**Verdict: FAILED**");
  });
});
