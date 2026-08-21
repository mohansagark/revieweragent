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
});
