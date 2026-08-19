import { spawn } from "node:child_process";
import { FINDINGS_JSON_SCHEMA } from "../../core/findings-schema.js";
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

export function callSubscriptionBackend(
  systemPrompt: string,
  userPayload: string,
  claudeBin = "claude",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
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

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

    child.on("error", (err) => {
      // Process failed to spawn at all — e.g. npm cache-miss fetch of the
      // pinned CLI failed (SPEC.md §7/§9: availability skip).
      reject(
        new ModelBackendError(`Failed to spawn claude CLI: ${err.message}`, {
          kind: "npm_fetch_fail_cache_miss",
        }),
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

      // SPEC.md §17: use structured_output; never branch on subtype.
      // is_error + 401/403 -> fail-closed; 429/5xx -> availability skip;
      // 400 quota splits by auth (subscription here -> availability skip).
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
          reject(new ModelBackendError("Claude Code plan-quota error", { kind: "http_400", auth: "subscription" }));
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
