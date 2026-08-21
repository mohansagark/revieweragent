import { describe, it, expect } from "vitest";
import { buildWorkflowYaml } from "../../src/cli/write-workflow.js";

// Constitution Security & Sanitization Requirements: "One auth secret per
// repo... never both live at once." This test locks the workflow-
// generation half of that invariant; src/cli/review.ts additionally
// guards against ANTHROPIC_API_KEY leaking into a subscription job env at
// runtime (SPEC.md §7/§8's verified precedence behavior).

describe("exactly one credential in the generated workflow", () => {
  const shas = { checkoutSha: "a".repeat(40), reviewActionSha: "b".repeat(40) };

  it("sets only ANTHROPIC_API_KEY for auth: api-key", () => {
    const yaml = buildWorkflowYaml({ owner: "acme", repo: "widgets", auth: "api-key", shas });
    expect(yaml).toContain("ANTHROPIC_API_KEY");
    expect(yaml).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("sets only CLAUDE_CODE_OAUTH_TOKEN for auth: subscription", () => {
    const yaml = buildWorkflowYaml({ owner: "acme", repo: "widgets", auth: "subscription", shas });
    expect(yaml).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(yaml).not.toContain("ANTHROPIC_API_KEY");
  });
});
