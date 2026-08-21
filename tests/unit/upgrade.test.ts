import { describe, expect, it } from "vitest";
import { UnmarkedWorkflowConflictError } from "../../src/cli/write-workflow.js";
import { upgradeManagedWorkflow } from "../../src/cli/upgrade.js";

const MANAGED = `# Managed by revieweragent (npmjs.com/package/revieweragent)
on:
  pull_request_target:
`;

describe("upgrade (v2)", () => {
  it("refreshes a managed workflow from the live config without changing provider", () => {
    const next = upgradeManagedWorkflow(
      MANAGED,
      ["version: 1", "provider: cursor", "auth: subscription", "mode: advisory"].join("\n"),
    );
    expect(next).toContain("merge_group:");
    expect(next).toContain("CURSOR_API_KEY");
    expect(next).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(next).toContain("Managed by revieweragent");
  });

  it("refuses to overwrite an unmarked workflow", () => {
    expect(() =>
      upgradeManagedWorkflow("name: not-ours\n", "version: 1\nprovider: claude\nauth: subscription\nmode: advisory\n"),
    ).toThrow(UnmarkedWorkflowConflictError);
  });
});
