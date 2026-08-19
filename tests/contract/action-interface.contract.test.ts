import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { buildWorkflowYaml, JOB_NAME } from "../../src/cli/write-workflow.js";

// Validates the generated workflow against
// specs/001-v1-core-commands/contracts/action-interface.md's required
// shape: locked job name, permissions, no merge_group, exactly one
// credential env var, base-only checkout.

describe("action-interface contract", () => {
  const yaml = buildWorkflowYaml({
    owner: "acme",
    repo: "widgets",
    auth: "api-key",
    shas: { checkoutSha: "a".repeat(40), reviewActionSha: "b".repeat(40) },
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
    const step = doc.jobs.revieweragent.steps[1];
    expect(step.env.ANTHROPIC_API_KEY).toBeDefined();
    expect(step.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("checks out with persist-credentials: false and no ref override", () => {
    const checkoutStep = doc.jobs.revieweragent.steps[0];
    expect(checkoutStep.with["persist-credentials"]).toBe(false);
    expect(checkoutStep.with.ref).toBeUndefined();
  });

  it("references this repo's actions/review path with an exact SHA pin", () => {
    const reviewStep = doc.jobs.revieweragent.steps[1];
    expect(reviewStep.uses).toBe(`acme/widgets/actions/review@${"b".repeat(40)}`);
  });

  it("action.yml exists at the locked path", () => {
    const actionYaml = readFileSync("actions/review/action.yml", "utf8");
    expect(actionYaml).toContain("dist/index.js");
  });
});
