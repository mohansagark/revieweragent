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
    // Real bug hit in manual testing: esbuild's ESM output leaves a
    // require() call from a bundled CJS dependency (the `yaml` package's
    // own runtime feature-detection) as a synthetic shim that throws
    // "Dynamic require of ... is not supported" the moment it's called —
    // esbuild does not polyfill a working require() for Node ESM targets
    // by default. Injecting a real one via node:module's createRequire is
    // the standard fix: the module being required ("process") is a real
    // Node builtin and resolves fine once require() actually works.
    js: [
      "// Managed by revieweragent build (esbuild.action.mjs). Do not hand-edit — regenerate with `npm run build:action`.",
      "import { createRequire as __revieweragentCreateRequire } from 'node:module';",
      "const require = __revieweragentCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});

console.log("Built actions/review/dist/index.js");
