import type { Octokit } from "@octokit/rest";
import type { EventContext } from "./review-event-context.js";
import type { RevieweragentConfig } from "../core/config-schema.js";

// SPEC.md §9's skip-vs-no-op table. A skip here means: no Reviews API
// call, no check run on head SHA, exit 0. Job-level `if:` in the
// generated workflow already drops the most obvious issue_comment noise
// (SPEC §9), but this is the authoritative check — a job-level `if:`
// skip is not itself a safe gate.

export type SkipDecision = { skip: true; reason: string } | { skip: false };

async function hasWriteAccess(
  octokit: Octokit,
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  const { data } = await octokit.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username,
  });
  return data.permission === "write" || data.permission === "admin";
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
