import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface TempGitRepo {
  dir: string;
  cleanup(): void;
}

export function createTempGitRepo(opts?: { owner?: string; repo?: string }): TempGitRepo {
  const dir = mkdtempSync(join(tmpdir(), "revieweragent-e2e-"));
  const owner = opts?.owner ?? "acme";
  const repo = opts?.repo ?? "widgets";
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };
  execFileSync("git", ["init", "-b", "main", "--template="], { cwd: dir, stdio: "ignore", env });
  execFileSync("git", ["config", "user.email", "e2e@example.test"], { cwd: dir, stdio: "ignore", env });
  execFileSync("git", ["config", "user.name", "e2e"], { cwd: dir, stdio: "ignore", env });
  writeFileSync(join(dir, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore", env });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore", env });
  execFileSync("git", ["remote", "add", "origin", `git@github.com:${owner}/${repo}.git`], {
    cwd: dir,
    stdio: "ignore",
    env,
  });
  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function writeEventPayload(dir: string, payload: unknown): string {
  const eventsDir = join(dir, ".git");
  mkdirSync(eventsDir, { recursive: true });
  const path = join(eventsDir, "revieweragent-event.json");
  writeFileSync(path, JSON.stringify(payload), "utf8");
  return path;
}
