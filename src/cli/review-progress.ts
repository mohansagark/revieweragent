import type { CheckConclusion } from "../platform/types.js";

export const REVIEW_START_COMMENT = "🔍 **Review starting**";

export function formatReviewCompleteComment(conclusion: CheckConclusion): string {
  if (conclusion === "failure") {
    return "⚠️ **Review completed** — findings posted on the diff.";
  }
  return "✅ **Review completed**";
}
