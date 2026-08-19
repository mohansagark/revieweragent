import { JOB_NAME } from "./write-workflow.js";

// SPEC.md §5 step 8 / §13 / Constitution Principle II: v1 never applies
// branch protection itself — applying a required check for a job that
// has never run on the default branch is a chicken-and-egg bug, forbidden
// in every release. This only prints instructions after the workflow has
// been pushed.

export function printBranchProtectionInstructions(owner: string, repo: string): void {
  const settingsUrl = `https://github.com/${owner}/${repo}/settings/branches`;
  const rulesetsUrl = `https://github.com/${owner}/${repo}/settings/rules`;
  console.log(`\nRequired check name: ${JOB_NAME}`);
  console.log(
    "\nAfter this commit lands on the default branch and the workflow has run at least once, " +
      "flip the required-check toggle for it here:",
  );
  console.log(`  Branch protection: ${settingsUrl}`);
  console.log(`  Rulesets:          ${rulesetsUrl}`);
  console.log(
    "\nUntil you require this check, every PR merges regardless of the review outcome. " +
      "Do this after the workflow has run at least once on the default branch.",
  );
}
