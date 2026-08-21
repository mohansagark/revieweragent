import { existsSync, readFileSync } from "node:fs";
import { createGitHubClient } from "../platform/github/client.js";
import { createGitHubReviewPort } from "../platform/github/reviews.js";
import { createGitHubCheckPort } from "../platform/github/checks.js";
import { createGitHubCommentPort, postProgressComment } from "../platform/github/comments.js";
import { isUnderActorCap } from "../platform/github/actor-rate-limit.js";
import {
  parseConfig,
  InvalidConfigYamlError,
  UnrecognizedConfigVersionError,
  InvalidConfigError,
} from "../core/config-schema.js";
import { resolveEventContext, UnsupportedEventError } from "./review-event-context.js";
import { decideSkip } from "./review-skip-rules.js";
import {
  fetchPrFiles,
  fetchCompareFiles,
  checkLimits,
  decideLimitOutcome,
  filterExcluded,
  CompareTruncatedError,
} from "../core/diff-limits.js";
import { wrapUntrustedData } from "../core/sanitizer.js";
import { buildInstructionsPreamble } from "../core/system-prompt.js";
import { parseFindings, InvalidFindingsError } from "../core/findings-schema.js";
import { evaluateGate } from "../core/gate-evaluator.js";
import { classifyError } from "../core/error-classifier.js";
import { commentsInDiff, formatFilePatches } from "../core/review-payload.js";
import { publishCheckAndReview } from "./review-outcome.js";
import {
  REVIEW_START_MARKER,
  REVIEW_COMPLETE_MARKER,
  formatReviewStartComment,
  formatReviewCompleteComment,
  summaryWithVerdict,
} from "./review-progress.js";
import { callSubscriptionBackend, ModelBackendError } from "../provider/claude/subscription.js";
import { callApiKeyBackend } from "../provider/claude/api-key.js";
import { callCursorBackend } from "../provider/cursor/backend.js";
import { JOB_NAME } from "./write-workflow.js";
import { shouldReuseMergeGroupCheck } from "./merge-group-reuse.js";

const CONFIG_PATH = ".revieweragent.yml";
const INSTRUCTIONS_PATH = ".revieweragent/instructions.md";

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
  const comments = createGitHubCommentPort(octokit, owner, repo);

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
    reviewComments?: Parameters<typeof publishCheckAndReview>[0]["comments"],
  ) =>
    publishCheckAndReview({
      checks,
      reviews,
      prNumber: ctx.prNumber,
      headSha: ctx.headSha,
      kind,
      mode,
      summary,
      comments: reviewComments,
    });

  const maybeProgress = async (pr: number | undefined, marker: string, body: string) => {
    if (pr === undefined) return;
    await postProgressComment(comments, pr, marker, body);
  };

  const publishWithProgress = async (
    kind: Parameters<typeof publishCheckAndReview>[0]["kind"],
    mode: Parameters<typeof publishCheckAndReview>[0]["mode"],
    summary: string,
    reviewComments?: Parameters<typeof publishCheckAndReview>[0]["comments"],
  ): Promise<number> => {
    await maybeProgress(ctx.prNumber, REVIEW_START_MARKER, formatReviewStartComment());
    try {
      const code = await publish(kind, mode, summaryWithVerdict(kind, summary), reviewComments);
      await maybeProgress(ctx.prNumber, REVIEW_COMPLETE_MARKER, formatReviewCompleteComment(kind, summary));
      return code;
    } catch (err) {
      await maybeProgress(ctx.prNumber, REVIEW_COMPLETE_MARKER, formatReviewCompleteComment("fail-closed-infra"));
      throw err;
    }
  };

  if (!existsSync(CONFIG_PATH)) {
    console.error(`${CONFIG_PATH} not found on the base branch.`);
    return await publishWithProgress("fail-closed-infra", "gate", `${CONFIG_PATH} not found on the base branch.`);
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
      return await publishWithProgress("fail-closed-infra", "gate", err.message);
    }
    throw err;
  }

  const instructions = existsSync(INSTRUCTIONS_PATH) ? readFileSync(INSTRUCTIONS_PATH, "utf8") : undefined;

  const skipDecision = await decideSkip(octokit, owner, repo, ctx, config);
  if (skipDecision.skip) {
    console.log(`No-op: ${skipDecision.reason}`);
    return 0;
  }

  if (ctx.eventName === "merge_group" && ctx.prNumber !== undefined) {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: ctx.prNumber });
    const { data: listed } = await octokit.checks.listForRef({
      owner,
      repo,
      ref: pr.head.sha,
      check_name: JOB_NAME,
    });
    const existing = listed.check_runs[0];
    if (
      shouldReuseMergeGroupCheck({
        checkConclusion: existing?.conclusion ?? undefined,
        checkTitle: existing?.output?.title ?? undefined,
        mergeGroupBaseSha: ctx.baseSha,
        pullBaseSha: pr.base.sha,
      })
    ) {
      await checks.upsertCheck(
        ctx.headSha,
        "success",
        "PASS",
        `Reused PR #${ctx.prNumber} review at ${pr.head.sha}.`,
      );
      return 0;
    }
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

  let files;
  try {
    files =
      ctx.eventName === "merge_group" || ctx.prNumber === undefined
        ? await fetchCompareFiles(octokit, owner, repo, ctx.baseSha, ctx.headSha)
        : await fetchPrFiles(octokit, owner, repo, ctx.prNumber);
  } catch (err) {
    if (!(err instanceof CompareTruncatedError)) throw err;
    const truncatedOutcome = decideLimitOutcome(config, true);
    if (truncatedOutcome.kind === "advisory-skip") {
      return await publishWithProgress("availability-skip", config.mode, "Diff too large — skipped review.");
    }
    return await publishWithProgress("fail-closed-infra", config.mode, "Diff too large — skipped review.");
  }
  const included = filterExcluded(files, config.exclude);
  const { overLimit } = checkLimits(config, files);
  const limitOutcome = decideLimitOutcome(config, overLimit);

  if (limitOutcome.kind === "gate-block" || limitOutcome.kind === "advisory-block") {
    return await publishWithProgress("fail-closed-infra", config.mode, "Diff too large — skipped review.");
  }
  if (limitOutcome.kind === "advisory-skip") {
    return await publishWithProgress("availability-skip", config.mode, "Diff too large — skipped review.");
  }

  const systemPrompt = buildInstructionsPreamble(instructions);
  const userPayload = wrapUntrustedData({
    title: ctx.title,
    body: ctx.body,
    diff: formatFilePatches(included),
  });

  if (config.provider === "claude" && config.auth === "subscription" && process.env.ANTHROPIC_API_KEY) {
    return await publishWithProgress(
      "fail-closed-infra",
      config.mode,
      "ANTHROPIC_API_KEY is set alongside auth: subscription — refusing to mix credentials.",
    );
  }

  let rawOutput: string;
  try {
    if (config.provider === "cursor") {
      rawOutput = await callCursorBackend(systemPrompt, userPayload);
    } else if (config.auth === "subscription") {
      rawOutput = await callSubscriptionBackend(systemPrompt, userPayload);
    } else {
      rawOutput = await callApiKeyBackend(systemPrompt, userPayload);
    }
  } catch (err) {
    if (err instanceof ModelBackendError) {
      const errClass = classifyError(err.classifiable);
      return await publishWithProgress(
        errClass === "fail-closed" ? "fail-closed-infra" : "availability-skip",
        config.mode,
        err.message,
      );
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "E2BIG") {
      return await publishWithProgress(
        "fail-closed-infra",
        config.mode,
        "Prompt exceeded the OS argument size limit.",
      );
    }
    throw err;
  }

  let findings;
  try {
    findings = parseFindings(rawOutput);
  } catch (err) {
    if (err instanceof InvalidFindingsError) {
      return await publishWithProgress("fail-closed-infra", config.mode, err.message);
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

  return await publishWithProgress(gateResult, config.mode, findings.summary, inlineComments);
}
