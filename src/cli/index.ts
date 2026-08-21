#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./init.js";
import { uninstall } from "./uninstall.js";
import { argvWithDefaultInitCommand } from "./default-command.js";

// SPEC.md §4: the prompt UI is a layer over a non-interactive engine.
// Every command works with flags + env when --non-interactive is set or
// stdin is not a TTY.

const program = new Command();
program.name("revieweragent").description("Wire automatic AI PR review into a git repo.");

program
  .command("init")
  .description("Install into the current repo")
  .option("--provider <provider>", "AI provider (v1: claude)", "claude")
  .option("--auth <auth>", "subscription | api-key")
  .option("--mode <mode>", "advisory | gate", "advisory")
  .option("--severity <severity>", "block severity threshold for gate mode", "high")
  .option("--oauth-token <token>", "Claude Code OAuth token (subscription auth)")
  .option("--api-key <key>", "Anthropic Console API key (api-key auth)")
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

program.parseAsync(["node", "revieweragent", ...argvWithDefaultInitCommand(process.argv.slice(2))]).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
