import { readFileSync } from "node:fs";
import type { Octokit } from "@octokit/rest";

// SPEC.md §8 step 1: resolve PR number + head SHA + base SHA from the
// event payload (pull_request_target or issue_comment). merge_group is
// explicitly not in v1 (SPEC §0, §8 step 4) — its shape is not resolved
// here.

export type PullRequestEventAction = "opened" | "synchronize" | "ready_for_review";

export interface EventContext {
  eventName: "pull_request_target" | "issue_comment";
  action: PullRequestEventAction | "created";
  prNumber: number;
  headSha: string;
  baseSha: string;
  isDraft: boolean;
  isFork: boolean;
  prAuthorLogin: string;
  title: string;
  body: string;
  commentBody?: string;
  commenterLogin?: string;
}

export class UnsupportedEventError extends Error {
  constructor(eventName: string) {
    super(`Unsupported or unhandled event: ${eventName} (merge_group is not in v1, SPEC.md §0/§8)`);
    this.name = "UnsupportedEventError";
  }
}

interface PullRequestTargetPayload {
  action: PullRequestEventAction;
  pull_request: {
    number: number;
    title?: string | null;
    body?: string | null;
    draft: boolean;
    head: { sha: string; repo: { full_name: string } | null; user?: { login: string } };
    base: { sha: string; repo: { full_name: string } };
    user: { login: string };
  };
  repository: { full_name: string };
}

interface IssueCommentPayload {
  action: "created";
  issue: { number: number; pull_request?: unknown };
  comment: { body: string; user: { login: string } };
  repository: { full_name: string };
}

function readEventPayload<T>(): T {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) throw new Error("GITHUB_EVENT_PATH is not set — not running inside GitHub Actions");
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export async function resolveEventContext(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<EventContext> {
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventName === "pull_request_target") {
    const payload = readEventPayload<PullRequestTargetPayload>();
    const pr = payload.pull_request;
    const isFork = pr.head.repo?.full_name !== payload.repository.full_name;
    return {
      eventName: "pull_request_target",
      action: payload.action,
      prNumber: pr.number,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      isDraft: pr.draft,
      isFork,
      prAuthorLogin: pr.user.login,
      title: pr.title ?? "",
      body: pr.body ?? "",
    };
  }

  if (eventName === "issue_comment") {
    const payload = readEventPayload<IssueCommentPayload>();
    if (!payload.issue.pull_request) {
      throw new UnsupportedEventError("issue_comment (not a pull request)");
    }
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: payload.issue.number });
    const isFork = pr.head.repo?.full_name !== `${owner}/${repo}`;
    return {
      eventName: "issue_comment",
      action: "created",
      prNumber: payload.issue.number,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      isDraft: pr.draft ?? false,
      isFork,
      prAuthorLogin: pr.user?.login ?? "",
      title: pr.title ?? "",
      body: pr.body ?? "",
      commentBody: payload.comment.body,
      commenterLogin: payload.comment.user.login,
    };
  }

  throw new UnsupportedEventError(eventName ?? "(unset)");
}
