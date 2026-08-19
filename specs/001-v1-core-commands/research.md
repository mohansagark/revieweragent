# Phase 0 Research: revieweragent v1 Core Commands

No functional mechanism in this feature required new research — `SPEC.md`
already verifies every CLI argv, API endpoint, schema, and error path this
plan depends on against source or GitHub's OpenAPI description (see
`SPEC.md` §8's "Verified CLI behavior" table and §14's OpenAPI-verified
review-update table). This document instead resolves the engineering
choices `SPEC.md` deliberately leaves open (language, package manager,
test framework, build/bundle strategy) since those are implementation
detail, not product mechanism.

## Decision: TypeScript, Node.js ≥20

**Rationale**: `SPEC.md` §6 already fixes Node.js + npm as a hard
prerequisite for the installer, and GitHub-hosted Actions runners ship
Node 20. TypeScript buys type safety exactly where this project needs it
most: the findings schema (§12), the `.revieweragent.yml` config shape
(§7), and GitHub REST API response shapes — all places where a silent
`any` would undermine Principle V (code decides the verdict, not the
model) by letting a malformed shape slip through undetected.

**Alternatives considered**: Plain JS — rejected, no compile-time
guarantee that a schema change in one module is reflected everywhere it's
consumed, which matters more here than in a typical CLI because the
schema also gates merges. Deno/Bun — rejected, GitHub Actions' JS action
runtime targets Node, and `SPEC.md` §6 already commits to Node.

## Decision: npm (not pnpm/yarn), npm workspaces for the two publishable
artifacts

**Rationale**: `SPEC.md` §6 lists Node.js + npm as the hard prerequisite
end users already need for `npx revieweragent`. Introducing a second
package manager for development would add a dependency the spec never
requires end users to have. npm workspaces let the CLI package and the
bundled Action share the core library code (schema, gate evaluator,
sanitizer, platform port, provider registry) without publishing that
shared code as its own npm package.

**Alternatives considered**: pnpm — faster, stricter, but an extra tool
for contributors with no requirement in `SPEC.md` justifying it. A single
flat package with no workspaces — rejected because the Action's bundled
`dist/index.js` (see below) must not include devDependencies or the
`@clack/prompts` interactive-UI stack the Action never uses; splitting
into workspaces keeps that boundary enforced by the dependency graph,
not by discipline.

## Decision: vitest for tests

**Rationale**: TypeScript-native (no separate ts-jest transform step),
fast, and has first-class fetch/HTTP mocking (`msw` pairs cleanly with
it) needed to test GitHub REST API and Anthropic Messages API
interactions without live network calls — required for FR-010 through
FR-018's error-classification paths (429 vs 401 vs 400, §9's fail-closed
vs availability-skip table) to be exercised deterministically in CI.

**Alternatives considered**: Jest — heavier config for ESM + TypeScript
in 2026, no material advantage here. Node's built-in `node:test` —
viable and zero-dependency, but weaker snapshot/mocking ergonomics for
the GitHub-event-fixture-driven integration tests this feature needs
(simulating `pull_request_target`, `issue_comment`, draft, and fork
payloads).

## Decision: esbuild to bundle the Action entrypoint; CLI ships unbundled

**Rationale**: `SPEC.md` §7 locks the Action's location at
`actions/review` in the public repo, referenced by exact commit SHA —
GitHub does not run `npm install` for a JS action at that path, so
`actions/review/dist/index.js` must be a single self-contained bundle
committed to the repo (this is a structural requirement of the
distribution model in §1/§7, not a preference). The CLI (`npx
revieweragent`) runs through normal npm install/resolution, so it does
not need bundling — publishing the compiled `dist/` from
`tsc` is sufficient there.

**Alternatives considered**: `@vercel/ncc` — the tool GitHub's own docs
recommend for JS actions; genuinely comparable to esbuild here. Chose
esbuild for one bundler across both the Action and any future dev
tooling rather than introducing a second bundler exclusively for one
target.

## Decision: single repository, two workspace packages, Action files at
the spec-locked path

See Project Structure in `plan.md`. This is not a free choice — `SPEC.md`
§7 requires `uses: <owner>/<repo>/actions/review@<sha>` to resolve inside
*this* public repo, so `actions/review/action.yml` must exist at that
literal path regardless of internal package layout.

## Non-decisions (deliberately deferred to `/speckit-tasks` /
implementation, not blocking this plan)

- Exact CLI argument-parsing library (e.g. `citty` vs `commander`) under
  `@clack/prompts` — either satisfies FR-007's non-interactive-mode
  requirement; left to implementation since `SPEC.md` doesn't mandate one.
- Exact YAML parser/serializer for `.revieweragent.yml` round-tripping
  (needed for §7's "preserve unknown keys / comments when possible")
  — a library-selection detail, not a product mechanism.
