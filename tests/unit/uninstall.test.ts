import { describe, it, expect } from "vitest";
import { readAuthFromConfigRaw } from "../../src/cli/uninstall.js";

describe("readAuthFromConfigRaw", () => {
  it("returns auth from a valid managed config", () => {
    const yaml = [
      "# Managed by revieweragent — schema version below is required.",
      "version: 1",
      "provider: claude",
      "auth: api-key",
      "mode: advisory",
    ].join("\n");
    expect(readAuthFromConfigRaw(yaml)).toBe("api-key");
  });

  it("returns undefined for corrupted YAML instead of throwing", () => {
    expect(readAuthFromConfigRaw("::: not yaml")).toBeUndefined();
  });

  it("returns undefined for invalid enum values instead of throwing", () => {
    expect(readAuthFromConfigRaw("version: 1\nauth: oauth\nmode: advisory\n")).toBeUndefined();
  });
});
