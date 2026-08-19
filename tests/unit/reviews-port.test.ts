import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { createGitHubReviewPort } from "../../src/platform/github/reviews.js";
import { bodyWithMarker } from "../../src/core/idempotency.js";

describe("createGitHubReviewPort", () => {
  it("paginates reviews and only matches this workflow actor's marker", async () => {
    const ours = { id: 2, user: { login: "github-actions[bot]" }, body: bodyWithMarker("ok", "head") };
    const foreign = { id: 1, user: { login: "alice" }, body: bodyWithMarker("ok", "head") };
    const paginate = vi.fn().mockResolvedValue([foreign, ours]);
    const octokit = {
      paginate,
      pulls: { listReviews: vi.fn(), createReview: vi.fn(), updateReview: vi.fn() },
    } as unknown as Octokit;

    const port = createGitHubReviewPort(octokit, "acme", "widgets");
    const found = await port.findExistingReview(7, "head");
    expect(found).toEqual({ id: 2 });
    expect(paginate).toHaveBeenCalled();
  });
});
