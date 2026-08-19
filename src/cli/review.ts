import { existsSync, readFileSync } from "node:fs";
import { createGitHubClient } from "../platform/github/client.js";
import { createGitHubReviewPort } from "../platform/github/reviews.js";
import { createGitHubCheckPort } from "../platform/github/checks.js";
import { isUnderActorCap } from "../platform/github/actor-rate-limit.js";
import {
  parseConfig,
  InvalidConfigYamlError,
  UnrecognizedConfigVersionError,
  InvalidConfigError,
} from "../core/config-schema.js";
import { resolveEventContext, UnsupportedEventError } from "./review-event-context.js";
import { decideSkip } from "./review-skip-rules.js";
import { fetchPrFiles, checkLimits, decideLimitOutcome, filterExcluded } from "../core/diff-limits.js";
import { wrapUntrustedData } from "../core/sanitizer.js";
import { buildInstructionsPreamble } from "../core/system-prompt.js";
import { parseFindings, InvalidFindingsError } from "../core/findings-schema.js";
import { evaluateGate } from "../core/gate-evaluator.js";
import { classifyError } from "../core/error-classifier.js";
import { commentsInDiff, formatFilePatches } from "../core/review-payload.js";
import { publishCheckAndReview } from "./review-outcome.js";
import { callSubscriptionBackend, ModelBackendError } from "../provider/claude/subscription.js";
import { callApiKeyBackend } from "../provider/claude/api-key.js";

const CONFIG_PATH = ".revieweragent.yml";
const INSTRUCTIONS_PATH = ".revieweragent/instructions.md";

// SPEC.md §8: "Runs only in GitHub Actions. Local invocation without
// Actions env exits 1."
export async function runReview(): Promise<number> {
  if (process.env.GITHUB_ACTIONS !== "true") {
    console.error("revieweragent review only runs inside GitHub Actions.");
    return 1;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    console.error("GITHUB_REPOSITORY is not set.");
    return 1;
  }
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error(`Malformed GITHUB_REPOSITORY: ${repository}`);
    return 1;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN is not set in the job env.");
    return 1;
  }
  const octokit = createGitHubClient(token);
  const checks = createGitHubCheckPort(octokit, owner, repo);
  const reviews = createGitHubReviewPort(octokit, owner, repo);

  let ctx;
  try {
    ctx = await resolveEventContext(octokit, owner, repo);
  } catch (err) {
    if (err instanceof UnsupportedEventError) {
      console.log(`No-op: ${err.message}`);
      return 0;
    }
    throw err;
  }

  const publish = (
    kind: Parameters<typeof publishCheckAndReview>[0]["kind"],
    mode: Parameters<typeof publishCheckAndReview>[0]["mode"],
    summary: string,
    comments?: Parameters<typeof publishCheckAndReview>[0]["comments"],
  ) =>
    publishCheckAndReview({
      checks,
      reviews,
      prNumber: ctx.prNumber,
      headSha: ctx.headSha,
      kind,
      mode,
      summary,
      comments,
    });

  if (!existsSync(CONFIG_PATH)) {
    console.error(`${CONFIG_PATH} not found on the base branch.`);
    return await publish("fail-closed-infra", "gate", `${CONFIG_PATH} not found on the base branch.`);
  }
  let config;
  try {
    config = parseConfig(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    if (
      err instanceof InvalidConfigYamlError ||
      err instanceof UnrecognizedConfigVersionError ||
      err instanceof InvalidConfigError
    ) {
      return await publish("fail-closed-infra", "gate", err.message);
    }
    throw err;
  }

  const instructions = existsSync(INSTRUCTIONS_PATH) ? readFileSync(INSTRUCTIONS_PATH, "utf8") : undefined;

  const skipDecision = await decideSkip(octokit, owner, repo, ctx, config);
  if (skipDecision.skip) {
    console.log(`No-op: ${skipDecision.reason}`);
    return 0;
  }

  if (ctx.eventName === "pull_request_target" && ctx.isFork && config.fork_policy === "auto") {
    const underCap = await isUnderActorCap(
      octokit,
      owner,
      repo,
      ctx.prAuthorLogin,
      config.max_fork_reviews_per_actor_per_hour,
    );
    if (!underCap) {
      console.log(`No-op: ${ctx.prAuthorLogin} exceeded the per-actor hourly fork-review cap.`);
      return 0;
    }
  }

  const files = await fetchPrFiles(octokit, owner, repo, ctx.prNumber);
  const included = filterExcluded(files, config.exclude);
  const { overLimit } = checkLimits(config, files);
  const limitOutcome = decideLimitOutcome(config, overLimit);

  if (limitOutcome.kind === "gate-block" || limitOutcome.kind === "advisory-block") {
    return await publish("fail-closed-infra", config.mode, "Diff too large — skipped review.");
  }
  if (limitOutcome.kind === "advisory-skip") {
    return await publish("availability-skip", config.mode, "Diff too large — skipped review.");
  }

  const systemPrompt = buildInstructionsPreamble(instructions);
  const userPayload = wrapUntrustedData({
    title: ctx.title,
    body: ctx.body,
    diff: formatFilePatches(included),
  });

  // SPEC.md §7/§8 verified behavior: if both credentials are ever present,
  // the Claude CLI prefers ANTHROPIC_API_KEY and silently bills that key
  // instead of the subscription — "exactly one credential" is load-bearing,
  // not hygiene. The generated workflow only ever sets one (contract-
  // tested), but a misconfigured job env (e.g. an org-level secret
  // collision) must not be allowed to silently mix billing.
  if (config.auth === "subscription" && process.env.ANTHROPIC_API_KEY) {
    return await publish(
      "fail-closed-infra",
      config.mode,
      "ANTHROPIC_API_KEY is set alongside auth: subscription — refusing to mix credentials.",
    );
  }

  let rawOutput: string;
  try {
    rawOutput =
      config.auth === "subscription"
        ? await callSubscriptionBackend(systemPrompt, userPayload)
        : await callApiKeyBackend(systemPrompt, userPayload);
  } catch (err) {
    if (err instanceof ModelBackendError) {
      const errClass = classifyError(err.classifiable);
      return await publish(
        errClass === "fail-closed" ? "fail-closed-infra" : "availability-skip",
        config.mode,
        err.message,
      );
    }
    throw err;
  }

  let findings;
  try {
    findings = parseFindings(rawOutput);
  } catch (err) {
    if (err instanceof InvalidFindingsError) {
      return await publish("fail-closed-infra", config.mode, err.message);
    }
    throw err;
  }

  const gateResult = evaluateGate(findings.findings, config.block_severity);
  const inlineComments = commentsInDiff(
    included,
    findings.findings
      .filter((f): f is typeof f & { line: number } => f.line !== null)
      .map((f) => ({ path: f.file, line: f.line, severity: f.severity, message: f.message })),
  );

  return await publish(gateResult, config.mode, findings.summary, inlineComments);
}
