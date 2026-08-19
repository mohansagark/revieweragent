// SPEC.md §14: identity is pr_number + head_sha. GitHub cannot dismiss a
// COMMENTED review — never call the dismiss endpoint. On retry/duplicate
// synchronize, find the existing review by this marker and PUT an
// updated summary; never create a second review, never dismiss.

export function reviewCommitMarker(headSha: string): string {
  return `<!-- revieweragent-commit:${headSha} -->`;
}

export function bodyWithMarker(summary: string, headSha: string): string {
  return `${summary}\n\n${reviewCommitMarker(headSha)}`;
}

export function findReviewByMarker(
  reviews: { id: number; body: string }[],
  headSha: string,
): { id: number } | undefined {
  const marker = reviewCommitMarker(headSha);
  return reviews.find((r) => r.body.includes(marker));
}
