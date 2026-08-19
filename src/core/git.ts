import { execFileSync } from "node:child_process";

export function getGitRemoteUrl(remote = "origin"): string {
  return execFileSync("git", ["remote", "get-url", remote], { encoding: "utf8" }).trim();
}
