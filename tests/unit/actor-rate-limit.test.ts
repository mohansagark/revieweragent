import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import {
  countInferenceRunsInLastHour,
  prHeadShaFromWorkflowRun,
} from "../../src/platform/github/actor-rate-limit.js";

const PR_HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MERGE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function octokitWithRuns(
  runs: unknown[],
  opts: {
    listForRef?: ReturnType<typeof vi.fn>;
    associatedPulls?: ReturnType<typeof vi.fn>;
  } = {},
): { octokit: Octokit; listForRef: ReturnType<typeof vi.fn>; associatedPulls: ReturnType<typeof vi.fn> } {
  const listWorkflowRuns = vi.fn().mockResolvedValue({ data: { workflow_runs: runs } });
  const listForRef =
    opts.listForRef ??
    vi.fn().mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === PR_HEAD) {
        return { data: { check_runs: [{ id: 1, name: "revieweragent" }] } };
      }
      return { data: { check_runs: [] } };
    });
  const associatedPulls =
    opts.associatedPulls ?? vi.fn().mockResolvedValue({ data: [] });
  const octokit = {
    paginate: {
      iterator: async function* () {
        const { data } = await listWorkflowRuns();
        yield { data: data.workflow_runs };
      },
    },
    actions: { listWorkflowRuns },
    checks: { listForRef },
    repos: { listPullRequestsAssociatedWithCommit: associatedPulls },
  } as unknown as Octokit;
  return { octokit, listForRef, associatedPulls };
}

describe("prHeadShaFromWorkflowRun", () => {
  it("prefers pull_requests[0].head.sha when GitHub populated it (same-repo PRs)", () => {
    expect(
      prHeadShaFromWorkflowRun({
        head_sha: MERGE_SHA,
        pull_requests: [{ head: { sha: PR_HEAD } }],
      }),
    ).toBe(PR_HEAD);
  });

  it("reads the PR head SHA from run-name when pull_requests is empty (fork / cross-repo PRs)", () => {
    // GitHub's Actions API leaves pull_requests empty for forked PRs.
    // The generated workflow sets run-name to `revieweragent <head-sha>`.
    expect(
      prHeadShaFromWorkflowRun({
        head_sha: MERGE_SHA,
        name: `revieweragent ${PR_HEAD}`,
        pull_requests: [],
      }),
    ).toBe(PR_HEAD);
  });

  it("does not treat display_title (PR title) as a SHA source", () => {
    expect(
      prHeadShaFromWorkflowRun({
        head_sha: MERGE_SHA,
        display_title: PR_HEAD,
        pull_requests: [],
      }),
    ).toBeUndefined();
  });
});

describe("countInferenceRunsInLastHour", () => {
  it("counts checks on the PR head SHA, not run.head_sha (base on pull_request_target)", async () => {
    const { octokit, listForRef } = octokitWithRuns([
      { head_sha: MERGE_SHA, pull_requests: [{ head: { sha: PR_HEAD } }] },
    ]);

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider");
    expect(count).toBe(1);
    expect(listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: PR_HEAD }));
    expect(listForRef).not.toHaveBeenCalledWith(expect.objectContaining({ ref: MERGE_SHA }));
  });

  it("counts fork runs whose pull_requests array is empty by parsing run-name", async () => {
    const { octokit, listForRef } = octokitWithRuns([
      { head_sha: MERGE_SHA, name: `revieweragent ${PR_HEAD}`, pull_requests: [] },
    ]);

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider");
    expect(count).toBe(1);
    expect(listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: PR_HEAD }));
  });

  it("falls back to PRs associated with the merge commit when run-name has no SHA", async () => {
    const associatedPulls = vi.fn().mockResolvedValue({
      data: [{ head: { sha: PR_HEAD } }],
    });
    const { octokit, listForRef } = octokitWithRuns(
      [{ head_sha: MERGE_SHA, pull_requests: [] }],
      { associatedPulls },
    );

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider");
    expect(count).toBe(1);
    expect(associatedPulls).toHaveBeenCalledWith(
      expect.objectContaining({ commit_sha: MERGE_SHA }),
    );
    expect(listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: PR_HEAD }));
  });

  it("does not count a run with no resolvable PR head SHA", async () => {
    const { octokit, listForRef } = octokitWithRuns([{ head_sha: MERGE_SHA, pull_requests: [] }]);

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider");
    expect(count).toBe(0);
    expect(listForRef).not.toHaveBeenCalled();
  });

  it("stops listing checks once the actor cap is reached", async () => {
    const { octokit, listForRef } = octokitWithRuns([
      { head_sha: MERGE_SHA, name: `revieweragent ${PR_HEAD}`, pull_requests: [] },
      { head_sha: MERGE_SHA, name: `revieweragent ${PR_HEAD}`, pull_requests: [] },
    ]);

    const count = await countInferenceRunsInLastHour(octokit, "acme", "widgets", "outsider", 1);
    expect(count).toBe(1);
    expect(listForRef).toHaveBeenCalledTimes(1);
  });
});
