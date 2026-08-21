import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPinnedShas } from "../../src/core/pinned-shas.js";
import { buildWorkflowYaml } from "../../src/cli/write-workflow.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("installed workflow pin stays in sync with pinned-shas.json", () => {
  const shas = loadPinnedShas(join(repoRoot, "pinned-shas.json"));
  const workflowPath = join(repoRoot, ".github/workflows/revieweragent.yml");
  const workflow = readFileSync(workflowPath, "utf8");

  it("matches what init generates for subscription auth", () => {
    expect(workflow).toBe(buildWorkflowYaml({ auth: "subscription", shas }));
  });

  it("reviewActionSha is a real commit object in this clone", () => {
    expect(shas.reviewActionSha).toMatch(/^[0-9a-f]{40}$/);
    const type = execFileSync("git", ["cat-file", "-t", shas.reviewActionSha], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    expect(type).toBe("commit");
  });
});
