import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as p from "@clack/prompts";
import { createGitHubClient, parseOwnerRepo, resolveGitHubToken } from "../platform/github/client.js";
import { getGitRemoteUrl } from "../core/git.js";
import { createGitHubSecretsPort } from "../platform/github/secrets.js";
import { loadPinnedShas } from "../core/pinned-shas.js";
import { defaultConfig, type AuthType, type Mode, type BlockSeverity, type RevieweragentConfig, type ProviderId, BLOCK_SEVERITY_VALUES } from "../core/config-schema.js";
import { loadPersistedCredential, persistCachedCredential } from "../core/credential-cache.js";
import { secretNameFor, unusedSecretNames } from "../core/secret-names.js";
import {
  requiredDependenciesFor,
  runFixCommand,
  runGhAuthLogin,
  checkGitRepo,
  checkGhCli,
  checkGhAuthenticated,
  shouldPromptGhLogin,
} from "./dependency-checks.js";
import { runSetupToken } from "../provider/claude/setup-token.js";
import { validateApiKey } from "../provider/claude/api-key-credential.js";
import { providerRegistry, listProvidersForCategory, type PromptCategory } from "../provider/registry.js";
import { buildWorkflowYaml, resolveWorkflowWrite, isManagedWorkflow } from "./write-workflow.js";
import { resolveConfigWrite, isManagedConfig } from "./write-config.js";
import { applyManagedCodeowners } from "./codeowners.js";
import { printCodeownersRecommendation } from "./print-codeowners.js";
import { printBranchProtectionInstructions } from "./print-protection-instructions.js";
import { commitAndMaybePush } from "./commit-push.js";

export interface InitOptions {
  provider: ProviderId;
  auth: AuthType;
  mode: Mode;
  severity: BlockSeverity;
  credential: string;
  nonInteractive: boolean;
  commit: boolean;
  push: boolean;
  writeCodeowners: boolean;
  codeownersUser?: string;
  noKeychain?: boolean;
}

export class MissingInputError extends Error {
  constructor(public readonly field: string) {
    super(`Missing required input: ${field}`);
    this.name = "MissingInputError";
  }
}

const WORKFLOW_PATH = ".github/workflows/revieweragent.yml";
const CONFIG_PATH = ".revieweragent.yml";

// FR-007: non-interactive engine — flags/env only, exit 1 with a
// machine-readable error on any missing input, never prompts.
export function parseNonInteractiveOptions(argv: {
  provider?: string;
  auth?: string;
  mode?: string;
  severity?: string;
  oauthToken?: string;
  apiKey?: string;
  cursorApiKey?: string;
  commit?: boolean;
  push?: boolean;
  codeowners?: string;
  noCodeowners?: boolean;
  noKeychain?: boolean;
}): InitOptions {
  const provider = (argv.provider ?? "claude") as ProviderId;
  if (provider !== "claude" && provider !== "cursor") throw new MissingInputError("provider");

  const auth = argv.auth as AuthType | undefined;
  if (auth !== "subscription" && auth !== "api-key") throw new MissingInputError("auth");
  if (provider === "cursor" && auth !== "subscription") throw new MissingInputError("auth");

  const mode = (argv.mode as Mode | undefined) ?? "advisory";
  if (mode !== "advisory" && mode !== "gate") throw new MissingInputError("mode");

  const severity = (argv.severity as BlockSeverity | undefined) ?? "high";
  if (!(BLOCK_SEVERITY_VALUES as readonly string[]).includes(severity)) {
    throw new MissingInputError("severity");
  }

  let credential: string | undefined;
  if (provider === "cursor") {
    credential = argv.cursorApiKey ?? process.env.CURSOR_API_KEY;
    if (!credential) throw new MissingInputError("cursor-api-key");
  } else if (auth === "api-key") {
    credential = argv.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!credential) throw new MissingInputError("api-key");
    credential = validateApiKey(credential);
  } else {
    credential = argv.oauthToken ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!credential) throw new MissingInputError("oauth-token");
  }

  return {
    provider,
    auth,
    mode,
    severity,
    credential,
    nonInteractive: true,
    commit: argv.commit ?? false,
    push: argv.push ?? false,
    writeCodeowners: Boolean(argv.codeowners) && !argv.noCodeowners,
    codeownersUser: argv.codeowners,
    noKeychain: Boolean(argv.noKeychain),
  };
}

async function promptForInitOptions(): Promise<InitOptions> {
  p.intro("revieweragent init");

  const category = (await p.select({
    message: "Agent or Model?",
    options: [
      { value: "Agent", label: "Agent — subscription / login tools (Claude Code, Cursor)" },
      { value: "Model", label: "Model — I have an Anthropic Console API key" },
    ],
  })) as PromptCategory;
  if (p.isCancel(category)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }

  const providers = listProvidersForCategory(providerRegistry, category);
  const providerId = (await p.select({
    message: "Pick a provider",
    options: providers.map((pr) => ({ value: pr.id, label: pr.displayName })),
  })) as string;
  if (p.isCancel(providerId)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }

  const provider = (providerId === "cursor" ? "cursor" : "claude") as ProviderId;
  const auth: AuthType = category === "Agent" ? "subscription" : "api-key";

  const cached = loadPersistedCredential(provider, auth);
  let credential: string;
  if (cached) {
    const reuse = await p.confirm({ message: "Reuse cached credential from a previous install?" });
    if (!p.isCancel(reuse) && reuse) {
      credential = cached.value;
    } else {
      credential = await acquireCredential(provider, auth);
    }
  } else {
    credential = await acquireCredential(provider, auth);
  }

  const cacheIt = await p.confirm({ message: "Cache this credential locally for reuse in other repos?" });
  if (!p.isCancel(cacheIt) && cacheIt) {
    persistCachedCredential(provider, auth, credential);
  }

  for (const dep of requiredDependenciesFor(auth)) {
    if (dep.present) continue;
    if (dep.name === "gh authentication") continue; // handled below
    const proceed = await p.confirm({
      message: `${dep.name} is missing. Run \`${dep.fixCommand}\`?`,
    });
    if (!p.isCancel(proceed) && proceed && dep.fixCommand) {
      runFixCommand(dep.fixCommand);
    }
  }

  if (
    shouldPromptGhLogin({
      ghCliPresent: checkGhCli().present,
      ghAuthenticated: checkGhAuthenticated().present,
    })
  ) {
    const loginNeeded = await p.confirm({ message: "Log in to gh CLI now?", initialValue: true });
    if (!p.isCancel(loginNeeded) && loginNeeded) runGhAuthLogin();
  }

  if (provider === "cursor") {
    p.note(
      [
        "Key is billed to your Cursor plan (personal or team service account).",
        "Every repo admin can trigger reviews against this personal credential.",
        "On public repos, fork_policy: auto (the default) reviews every fork PR and shares this quota.",
        "Rotate with `npx revieweragent rotate-secret`.",
      ].join("\n"),
      "Before continuing",
    );
  } else if (auth === "subscription") {
    p.note(
      [
        "Token lasts ~1 year. Quota is shared with your interactive Claude Code / claude.ai sessions.",
        "Every repo admin can trigger reviews against this personal credential.",
        "CI is pinned to Sonnet with discovery disabled (~18x cheaper than unpinned Opus).",
        "On public repos, fork_policy: auto (the default) reviews every fork PR and shares this quota.",
      ].join("\n"),
      "Before continuing",
    );
  }

  const mode = (await p.select({
    message: "Advisory (comment-only) or gate (blocking) mode?",
    options: [
      { value: "advisory", label: "Advisory — never blocks merges" },
      { value: "gate", label: "Gate — also reports a blocking status check" },
    ],
  })) as Mode;
  if (p.isCancel(mode)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }

  let severity: BlockSeverity = "high";
  if (mode === "gate") {
    const sev = (await p.select({
      message: "Block severity threshold",
      options: [
        { value: "any", label: "any" },
        { value: "critical", label: "critical" },
        { value: "high", label: "high (default)" },
        { value: "medium", label: "medium" },
        { value: "low", label: "low" },
      ],
      initialValue: "high",
    })) as BlockSeverity;
    if (!p.isCancel(sev)) severity = sev;
  }

  const writeCo = await p.confirm({
    message: "Write a managed CODEOWNERS block for revieweragent files?",
    initialValue: true,
  });

  const commit = await p.confirm({ message: "Commit the generated files now?", initialValue: false });
  const doCommit = !p.isCancel(commit) && commit;
  let doPush = false;
  if (doCommit) {
    const push = await p.confirm({ message: "Push that commit too?", initialValue: false });
    doPush = !p.isCancel(push) && push;
  }

  return {
    provider,
    auth,
    mode,
    severity,
    credential,
    nonInteractive: false,
    commit: doCommit,
    push: doPush,
    writeCodeowners: !p.isCancel(writeCo) && Boolean(writeCo),
  };
}

async function acquireCredential(provider: ProviderId, auth: AuthType): Promise<string> {
  if (provider === "cursor") {
    const key = await p.password({ message: "Paste your Cursor Dashboard / service-account API key" });
    if (p.isCancel(key)) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    const trimmed = key.trim();
    if (trimmed.length < 8) throw new Error("Cursor API key looks empty.");
    return trimmed;
  }
  if (auth === "subscription") {
    const spinner = p.spinner();
    spinner.start("Waiting for browser login (claude setup-token)...");
    try {
      const token = await runSetupToken();
      spinner.stop("Token acquired.");
      return token;
    } catch (err) {
      spinner.stop("Failed to acquire token.");
      throw err;
    }
  }
  const key = await p.password({ message: "Paste your Anthropic Console API key" });
  if (p.isCancel(key)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return validateApiKey(key);
}

export function decideOtherSecretDeletion(opts: {
  hasOtherSecret: boolean;
  confirmed: boolean;
}): "noop" | "delete" | "abort" {
  if (!opts.hasOtherSecret) return "noop";
  if (!opts.confirmed) return "abort";
  return "delete";
}

export async function runInit(options: InitOptions): Promise<void> {
  const token = resolveGitHubToken();
  const octokit = createGitHubClient(token);
  const { owner, repo } = parseOwnerRepo(getGitRemoteUrl());

  const shas = loadPinnedShas();
  const workflowYaml = buildWorkflowYaml({ auth: options.auth, provider: options.provider, shas });
  const existingWorkflow = existsSync(WORKFLOW_PATH) ? readFileSync(WORKFLOW_PATH, "utf8") : undefined;
  if (existingWorkflow !== undefined && isManagedWorkflow(existingWorkflow) && !options.nonInteractive) {
    const ok = await p.confirm({ message: "Overwrite existing .github/workflows/revieweragent.yml?" });
    if (p.isCancel(ok) || !ok) {
      throw new Error("Init cancelled: existing workflow not overwritten.");
    }
  }
  const workflowResult = resolveWorkflowWrite(WORKFLOW_PATH, existingWorkflow, workflowYaml);

  const config: RevieweragentConfig = defaultConfig({
    provider: options.provider,
    auth: options.auth,
    mode: options.mode,
    block_severity: options.severity,
  });
  const existingConfig = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, "utf8") : undefined;
  if (existingConfig !== undefined && isManagedConfig(existingConfig) && !options.nonInteractive) {
    const ok = await p.confirm({ message: "Overwrite existing .revieweragent.yml?" });
    if (p.isCancel(ok) || !ok) {
      throw new Error("Init cancelled: existing config not overwritten.");
    }
  }
  const configResult = resolveConfigWrite(CONFIG_PATH, existingConfig, config, true);

  const secrets = createGitHubSecretsPort(octokit, owner, repo);
  const unused = unusedSecretNames(options.provider, options.auth);
  const presentUnused: string[] = [];
  for (const name of unused) {
    if (await secrets.hasSecret(name)) presentUnused.push(name);
  }
  let deleteConfirmed = options.nonInteractive;
  if (presentUnused.length > 0 && !options.nonInteractive) {
    const ok = await p.confirm({
      message: `Delete unused secret(s) ${presentUnused.join(", ")}? Only one credential can be live per repo.`,
    });
    deleteConfirmed = !p.isCancel(ok) && Boolean(ok);
  }
  const deletion = decideOtherSecretDeletion({ hasOtherSecret: presentUnused.length > 0, confirmed: deleteConfirmed });
  if (deletion === "abort") {
    throw new Error(
      `Refusing to leave ${presentUnused.join(", ")} in place. Confirm deletion or remove them manually, then re-run init.`,
    );
  }

  const secretName = secretNameFor(options.provider, options.auth);
  await secrets.putSecret(secretName, options.credential);

  writeFile(WORKFLOW_PATH, workflowResult.content);
  writeFile(CONFIG_PATH, configResult.content);

  if (deletion === "delete") {
    for (const name of presentUnused) await secrets.deleteSecret(name);
  }

  const { data: user } = await octokit.users.getAuthenticated();
  const codeownersUser = options.codeownersUser ?? user.login;
  const pathsToCommit = [WORKFLOW_PATH, CONFIG_PATH];
  if (options.writeCodeowners) {
    const codeownersPath = existsSync("CODEOWNERS")
      ? "CODEOWNERS"
      : existsSync("docs/CODEOWNERS")
        ? "docs/CODEOWNERS"
        : ".github/CODEOWNERS";
    const existing = existsSync(codeownersPath) ? readFileSync(codeownersPath, "utf8") : undefined;
    const written = applyManagedCodeowners(existing, codeownersUser);
    writeFile(codeownersPath, written.content);
    pathsToCommit.push(codeownersPath);
    printCodeownersRecommendation(codeownersUser);
  } else {
    printCodeownersRecommendation(codeownersUser);
  }
  if (options.mode === "gate") {
    printBranchProtectionInstructions(owner, repo);
  }
  console.log(
    "\nIf this repo uses a merge queue, a dirty or unmapped merge commit still costs one extra model inference.",
  );

  if (options.commit) {
    commitAndMaybePush(pathsToCommit, options.push);
  } else {
    console.log("\nNext: commit and push these files to your default branch to activate the workflow.");
  }
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export async function init(args: {
  nonInteractive: boolean;
  provider?: string;
  auth?: string;
  mode?: string;
  severity?: string;
  oauthToken?: string;
  apiKey?: string;
  cursorApiKey?: string;
  commit?: boolean;
  push?: boolean;
  codeowners?: string;
  noCodeowners?: boolean;
  noKeychain?: boolean;
}): Promise<number> {
  try {
    if (!checkGitRepo().present) {
      throw new Error("Not a git repository. Run this from the repo you want to install into.");
    }
    const options = args.nonInteractive
      ? parseNonInteractiveOptions(args)
      : await promptForInitOptions();
    await runInit(options);
    return 0;
  } catch (err) {
    if (err instanceof MissingInputError) {
      process.stderr.write(JSON.stringify({ error: "missing_input", field: err.field }) + "\n");
      return 1;
    }
    if (
      err instanceof Error &&
      (err.name === "UnmanagedConfigConflictError" || err.name === "UnmarkedWorkflowConflictError")
    ) {
      process.stderr.write(JSON.stringify({ error: "unmarked_conflict", message: err.message }) + "\n");
      return 1;
    }
    process.stderr.write(JSON.stringify({ error: "init_failed", message: (err as Error).message }) + "\n");
    return 1;
  }
}

export { isManagedWorkflow };
