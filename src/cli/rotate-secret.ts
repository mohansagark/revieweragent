import { existsSync, readFileSync } from "node:fs";
import * as p from "@clack/prompts";
import { parseConfig, type AuthType, type ProviderId } from "../core/config-schema.js";
import { createGitHubClient, parseOwnerRepo, resolveGitHubToken } from "../platform/github/client.js";
import { createGitHubSecretsPort } from "../platform/github/secrets.js";
import { getGitRemoteUrl } from "../core/git.js";
import { secretNameFor } from "../core/secret-names.js";
import { persistCachedCredential } from "../core/credential-cache.js";
import { validateApiKey } from "../provider/claude/api-key-credential.js";
import { validateGeminiApiKey } from "../provider/gemini/api-key-credential.js";
import { runSetupToken } from "../provider/claude/setup-token.js";

const CONFIG_PATH = ".revieweragent.yml";

export async function rotateSecret(args: {
  nonInteractive: boolean;
  yes?: boolean;
  oauthToken?: string;
  apiKey?: string;
  cursorApiKey?: string;
  geminiApiKey?: string;
  fallback?: boolean;
  updateCache?: boolean;
  noKeychain?: boolean;
}): Promise<number> {
  try {
    if (!existsSync(CONFIG_PATH)) throw new Error("No .revieweragent.yml found.");
    const config = parseConfig(readFileSync(CONFIG_PATH, "utf8"));
    let target: { provider: ProviderId; auth: AuthType } = { provider: config.provider, auth: config.auth };
    if (args.fallback) {
      if (!config.fallback) throw new Error("No fallback provider is configured.");
      target = config.fallback;
    } else if (!args.nonInteractive && config.fallback) {
      const choice = (await p.select({
        message: "Rotate which credential?",
        options: [
          { value: "primary", label: `${config.provider} ${config.auth} (primary)` },
          { value: "fallback", label: `${config.fallback.provider} ${config.fallback.auth} (fallback)` },
        ],
      })) as "primary" | "fallback";
      if (p.isCancel(choice)) throw new Error("Cancelled.");
      if (choice === "fallback") target = config.fallback;
    }
    const name = secretNameFor(target.provider, target.auth);
    if (args.nonInteractive && !args.yes) {
      throw new Error("--non-interactive rotate-secret requires --yes.");
    }
    if (!args.nonInteractive) {
      const ok = await p.confirm({ message: `Overwrite GitHub secret ${name}?`, initialValue: true });
      if (p.isCancel(ok) || !ok) throw new Error("Cancelled.");
    }
    const credential = await acquire(target.provider, target.auth, args);
    const token = resolveGitHubToken();
    const octokit = createGitHubClient(token);
    const { owner, repo } = parseOwnerRepo(getGitRemoteUrl());
    const secrets = createGitHubSecretsPort(octokit, owner, repo);
    await secrets.putSecret(name, credential);
    if (args.updateCache) {
      persistCachedCredential(target.provider, target.auth, credential, { noKeychain: args.noKeychain });
    }
    console.log(`Updated ${name}.`);
    return 0;
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: "rotate_secret_failed", message: (err as Error).message }) + "\n");
    return 1;
  }
}

async function acquire(
  provider: ProviderId,
  auth: AuthType,
  args: {
    nonInteractive: boolean;
    oauthToken?: string;
    apiKey?: string;
    cursorApiKey?: string;
    geminiApiKey?: string;
  },
): Promise<string> {
  if (provider === "cursor") {
    const value = args.cursorApiKey ?? process.env.CURSOR_API_KEY;
    if (value) return value.trim();
    if (args.nonInteractive) throw new Error("Missing --cursor-api-key");
    const key = await p.password({ message: "Paste the new Cursor API key" });
    if (p.isCancel(key)) throw new Error("Cancelled.");
    return key.trim();
  }
  if (provider === "gemini") {
    const value = args.geminiApiKey ?? process.env.GEMINI_API_KEY;
    if (value) return validateGeminiApiKey(value);
    if (args.nonInteractive) throw new Error("Missing --gemini-api-key");
    const key = await p.password({ message: "Paste the new Gemini API key" });
    if (p.isCancel(key)) throw new Error("Cancelled.");
    return validateGeminiApiKey(key);
  }
  if (auth === "api-key") {
    const value = args.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (value) return validateApiKey(value);
    if (args.nonInteractive) throw new Error("Missing --api-key");
    const key = await p.password({ message: "Paste the new Anthropic API key" });
    if (p.isCancel(key)) throw new Error("Cancelled.");
    return validateApiKey(key);
  }
  const value = args.oauthToken ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (value) return value;
  if (args.nonInteractive) throw new Error("Missing --oauth-token");
  return runSetupToken();
}
