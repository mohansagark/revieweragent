import { Octokit } from "@octokit/rest";
import { execFileSync } from "node:child_process";

// SPEC.md §6: gh CLI, GH_TOKEN, or GITHUB_TOKEN. CI (review) always uses
// GITHUB_TOKEN from the job env; the CLI (init/uninstall) prefers an
// already-authenticated `gh`, falling back to a token env var.
export function resolveGitHubToken(): string {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken) return envToken;

  try {
    const out = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const token = out.trim();
    if (token) return token;
  } catch {
    // gh not installed or not authenticated — caller decides how to handle
    // a missing token (dependency-checks.ts drives `gh auth login`).
  }

  throw new Error(
    "No GitHub credential found: authenticate with `gh auth login` or set GH_TOKEN/GITHUB_TOKEN.",
  );
}

export function createGitHubClient(token = resolveGitHubToken()): Octokit {
  return new Octokit({ auth: token });
}

export function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } {
  // Handles both git@github.com:owner/repo.git and https://github.com/owner/repo(.git)
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Could not parse a GitHub owner/repo from remote: ${remoteUrl}`);
  }
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) {
    throw new Error(`Could not parse a GitHub owner/repo from remote: ${remoteUrl}`);
  }
  return { owner, repo };
}
