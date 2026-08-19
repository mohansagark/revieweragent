import type { Octokit } from "@octokit/rest";
import { JOB_NAME } from "../../cli/write-workflow.js";

// SPEC.md §8 step 5: per-actor hourly fork-review cap, counted via the
// Actions API (not Checks — check runs have no list-by-actor query).
// Count only inference runs: a run counts only if its `revieweragent`
// check run on the head SHA exists (PASS, BLOCK, or "Review skipped:").
// No-ops (drafts, comment-gated skips) create a workflow run but emit no
// check — they must not burn the cap.

const WORKFLOW_FILE = "revieweragent.yml";

export async function countInferenceRunsInLastHour(
  octokit: Octokit,
  owner: string,
  repo: string,
  actor: string,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: WORKFLOW_FILE,
    actor,
    event: "pull_request_target",
    created: `>${oneHourAgo}`,
    per_page: 100,
  });

  let inferenceCount = 0;
  for (const run of data.workflow_runs) {
    const headSha = run.head_sha;
    if (!headSha) continue;
    const { data: checks } = await octokit.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      check_name: JOB_NAME,
    });
    if (checks.check_runs.length > 0) inferenceCount += 1;
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
  const count = await countInferenceRunsInLastHour(octokit, owner, repo, actor);
  return count < capPerHour;
}
