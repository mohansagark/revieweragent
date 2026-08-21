import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as p from "@clack/prompts";
import { createGitHubClient, parseOwnerRepo, resolveGitHubToken } from "../platform/github/client.js";
import { getGitRemoteUrl } from "../core/git.js";
import { createGitHubSecretsPort } from "../platform/github/secrets.js";
import { loadPinnedShas } from "../core/pinned-shas.js";
import {
  defaultConfig,
  parseConfig,
  methodKey,
  LIVE_PROVIDERS,
  type AuthType,
  type Mode,
  type BlockSeverity,
  type RevieweragentConfig,
  type ProviderId,
  type FallbackConfig,
  BLOCK_SEVERITY_VALUES,
} from "../core/config-schema.js";
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
import { validateGeminiApiKey } from "../provider/gemini/api-key-credential.js";
import { providerRegistry, listProvidersForCategory, type PromptCategory } from "../provider/registry.js";
import { buildWorkflowYaml, resolveWorkflowWrite, isManagedWorkflow } from "./write-workflow.js";
import { resolveConfigWrite, isManagedConfig } from "./write-config.js";
import { applyManagedCodeowners } from "./codeowners.js";
import { printCodeownersRecommendation } from "./print-codeowners.js";
import { printBranchProtectionInstructions } from "./print-protection-instructions.js";
import { commitAndMaybePush } from "./commit-push.js";

export interface InitFallback {
  provider: ProviderId;
  auth: AuthType;
  credential: string;
}

export interface InitOptions {
  provider: ProviderId;
  auth: AuthType;
  mode: Mode;
  severity: BlockSeverity;
  credential: string;
  fallback?: InitFallback;
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

export interface NonInteractiveInitArgv {
  provider?: string;
  auth?: string;
  mode?: string;
  severity?: string;
  oauthToken?: string;
  apiKey?: string;
  cursorApiKey?: string;
  geminiApiKey?: string;
  fallbackProvider?: string;
  fallbackAuth?: string;
  fallbackOauthToken?: string;
  fallbackApiKey?: string;
  fallbackCursorApiKey?: string;
  fallbackGeminiApiKey?: string;
  commit?: boolean;
  push?: boolean;
  codeowners?: string;
  noCodeowners?: boolean;
  noKeychain?: boolean;
}

function parseProviderId(raw: string | undefined, field: string): ProviderId {
  if (!raw || !(LIVE_PROVIDERS as readonly string[]).includes(raw)) {
    throw new MissingInputError(field);
  }
  return raw as ProviderId;
}

function parseAuthForProvider(provider: ProviderId, raw: string | undefined, field: string): AuthType {
  let auth = raw as AuthType | undefined;
  if (!auth && provider === "gemini") auth = "api-key";
  if (!auth && provider === "cursor") auth = "subscription";
  if (auth !== "subscription" && auth !== "api-key") throw new MissingInputError(field);
  if (provider === "cursor" && auth !== "subscription") throw new MissingInputError(field);
  if (provider === "gemini" && auth !== "api-key") throw new MissingInputError(field);
  return auth;
}

function credentialForMethod(
  provider: ProviderId,
  auth: AuthType,
  flags: { oauthToken?: string; apiKey?: string; cursorApiKey?: string; geminiApiKey?: string },
  fieldPrefix: "" | "fallback-",
): string {
  if (provider === "cursor") {
    const value = flags.cursorApiKey ?? (fieldPrefix === "" ? process.env.CURSOR_API_KEY : undefined);
    if (!value) throw new MissingInputError(`${fieldPrefix}cursor-api-key`);
    const trimmed = value.trim();
    if (trimmed.length < 8) throw new MissingInputError(`${fieldPrefix}cursor-api-key`);
    return trimmed;
  }
  if (provider === "gemini") {
    const value = flags.geminiApiKey ?? (fieldPrefix === "" ? process.env.GEMINI_API_KEY : undefined);
    if (!value) throw new MissingInputError(`${fieldPrefix}gemini-api-key`);
    return validateGeminiApiKey(value);
  }
  if (auth === "api-key") {
    const value = flags.apiKey ?? (fieldPrefix === "" ? process.env.ANTHROPIC_API_KEY : undefined);
    if (!value) throw new MissingInputError(`${fieldPrefix}api-key`);
    return validateApiKey(value);
  }
  const value = flags.oauthToken ?? (fieldPrefix === "" ? process.env.CLAUDE_CODE_OAUTH_TOKEN : undefined);
  if (!value) throw new MissingInputError(`${fieldPrefix}oauth-token`);
  return value;
}

function parseFallbackOptions(argv: NonInteractiveInitArgv, primary: { provider: ProviderId; auth: AuthType }): InitFallback | undefined {
  const hasProvider = Boolean(argv.fallbackProvider);
  const hasAuth = Boolean(argv.fallbackAuth);
  const hasCred = Boolean(
    argv.fallbackOauthToken || argv.fallbackApiKey || argv.fallbackCursorApiKey || argv.fallbackGeminiApiKey,
  );
  if (!hasProvider && !hasAuth && !hasCred) return undefined;
  if (!hasProvider) throw new MissingInputError("fallback-provider");

  const provider = parseProviderId(argv.fallbackProvider, "fallback-provider");
  const auth = parseAuthForProvider(provider, argv.fallbackAuth, "fallback-auth");
  if (methodKey(provider, auth) === methodKey(primary.provider, primary.auth)) {
    throw new MissingInputError("fallback");
  }
  const credential = credentialForMethod(
    provider,
    auth,
    {
      oauthToken: argv.fallbackOauthToken,
      apiKey: argv.fallbackApiKey,
      cursorApiKey: argv.fallbackCursorApiKey,
      geminiApiKey: argv.fallbackGeminiApiKey,
    },
    "fallback-",
  );
  return { provider, auth, credential };
}

export function parseNonInteractiveOptions(argv: NonInteractiveInitArgv): InitOptions {
  const provider = parseProviderId(argv.provider ?? "claude", "provider");
  const auth = parseAuthForProvider(provider, argv.auth, "auth");

  const mode = (argv.mode as Mode | undefined) ?? "advisory";
  if (mode !== "advisory" && mode !== "gate") throw new MissingInputError("mode");

  const severity = (argv.severity as BlockSeverity | undefined) ?? "high";
  if (!(BLOCK_SEVERITY_VALUES as readonly string[]).includes(severity)) {
    throw new MissingInputError("severity");
  }

  const credential = credentialForMethod(provider, auth, argv, "");
  const fallback = parseFallbackOptions(argv, { provider, auth });

  return {
    provider,
    auth,
    mode,
    severity,
    credential,
    fallback,
    nonInteractive: true,
    commit: argv.commit ?? false,
    push: argv.push ?? false,
    writeCodeowners: Boolean(argv.codeowners) && !argv.noCodeowners,
    codeownersUser: argv.codeowners,
    noKeychain: Boolean(argv.noKeychain),
  };
}

function tryExistingConfig(): RevieweragentConfig | undefined {
  if (!existsSync(CONFIG_PATH)) return undefined;
  try {
    return parseConfig(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return undefined;
  }
}

function geminiTrainingNote(): void {
  p.note(
    [
      "Gemini free-tier prompts may be used to improve Google's models.",
      "Fork PR diffs (untrusted authors) go to Google when Gemini runs as primary or fallback.",
    ].join("\n"),
    "Gemini",
  );
}

function fallbackFreezeNote(): void {
  p.note(
    [
      "If both providers are rate-limited, the revieweragent check fails closed.",
      "On a public repo with fork_policy: auto (the default), an outsider can burn both quotas and freeze merges.",
      "Leave fallback off to keep skip-and-pass on quota.",
    ].join("\n"),
    "Fallback and forks",
  );
}

async function promptCategoryProviderCredential(opts?: {
  omit?: { provider: ProviderId; auth: AuthType };
}): Promise<{ provider: ProviderId; auth: AuthType; credential: string }> {
  const omit = opts?.omit;
  const agentProviders = listProvidersForCategory(providerRegistry, "Agent", omit);
  const modelProviders = listProvidersForCategory(providerRegistry, "Model", omit);
  const categoryOptions: { value: PromptCategory; label: string }[] = [];
  if (agentProviders.length > 0) {
    categoryOptions.push({
      value: "Agent",
      label: "Agent — subscription / login tools (Claude Code, Cursor)",
    });
  }
  if (modelProviders.length > 0) {
    categoryOptions.push({
      value: "Model",
      label: "Model — I have a provider API key",
    });
  }
  if (categoryOptions.length === 0) {
    throw new Error("No remaining providers for this choice.");
  }

  let category: PromptCategory;
  if (categoryOptions.length === 1) {
    category = categoryOptions[0]!.value;
  } else {
    const picked = (await p.select({
      message: "Agent or Model?",
      options: categoryOptions,
    })) as PromptCategory;
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    category = picked;
  }

  const providers = category === "Agent" ? agentProviders : modelProviders;
  const providerId = (await p.select({
    message: "Pick a provider",
    options: providers.map((pr) => ({ value: pr.id, label: pr.displayName })),
  })) as string;
  if (p.isCancel(providerId)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }

  const provider = parseProviderId(providerId, "provider");
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

  if (provider === "gemini") geminiTrainingNote();

  return { provider, auth, credential };
}

async function promptForInitOptions(): Promise<InitOptions> {
  p.intro("revieweragent init");

  const primary = await promptCategoryProviderCredential();

  for (const dep of requiredDependenciesFor(primary.auth)) {
    if (dep.present) continue;
    if (dep.name === "gh authentication") continue;
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

  if (primary.provider === "cursor") {
    p.note(
      [
        "Key is billed to your Cursor plan (personal or team service account).",
        "Every repo admin can trigger reviews against this personal credential.",
        "On public repos, fork_policy: auto (the default) reviews every fork PR and shares this quota.",
        "Rotate with `npx revieweragent rotate-secret`.",
      ].join("\n"),
      "Before continuing",
    );
  } else if (primary.provider === "claude" && primary.auth === "subscription") {
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

  const existing = tryExistingConfig();
  const wantFallback = await p.confirm({
    message: "Configure a fallback provider?",
    initialValue: Boolean(existing?.fallback),
  });
  let fallback: InitFallback | undefined;
  if (!p.isCancel(wantFallback) && wantFallback) {
    const fb = await promptCategoryProviderCredential({
      omit: { provider: primary.provider, auth: primary.auth },
    });
    fallback = fb;
    fallbackFreezeNote();
  }

  return {
    provider: primary.provider,
    auth: primary.auth,
    mode,
    severity,
    credential: primary.credential,
    fallback,
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
  if (provider === "gemini") {
    const key = await p.password({ message: "Paste your Google AI Studio API key" });
    if (p.isCancel(key)) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    return validateGeminiApiKey(key);
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

  const fallbackCfg: FallbackConfig | undefined = options.fallback
    ? { provider: options.fallback.provider, auth: options.fallback.auth }
    : undefined;
  const shas = loadPinnedShas();
  const workflowYaml = buildWorkflowYaml({
    auth: options.auth,
    provider: options.provider,
    fallback: fallbackCfg,
    shas,
  });
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
    ...(fallbackCfg ? { fallback: fallbackCfg } : {}),
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
  const unused = unusedSecretNames(options.provider, options.auth, fallbackCfg);
  const presentUnused: string[] = [];
  for (const name of unused) {
    if (await secrets.hasSecret(name)) presentUnused.push(name);
  }
  let deleteConfirmed = options.nonInteractive;
  if (presentUnused.length > 0 && !options.nonInteractive) {
    const ok = await p.confirm({
      message: `Delete unused secret(s) ${presentUnused.join(", ")}? Only the live primary${fallbackCfg ? " and fallback" : ""} credential(s) remain.`,
    });
    deleteConfirmed = !p.isCancel(ok) && Boolean(ok);
  }
  const deletion = decideOtherSecretDeletion({ hasOtherSecret: presentUnused.length > 0, confirmed: deleteConfirmed });
  if (deletion === "abort") {
    throw new Error(
      `Refusing to leave ${presentUnused.join(", ")} in place. Confirm deletion or remove them manually, then re-run init.`,
    );
  }

  await secrets.putSecret(secretNameFor(options.provider, options.auth), options.credential);
  if (options.fallback) {
    await secrets.putSecret(secretNameFor(options.fallback.provider, options.fallback.auth), options.fallback.credential);
  }

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

export async function init(args: NonInteractiveInitArgv & { nonInteractive: boolean }): Promise<number> {
  try {
    if (!checkGitRepo().present) {
      throw new Error("Not a git repository. Run this from the repo you want to install into.");
    }
    const options = args.nonInteractive ? parseNonInteractiveOptions(args) : await promptForInitOptions();
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
