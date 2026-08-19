import type { Octokit } from "@octokit/rest";
import type { CheckPort, CheckConclusion } from "../types.js";
import { JOB_NAME } from "../../cli/write-workflow.js";

// SPEC.md §9 "Check run SHA": create/update on the correct head SHA,
// success/failure only — never neutral (inconsistent handling across
// GitHub's docs/UI for required checks).

export function createGitHubCheckPort(
  octokit: Octokit,
  owner: string,
  repo: string,
): CheckPort {
  return {
    async upsertCheck(
      headSha: string,
      conclusion: CheckConclusion,
      title: string,
      summary: string,
    ): Promise<void> {
      const { data: existing } = await octokit.checks.listForRef({
        owner,
        repo,
        ref: headSha,
        check_name: JOB_NAME,
      });
      const run = existing.check_runs[0];

      if (run) {
        await octokit.checks.update({
          owner,
          repo,
          check_run_id: run.id,
          status: "completed",
          conclusion,
          output: { title, summary },
        });
        return;
      }

      await octokit.checks.create({
        owner,
        repo,
        name: JOB_NAME,
        head_sha: headSha,
        status: "completed",
        conclusion,
        output: { title, summary },
      });
    },
  };
}
