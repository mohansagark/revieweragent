import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { countInferenceRunsInLastHour } from "../../src/platform/github/actor-rate-limit.js";

describe("countInferenceRunsInLastHour", () => {
  it("counts checks on the PR head SHA, not run.head_sha (base on pull_request_target)", async () => {
    const listWorkflowRuns = vi.fn().mockResolvedValue({
      data: {
        workflow_runs: [
          {
            head_sha: "base-sha",
            pull_requests: [{ head: { sha: "pr-head-sha" } }],
          },
        ],
      },
    });
    const listForRef = vi.fn().mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === "pr-head-sha") {
        return { data: { check_runs: [{ id: 1, name: "revieweragent" }] } };
      }
      return { data: { check_runs: [{ id: 2, name: "revieweragent" }] } };
    });
    const octokit = {
      paginate: {
        iterator: async function* () {
          const { data } = await listWorkflowRuns();
          yield { data: data.workflow_runs };
        },
      },
      actions: { listWorkflowRuns },
      checks: { listForRef },
    } as unknown as Octokit;

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider");
    expect(count).toBe(1);
    expect(listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: "pr-head-sha" }));
    expect(listForRef).not.toHaveBeenCalledWith(expect.objectContaining({ ref: "base-sha" }));
  });

  it("does not count a run with no PR head SHA and no inference check there", async () => {
    const listWorkflowRuns = vi.fn().mockResolvedValue({
      data: { workflow_runs: [{ head_sha: "base-sha", pull_requests: [] }] },
    });
    const listForRef = vi.fn();
    const octokit = {
      paginate: {
        iterator: async function* () {
          const { data } = await listWorkflowRuns();
          yield { data: data.workflow_runs };
        },
      },
      actions: { listWorkflowRuns },
      checks: { listForRef },
    } as unknown as Octokit;

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider");
    expect(count).toBe(0);
    expect(listForRef).not.toHaveBeenCalled();
  });
});
