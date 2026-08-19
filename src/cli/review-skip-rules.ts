import type { Octokit } from "@octokit/rest";
import type { EventContext } from "./review-event-context.js";
import type { RevieweragentConfig } from "../core/config-schema.js";

// SPEC.md §9's skip-vs-no-op table. A skip here means: no Reviews API
// call, no check run on head SHA, exit 0. Drafts are also skipped by the
// generated workflow's job-level `if:` (SPEC §7/§9, corrected after live
// testing). Other no-ops stay code-side so GitHub's auto-check for
// `revieweragent-run` is never the required gate.

export type SkipDecision = { skip: true; reason: string } | { skip: false };

async function hasWriteAccess(
  octokit: Octokit,
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  try {
    const { data } = await octokit.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    return data.permission === "admin" || data.permission === "maintain" || data.permission === "write";
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 403) return false;
    throw err;
  }
}

export async function decideSkip(
  octokit: Octokit,
  owner: string,
  repo: string,
  ctx: EventContext,
  config: RevieweragentConfig,
): Promise<SkipDecision> {
  if (ctx.eventName === "pull_request_target") {
    if (ctx.isDraft) {
      return { skip: true, reason: "draft PR — ready_for_review is the real run" };
    }
    if (ctx.isFork && config.fork_policy === "comment-gated") {
      return { skip: true, reason: "comment-gated fork PR with no /review yet" };
    }
    return { skip: false };
  }

  // issue_comment
  if (!ctx.commentBody?.includes(config.trigger_phrase)) {
    return { skip: true, reason: "comment lacks trigger phrase" };
  }
  if (!ctx.commenterLogin || !(await hasWriteAccess(octokit, owner, repo, ctx.commenterLogin))) {
    return { skip: true, reason: "commenter lacks write access" };
  }
  return { skip: false };
}
