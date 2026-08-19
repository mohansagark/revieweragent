import { describe, it, expect, vi, afterEach } from "vitest";
import type { Octokit } from "@octokit/rest";
import { createGitHubReviewPort } from "../../src/platform/github/reviews.js";
import { bodyWithMarker } from "../../src/core/idempotency.js";

function octokitWithReviewPages(
  pages: Array<Array<{ id: number; user: { login: string } | null; body: string }>>,
) {
  const listReviews = vi.fn();
  let calls = 0;
  const octokit = {
    paginate: {
      iterator: async function* () {
        for (const data of pages) {
          calls += 1;
          yield { data };
        }
      },
    },
    pulls: { listReviews, createReview: vi.fn(), updateReview: vi.fn() },
  } as unknown as Octokit;
  return { octokit, listReviews, pagesFetched: () => calls };
}

describe("createGitHubReviewPort", () => {
  const originalActor = process.env.GITHUB_ACTOR;
  afterEach(() => {
    if (originalActor === undefined) delete process.env.GITHUB_ACTOR;
    else process.env.GITHUB_ACTOR = originalActor;
  });

  it("paginates reviews and only matches github-actions[bot]'s marker", async () => {
    const ours = { id: 2, user: { login: "github-actions[bot]" }, body: bodyWithMarker("ok", "head") };
    const foreign = { id: 1, user: { login: "alice" }, body: bodyWithMarker("ok", "head") };
    const { octokit } = octokitWithReviewPages([[foreign, ours]]);

    const port = createGitHubReviewPort(octokit, "acme", "widgets");
    const found = await port.findExistingReview(7, "head");
    expect(found).toEqual({ id: 2 });
  });

  it("does not treat GITHUB_ACTOR as a trusted review author (fork PR authors are GITHUB_ACTOR)", async () => {
    process.env.GITHUB_ACTOR = "alice";
    const forged = { id: 9, user: { login: "alice" }, body: bodyWithMarker("ok", "head") };
    const { octokit } = octokitWithReviewPages([[forged]]);

    const port = createGitHubReviewPort(octokit, "acme", "widgets");
    await expect(port.findExistingReview(7, "head")).resolves.toBeUndefined();
  });

  it("stops paginating once the matching review is found", async () => {
    const ours = { id: 2, user: { login: "github-actions[bot]" }, body: bodyWithMarker("ok", "head") };
    const later = { id: 3, user: { login: "github-actions[bot]" }, body: "unrelated" };
    const { octokit, pagesFetched } = octokitWithReviewPages([[ours], [later]]);

    const port = createGitHubReviewPort(octokit, "acme", "widgets");
    await expect(port.findExistingReview(7, "head")).resolves.toEqual({ id: 2 });
    expect(pagesFetched()).toBe(1);
  });
});
