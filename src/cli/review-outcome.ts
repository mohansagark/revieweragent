import { checkOutcomeFor, type CheckOutcomeKind } from "../core/error-classifier.js";
import type { Mode } from "../core/config-schema.js";
import type { CheckPort, FindingComment, ReviewPort } from "../platform/types.js";

export async function publishCheckAndReview(opts: {
  checks: CheckPort;
  reviews: ReviewPort;
  prNumber: number;
  headSha: string;
  kind: CheckOutcomeKind;
  mode: Mode;
  summary: string;
  comments?: FindingComment[];
}): Promise<number> {
  const outcome = checkOutcomeFor(opts.kind, opts.mode);
  const title = outcome.titlePrefix ? `${outcome.titlePrefix} ${opts.kind}` : opts.kind;
  console.log(`revieweragent: ${opts.kind} -> ${outcome.conclusion} (exit ${outcome.exitCode})`);

  try {
    const existing = await opts.reviews.findExistingReview(opts.prNumber, opts.headSha);
    if (existing) {
      await opts.reviews.updateReview(existing.id, opts.prNumber, opts.headSha, opts.summary);
    } else {
      await opts.reviews.createReview(opts.prNumber, opts.headSha, opts.summary, opts.comments ?? []);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await opts.checks.upsertCheck(
      opts.headSha,
      "failure",
      "fail-closed-infra",
      `Reviews API failed: ${message}`,
    );
    throw err;
  }

  await opts.checks.upsertCheck(opts.headSha, outcome.conclusion, title, opts.summary);
  return outcome.exitCode;
}
