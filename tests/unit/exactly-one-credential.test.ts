import { describe, it, expect } from "vitest";
import { buildWorkflowYaml } from "../../src/cli/write-workflow.js";

// Constitution Security & Sanitization Requirements: "One auth secret per
// repo... never both live at once." This test locks the workflow-
// generation half of that invariant; src/cli/review.ts additionally
// guards against ANTHROPIC_API_KEY leaking into a subscription job env at
// runtime (SPEC.md §7/§8's verified precedence behavior).

describe("exactly one credential in the generated workflow", () => {
  it("sets only ANTHROPIC_API_KEY for auth: api-key", () => {
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
    expect(yaml).toContain("ANTHROPIC_API_KEY");
    expect(yaml).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(yaml).not.toContain("CURSOR_API_KEY");
  });

  it("sets only CLAUDE_CODE_OAUTH_TOKEN for auth: subscription", () => {
    const yaml = buildWorkflowYaml({
      auth: "subscription",
      shas: {
        checkoutSha: "a".repeat(40),
        reviewActionSha: "b".repeat(40),
        actionOwner: "revieweragent-org",
        actionRepo: "revieweragent",
        cacheSha: "c".repeat(40),
      },
    });
    expect(yaml).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(yaml).not.toContain("ANTHROPIC_API_KEY");
    expect(yaml).not.toContain("CURSOR_API_KEY");
  });

  it("sets only CURSOR_API_KEY for provider: cursor", () => {
    const yaml = buildWorkflowYaml({
      auth: "subscription",
      provider: "cursor",
      shas: {
        checkoutSha: "a".repeat(40),
        reviewActionSha: "b".repeat(40),
        actionOwner: "revieweragent-org",
        actionRepo: "revieweragent",
        cacheSha: "c".repeat(40),
      },
    });
    expect(yaml).toContain("CURSOR_API_KEY");
    expect(yaml).not.toContain("ANTHROPIC_API_KEY");
    expect(yaml).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("emits primary Claude OAuth plus Gemini fallback without ANTHROPIC_API_KEY", () => {
    const yaml = buildWorkflowYaml({
      auth: "subscription",
      provider: "claude",
      fallback: { provider: "gemini", auth: "api-key" },
      shas: {
        checkoutSha: "a".repeat(40),
        reviewActionSha: "b".repeat(40),
        actionOwner: "revieweragent-org",
        actionRepo: "revieweragent",
        cacheSha: "c".repeat(40),
      },
    });
    expect(yaml).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(yaml).toContain("GEMINI_API_KEY");
    expect(yaml).not.toContain("ANTHROPIC_API_KEY");
  });

  it("maps Claude api-key fallback to REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY", () => {
    const yaml = buildWorkflowYaml({
      auth: "subscription",
      provider: "claude",
      fallback: { provider: "claude", auth: "api-key" },
      shas: {
        checkoutSha: "a".repeat(40),
        reviewActionSha: "b".repeat(40),
        actionOwner: "revieweragent-org",
        actionRepo: "revieweragent",
        cacheSha: "c".repeat(40),
      },
    });
    expect(yaml).toContain("REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY");
    expect(yaml).not.toMatch(/^\s+ANTHROPIC_API_KEY:/m);
  });
});
