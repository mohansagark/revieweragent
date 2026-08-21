import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildWorkflowYaml, WORKFLOW_JOB_ID } from "../../src/cli/write-workflow.js";

const shas = {
  checkoutSha: "a".repeat(40),
  reviewActionSha: "b".repeat(40),
  actionOwner: "revieweragent-org",
  actionRepo: "revieweragent",
  cacheSha: "c".repeat(40),
};

describe("fallback workflow generation", () => {
  it("unions Claude npm and Cursor tarball installs with split CLI-failed flags", () => {
    const yaml = buildWorkflowYaml({
      auth: "subscription",
      provider: "claude",
      fallback: { provider: "cursor", auth: "subscription" },
      shas,
    });
    expect(yaml).toContain("claude-code");
    expect(yaml).toContain("downloads.cursor.com/lab");
    const review = parseYaml(yaml).jobs[WORKFLOW_JOB_ID].steps.at(-1);
    expect(review.env.REVIEWERAGENT_CLI_INSTALL_FAILED).toBeDefined();
    expect(review.env.REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED).toBeDefined();
    expect(review.env.REVIEWERAGENT_CURSOR_BIN).toBeDefined();
    expect(review.env.CLAUDE_CODE_OAUTH_TOKEN).toBeDefined();
    expect(review.env.CURSOR_API_KEY).toBeDefined();
  });

  it("omits both CLI installs for Gemini-only", () => {
    const yaml = buildWorkflowYaml({ auth: "api-key", provider: "gemini", shas });
    const job = parseYaml(yaml).jobs[WORKFLOW_JOB_ID];
    expect(job.steps).toHaveLength(2);
    expect(yaml).not.toContain("claude-code");
    expect(yaml).not.toContain("downloads.cursor.com");
    expect(job.steps[1].env.GEMINI_API_KEY).toBeDefined();
    expect(job.steps[1].env.REVIEWERAGENT_CLI_INSTALL_FAILED).toBeUndefined();
  });

  it("uses the new Cursor CLI-failed flag on cursor-only workflows", () => {
    const yaml = buildWorkflowYaml({ auth: "subscription", provider: "cursor", shas });
    const review = parseYaml(yaml).jobs[WORKFLOW_JOB_ID].steps.at(-1);
    expect(review.env.REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED).toBeDefined();
    expect(review.env.REVIEWERAGENT_CLI_INSTALL_FAILED).toBeUndefined();
  });
});
