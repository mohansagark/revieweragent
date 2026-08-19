import { runReview } from "./cli/review.js";

// Entrypoint bundled into actions/review/dist/index.js by esbuild.action.mjs.
// Deliberately imports only the review orchestrator — never src/cli/index.ts
// — so @clack/prompts and the rest of the interactive installer surface
// never end up in this bundle (SPEC.md §7: self-contained, minimal Action).
runReview()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  });
