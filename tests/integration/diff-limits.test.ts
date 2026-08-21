import { describe, it, expect } from "vitest";
import {
  filterExcluded,
  checkLimits,
  decideLimitOutcome,
  compareResponseIsTruncated,
  CompareTruncatedError,
  fetchCompareFiles,
  type PrFile,
} from "../../src/core/diff-limits.js";
import { defaultConfig } from "../../src/core/config-schema.js";

describe("diff limits", () => {
  it("excludes lockfiles and build output via the default globs", () => {
    const files: PrFile[] = [
      { filename: "package-lock.json", changes: 5000 },
      { filename: "dist/bundle.js", changes: 2000 },
      { filename: "src/index.ts", changes: 10 },
    ];
    const included = filterExcluded(files, defaultConfig().exclude);
    expect(included.map((f) => f.filename)).toEqual(["src/index.ts"]);
  });

  it("gate mode always BLOCKs over-limit regardless of on_limit", () => {
    const config = defaultConfig({ mode: "gate", max_diff_lines: 10, on_limit: "skip" });
    const files: PrFile[] = [{ filename: "src/big.ts", changes: 5000 }];
    const { overLimit } = checkLimits(config, files);
    expect(overLimit).toBe(true);
    expect(decideLimitOutcome(config, overLimit)).toEqual({ kind: "gate-block" });
  });

  it("advisory mode with on_limit: skip treats over-limit as a skip, not a block", () => {
    const config = defaultConfig({ mode: "advisory", max_diff_lines: 10, on_limit: "skip" });
    const files: PrFile[] = [{ filename: "src/big.ts", changes: 5000 }];
    const { overLimit } = checkLimits(config, files);
    expect(decideLimitOutcome(config, overLimit)).toEqual({ kind: "advisory-skip" });
  });

  it("advisory mode with on_limit: block reports over-limit as a block", () => {
    const config = defaultConfig({ mode: "advisory", max_diff_lines: 10, on_limit: "block" });
    const files: PrFile[] = [{ filename: "src/big.ts", changes: 5000 }];
    const { overLimit } = checkLimits(config, files);
    expect(decideLimitOutcome(config, overLimit)).toEqual({ kind: "advisory-block" });
  });

  it("under-limit diffs pass through untouched", () => {
    const config = defaultConfig();
    const files: PrFile[] = [{ filename: "src/small.ts", changes: 5 }];
    const { overLimit } = checkLimits(config, files);
    expect(decideLimitOutcome(config, overLimit)).toEqual({ kind: "under-limit" });
  });
});

describe("compare API truncation (merge_group)", () => {
  it("treats truncated=true or a 300-file page as truncated", () => {
    expect(compareResponseIsTruncated({ truncated: true, files: [{ filename: "a.ts" }] })).toBe(true);
    expect(
      compareResponseIsTruncated({
        files: Array.from({ length: 300 }, (_, i) => ({ filename: `${i}.ts` })),
      }),
    ).toBe(true);
    expect(compareResponseIsTruncated({ truncated: false, files: [{ filename: "a.ts" }] })).toBe(false);
  });

  it("fail-closes fetchCompareFiles when GitHub truncates the file list", async () => {
    const octokit = {
      repos: {
        compareCommits: async () => ({ data: { truncated: true, files: [{ filename: "a.ts", changes: 1 }] } }),
      },
    };
    await expect(fetchCompareFiles(octokit as never, "o", "r", "base", "head")).rejects.toBeInstanceOf(
      CompareTruncatedError,
    );
  });
});
