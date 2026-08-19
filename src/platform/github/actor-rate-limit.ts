import type { Octokit } from "@octokit/rest";
import { JOB_NAME } from "../../cli/write-workflow.js";

const WORKFLOW_FILE = "revieweragent.yml";

interface WorkflowRunLike {
  head_sha?: string;
  pull_requests?: Array<{ head?: { sha?: string } }>;
}

export async function countInferenceRunsInLastHour(
  octokit: Octokit,
  owner: string,
  repo: string,
  actor: string,
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
      const prHeadSha = run.pull_requests?.[0]?.head?.sha;
      if (!prHeadSha) continue;
      const { data: checks } = await octokit.checks.listForRef({
        owner,
        repo,
        ref: prHeadSha,
        check_name: JOB_NAME,
      });
      if (checks.check_runs.length > 0) inferenceCount += 1;
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
  const count = await countInferenceRunsInLastHour(octokit, owner, repo, actor);
  return count < capPerHour;
}
