import { describe, expect, it } from "vitest";
import {
  InvalidConfigError,
  defaultConfig,
  parseConfig,
  serializeConfig,
} from "../../src/core/config-schema.js";

describe("provider: cursor (v2)", () => {
  it("accepts cursor + subscription", () => {
    const yaml = serializeConfig(defaultConfig({ provider: "cursor", auth: "subscription" }));
    expect(parseConfig(yaml)).toMatchObject({ provider: "cursor", auth: "subscription" });
  });

  it("rejects cursor + api-key as invalid", () => {
    const yaml = [
      "version: 1",
      "provider: cursor",
      "auth: api-key",
      "mode: advisory",
    ].join("\n");
    expect(() => parseConfig(yaml)).toThrow(InvalidConfigError);
    expect(() => parseConfig(yaml)).toThrow(/cursor/);
  });

  it("rejects unknown providers", () => {
    expect(() => parseConfig("version: 1\nprovider: copilot\n")).toThrow(InvalidConfigError);
  });
});
