import type { Octokit } from "@octokit/rest";
import { JOB_NAME } from "../../cli/write-workflow.js";

const WORKFLOW_FILE = "revieweragent.yml";
const RUN_NAME_PREFIX = "revieweragent ";
const SHA_RE = /^[0-9a-f]{40}$/;

interface WorkflowRunLike {
  head_sha?: string;
  name?: string;
  display_title?: string;
  pull_requests?: Array<{ head?: { sha?: string } }>;
}

export function prHeadShaFromWorkflowRun(run: WorkflowRunLike): string | undefined {
  const fromPr = run.pull_requests?.[0]?.head?.sha;
  if (fromPr && SHA_RE.test(fromPr)) return fromPr;

  // GitHub leaves pull_requests empty for cross-repo (forked) PRs. The
  // generated workflow sets `run-name: revieweragent <pr-head-sha>` so
  // the cap can still address the check on the fork commit.
  if (run.name?.startsWith(RUN_NAME_PREFIX)) {
    const fromName = run.name.slice(RUN_NAME_PREFIX.length).trim().split(/\s+/)[0];
    if (fromName && SHA_RE.test(fromName)) return fromName;
  }
  return undefined;
}

async function resolvePrHeadSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  run: WorkflowRunLike,
): Promise<string | undefined> {
  const fromRun = prHeadShaFromWorkflowRun(run);
  if (fromRun) return fromRun;
  if (!run.head_sha) return undefined;
  try {
    const { data } = await octokit.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: run.head_sha,
      per_page: 1,
    });
    const associated = data[0]?.head?.sha;
    return associated && SHA_RE.test(associated) ? associated : undefined;
  } catch {
    return undefined;
  }
}

export async function countInferenceRunsInLastHour(
  octokit: Octokit,
  owner: string,
  repo: string,
  actor: string,
  stopAfter?: number,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let inferenceCount = 0;
  for await (const response of octokit.paginate.iterator(octokit.actions.listWorkflowRuns, {
    owner,
    repo,
    workflow_id: WORKFLOW_FILE,
    actor,
    event: "pull_request_target",
    created: `>${oneHourAgo}`,
    per_page: 100,
  })) {
    for (const run of response.data as WorkflowRunLike[]) {
      const prHeadSha = await resolvePrHeadSha(octokit, owner, repo, run);
      if (!prHeadSha) continue;
      const { data: checks } = await octokit.checks.listForRef({
        owner,
        repo,
        ref: prHeadSha,
        check_name: JOB_NAME,
      });
      if (checks.check_runs.length > 0) inferenceCount += 1;
      if (stopAfter !== undefined && inferenceCount >= stopAfter) return inferenceCount;
    }
  }
  return inferenceCount;
}

export async function isUnderActorCap(
  octokit: Octokit,
  owner: string,
  repo: string,
  actor: string,
  capPerHour: number,
): Promise<boolean> {
  const count = await countInferenceRunsInLastHour(octokit, owner, repo, actor, capPerHour);
  return count < capPerHour;
}
