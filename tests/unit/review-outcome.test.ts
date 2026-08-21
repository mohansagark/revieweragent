import { describe, it, expect, vi } from "vitest";
import { publishCheckAndReview } from "../../src/cli/review-outcome.js";
import type { CheckPort, ReviewPort } from "../../src/platform/types.js";

function fakePorts(opts?: { reviewShouldFail?: boolean }) {
  const checks: CheckPort = {
    upsertCheck: vi.fn().mockResolvedValue(undefined),
  };
  const reviews: ReviewPort = {
    findExistingReview: vi.fn().mockResolvedValue(undefined),
    createReview: opts?.reviewShouldFail
      ? vi.fn().mockRejectedValue(new Error("Validation Failed: line not part of the diff"))
      : vi.fn().mockResolvedValue(undefined),
    updateReview: vi.fn().mockResolvedValue(undefined),
  };
  return { checks, reviews };
}

describe("publishCheckAndReview", () => {
  it("posts a COMMENT review for availability skips before the success check", async () => {
    const { checks, reviews } = fakePorts();
    const exit = await publishCheckAndReview({
      checks,
      reviews,
      prNumber: 7,
      headSha: "abc",
      kind: "availability-skip",
      mode: "gate",
      summary: "Diff too large — skipped review.",
      comments: [],
    });
    expect(exit).toBe(0);
    expect(reviews.createReview).toHaveBeenCalledWith(7, "abc", "Diff too large — skipped review.", []);
    expect(checks.upsertCheck).toHaveBeenCalledWith(
      "abc",
      "success",
      expect.stringContaining("Review skipped:"),
      "Diff too large — skipped review.",
    );
  });

  it("still upserts a failure check on head when the Reviews API fails", async () => {
    const { checks, reviews } = fakePorts({ reviewShouldFail: true });
    await expect(
      publishCheckAndReview({
        checks,
        reviews,
        prNumber: 7,
        headSha: "abc",
        kind: "PASS",
        mode: "gate",
        summary: "looks good",
        comments: [{ path: "x.ts", line: 1, severity: "high", message: "nope" }],
      }),
    ).rejects.toThrow(/Validation Failed/);
    expect(checks.upsertCheck).toHaveBeenCalledWith(
      "abc",
      "failure",
      expect.stringContaining("fail-closed"),
      expect.stringContaining("Reviews API failed"),
    );
  });

  it("PUTs the existing review instead of stacking a second COMMENT", async () => {
    const { checks, reviews } = fakePorts();
    (reviews.findExistingReview as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 99 });
    await publishCheckAndReview({
      checks,
      reviews,
      prNumber: 7,
      headSha: "abc",
      kind: "PASS",
      mode: "advisory",
      summary: "updated",
      comments: [],
    });
    expect(reviews.updateReview).toHaveBeenCalledWith(99, 7, "abc", "updated");
    expect(reviews.createReview).not.toHaveBeenCalled();
  });

  it("skips the Reviews API when there is no PR number (unmapped merge_group)", async () => {
    const { checks, reviews } = fakePorts();
    const exit = await publishCheckAndReview({
      checks,
      reviews,
      headSha: "merge-sha",
      kind: "PASS",
      mode: "gate",
      summary: "looks good",
    });
    expect(exit).toBe(0);
    expect(reviews.createReview).not.toHaveBeenCalled();
    expect(reviews.findExistingReview).not.toHaveBeenCalled();
    expect(checks.upsertCheck).toHaveBeenCalledWith("merge-sha", "success", "PASS", "looks good");
  });
});
