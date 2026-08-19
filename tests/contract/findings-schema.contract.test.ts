import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FINDINGS_JSON_SCHEMA } from "../../src/core/findings-schema.js";

// Validates src/core/findings-schema.ts's runtime schema against the
// checked-in contract at specs/001-v1-core-commands/contracts/findings-schema.json
// — the two must never drift.

describe("findings-schema contract", () => {
  it("matches the published contract in specs/001-v1-core-commands/contracts/", () => {
    const contract = JSON.parse(
      readFileSync("specs/001-v1-core-commands/contracts/findings-schema.json", "utf8"),
    );
    // Compare the parts that matter for validation behavior — required
    // keys, additionalProperties, and the enum — not $schema/title/description.
    expect(FINDINGS_JSON_SCHEMA.required).toEqual(contract.required);
    expect(FINDINGS_JSON_SCHEMA.additionalProperties).toBe(contract.additionalProperties);
    expect(FINDINGS_JSON_SCHEMA.properties.findings.items.required).toEqual(
      contract.properties.findings.items.required,
    );
    expect(FINDINGS_JSON_SCHEMA.properties.findings.items.additionalProperties).toBe(
      contract.properties.findings.items.additionalProperties,
    );
    expect(FINDINGS_JSON_SCHEMA.properties.findings.items.properties.severity.enum).toEqual(
      contract.properties.findings.items.properties.severity.enum,
    );
  });
});
