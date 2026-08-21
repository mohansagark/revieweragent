import type { CheckOutcomeKind } from "../core/error-classifier.js";

export const REVIEW_START_COMMENT = "🔍 **Review starting**";
export const REVIEW_START_MARKER = "<!-- revieweragent-progress:start -->";
export const REVIEW_COMPLETE_MARKER = "<!-- revieweragent-progress:complete -->";

export type ReviewVerdict = "PASS" | "BLOCK" | "SKIPPED" | "FAILED";

const VERDICT_EMOJI: Record<ReviewVerdict, string> = {
  PASS: "✅",
  BLOCK: "⚠️",
  SKIPPED: "ℹ️",
  FAILED: "❌",
};

export function verdictFor(kind: CheckOutcomeKind): ReviewVerdict {
  switch (kind) {
    case "PASS":
      return "PASS";
    case "BLOCK":
      return "BLOCK";
    case "availability-skip":
      return "SKIPPED";
    case "fail-closed-infra":
      return "FAILED";
  }
}

export function summaryWithVerdict(kind: CheckOutcomeKind, summary: string): string {
  return `**Verdict: ${verdictFor(kind)}**\n\n${summary}`;
}

/** Public timeline text — never include raw backend/exception strings. */
export function publicProgressDetails(kind: CheckOutcomeKind, summary?: string): string {
  if (kind === "PASS" || kind === "BLOCK") {
    return summary?.trim() || "";
  }
  if (kind === "availability-skip") {
    return "Review skipped (limit or availability).";
  }
  return "Review could not complete. See the revieweragent check for details.";
}

export function formatReviewStartComment(): string {
  return `${REVIEW_START_COMMENT}\n\n${REVIEW_START_MARKER}`;
}

export function formatReviewCompleteComment(kind: CheckOutcomeKind, summary?: string): string {
  const verdict = verdictFor(kind);
  const details = publicProgressDetails(kind, summary);
  const lines = [
    `${VERDICT_EMOJI[verdict]} **Review completed**`,
    "",
    `**Verdict: ${verdict}**`,
  ];
  if (details) {
    lines.push("", details);
  }
  lines.push("", REVIEW_COMPLETE_MARKER);
  return lines.join("\n");
}
