import { spawn } from "node:child_process";

// SPEC.md §5 / §11: installer spawns `claude setup-token` itself.
// stdin/stderr inherited (browser-login prompt + URL display normally);
// stdout piped AND echoed to the terminal so the user still sees it, but
// also captured so the token can be parsed without a manual copy-paste.
// The token exists only as this function's return value — never written
// to disk (that temp-file design was explicitly rejected, SPEC.md §5).

const TOKEN_PATTERN = /sk-ant-oat[a-zA-Z0-9_-]+/;

export class SetupTokenError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "SetupTokenError";
  }
}

export function runSetupToken(claudeBin = "claude"): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin, ["setup-token"], {
      stdio: ["inherit", "pipe", "inherit"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      stdout += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(new SetupTokenError(`Failed to spawn \`${claudeBin} setup-token\`: ${err.message}`, null));
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new SetupTokenError(`\`${claudeBin} setup-token\` exited with code ${code}`, code));
        return;
      }
      const match = stdout.match(TOKEN_PATTERN);
      const token = match ? match[0] : stdout.trim().split("\n").filter(Boolean).pop();
      if (!token) {
        reject(new SetupTokenError("Could not parse a token from `claude setup-token` output", code));
        return;
      }
      resolve(token);
    });
  });
}
