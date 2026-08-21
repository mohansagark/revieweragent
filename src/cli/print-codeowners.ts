// SPEC.md §7 / §0: v2 writes the managed CODEOWNERS block. This printer
// remains for v1-style copy when writing is skipped (`--no-codeowners`).

export { codeownersBlock } from "./codeowners.js";
import { codeownersBlock } from "./codeowners.js";

export function printCodeownersRecommendation(user: string): void {
  console.log("\nCODEOWNERS (managed block):\n");
  console.log(codeownersBlock(user));
}
