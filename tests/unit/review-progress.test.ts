import { describe, it, expect } from "vitest";
import {
  REVIEW_START_COMMENT,
  REVIEW_COMPLETE_MARKER,
  formatReviewCompleteComment,
  formatReviewStartComment,
  publicProgressDetails,
  summaryWithVerdict,
  verdictFor,
} from "../../src/cli/review-progress.js";

describe("review progress comments", () => {
  it("uses a visible start marker", () => {
    expect(formatReviewStartComment()).toContain(REVIEW_START_COMMENT);
    expect(formatReviewStartComment()).toContain("🔍");
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
    expect(comment).toContain(REVIEW_COMPLETE_MARKER);
    expect(summaryWithVerdict("PASS", "Looks good")).toBe("**Verdict: PASS**\n\nLooks good");
  });

  it("posts BLOCK even in advisory (findings, not infra failure)", () => {
    const comment = formatReviewCompleteComment("BLOCK", "SQL injection");
    expect(comment).toContain("⚠️");
    expect(comment).toContain("**Verdict: BLOCK**");
  });

  it("does not put raw exception text on the public FAILED/SKIPPED comment", () => {
    expect(publicProgressDetails("fail-closed-infra", "Validation Failed: line not part of the diff")).not.toMatch(
      /Validation Failed/,
    );
    expect(formatReviewCompleteComment("fail-closed-infra", "secret token leaked in logs")).not.toMatch(/secret token/);
    expect(formatReviewCompleteComment("availability-skip", "HTTP 429 quota xyz")).toContain("**Verdict: SKIPPED**");
    expect(formatReviewCompleteComment("availability-skip", "HTTP 429 quota xyz")).not.toContain("HTTP 429");
  });
});
