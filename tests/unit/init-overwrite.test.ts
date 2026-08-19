import { describe, it, expect } from "vitest";
import {
  resolveConfigWrite,
  UnmanagedConfigConflictError,
} from "../../src/cli/write-config.js";
import { defaultConfig } from "../../src/core/config-schema.js";
import { decideOtherSecretDeletion } from "../../src/cli/init.js";

describe("resolveConfigWrite", () => {
  it("refuses to overwrite an unmarked .revieweragent.yml even if confirmed", () => {
    expect(() =>
      resolveConfigWrite(".revieweragent.yml", "version: 1\nmode: advisory\n", defaultConfig(), true),
    ).toThrow(UnmanagedConfigConflictError);
  });

  it("overwrites a managed file when confirmed", () => {
    const existing = [
      "# Managed by revieweragent — schema version below is required.",
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
    ].join("\n");
    const result = resolveConfigWrite(".revieweragent.yml", existing, defaultConfig({ mode: "gate" }), true);
    expect(result.wasOverwrite).toBe(true);
    expect(result.content).toContain("mode: gate");
  });
});

describe("decideOtherSecretDeletion", () => {
  it("aborts when the other secret exists and deletion was not confirmed", () => {
    expect(decideOtherSecretDeletion({ hasOtherSecret: true, confirmed: false })).toBe("abort");
  });

  it("deletes when confirmed", () => {
    expect(decideOtherSecretDeletion({ hasOtherSecret: true, confirmed: true })).toBe("delete");
  });

  it("is a no-op when the other secret is absent", () => {
    expect(decideOtherSecretDeletion({ hasOtherSecret: false, confirmed: false })).toBe("noop");
  });
});
