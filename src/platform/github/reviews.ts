import type { Octokit } from "@octokit/rest";
import type { ReviewPort, FindingComment } from "../types.js";
import { findReviewByMarker, bodyWithMarker } from "../../core/idempotency.js";

// SPEC.md §9 "Review object vs gate" / §14. Native PR Review, type
// COMMENT, always — never APPROVE or REQUEST_CHANGES. This is never the
// gate; checks.ts is.

export function createGitHubReviewPort(
  octokit: Octokit,
  owner: string,
  repo: string,
): ReviewPort {
  return {
    async findExistingReview(pr: number, headSha: string) {
      const { data } = await octokit.pulls.listReviews({ owner, repo, pull_number: pr });
      return findReviewByMarker(data as { id: number; body: string }[], headSha);
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
      // SPEC.md §14: PUT is the supported update path — no
      // submitted/pending restriction. Never dismiss, never stack. The
      // marker is re-embedded so the next retry's lookup still matches.
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
