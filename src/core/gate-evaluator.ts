import { SEVERITY_RANK, type Finding } from "./findings-schema.js";
import type { BlockSeverity } from "./config-schema.js";

// SPEC.md §12 / Constitution Principle V: code decides PASS/BLOCK from
// the findings array and configured threshold — this function is the
// entirety of that decision. It never looks at anything the model might
// have labeled "verdict"; parseFindings (findings-schema.ts) already
// rejects any such key before a Finding[] ever reaches here.

export type GateResult = "PASS" | "BLOCK";

export function evaluateGate(findings: Finding[], blockSeverity: BlockSeverity): GateResult {
  if (blockSeverity === "any") {
    return findings.length > 0 ? "BLOCK" : "PASS";
  }
  const threshold = SEVERITY_RANK[blockSeverity];
  const blocks = findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
  return blocks ? "BLOCK" : "PASS";
}
