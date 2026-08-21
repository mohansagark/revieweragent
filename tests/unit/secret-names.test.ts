import { describe, expect, it } from "vitest";
import { secretNameFor, unusedSecretNames, jobEnvFor, FALLBACK_ANTHROPIC_JOB_ENV } from "../../src/core/secret-names.js";

describe("secretNameFor", () => {
  it("maps Claude auth paths to the locked Actions secret names", () => {
    expect(secretNameFor("claude", "subscription")).toBe("REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN");
    expect(secretNameFor("claude", "api-key")).toBe("REVIEWERAGENT_ANTHROPIC_API_KEY");
  });

  it("maps Cursor subscription to REVIEWERAGENT_CURSOR_API_KEY", () => {
    expect(secretNameFor("cursor", "subscription")).toBe("REVIEWERAGENT_CURSOR_API_KEY");
  });

  it("maps Gemini api-key to REVIEWERAGENT_GEMINI_API_KEY", () => {
    expect(secretNameFor("gemini", "api-key")).toBe("REVIEWERAGENT_GEMINI_API_KEY");
  });

  it("lists every other secret name when switching provider or auth", () => {
    expect(unusedSecretNames("cursor", "subscription").sort()).toEqual([
      "REVIEWERAGENT_ANTHROPIC_API_KEY",
      "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
      "REVIEWERAGENT_GEMINI_API_KEY",
    ]);
    expect(unusedSecretNames("claude", "api-key").sort()).toEqual([
      "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
      "REVIEWERAGENT_CURSOR_API_KEY",
      "REVIEWERAGENT_GEMINI_API_KEY",
    ]);
  });

  it("keeps both primary and fallback secrets live", () => {
    expect(
      unusedSecretNames("claude", "subscription", { provider: "gemini", auth: "api-key" }).sort(),
    ).toEqual(["REVIEWERAGENT_ANTHROPIC_API_KEY", "REVIEWERAGENT_CURSOR_API_KEY"]);
  });
});

describe("jobEnvFor mixing rule", () => {
  it("maps Claude api-key fallback next to Claude subscription to the isolated env name", () => {
    expect(
      jobEnvFor("claude", "api-key", {
        role: "fallback",
        primary: { provider: "claude", auth: "subscription" },
      }),
    ).toEqual({
      name: FALLBACK_ANTHROPIC_JOB_ENV,
      secret: "REVIEWERAGENT_ANTHROPIC_API_KEY",
    });
  });

  it("keeps ANTHROPIC_API_KEY when Claude api-key is primary", () => {
    expect(jobEnvFor("claude", "api-key")).toEqual({
      name: "ANTHROPIC_API_KEY",
      secret: "REVIEWERAGENT_ANTHROPIC_API_KEY",
    });
  });
});
