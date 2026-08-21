import { minimatch } from "minimatch";
import type { Octokit } from "@octokit/rest";
import type { RevieweragentConfig } from "./config-schema.js";

export interface PrFile {
  filename: string;
  changes: number;
  patch?: string;
}

export async function fetchPrFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pr: number,
): Promise<PrFile[]> {
  const files: PrFile[] = [];
  for await (const response of octokit.paginate.iterator(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: pr,
    per_page: 100,
  })) {
    for (const f of response.data) {
      files.push({ filename: f.filename, changes: f.changes, patch: f.patch });
    }
  }
  return files;
}

export async function fetchCompareFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<PrFile[]> {
  const { data } = await octokit.repos.compareCommits({ owner, repo, base: baseSha, head: headSha });
  return (data.files ?? []).map((f) => ({
    filename: f.filename,
    changes: f.changes,
    patch: f.patch,
  }));
}

export function filterExcluded(files: PrFile[], excludeGlobs: string[]): PrFile[] {
  return files.filter((f) => !excludeGlobs.some((glob) => minimatch(f.filename, glob, { dot: true })));
}

export function sumChanges(files: PrFile[]): number {
  return files.reduce((total, f) => total + f.changes, 0);
}

export function estimateTokens(files: PrFile[]): number {
  const chars = files.reduce((total, f) => total + (f.patch?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}

export interface LimitCheck {
  overLimit: boolean;
  diffLines: number;
  estimatedTokens: number;
}

export function checkLimits(config: RevieweragentConfig, files: PrFile[]): LimitCheck {
  const included = filterExcluded(files, config.exclude);
  const diffLines = sumChanges(included);
  const estimatedTokens = estimateTokens(included);
  const overLimit = diffLines > config.max_diff_lines || estimatedTokens > config.max_prompt_tokens;
  return { overLimit, diffLines, estimatedTokens };
}

export type LimitOutcome =
  | { kind: "under-limit" }
  | { kind: "gate-block" }
  | { kind: "advisory-skip" }
  | { kind: "advisory-block" };

export function decideLimitOutcome(config: RevieweragentConfig, overLimit: boolean): LimitOutcome {
  if (!overLimit) return { kind: "under-limit" };
  if (config.mode === "gate") return { kind: "gate-block" };
  return config.on_limit === "block" ? { kind: "advisory-block" } : { kind: "advisory-skip" };
}
