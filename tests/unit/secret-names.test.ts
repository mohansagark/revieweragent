import { describe, expect, it } from "vitest";
import { secretNameFor, unusedSecretNames } from "../../src/core/secret-names.js";

describe("secretNameFor", () => {
  it("maps Claude auth paths to the locked Actions secret names", () => {
    expect(secretNameFor("claude", "subscription")).toBe("REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN");
    expect(secretNameFor("claude", "api-key")).toBe("REVIEWERAGENT_ANTHROPIC_API_KEY");
  });

  it("maps Cursor subscription to REVIEWERAGENT_CURSOR_API_KEY", () => {
    expect(secretNameFor("cursor", "subscription")).toBe("REVIEWERAGENT_CURSOR_API_KEY");
  });

  it("lists every other secret name when switching provider or auth", () => {
    expect(unusedSecretNames("cursor", "subscription").sort()).toEqual([
      "REVIEWERAGENT_ANTHROPIC_API_KEY",
      "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
    ]);
    expect(unusedSecretNames("claude", "api-key").sort()).toEqual([
      "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
      "REVIEWERAGENT_CURSOR_API_KEY",
    ]);
  });
});
