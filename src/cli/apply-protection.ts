import { JOB_NAME } from "./write-workflow.js";
import {
  getProtectionHasCheck,
  mergeRequiredCheck,
  type ClassicProtection,
} from "../platform/github/apply-protection.js";
import { createGitHubClient, parseOwnerRepo, resolveGitHubToken } from "../platform/github/client.js";
import { getGitRemoteUrl } from "../core/git.js";
import { printBranchProtectionInstructions } from "./print-protection-instructions.js";

export async function applyProtection(args: { yes?: boolean; nonInteractive: boolean }): Promise<number> {
  try {
    const token = resolveGitHubToken();
    const octokit = createGitHubClient(token);
    const { owner, repo } = parseOwnerRepo(getGitRemoteUrl());
    const { data: repository } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repository.default_branch;

    try {
      await octokit.repos.getContent({
        owner,
        repo,
        path: ".github/workflows/revieweragent.yml",
        ref: defaultBranch,
      });
    } catch {
      console.log(
        `Hard gate: .github/workflows/revieweragent.yml is not on ${defaultBranch}. Push the workflow, then re-run apply-protection.`,
      );
      printBranchProtectionInstructions(owner, repo);
      return 0;
    }

    if (args.nonInteractive && !args.yes) {
      console.log("Skipping apply-protection without --yes. Print-only:");
      printBranchProtectionInstructions(owner, repo);
      return 0;
    }

    let existing: ClassicProtection;
    try {
      const { data } = await octokit.repos.getBranchProtection({ owner, repo, branch: defaultBranch });
      existing = data as ClassicProtection;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        console.log("No classic branch protection found. Not creating a ruleset from scratch.");
        printBranchProtectionInstructions(owner, repo);
        return 0;
      }
      throw err;
    }

    const next = mergeRequiredCheck(existing, JOB_NAME);
    await octokit.repos.updateBranchProtection({
      owner,
      repo,
      branch: defaultBranch,
      ...next,
    } as Parameters<typeof octokit.repos.updateBranchProtection>[0]);

    const { data: verified } = await octokit.repos.getBranchProtection({ owner, repo, branch: defaultBranch });
    if (!getProtectionHasCheck(verified as ClassicProtection, JOB_NAME)) {
      throw new Error("Verify failed: revieweragent is not in required_status_checks after PUT.");
    }
    console.log(`Required check ${JOB_NAME} is now on ${defaultBranch}.`);
    return 0;
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: "apply_protection_failed", message: (err as Error).message }) + "\n");
    return 1;
  }
}
