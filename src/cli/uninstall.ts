import { existsSync, readFileSync } from "node:fs";
import * as p from "@clack/prompts";
import { createGitHubClient, parseOwnerRepo, resolveGitHubToken } from "../platform/github/client.js";
import { createGitHubSecretsPort } from "../platform/github/secrets.js";
import { parseConfig } from "../core/config-schema.js";
import { getGitRemoteUrl } from "../core/git.js";
import { deleteManagedFiles } from "./delete-managed-files.js";
import { deleteRepoSecret } from "./delete-secret.js";
import { deleteLocalCredentials } from "./delete-local-credentials.js";
import { printUninstallProtectionWarning, printCommitReminder } from "./print-uninstall-warning.js";

const CONFIG_PATH = ".revieweragent.yml";

export class RefusedWithoutConsentError extends Error {
  constructor() {
    super("--non-interactive uninstall requires --yes.");
    this.name = "RefusedWithoutConsentError";
  }
}

export interface UninstallOptions {
  nonInteractive: boolean;
  yes: boolean;
  deleteSecret: boolean;
  deleteLocalCredentials: boolean;
}

async function confirmStep(message: string, options: UninstallOptions): Promise<boolean> {
  if (options.nonInteractive) return options.yes;
  const answer = await p.confirm({ message });
  return !p.isCancel(answer) && answer;
}

export async function runUninstall(options: UninstallOptions): Promise<void> {
  if (options.nonInteractive && !options.yes) {
    throw new RefusedWithoutConsentError();
  }

  const auth = existsSync(CONFIG_PATH) ? parseConfig(readFileSync(CONFIG_PATH, "utf8")).auth : undefined;

  const proceed = await confirmStep("Remove revieweragent's managed files from this repo?", options);
  if (!proceed) {
    console.log("Nothing removed.");
    return;
  }
  const { deleted, refused } = deleteManagedFiles();
  for (const path of deleted) console.log(`Removed ${path}`);
  for (const path of refused) console.log(`Refused to remove ${path} (no ownership marker found)`);

  const token = resolveGitHubToken();
  const octokit = createGitHubClient(token);
  const { owner, repo } = parseOwnerRepo(getGitRemoteUrl());

  if (auth) {
    // SPEC.md §15 step 3: --delete-secret (default: ask interactively;
    // false in non-interactive unless flagged) — its own opt-in, not tied
    // to the general --yes flag.
    let wantsSecretDeletion = options.deleteSecret;
    if (!wantsSecretDeletion && !options.nonInteractive) {
      const answer = await p.confirm({ message: "Delete the repo secret too?", initialValue: false });
      wantsSecretDeletion = !p.isCancel(answer) && answer;
    }
    const secrets = createGitHubSecretsPort(octokit, owner, repo);
    const secretDeleted = await deleteRepoSecret(secrets, auth, wantsSecretDeletion);
    console.log(secretDeleted ? "Repo secret deleted." : "Repo secret left in place.");
  }

  // SPEC.md §15 step 5: untouched unless --delete-local-credentials — this
  // does NOT follow the general --yes flag, it has its own explicit opt-in.
  let wantsCredentialDeletion = options.deleteLocalCredentials;
  if (!wantsCredentialDeletion && !options.nonInteractive) {
    const answer = await p.confirm({ message: "Delete the locally cached credential too?", initialValue: false });
    wantsCredentialDeletion = !p.isCancel(answer) && answer;
  }
  const credentialsDeleted = deleteLocalCredentials(wantsCredentialDeletion);
  console.log(credentialsDeleted ? "Local credential cache deleted." : "Local credential cache left in place.");

  printUninstallProtectionWarning(owner, repo);
  printCommitReminder();
}

export async function uninstall(args: {
  nonInteractive: boolean;
  yes?: boolean;
  deleteSecret?: boolean;
  deleteLocalCredentials?: boolean;
}): Promise<number> {
  try {
    await runUninstall({
      nonInteractive: args.nonInteractive,
      yes: args.yes ?? false,
      deleteSecret: args.deleteSecret ?? false,
      deleteLocalCredentials: args.deleteLocalCredentials ?? false,
    });
    return 0;
  } catch (err) {
    if (err instanceof RefusedWithoutConsentError) {
      process.stderr.write(JSON.stringify({ error: "refused_without_consent" }) + "\n");
      return 1;
    }
    process.stderr.write(JSON.stringify({ error: "uninstall_failed", message: (err as Error).message }) + "\n");
    return 1;
  }
}
