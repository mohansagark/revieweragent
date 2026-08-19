import { describe, it, expect } from "vitest";
import { commentsInDiff, formatFilePatches, rightSideLines } from "../../src/core/review-payload.js";
import { wrapUntrustedData } from "../../src/core/sanitizer.js";
import { filterExcluded, type PrFile } from "../../src/core/diff-limits.js";
import { defaultConfig } from "../../src/core/config-schema.js";

describe("formatFilePatches", () => {
  it("includes the filename so hunks are attributable", () => {
    const files: PrFile[] = [
      { filename: "src/auth.ts", changes: 2, patch: "@@ -1,1 +1,2 @@\n context\n+new" },
    ];
    const formatted = formatFilePatches(files);
    expect(formatted).toContain("diff --git a/src/auth.ts b/src/auth.ts");
    expect(formatted).toContain("+new");
  });
});

describe("excluded files are dropped from the model payload", () => {
  it("does not send lockfiles or dist after exclude globs", () => {
    const files: PrFile[] = [
      { filename: "package-lock.json", changes: 5000, patch: "+lock" },
      { filename: "dist/bundle.js", changes: 2000, patch: "+bundle" },
      { filename: "src/index.ts", changes: 10, patch: "@@ -1 +1,2 @@\n+ok" },
    ];
    const included = filterExcluded(files, defaultConfig().exclude);
    const payload = wrapUntrustedData({
      title: "Fix auth",
      body: "details",
      diff: formatFilePatches(included),
    });
    expect(payload).toContain("src/index.ts");
    expect(payload).toContain("Fix auth");
    expect(payload).toContain("details");
    expect(payload).not.toContain("package-lock.json");
    expect(payload).not.toContain("+lock");
    expect(payload).not.toContain("dist/bundle.js");
  });
});

describe("rightSideLines / commentsInDiff", () => {
  const patch = ["@@ -10,3 +10,4 @@", " context", "-old", "+new", " more"].join("\n");

  it("collects RIGHT-side line numbers from a unified hunk", () => {
    const lines = rightSideLines(patch);
    expect(lines.has(10)).toBe(true);
    expect(lines.has(11)).toBe(true);
    expect(lines.has(12)).toBe(true);
    expect(lines.has(9)).toBe(false);
  });

  it("drops inline comments whose line is not in a RIGHT hunk", () => {
    const files: PrFile[] = [{ filename: "src/auth.ts", changes: 2, patch }];
    const kept = commentsInDiff(files, [
      { path: "src/auth.ts", line: 11, severity: "high", message: "in hunk" },
      { path: "src/auth.ts", line: 999, severity: "high", message: "not in hunk" },
      { path: "src/other.ts", line: 11, severity: "high", message: "wrong file" },
    ]);
    expect(kept).toEqual([{ path: "src/auth.ts", line: 11, severity: "high", message: "in hunk" }]);
  });
});
