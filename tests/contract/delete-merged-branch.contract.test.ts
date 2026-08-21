import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

describe("delete-merged-branch workflow", () => {
  const yaml = readFileSync(".github/workflows/delete-merged-branch.yml", "utf8");
  const doc = parseYaml(yaml);
  const job = doc.jobs.delete;

  it("runs only after a pull request is closed", () => {
    expect(doc.on.pull_request.types).toEqual(["closed"]);
  });

  it("deletes only merged same-repo heads, never the default branch", () => {
    expect(job.if).toContain("github.event.pull_request.merged");
    expect(job.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(job.if).toContain("github.event.pull_request.head.ref != github.event.repository.default_branch");
  });

  it("uses contents: write so GITHUB_TOKEN can delete the ref", () => {
    expect(doc.permissions.contents).toBe("write");
  });

  it("runs the tested delete script, not inline gh-api grep", () => {
    const step = job.steps.find((s: { run?: string }) => s.run?.includes("delete-merged-head-ref.sh"));
    expect(step).toBeDefined();
  });
});
