import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildWorkflowYaml, CURSOR_CLI_VERSION, WORKFLOW_JOB_ID } from "../../src/cli/write-workflow.js";

const shas = {
  checkoutSha: "a".repeat(40),
  reviewActionSha: "b".repeat(40),
  actionOwner: "revieweragent-org",
  actionRepo: "revieweragent",
  cacheSha: "c".repeat(40),
};

describe("v2 generated workflow", () => {
  it("emits merge_group and carries its SHA in run-name and concurrency", () => {
    const yaml = buildWorkflowYaml({ auth: "subscription", provider: "claude", shas });
    expect(yaml).toMatch(/merge_group:/);
    expect(yaml).toMatch(/github\.event\.merge_group\.head_sha/);
    const doc = parseYaml(yaml);
    expect(doc.on.merge_group).toBeDefined();
    expect(doc.on.pull_request).toBeUndefined();
  });

  it("installs the checksum-pinned Cursor tarball instead of Claude npm", () => {
    const yaml = buildWorkflowYaml({ auth: "subscription", provider: "cursor", shas });
    expect(yaml).toContain(`CURSOR_CLI_VERSION: ${CURSOR_CLI_VERSION}`);
    expect(yaml).toContain("downloads.cursor.com/lab/${CURSOR_CLI_VERSION}/linux/");
    expect(yaml).toContain("agent-cli-package.tar.gz");
    expect(yaml).toContain("sha256sum");
    expect(yaml).toContain("CURSOR_API_KEY");
    expect(yaml).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(yaml).not.toContain("claude-code");
    const job = parseYaml(yaml).jobs[WORKFLOW_JOB_ID];
    const review = job.steps[job.steps.length - 1];
    expect(review.env.CURSOR_API_KEY).toBeDefined();
    expect(review.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
