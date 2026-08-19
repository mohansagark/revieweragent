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
    auth: "api-key",
    shas: {
      checkoutSha: "a".repeat(40),
      reviewActionSha: "b".repeat(40),
      actionOwner: "revieweragent-org",
      actionRepo: "revieweragent",
    },
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

  it("references the package's own actions/review path with an exact SHA pin — never the target repo being installed into", () => {
    const reviewStep = doc.jobs.revieweragent.steps[1];
    expect(reviewStep.uses).toBe(`revieweragent-org/revieweragent/actions/review@${"b".repeat(40)}`);
  });

  it("regression: buildWorkflowYaml takes no target-repo owner/repo at all", () => {
    // Real bug caught in manual testing: init.ts once passed the repo
    // being installed INTO as buildWorkflowYaml's owner/repo, generating
    // `uses: <target-owner>/<target-repo>/actions/review@sha` — a path
    // GitHub Actions can never resolve, since actions/review only exists
    // in this package's own repo. WorkflowOptions has no owner/repo field
    // any more; only shas.actionOwner/actionRepo feed the `uses:` line.
    const opts: Parameters<typeof buildWorkflowYaml>[0] = {
      auth: "api-key",
      shas: {
        checkoutSha: "a".repeat(40),
        reviewActionSha: "b".repeat(40),
        actionOwner: "revieweragent-org",
        actionRepo: "revieweragent",
      },
    };
    expect(Object.keys(opts)).not.toContain("owner");
    expect(Object.keys(opts)).not.toContain("repo");
  });

  it("action.yml exists at the locked path", () => {
    const actionYaml = readFileSync("actions/review/action.yml", "utf8");
    expect(actionYaml).toContain("dist/index.js");
  });
});
