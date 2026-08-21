import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelBackendError } from "../claude/subscription.js";
import { presentSecret } from "../../core/present-secret.js";
import {
  buildCursorAgentArgv,
  classifyCursorSpawnError,
  parseCursorEnvelope,
} from "./agent.js";

export function cursorCliInstallFailed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED !== undefined) {
    return env.REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED === "true";
  }
  if (presentSecret(env.CLAUDE_CODE_OAUTH_TOKEN)) return false;
  return env.REVIEWERAGENT_CLI_INSTALL_FAILED === "true";
}

export function callCursorBackend(
  systemPrompt: string,
  userPayload: string,
  agentBin = process.env.REVIEWERAGENT_CURSOR_BIN ?? "agent",
): Promise<string> {
  if (!presentSecret(process.env.CURSOR_API_KEY)) {
    return Promise.reject(new ModelBackendError("CURSOR_API_KEY is not set", { kind: "missing_secret" }));
  }

  const root = process.env.RUNNER_TEMP ?? tmpdir();
  const workspace = mkdtempSync(join(root, "revieweragent-cursor-ws-"));
  const isolatedHome = mkdtempSync(join(root, "revieweragent-cursor-home-"));
  mkdirSync(join(isolatedHome, ".cursor"), { recursive: true });
  const prompt = `${systemPrompt}\n\n${userPayload}`;

  const childEnv = { ...process.env };
  childEnv.HOME = isolatedHome;
  childEnv.XDG_CONFIG_HOME = isolatedHome;
  childEnv.CURSOR_CONFIG_DIR = join(isolatedHome, ".cursor");
  delete childEnv.ANTHROPIC_API_KEY;
  delete childEnv.CLAUDE_CODE_OAUTH_TOKEN;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(agentBin, buildCursorAgentArgv({ workspace, prompt }), {
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
      });
    } catch (err) {
      reject(
        new ModelBackendError(
          `Failed to spawn Cursor agent: ${(err as Error).message}`,
          classifyCursorSpawnError(err as NodeJS.ErrnoException, cursorCliInstallFailed()),
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
          `Failed to spawn Cursor agent: ${err.message}`,
          classifyCursorSpawnError(err, cursorCliInstallFailed()),
        ),
      );
    });
    child.on("exit", (code) => {
      try {
        resolve(parseCursorEnvelope(stdout, code ?? 1, stderr));
      } catch (err) {
        reject(err);
      }
    });
  });
}
