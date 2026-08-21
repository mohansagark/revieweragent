import { describe, expect, it } from "vitest";
import {
  parseMergeGroupPrNumber,
  shouldReuseMergeGroupCheck,
} from "../../src/cli/merge-group-reuse.js";

describe("merge_group mapping (v2)", () => {
  it("parses the PR number from GitHub's queue head_ref", () => {
    expect(
      parseMergeGroupPrNumber("refs/heads/gh-readonly-queue/main/pr-42-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ).toBe(42);
    expect(parseMergeGroupPrNumber("refs/heads/feature")).toBeUndefined();
  });

  it("reuses only a real PASS when the merge-group base matches the PR base", () => {
    expect(
      shouldReuseMergeGroupCheck({
        checkConclusion: "success",
        checkTitle: "PASS",
        mergeGroupBaseSha: "base1",
        pullBaseSha: "base1",
      }),
    ).toBe(true);
  });

  it("does not reuse availability skips, failures, or a moved base", () => {
    expect(
      shouldReuseMergeGroupCheck({
        checkConclusion: "success",
        checkTitle: "Review skipped: availability-skip",
        mergeGroupBaseSha: "base1",
        pullBaseSha: "base1",
      }),
    ).toBe(false);
    expect(
      shouldReuseMergeGroupCheck({
        checkConclusion: "failure",
        checkTitle: "BLOCK",
        mergeGroupBaseSha: "base1",
        pullBaseSha: "base1",
      }),
    ).toBe(false);
    expect(
      shouldReuseMergeGroupCheck({
        checkConclusion: "success",
        checkTitle: "PASS",
        mergeGroupBaseSha: "new-base",
        pullBaseSha: "old-base",
      }),
    ).toBe(false);
  });
});
