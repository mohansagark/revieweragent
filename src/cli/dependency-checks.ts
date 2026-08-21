import { execFileSync, spawnSync } from "node:child_process";
import { platform } from "node:os";
import type { AuthType } from "../core/config-schema.js";

// SPEC.md §6: no dependency is auto-installed silently. Every fix is
// shown as an exact command and confirm-gated by the caller (init.ts).
// This module only detects state and reports the command to run — it
// never executes an install itself except `runCommand`, which init.ts
// calls only after the user has confirmed.

export interface DependencyStatus {
  name: string;
  present: boolean;
  fixCommand?: string;
  fixDescription?: string;
}

function commandExists(bin: string): boolean {
  const result = spawnSync(platform() === "win32" ? "where" : "which", [bin], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export function checkGitRepo(): DependencyStatus {
  const result = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
  return { name: "git repository", present: result.status === 0 };
}

export function checkGhCli(): DependencyStatus {
  const present = commandExists("gh");
  if (present) return { name: "gh CLI", present: true };

  const installCommand =
    platform() === "darwin"
      ? "brew install gh"
      : platform() === "win32"
        ? "winget install --id GitHub.cli"
        : "sudo apt install gh";

  return {
    name: "gh CLI",
    present: false,
    fixCommand: installCommand,
    fixDescription: "GitHub CLI is used for secrets, repo metadata, and protection APIs (optional — a PAT works too).",
  };
}

export function checkGhAuthenticated(): DependencyStatus {
  const result = spawnSync("gh", ["auth", "status"], { stdio: "ignore" });
  return { name: "gh authentication", present: result.status === 0 };
}

export function shouldPromptGhLogin(opts: { ghCliPresent: boolean; ghAuthenticated: boolean }): boolean {
  return opts.ghCliPresent && !opts.ghAuthenticated;
}

/** SPEC.md §6: a real identity step, run via its own browser/device-code flow. */
export function runGhAuthLogin(): void {
  execFileSync("gh", ["auth", "login"], { stdio: "inherit" });
}

export function checkClaudeCli(): DependencyStatus {
  const present = commandExists("claude");
  if (present) return { name: "claude CLI", present: true };

  return {
    name: "claude CLI",
    present: false,
    fixCommand: "npm install -g @anthropic-ai/claude-code",
    fixDescription: "Required for `claude setup-token` during subscription setup. Not required for the api-key auth path.",
  };
}

export function requiredDependenciesFor(auth: AuthType): DependencyStatus[] {
  const checks = [checkGitRepo(), checkGhCli()];
  if (auth === "subscription") checks.push(checkClaudeCli());
  return checks;
}

/** Only called by the CLI layer after the user has confirmed the exact command shown. */
export function runFixCommand(command: string): void {
  const [bin, ...args] = command.split(" ");
  if (!bin) throw new Error("Empty fix command");
  execFileSync(bin, args, { stdio: "inherit" });
}
