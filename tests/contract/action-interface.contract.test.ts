import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { buildWorkflowYaml, JOB_NAME } from "../../src/cli/write-workflow.js";
import { TEST_SHAS } from "../helpers/pinned-shas.js";

function reviewStep(doc: { jobs: { revieweragent: { steps: Array<{ uses?: string; env?: Record<string, string> }> } } }) {
  return doc.jobs.revieweragent.steps.find((s) => s.uses?.includes("/actions/review@"));
}

describe("action-interface contract", () => {
  const yaml = buildWorkflowYaml({
    auth: "api-key",
    shas: TEST_SHAS,
  });
  const doc = parseYaml(yaml);

  it("locks the job name to 'revieweragent'", () => {
    expect(JOB_NAME).toBe("revieweragent");
    expect(doc.jobs.revieweragent.name).toBe("revieweragent");
  });

  it("declares exactly the required job permissions", () => {
    expect(doc.jobs.revieweragent.permissions).toEqual({
      contents: "read",
      "pull-requests": "write",
      checks: "write",
      actions: "read",
    });
  });

  it("does not include merge_group in v1's on: block", () => {
    expect(doc.on.merge_group).toBeUndefined();
    expect(doc.on.pull_request_target).toBeDefined();
    expect(doc.on.issue_comment).toBeDefined();
    expect(doc.on.pull_request).toBeUndefined();
  });

  it("sets exactly one credential env var matching the auth type", () => {
    const step = reviewStep(doc);
    expect(step?.env?.ANTHROPIC_API_KEY).toBeDefined();
    expect(step?.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("wires GITHUB_TOKEN into the review step's env", () => {
    const step = reviewStep(doc);
    expect(step?.env?.GITHUB_TOKEN).toBeDefined();
  });

  it("checks out with persist-credentials: false and no ref override", () => {
    const checkoutStep = doc.jobs.revieweragent.steps[0];
    expect(checkoutStep.with["persist-credentials"]).toBe(false);
    expect(checkoutStep.with.ref).toBeUndefined();
  });

  it("references the package's own actions/review path with an exact SHA pin — never the target repo being installed into", () => {
    const step = reviewStep(doc);
    expect(step?.uses).toBe(
      `revieweragent-org/revieweragent/actions/review@${TEST_SHAS.reviewActionSha}`,
    );
  });

  it("regression: buildWorkflowYaml takes no target-repo owner/repo at all", () => {
    const opts: Parameters<typeof buildWorkflowYaml>[0] = {
      auth: "api-key",
      shas: TEST_SHAS,
    };
    expect(Object.keys(opts)).not.toContain("owner");
    expect(Object.keys(opts)).not.toContain("repo");
  });

  it("drops non-PR issue_comment noise at job-level if: without using that as the gate", () => {
    expect(doc.jobs.revieweragent.if).toContain("issue_comment");
    expect(doc.jobs.revieweragent.if).toContain("github.event.issue.pull_request");
  });

  it("action.yml exists at the locked path", () => {
    const actionYaml = readFileSync("actions/review/action.yml", "utf8");
    expect(actionYaml).toContain("dist/index.js");
  });
});

describe("subscription workflow installs the pinned Claude CLI", () => {
  const yaml = buildWorkflowYaml({ auth: "subscription", shas: TEST_SHAS });
  const doc = parseYaml(yaml);
  const steps: Array<Record<string, unknown>> = doc.jobs.revieweragent.steps;

  it("SHA-pins actions/cache and installs the exact @anthropic-ai/claude-code version before review", () => {
    const cacheStep = steps.find((s) => typeof s.uses === "string" && String(s.uses).startsWith("actions/cache@"));
    expect(cacheStep?.uses).toBe(`actions/cache@${TEST_SHAS.cacheSha}`);
    const installStep = steps.find(
      (s) => typeof s.run === "string" && String(s.run).includes("@anthropic-ai/claude-code@"),
    );
    expect(installStep?.run).toContain(`@anthropic-ai/claude-code@${TEST_SHAS.claudeCodeVersion}`);
    expect(installStep?.["continue-on-error"]).toBe(true);
  });

  it("does not install the CLI on the api-key path", () => {
    const apiYaml = buildWorkflowYaml({ auth: "api-key", shas: TEST_SHAS });
    expect(apiYaml).not.toContain("@anthropic-ai/claude-code");
    expect(apiYaml).not.toContain("actions/cache@");
  });

  it("passes install outcome into the review step so npm fetch failure can skip", () => {
    const review = steps.find((s) => typeof s.uses === "string" && String(s.uses).includes("/actions/review@")) as {
      env: Record<string, string>;
    };
    expect(review.env.REVIEWERAGENT_CLI_INSTALL_FAILED).toBeDefined();
    expect(review.env.CLAUDE_CODE_OAUTH_TOKEN).toBeDefined();
    expect(review.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
