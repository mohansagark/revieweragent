import { describe, it, expect } from "vitest";
import { parseFindings, InvalidFindingsError } from "../../src/core/findings-schema.js";

describe("parseFindings", () => {
  it("parses a well-formed findings payload", () => {
    const result = parseFindings(
      JSON.stringify({
        summary: "1 issue found",
        findings: [{ severity: "high", file: "src/a.ts", line: 10, message: "bug" }],
      }),
    );
    expect(result.summary).toBe("1 issue found");
    expect(result.findings).toHaveLength(1);
  });

  it("strips an optional markdown fence", () => {
    const fenced = "```json\n" + JSON.stringify({ summary: "ok", findings: [] }) + "\n```";
    expect(parseFindings(fenced).summary).toBe("ok");
  });

  it("rejects a verdict field — model output cannot smuggle a decision", () => {
    const withVerdict = JSON.stringify({ summary: "ok", findings: [], verdict: "PASS" });
    expect(() => parseFindings(withVerdict)).toThrow(InvalidFindingsError);
  });

  it("rejects an unrecognized severity", () => {
    const bad = JSON.stringify({
      summary: "x",
      findings: [{ severity: "catastrophic", file: "a.ts", line: 1, message: "m" }],
    });
    expect(() => parseFindings(bad)).toThrow(InvalidFindingsError);
  });

  it("rejects non-JSON output", () => {
    expect(() => parseFindings("not json at all")).toThrow(InvalidFindingsError);
  });

  it("accepts a null line for cross-file notes", () => {
    const result = parseFindings(
      JSON.stringify({
        summary: "note",
        findings: [{ severity: "note", file: "README.md", line: null, message: "consider updating docs" }],
      }),
    );
    expect(result.findings[0]!.line).toBeNull();
  });
});
