import type { CheckOutcomeKind } from "../core/error-classifier.js";

export const REVIEW_START_COMMENT = "🔍 **Review starting**";

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

export function formatReviewCompleteComment(kind: CheckOutcomeKind, summary?: string): string {
  const verdict = verdictFor(kind);
  const lines = [
    `${VERDICT_EMOJI[verdict]} **Review completed**`,
    "",
    `**Verdict: ${verdict}**`,
  ];
  if (summary?.trim()) {
    lines.push("", summary.trim());
  }
  return lines.join("\n");
}
