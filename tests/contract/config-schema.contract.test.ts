import { describe, it, expect } from "vitest";
import {
  defaultConfig,
  serializeConfig,
  parseConfig,
  CONFIG_SCHEMA_VERSION,
  UnrecognizedConfigVersionError,
  InvalidConfigYamlError,
} from "../../src/core/config-schema.js";

// Validates behavior documented in
// specs/001-v1-core-commands/contracts/revieweragent-config-schema.md.

describe(".revieweragent.yml contract", () => {
  it("round-trips a default config through serialize -> parse", () => {
    const config = defaultConfig();
    const yaml = serializeConfig(config);
    const parsed = parseConfig(yaml);
    expect(parsed).toEqual(config);
  });

  it("requires version to match the current schema version", () => {
    expect(CONFIG_SCHEMA_VERSION).toBe(1);
    const badYaml = "version: 2\nprovider: claude\nauth: subscription\nmode: advisory\n";
    expect(() => parseConfig(badYaml)).toThrow(UnrecognizedConfigVersionError);
  });

  it("refuses to serialize over invalid existing YAML rather than clobber it", () => {
    const config = defaultConfig();
    expect(() => serializeConfig(config, "not: valid: yaml: at: all: ][")).toThrow(InvalidConfigYamlError);
  });

  it("preserves unknown keys when merging into an existing managed file", () => {
    const existing = [
      "# Managed by revieweragent — schema version below is required.",
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
      "block_severity: high",
      "max_diff_lines: 4000",
      "max_prompt_tokens: 80000",
      "on_limit: skip",
      "max_fork_reviews_per_actor_per_hour: 5",
      "fork_policy: auto",
      "trigger_phrase: /review",
      "exclude: []",
      "future_field: keep-me",
    ].join("\n");
    const rewritten = serializeConfig(defaultConfig({ mode: "gate" }), existing);
    expect(rewritten).toContain("future_field: keep-me");
    expect(rewritten).toContain("mode: gate");
  });
});
