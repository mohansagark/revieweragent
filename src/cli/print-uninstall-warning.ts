import { JOB_NAME } from "./write-workflow.js";

// SPEC.md §15 step 4: v1 prints manual removal steps — nothing
// auto-applied the required check, so nothing auto-removes it.
// Uninstalling while the check is still required leaves every PR blocked
// on a check that will never report; say so loudly.

export function printUninstallProtectionWarning(owner: string, repo: string): void {
  console.log(
    `\n⚠ If "${JOB_NAME}" is still configured as a required status check, every future PR ` +
      "on this repo will be permanently blocked — it can never report again.",
  );
  console.log(`Remove it manually: https://github.com/${owner}/${repo}/settings/branches`);
}

export function printCommitReminder(): void {
  console.log(
    "\nUninstall is a local tree change until you commit and push it — the workflow keeps " +
      "using the default-branch copy of these files until that lands.",
  );
}
