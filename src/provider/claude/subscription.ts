import { spawn } from "node:child_process";
import { FINDINGS_JSON_SCHEMA } from "../../core/findings-schema.js";
import { presentSecret } from "../../core/present-secret.js";
import type { ClassifiableError } from "../../core/error-classifier.js";

// SPEC.md §8's verified argv — every flag here is load-bearing (§8
// "Verified CLI behavior" table). Do NOT pass --bare (ignores
// CLAUDE_CODE_OAUTH_TOKEN). Never checkout PR head or --add-dir it. Node
// spawn with stdin: "ignore" — relying on shell `< /dev/null` is not
// enough if stdin is ever inherited instead.

export class ModelBackendError extends Error {
  constructor(
    message: string,
    public readonly classifiable: ClassifiableError,
  ) {
    super(message);
    this.name = "ModelBackendError";
  }
}

interface ClaudeCliEnvelope {
  is_error?: boolean;
  api_error_status?: number;
  subtype?: string;
  num_turns?: number;
  stop_reason?: string;
  total_cost_usd?: number;
  structured_output?: unknown;
}

export function classifyCliSpawnError(
  err: { code?: string; message?: string },
  installFailed: boolean,
): ClassifiableError {
  if (err.code === "E2BIG" || /\bE2BIG\b/i.test(err.message ?? "")) return { kind: "e2big" };
  if (installFailed) return { kind: "npm_fetch_fail_cache_miss" };
  return { kind: "cli_missing" };
}

export function isSubscriptionQuotaMessage(text: string): boolean {
  const t = text.toLowerCase();
  return /credit|quota|billing|usage.?limit/.test(t);
}

function cliInstallFailed(): boolean {
  return process.env.REVIEWERAGENT_CLI_INSTALL_FAILED === "true";
}

export function callSubscriptionBackend(
  systemPrompt: string,
  userPayload: string,
  claudeBin = "claude",
): Promise<string> {
  if (!presentSecret(process.env.CLAUDE_CODE_OAUTH_TOKEN)) {
    return Promise.reject(
      new ModelBackendError("CLAUDE_CODE_OAUTH_TOKEN is not set", { kind: "missing_secret" }),
    );
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(
        claudeBin,
        [
          "-p",
          "--output-format",
          "json",
          "--tools",
          "",
          "--model",
          "sonnet",
          "--disable-slash-commands",
          "--strict-mcp-config",
          "--json-schema",
          JSON.stringify(FINDINGS_JSON_SCHEMA),
          "--system-prompt",
          systemPrompt,
          userPayload,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      reject(
        new ModelBackendError(
          `Failed to spawn claude CLI: ${(err as Error).message}`,
          classifyCliSpawnError(err as NodeJS.ErrnoException, cliInstallFailed()),
        ),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        new ModelBackendError(
          `Failed to spawn claude CLI: ${err.message}`,
          classifyCliSpawnError(err, cliInstallFailed()),
        ),
      );
    });

    child.on("exit", () => {
      let envelope: ClaudeCliEnvelope;
      try {
        envelope = JSON.parse(stdout) as ClaudeCliEnvelope;
      } catch {
        reject(
          new ModelBackendError(`claude CLI produced non-JSON output: ${stderr || stdout}`, {
            kind: "invalid_json",
          }),
        );
        return;
      }

      if (envelope.is_error) {
        const status = envelope.api_error_status;
        if (status === 401 || status === 403) {
          reject(new ModelBackendError("Claude Code auth rejected", { kind: status === 401 ? "http_401" : "http_403" }));
          return;
        }
        if (status === 429) {
          reject(new ModelBackendError("Claude Code rate limited", { kind: "http_429" }));
          return;
        }
        if (status === 400) {
          const blob = `${JSON.stringify(envelope)}\n${stderr}`;
          const quotaSignal = isSubscriptionQuotaMessage(blob);
          reject(
            new ModelBackendError(quotaSignal ? "Claude Code plan-quota error" : "Claude Code HTTP 400", {
              kind: "http_400",
              auth: "subscription",
              quotaSignal,
            }),
          );
          return;
        }
        if (status && status >= 500) {
          reject(new ModelBackendError("Claude Code backend overload", { kind: "http_5xx" }));
          return;
        }
        reject(new ModelBackendError("Claude Code reported an error with no recognized status", { kind: "invalid_json" }));
        return;
      }

      if (envelope.structured_output === undefined) {
        reject(new ModelBackendError("claude CLI response had no structured_output", { kind: "invalid_json" }));
        return;
      }

      resolve(JSON.stringify(envelope.structured_output));
    });
  });
}
