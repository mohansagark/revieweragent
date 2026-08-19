import { build } from "esbuild";

// SPEC.md §7: the Action at actions/review is fetched by exact commit SHA
// with no npm-install step, so its entrypoint must be a single
// self-contained bundle. Only src/action-entry.ts and what it imports
// (the review orchestrator, never the interactive CLI/@clack/prompts
// surface) end up in this bundle.
await build({
  entryPoints: ["src/action-entry.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "actions/review/dist/index.js",
  banner: {
    js: "// Managed by revieweragent build (esbuild.action.mjs). Do not hand-edit — regenerate with `npm run build:action`.",
  },
});

console.log("Built actions/review/dist/index.js");
