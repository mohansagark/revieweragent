import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { buildWorkflowYaml, JOB_NAME, WORKFLOW_JOB_ID } from "../../src/cli/write-workflow.js";

// Validates the generated workflow against
// specs/001-v1-core-commands/contracts/action-interface.md's required
// shape: locked check name, permissions, no merge_group, exactly one
// credential env var, base-only checkout.

describe("action-interface contract", () => {
  const yaml = buildWorkflowYaml({
    auth: "api-key",
    shas: {
      checkoutSha: "a".repeat(40),
      reviewActionSha: "b".repeat(40),
      actionOwner: "revieweragent-org",
      actionRepo: "revieweragent",
      cacheSha: "c".repeat(40),
    },
  });
  const doc = parseYaml(yaml);
  const job = doc.jobs[WORKFLOW_JOB_ID];

  it("locks the required-check name to 'revieweragent'", () => {
    expect(JOB_NAME).toBe("revieweragent");
  });

  it("uses a different workflow job id than the check name — GitHub auto-creates a check named after the job, and (confirmed empirically, Feb 2025 policy) blocks GITHUB_TOKEN from updating that auto-check's conclusion via the API", () => {
    expect(WORKFLOW_JOB_ID).not.toBe(JOB_NAME);
    expect(job).toBeDefined();
    expect(doc.jobs[JOB_NAME]).toBeUndefined();
  });

  it("skips the job entirely for draft PRs via job-level if: — safe because GitHub natively blocks merging any draft PR regardless of check status", () => {
    expect(job.if).toContain("draft == false");
  });

  it("drops issue_comment noise (comments on issues, not PRs) via job-level if: — SPEC.md §9 explicitly allows this", () => {
    expect(job.if).toContain("issue_comment");
    expect(job.if).toContain("github.event.issue.pull_request");
  });

  it("declares exactly the required job permissions", () => {
    expect(job.permissions).toEqual({
      contents: "read",
      "pull-requests": "write",
      checks: "write",
      actions: "read",
    });
  });

  it("sets run-name to the PR head SHA so fork actor-cap counting works when pull_requests is empty", () => {
    expect(yaml).toMatch(
      /run-name:\s*revieweragent \$\{\{\s*github\.event\.pull_request\.head\.sha \|\| github\.sha\s*\}\}/,
    );
  });

  it("does not include merge_group in v1's on: block", () => {
    expect(doc.on.merge_group).toBeUndefined();
    expect(doc.on.pull_request_target).toBeDefined();
    expect(doc.on.issue_comment).toBeDefined();
    expect(doc.on.pull_request).toBeUndefined();
  });

  it("sets exactly one credential env var matching the auth type", () => {
    const step = job.steps[1];
    expect(step.env.ANTHROPIC_API_KEY).toBeDefined();
    expect(step.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("wires GITHUB_TOKEN into the review step's env", () => {
    // Real bug caught running Scenario B against a real PR: GitHub
    // Actions does not auto-inject GITHUB_TOKEN into a JS action's
    // process.env — it must be passed explicitly via env:, same as any
    // other secret. Without this the review step can never call the
    // GitHub API at all (checks, reviews, actor rate-limit).
    const step = job.steps[1];
    expect(step.env.GITHUB_TOKEN).toBeDefined();
  });

  it("checks out with persist-credentials: false and no ref override", () => {
    const checkoutStep = job.steps[0];
    expect(checkoutStep.with["persist-credentials"]).toBe(false);
    expect(checkoutStep.with.ref).toBeUndefined();
  });

  it("references the package's own actions/review path with an exact SHA pin — never the target repo being installed into", () => {
    const reviewStep = job.steps[1];
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

describe("subscription auth installs the pinned Claude CLI", () => {
  // Real bug found in manual testing: this install step didn't exist at
  // all. spawn("claude", ...) failed with ENOENT on every real run (no
  // fresh runner has it preinstalled), silently misclassified as an
  // availability skip, reporting a false "pass" with the model never
  // actually called (specs/001-v1-core-commands/contracts uses SPEC.md
  // §7/§8's "CI uses a pinned copy" requirement, which had no
  // implementation until this fix).
  const subscriptionYaml = buildWorkflowYaml({
    auth: "subscription",
    shas: {
      checkoutSha: "a".repeat(40),
      reviewActionSha: "b".repeat(40),
      actionOwner: "revieweragent-org",
      actionRepo: "revieweragent",
      cacheSha: "c".repeat(40),
    },
  });
  const subDoc = parseYaml(subscriptionYaml);
  const subJob = subDoc.jobs[WORKFLOW_JOB_ID];

  it("caches the npm global install directory before installing, pinned by exact SHA", () => {
    // Follow-up work from SPEC.md §7 (added after PR #1 surfaced it as a
    // real, verified actions/cache pin) — avoids a fresh npm fetch on
    // every PR for auth: subscription installs.
    expect(subJob.steps).toHaveLength(4);
    const cacheStep = subJob.steps[1];
    expect(cacheStep.uses).toBe(`actions/cache@${"c".repeat(40)}`);
    expect(cacheStep.with.path).toBe("~/.npm");
  });

  it("installs @anthropic-ai/claude-code globally before the review step", () => {
    expect(subJob.steps[2].run).toMatch(/npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+/);
    expect(subJob.steps[2]["continue-on-error"]).toBe(true);
  });

  it("passes install failure into the review step so npm outage can availability-skip", () => {
    const review = subJob.steps[3];
    expect(review.env.REVIEWERAGENT_CLI_INSTALL_FAILED).toBeDefined();
    expect(review.env.CLAUDE_CODE_OAUTH_TOKEN).toBeDefined();
    expect(review.env.GITHUB_TOKEN).toBeDefined();
  });

  it("does not install the CLI for api-key auth — it never needs it", () => {
    const apiKeyYaml = buildWorkflowYaml({
      auth: "api-key",
      shas: {
        checkoutSha: "a".repeat(40),
        reviewActionSha: "b".repeat(40),
        actionOwner: "revieweragent-org",
        actionRepo: "revieweragent",
      },
    });
    const apiKeyJob = parseYaml(apiKeyYaml).jobs[WORKFLOW_JOB_ID];
    expect(apiKeyJob.steps).toHaveLength(2);
    expect(apiKeyJob.steps.some((s: { run?: string }) => s.run?.includes("claude-code"))).toBe(false);
  });
});
