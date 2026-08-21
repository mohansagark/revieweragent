import { ModelBackendError } from "../claude/subscription.js";
import type { ClassifiableError } from "../../core/error-classifier.js";

export const CURSOR_CLI_VERSION = "2026.08.11-e8db854";
export const CURSOR_MODEL = "composer-1";
export const CURSOR_TARBALL_SHA256 = {
  x64: "bfff4bf6f4e9dd30c1d0ef0a70b6077b074015dd2948e4c50685d53afdcfce5a",
  arm64: "ea13f92e295f523a99ce8d8f57d6894d21e5d1e2d030ffad718ccd5955ca2eed",
} as const;

export function buildCursorAgentArgv(opts: { workspace: string; prompt: string; model?: string }): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--mode",
    "ask",
    "--sandbox",
    "enabled",
    "--trust",
    "--model",
    opts.model ?? CURSOR_MODEL,
    "--workspace",
    opts.workspace,
    opts.prompt,
  ];
}

export function classifyCursorSpawnError(
  err: { code?: string; message?: string },
  installFailed: boolean,
): ClassifiableError {
  if (err.code === "E2BIG") return { kind: "e2big" };
  if (installFailed) return { kind: "npm_fetch_fail_cache_miss" };
  return { kind: "cli_missing" };
}

interface CursorEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

export function parseCursorEnvelope(stdout: string, exitCode: number, stderr: string): string {
  const blob = `${stdout}\n${stderr}`;
  if (exitCode !== 0 && !stdout.trim()) {
    if (/401|403|unauthorized|forbidden|revoked/i.test(blob)) {
      throw new ModelBackendError("Cursor auth rejected", { kind: /403|forbidden/.test(blob) ? "http_403" : "http_401" });
    }
    if (/429|rate limit/i.test(blob)) {
      throw new ModelBackendError("Cursor rate limited", { kind: "http_429" });
    }
    if (/credit|quota|billing|usage.?limit/i.test(blob)) {
      throw new ModelBackendError("Cursor plan-quota error", {
        kind: "http_400",
        auth: "subscription",
        quotaSignal: true,
      });
    }
    if (/5\d\d|overload|unavailable/i.test(blob)) {
      throw new ModelBackendError("Cursor backend overload", { kind: "http_5xx" });
    }
    throw new ModelBackendError(`Cursor CLI failed: ${stderr || "no output"}`, { kind: "invalid_json" });
  }

  let envelope: CursorEnvelope;
  try {
    envelope = JSON.parse(stdout) as CursorEnvelope;
  } catch {
    throw new ModelBackendError(`Cursor CLI produced non-JSON output: ${stderr || stdout}`, { kind: "invalid_json" });
  }

  if (envelope.is_error) {
    throw new ModelBackendError("Cursor CLI reported is_error", { kind: "invalid_json" });
  }
  if (typeof envelope.result !== "string" || envelope.result.trim() === "") {
    throw new ModelBackendError("Cursor CLI response had no result text", { kind: "invalid_json" });
  }
  return envelope.result;
}
