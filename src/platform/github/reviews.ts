import type { Octokit } from "@octokit/rest";
import type { ReviewPort, FindingComment } from "../types.js";
import { findReviewByMarker, bodyWithMarker } from "../../core/idempotency.js";

// GITHUB_TOKEN reviews are always authored by github-actions[bot]. Do not
// add GITHUB_ACTOR: on pull_request_target from a fork, that is the
// untrusted PR author, and a forged marker comment would match as "ours"
// then 403 on updateReview (they don't own the bot's review).
const WORKFLOW_REVIEW_ACTOR = "github-actions[bot]";

export function createGitHubReviewPort(
  octokit: Octokit,
  owner: string,
  repo: string,
): ReviewPort {
  return {
    async findExistingReview(pr: number, headSha: string) {
      for await (const response of octokit.paginate.iterator(octokit.pulls.listReviews, {
        owner,
        repo,
        pull_number: pr,
        per_page: 100,
      })) {
        const page = (
          response.data as { id: number; body?: string | null; user?: { login?: string | null } | null }[]
        )
          .filter((r) => r.user?.login === WORKFLOW_REVIEW_ACTOR)
          .map((r) => ({ id: r.id, body: r.body ?? "" }));
        const match = findReviewByMarker(page, headSha);
        if (match) return { id: match.id };
      }
      return undefined;
    },

    async createReview(
      pr: number,
      headSha: string,
      summary: string,
      comments: FindingComment[],
    ): Promise<void> {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pr,
        commit_id: headSha,
        event: "COMMENT",
        body: bodyWithMarker(summary, headSha),
        comments: comments.map((c) => ({
          path: c.path,
          line: c.line,
          side: "RIGHT",
          body: `**${c.severity}**: ${c.message}`,
        })),
      });
    },

    async updateReview(reviewId: number, pr: number, headSha: string, summary: string): Promise<void> {
      await octokit.pulls.updateReview({
        owner,
        repo,
        pull_number: pr,
        review_id: reviewId,
        body: bodyWithMarker(summary, headSha),
      });
    },
  };
}
