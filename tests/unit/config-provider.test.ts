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

describe("provider: gemini", () => {
  it("accepts gemini + api-key", () => {
    const yaml = serializeConfig(defaultConfig({ provider: "gemini", auth: "api-key" }));
    expect(parseConfig(yaml)).toMatchObject({ provider: "gemini", auth: "api-key" });
  });

  it("rejects gemini + subscription", () => {
    const yaml = [
      "version: 1",
      "provider: gemini",
      "auth: subscription",
      "mode: advisory",
    ].join("\n");
    expect(() => parseConfig(yaml)).toThrow(/gemini/i);
  });
});

describe("optional fallback", () => {
  it("parses a valid gemini fallback", () => {
    const yaml = [
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: gate",
      "fallback:",
      "  provider: gemini",
      "  auth: api-key",
    ].join("\n");
    expect(parseConfig(yaml).fallback).toEqual({ provider: "gemini", auth: "api-key" });
  });

  it("treats explicit fallback: null as no fallback", () => {
    const yaml = [
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
      "fallback: null",
    ].join("\n");
    expect(parseConfig(yaml).fallback).toBeUndefined();
  });

  it("rejects the same method for primary and fallback", () => {
    const yaml = [
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
      "fallback:",
      "  provider: claude",
      "  auth: subscription",
    ].join("\n");
    expect(() => parseConfig(yaml)).toThrow(/different method/i);
  });

  it("allows claude subscription primary + claude api-key fallback", () => {
    const yaml = [
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
      "fallback:",
      "  provider: claude",
      "  auth: api-key",
    ].join("\n");
    expect(parseConfig(yaml).fallback).toEqual({ provider: "claude", auth: "api-key" });
  });

  it("rejects empty fallback mapping", () => {
    const yaml = [
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
      "fallback: {}",
    ].join("\n");
    expect(() => parseConfig(yaml)).toThrow(InvalidConfigError);
  });
});
