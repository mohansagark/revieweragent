// SPEC.md §7 / §0: v1 prints only — never creates, appends, or edits
// CODEOWNERS. That file governs review routing for the whole repo and
// this tool does not own it (Constitution Principle II — v1 scope
// discipline; writing it is explicitly deferred).

export function codeownersBlock(user: string): string {
  return [
    "# revieweragent:start",
    `.github/workflows/revieweragent.yml  @${user}`,
    `.revieweragent.yml                   @${user}`,
    `.revieweragent/                      @${user}`,
    "# revieweragent:end",
  ].join("\n");
}

export function printCodeownersRecommendation(user: string): void {
  console.log("\nRecommended CODEOWNERS entry (not written automatically in v1):\n");
  console.log(codeownersBlock(user));
  console.log(
    "\nAdd this to your repo's CODEOWNERS file so changes to revieweragent's managed files require your review.",
  );
}
