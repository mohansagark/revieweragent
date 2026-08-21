import { describe, expect, it } from "vitest";
import { MissingInputError, parseNonInteractiveOptions } from "../../src/cli/init.js";

describe("parseNonInteractiveOptions (v2)", () => {
  it("accepts Cursor subscription via --cursor-api-key", () => {
    expect(
      parseNonInteractiveOptions({
        provider: "cursor",
        auth: "subscription",
        cursorApiKey: "cursor-key-not-real",
        codeowners: "@alice",
      }),
    ).toMatchObject({
      provider: "cursor",
      auth: "subscription",
      credential: "cursor-key-not-real",
      writeCodeowners: true,
      codeownersUser: "@alice",
    });
  });

  it("rejects Cursor + api-key", () => {
    expect(() =>
      parseNonInteractiveOptions({
        provider: "cursor",
        auth: "api-key",
        apiKey: "sk-ant-not-real",
      }),
    ).toThrow(MissingInputError);
  });

  it("skips CODEOWNERS unless --codeowners is passed", () => {
    expect(
      parseNonInteractiveOptions({
        provider: "claude",
        auth: "api-key",
        apiKey: "sk-ant-testkey",
      }).writeCodeowners,
    ).toBe(false);
  });

  it("accepts Gemini primary via --gemini-api-key and does not require sk-ant", () => {
    expect(
      parseNonInteractiveOptions({
        provider: "gemini",
        auth: "api-key",
        geminiApiKey: "AIza-test-key",
      }),
    ).toMatchObject({
      provider: "gemini",
      auth: "api-key",
      credential: "AIza-test-key",
    });
  });

  it("rejects a Gemini key passed through --api-key", () => {
    expect(() =>
      parseNonInteractiveOptions({
        provider: "gemini",
        auth: "api-key",
        apiKey: "AIza-test-key",
      }),
    ).toThrow(MissingInputError);
  });

  it("accepts Claude subscription plus Gemini fallback flags", () => {
    expect(
      parseNonInteractiveOptions({
        provider: "claude",
        auth: "subscription",
        oauthToken: "oauth-test-token-not-real",
        fallbackProvider: "gemini",
        fallbackGeminiApiKey: "AIza-test-key",
      }).fallback,
    ).toEqual({
      provider: "gemini",
      auth: "api-key",
      credential: "AIza-test-key",
    });
  });

  it("rejects fallback flags without --fallback-provider", () => {
    expect(() =>
      parseNonInteractiveOptions({
        provider: "claude",
        auth: "subscription",
        oauthToken: "oauth-test-token-not-real",
        fallbackGeminiApiKey: "AIza-test-key",
      }),
    ).toThrow(MissingInputError);
  });

  it("rejects the same method as fallback", () => {
    expect(() =>
      parseNonInteractiveOptions({
        provider: "claude",
        auth: "subscription",
        oauthToken: "oauth-test-token-not-real",
        fallbackProvider: "claude",
        fallbackAuth: "subscription",
        fallbackOauthToken: "other-oauth-token-not-real",
      }),
    ).toThrow(MissingInputError);
  });
});
