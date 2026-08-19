import { describe, it, expect } from "vitest";
import { evaluateGate } from "../../src/core/gate-evaluator.js";
import type { Finding } from "../../src/core/findings-schema.js";

function finding(severity: Finding["severity"]): Finding {
  return { severity, file: "src/x.ts", line: 1, message: "msg" };
}

describe("evaluateGate", () => {
  it("PASSes an empty findings list at any threshold", () => {
    expect(evaluateGate([], "high")).toBe("PASS");
    expect(evaluateGate([], "any")).toBe("PASS");
  });

  it("BLOCKs on any finding when threshold is 'any'", () => {
    expect(evaluateGate([finding("note")], "any")).toBe("BLOCK");
  });

  it("PASSes findings below the threshold", () => {
    expect(evaluateGate([finding("low"), finding("note")], "high")).toBe("PASS");
  });

  it("BLOCKs when a finding meets or exceeds the threshold", () => {
    expect(evaluateGate([finding("high")], "high")).toBe("BLOCK");
    expect(evaluateGate([finding("critical")], "high")).toBe("BLOCK");
  });

  it("never honors a verdict field — only severities decide the outcome", () => {
    // Finding type has no verdict field at all; this test documents the
    // invariant that only severity/threshold comparison drives the result.
    const findings: Finding[] = [finding("low")];
    expect(evaluateGate(findings, "critical")).toBe("PASS");
  });
});
