import { describe, expect, it } from "vitest";
import { cursorCliInstallFailed } from "../../src/provider/cursor/backend.js";

describe("cursorCliInstallFailed", () => {
  it("reads the dedicated Cursor flag when set", () => {
    expect(cursorCliInstallFailed({ REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED: "true" })).toBe(true);
    expect(cursorCliInstallFailed({ REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED: "false" })).toBe(false);
  });

  it("falls back to the old shared flag only when Claude OAuth is absent", () => {
    expect(cursorCliInstallFailed({ REVIEWERAGENT_CLI_INSTALL_FAILED: "true" })).toBe(true);
    expect(
      cursorCliInstallFailed({
        REVIEWERAGENT_CLI_INSTALL_FAILED: "true",
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-test-token-not-real",
      }),
    ).toBe(false);
  });
});
