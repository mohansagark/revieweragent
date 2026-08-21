import { describe, expect, it } from "vitest";
import { ModelBackendError } from "../../src/provider/claude/subscription.js";
import {
  CURSOR_MODEL,
  buildCursorAgentArgv,
  classifyCursorSpawnError,
  parseCursorEnvelope,
} from "../../src/provider/cursor/agent.js";

describe("Cursor agent argv and envelope (v2)", () => {
  it("locks ask-mode argv with empty workspace and no --force", () => {
    const argv = buildCursorAgentArgv({
      workspace: "/tmp/empty",
      prompt: "findings please",
    });
    expect(argv).toEqual([
      "-p",
      "--output-format",
      "json",
      "--mode",
      "ask",
      "--sandbox",
      "enabled",
      "--trust",
      "--model",
      CURSOR_MODEL,
      "--workspace",
      "/tmp/empty",
      "findings please",
    ]);
    expect(argv).not.toContain("--force");
    expect(argv).not.toContain("--yolo");
    expect(argv).not.toContain("--api-key");
  });

  it("parses the result string as findings JSON, including fenced text", () => {
    const findings = { summary: "ok", findings: [] };
    const fenced = "```json\n" + JSON.stringify(findings) + "\n```";
    const stdout = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: fenced,
    });
    expect(parseCursorEnvelope(stdout, 0, "")).toBe(fenced);
  });

  it("does not treat subtype success as PASS when is_error is true", () => {
    const stdout = JSON.stringify({ subtype: "success", is_error: true, result: "" });
    expect(() => parseCursorEnvelope(stdout, 0, "")).toThrow(ModelBackendError);
  });

  it("classifies non-zero exit with no JSON as fail-closed unless quota/429", () => {
    expect(() => parseCursorEnvelope("", 1, "unauthorized")).toThrow(/auth/i);
    expect(() => parseCursorEnvelope("", 1, "Rate limit exceeded 429")).toThrow(ModelBackendError);
  });

  it("maps spawn E2BIG to fail-closed, tarball install fail to availability skip", () => {
    expect(classifyCursorSpawnError({ code: "E2BIG" }, false)).toEqual({ kind: "e2big" });
    expect(classifyCursorSpawnError({ code: "ENOENT" }, true)).toEqual({ kind: "npm_fetch_fail_cache_miss" });
    expect(classifyCursorSpawnError({ code: "ENOENT" }, false)).toEqual({ kind: "cli_missing" });
  });
});
