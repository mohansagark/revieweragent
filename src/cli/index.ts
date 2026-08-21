#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./init.js";
import { uninstall } from "./uninstall.js";
import { upgrade } from "./upgrade.js";
import { rotateSecret } from "./rotate-secret.js";
import { applyProtection } from "./apply-protection.js";
import { argvWithDefaultInitCommand } from "./default-command.js";

// SPEC.md §4: the prompt UI is a layer over a non-interactive engine.
// Every command works with flags + env when --non-interactive is set or
// stdin is not a TTY.

const program = new Command();
program.name("revieweragent").description("Wire automatic AI PR review into a git repo.");

program
  .command("init")
  .description("Install into the current repo")
  .option("--provider <provider>", "AI provider (claude | cursor | gemini)", "claude")
  .option("--auth <auth>", "subscription | api-key")
  .option("--mode <mode>", "advisory | gate", "advisory")
  .option("--severity <severity>", "block severity threshold for gate mode", "high")
  .option("--oauth-token <token>", "Claude Code OAuth token (subscription auth)")
  .option("--api-key <key>", "Anthropic Console API key (api-key auth)")
  .option("--cursor-api-key <key>", "Cursor Dashboard / service-account API key")
  .option("--gemini-api-key <key>", "Google AI Studio Gemini API key")
  .option("--fallback-provider <provider>", "Optional fallback provider (claude | cursor | gemini)")
  .option("--fallback-auth <auth>", "Fallback auth (subscription | api-key)")
  .option("--fallback-oauth-token <token>", "Fallback Claude Code OAuth token")
  .option("--fallback-api-key <key>", "Fallback Anthropic Console API key")
  .option("--fallback-cursor-api-key <key>", "Fallback Cursor API key")
  .option("--fallback-gemini-api-key <key>", "Fallback Gemini API key")
  .option("--codeowners <user>", "Write a managed CODEOWNERS block for @USER")
  .option("--no-codeowners", "Skip writing CODEOWNERS (non-interactive default)")
  .option("--no-keychain", "Force the plaintext 0600 credential file instead of the OS keychain")
  .option("--commit", "Commit the files init writes", false)
  .option("--push", "Push the commit (requires --commit)", false)
  .option("--non-interactive", "Run without prompts; all inputs via flags/env", !process.stdin.isTTY)
  .action(async (opts) => {
    const exitCode = await init({
      nonInteractive: opts.nonInteractive,
      provider: opts.provider,
      auth: opts.auth,
      mode: opts.mode,
      severity: opts.severity,
      oauthToken: opts.oauthToken,
      apiKey: opts.apiKey,
      cursorApiKey: opts.cursorApiKey,
      geminiApiKey: opts.geminiApiKey,
      fallbackProvider: opts.fallbackProvider,
      fallbackAuth: opts.fallbackAuth,
      fallbackOauthToken: opts.fallbackOauthToken,
      fallbackApiKey: opts.fallbackApiKey,
      fallbackCursorApiKey: opts.fallbackCursorApiKey,
      fallbackGeminiApiKey: opts.fallbackGeminiApiKey,
      codeowners: typeof opts.codeowners === "string" ? opts.codeowners : undefined,
      noCodeowners: opts.codeowners === false,
      noKeychain: opts.keychain === false,
      commit: opts.commit,
      push: opts.push,
    });
    process.exitCode = exitCode;
  });

program
  .command("uninstall")
  .description("Remove revieweragent from the current repo")
  .option("--yes", "Consent to destructive steps (required with --non-interactive)", false)
  .option("--delete-secret", "Also delete the repo secret", false)
  .option("--delete-local-credentials", "Also delete the local credential cache", false)
  .option("--non-interactive", "Run without prompts; requires --yes", !process.stdin.isTTY)
  .action(async (opts) => {
    const exitCode = await uninstall({
      nonInteractive: opts.nonInteractive,
      yes: opts.yes,
      deleteSecret: opts.deleteSecret,
      deleteLocalCredentials: opts.deleteLocalCredentials,
    });
    process.exitCode = exitCode;
  });

program
  .command("upgrade")
  .description("Refresh pinned action SHAs in the managed workflow without changing provider or auth")
  .action(async () => {
    process.exitCode = await upgrade();
  });

program
  .command("rotate-secret")
  .description("Write a new credential to the matching GitHub Actions secret")
  .option("--yes", "Consent to overwrite the secret (required with --non-interactive)", false)
  .option("--oauth-token <token>", "New Claude Code OAuth token")
  .option("--api-key <key>", "New Anthropic Console API key")
  .option("--cursor-api-key <key>", "New Cursor Dashboard / service-account API key")
  .option("--gemini-api-key <key>", "New Google AI Studio Gemini API key")
  .option("--fallback", "Rotate the fallback credential instead of primary", false)
  .option("--update-cache", "Also update the local credential cache", false)
  .option("--no-keychain", "Force the plaintext 0600 credential file instead of the OS keychain")
  .option("--non-interactive", "Run without prompts; requires --yes", !process.stdin.isTTY)
  .action(async (opts) => {
    process.exitCode = await rotateSecret({
      nonInteractive: opts.nonInteractive,
      yes: opts.yes,
      oauthToken: opts.oauthToken,
      apiKey: opts.apiKey,
      cursorApiKey: opts.cursorApiKey,
      geminiApiKey: opts.geminiApiKey,
      fallback: opts.fallback,
      updateCache: opts.updateCache,
      noKeychain: opts.keychain === false,
    });
  });

program
  .command("apply-protection")
  .description("Add the revieweragent required check via classic branch-protection RMW")
  .option("--yes", "Apply the RMW (required with --non-interactive)", false)
  .option("--non-interactive", "Run without prompts; print-only unless --yes", !process.stdin.isTTY)
  .action(async (opts) => {
    process.exitCode = await applyProtection({
      nonInteractive: opts.nonInteractive,
      yes: opts.yes,
    });
  });

program.parseAsync(["node", "revieweragent", ...argvWithDefaultInitCommand(process.argv.slice(2))]).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
