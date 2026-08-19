import { describe, it, expect } from "vitest";
import { buildWorkflowYaml } from "../../src/cli/write-workflow.js";
import { TEST_SHAS } from "../helpers/pinned-shas.js";

describe("exactly one credential in the generated workflow", () => {
  it("sets only ANTHROPIC_API_KEY for auth: api-key", () => {
    const yaml = buildWorkflowYaml({ auth: "api-key", shas: TEST_SHAS });
    expect(yaml).toContain("ANTHROPIC_API_KEY");
    expect(yaml).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("sets only CLAUDE_CODE_OAUTH_TOKEN for auth: subscription", () => {
    const yaml = buildWorkflowYaml({ auth: "subscription", shas: TEST_SHAS });
    expect(yaml).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(yaml).not.toContain("ANTHROPIC_API_KEY");
  });
});
