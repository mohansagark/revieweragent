import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as p from "@clack/prompts";
import { createGitHubClient, parseOwnerRepo, resolveGitHubToken } from "../platform/github/client.js";
import { getGitRemoteUrl } from "../core/git.js";
import { createGitHubSecretsPort } from "../platform/github/secrets.js";
import { loadPinnedShas } from "../core/pinned-shas.js";
import {
  defaultConfig,
  type AuthType,
  type Mode,
  type BlockSeverity,
  type RevieweragentConfig,
} from "../core/config-schema.js";
import { readCachedCredential, writeCachedCredential } from "../core/credential-cache.js";
import { requiredDependenciesFor, runFixCommand, runGhAuthLogin } from "./dependency-checks.js";
import { runSetupToken } from "../provider/claude/setup-token.js";
import { validateApiKey } from "../provider/claude/api-key-credential.js";
import { claudeProvider } from "../provider/claude/registry-entry.js";
import { listProvidersForCategory, type PromptCategory } from "../provider/registry.js";
import { buildWorkflowYaml, resolveWorkflowWrite, isManagedWorkflow } from "./write-workflow.js";
import { resolveConfigWrite } from "./write-config.js";
import { printCodeownersRecommendation } from "./print-codeowners.js";
import { printBranchProtectionInstructions } from "./print-protection-instructions.js";
import { commitAndMaybePush } from "./commit-push.js";

export interface InitOptions {
  provider: "claude";
  auth: AuthType;
  mode: Mode;
  severity: BlockSeverity;
  credential: string;
  nonInteractive: boolean;
  commit: boolean;
  push: boolean;
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
  commit?: boolean;
  push?: boolean;
}): InitOptions {
  const provider = argv.provider ?? "claude";
  if (provider !== "claude") throw new MissingInputError("provider");

  const auth = argv.auth as AuthType | undefined;
  if (auth !== "subscription" && auth !== "api-key") throw new MissingInputError("auth");

  const mode = (argv.mode as Mode | undefined) ?? "advisory";
  if (mode !== "advisory" && mode !== "gate") throw new MissingInputError("mode");

  const severity = (argv.severity as BlockSeverity | undefined) ?? "high";

  const credential =
    auth === "api-key"
      ? (argv.apiKey ?? process.env.ANTHROPIC_API_KEY)
      : (argv.oauthToken ?? process.env.CLAUDE_CODE_OAUTH_TOKEN);
  if (!credential) throw new MissingInputError(auth === "api-key" ? "api-key" : "oauth-token");

  return {
    provider: "claude",
    auth,
    mode,
    severity,
    credential: auth === "api-key" ? validateApiKey(credential) : credential,
    nonInteractive: true,
    commit: argv.commit ?? false,
    push: argv.push ?? false,
  };
}

async function promptForInitOptions(): Promise<InitOptions> {
  p.intro("revieweragent init");

  const category = (await p.select({
    message: "Agent or Model?",
    options: [
      { value: "Agent", label: "Agent — I have a Claude subscription (Pro/Max/Team/Enterprise)" },
      { value: "Model", label: "Model — I have an Anthropic Console API key" },
    ],
  })) as PromptCategory;
  if (p.isCancel(category)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }

  const providers = listProvidersForCategory([claudeProvider], category);
  const providerId = (await p.select({
    message: "Pick a provider",
    options: providers.map((pr) => ({ value: pr.id, label: pr.displayName })),
  })) as string;
  if (p.isCancel(providerId)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }

  const auth: AuthType = category === "Agent" ? "subscription" : "api-key";

  const cached = readCachedCredential();
  let credential: string;
  if (cached && cached.auth === auth) {
    const reuse = await p.confirm({ message: "Reuse cached credential from a previous install?" });
    if (!p.isCancel(reuse) && reuse) {
      credential = cached.value;
    } else {
      credential = await acquireCredential(auth);
    }
  } else {
    credential = await acquireCredential(auth);
  }

  const cacheIt = await p.confirm({ message: "Cache this credential locally for reuse in other repos?" });
  if (!p.isCancel(cacheIt) && cacheIt) {
    writeCachedCredential({ auth, value: credential });
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

  const ghAuthed = requiredDependenciesFor(auth).find((d) => d.name === "gh CLI")?.present;
  if (ghAuthed) {
    const loginNeeded = await p.confirm({ message: "Log in to gh CLI now?", initialValue: false });
    if (!p.isCancel(loginNeeded) && loginNeeded) runGhAuthLogin();
  }

  if (auth === "subscription") {
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

  const commit = await p.confirm({ message: "Commit the generated files now?", initialValue: false });
  const doCommit = !p.isCancel(commit) && commit;
  let doPush = false;
  if (doCommit) {
    const push = await p.confirm({ message: "Push that commit too?", initialValue: false });
    doPush = !p.isCancel(push) && push;
  }

  return {
    provider: "claude",
    auth,
    mode,
    severity,
    credential,
    nonInteractive: false,
    commit: doCommit,
    push: doPush,
  };
}

async function acquireCredential(auth: AuthType): Promise<string> {
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

  const secrets = createGitHubSecretsPort(octokit, owner, repo);
  const otherAuth: AuthType = options.auth === "api-key" ? "subscription" : "api-key";
  const otherSecretName =
    otherAuth === "api-key" ? "REVIEWERAGENT_ANTHROPIC_API_KEY" : "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN";
  const hasOther = await secrets.hasSecret(otherSecretName);
  let deleteConfirmed = options.nonInteractive;
  if (hasOther && !options.nonInteractive) {
    const ok = await p.confirm({
      message: `Delete unused secret ${otherSecretName}? Only one auth secret can be live per repo.`,
    });
    deleteConfirmed = !p.isCancel(ok) && Boolean(ok);
  }
  const deletion = decideOtherSecretDeletion({ hasOtherSecret: hasOther, confirmed: deleteConfirmed });
  if (deletion === "abort") {
    throw new Error(
      `Refusing to leave ${otherSecretName} in place. Confirm deletion or remove it manually, then re-run init.`,
    );
  }
  if (deletion === "delete") {
    await secrets.deleteSecret(otherSecretName);
  }
  const secretName =
    options.auth === "api-key" ? "REVIEWERAGENT_ANTHROPIC_API_KEY" : "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN";
  await secrets.putSecret(secretName, options.credential);

  const shas = loadPinnedShas();
  const workflowYaml = buildWorkflowYaml({ auth: options.auth, shas });
  const existingWorkflow = existsSync(WORKFLOW_PATH) ? readFileSync(WORKFLOW_PATH, "utf8") : undefined;
  if (existingWorkflow !== undefined && isManagedWorkflow(existingWorkflow) && !options.nonInteractive) {
    const ok = await p.confirm({ message: "Overwrite existing .github/workflows/revieweragent.yml?" });
    if (p.isCancel(ok) || !ok) {
      throw new Error("Init cancelled: existing workflow not overwritten.");
    }
  }
  const workflowResult = resolveWorkflowWrite(WORKFLOW_PATH, existingWorkflow, workflowYaml);
  writeFile(WORKFLOW_PATH, workflowResult.content);

  const config: RevieweragentConfig = defaultConfig({
    auth: options.auth,
    mode: options.mode,
    block_severity: options.severity,
  });
  const existingConfig = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, "utf8") : undefined;
  if (existingConfig !== undefined && !options.nonInteractive) {
    const ok = await p.confirm({ message: "Overwrite existing .revieweragent.yml?" });
    if (p.isCancel(ok) || !ok) {
      throw new Error("Init cancelled: existing config not overwritten.");
    }
  }
  const configResult = resolveConfigWrite(CONFIG_PATH, existingConfig, config, true);
  writeFile(CONFIG_PATH, configResult.content);

  const { data: user } = await octokit.users.getAuthenticated();
  printCodeownersRecommendation(user.login);
  if (options.mode === "gate") {
    printBranchProtectionInstructions(owner, repo);
  }

  if (options.commit) {
    commitAndMaybePush([WORKFLOW_PATH, CONFIG_PATH], options.push);
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
  commit?: boolean;
  push?: boolean;
}): Promise<number> {
  try {
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
    if (err instanceof Error && err.name === "UnmarkedWorkflowConflictError") {
      process.stderr.write(JSON.stringify({ error: "unmarked_conflict", message: err.message }) + "\n");
      return 1;
    }
    process.stderr.write(JSON.stringify({ error: "init_failed", message: (err as Error).message }) + "\n");
    return 1;
  }
}

export { isManagedWorkflow };
