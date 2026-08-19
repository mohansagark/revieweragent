# Implementation Plan: revieweragent v1 Core Commands

**Branch**: `001-v1-core-commands` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-v1-core-commands/spec.md`

## Summary

Ship the three v1 commands (`init`, `review`, `uninstall`) that make up
revieweragent's product per `SPEC.md` §0: an npm-installed CLI that wires
automatic AI pull-request review into a GitHub repo, backed by a
separately-published, SHA-pinned public GitHub Action that runs the actual
review inside CI. `init` and `uninstall` are the local installer surface;
`review` runs only inside the bundled Action. All three share one
in-repo core library (config/findings schemas, deterministic gate
evaluator, prompt-injection sanitizer, GitHub platform port, Claude
provider with two auth backends) so the gate logic that decides pass/fail
is identical whether exercised via install-time validation or at review
time. Every mechanism below is cited to the `SPEC.md` section that
verified it — this plan does not re-derive alternatives to already-locked
decisions.

## Technical Context

**Language/Version**: TypeScript, compiled for Node.js ≥20 (matches
GitHub-hosted Actions runners; Node+npm is `SPEC.md` §6's hard
prerequisite). See `research.md`.

**Primary Dependencies**: `@clack/prompts` (interactive CLI UI, SPEC §5);
a CLI argument-parsing library (implementation detail, not spec-mandated
— see `research.md` "Non-decisions"); a YAML parser/serializer supporting
comment-preserving round-trip (for `.revieweragent.yml` rewrite rules,
SPEC §7); `@octokit/rest` or equivalent for GitHub REST calls (secrets
encrypt+PUT, Reviews API, Checks API, Actions API actor-filtered runs —
SPEC §6, §8, §9, §14); Anthropic Messages API client for the `api-key`
backend (SPEC §8); no SDK dependency for the `subscription` backend — it
shells out to the pinned `claude` CLI directly (SPEC §8's verified argv).

**Storage**: No database. Two persisted surfaces only: the target repo's
files (`.github/workflows/revieweragent.yml`, `.revieweragent.yml`,
`.revieweragent/instructions.md`) and an optional local credential cache
at `~/.config/revieweragent/credentials.json` (mode `0600`, SPEC §3/§11).
GitHub Actions secrets are the CI-side credential store (encrypt-with-repo-
public-key + PUT, SPEC §6).

**Testing**: vitest. See `research.md` for rationale (TS-native, strong
HTTP-mocking story for GitHub/Anthropic API interactions).

**Target Platform**: Two runtime targets — (1) any OS running Node ≥20 for
the CLI (`init`/`uninstall`, run locally by an operator), and (2)
GitHub-hosted (or self-hosted) Actions Linux runners for the bundled
`review` entrypoint (SPEC §8: "Runs only in GitHub Actions").

**Project Type**: CLI tool + companion GitHub Action, single repository
(monorepo via npm workspaces). Not a web service — no server process.

**Performance Goals**: Not throughput-bound. Review latency is dominated
by the model call; no numeric target is set in `SPEC.md` or the feature
spec beyond SC-001's "install to working review in under 10 minutes"
(human setup time, not a system throughput figure).

**Constraints**: Model calls use **no tools** (SPEC §8, §10 — structural
prompt-injection control); the review runtime must never checkout PR head
or execute PR-supplied code (SPEC §9); exactly one credential type active
in the job env at a time (SPEC §7, §8 verified behavior); diff/token caps
enforced before the model call (`max_diff_lines`, `max_prompt_tokens`,
FR-018); the Action bundle must be self-contained (no `npm install` step
available at that path — SPEC §7, `research.md`).

**Scale/Scope**: Single active provider, single active platform (GitHub)
per install in v1 (SPEC §2, §3). Fork-PR abuse bounded by
`max_fork_reviews_per_actor_per_hour` (default 5, FR-016). No stated
concurrent-repo or request-volume target — scope is "works correctly per
repo," not a load target.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Spec Is the Source of Truth | Every Technical Context and contract entry above cites a `SPEC.md` section; no invented mechanism | PASS |
| II. v1 Scope Discipline | Plan covers only `init`/`review`/`uninstall`; `upgrade`, `rotate-secret`, `apply-protection`, `merge_group`, keychain, auto-CODEOWNERS explicitly out (data-model.md, quickstart.md, contracts/action-interface.md's "Non-goals") | PASS |
| III. Fail-Closed / Availability-Skip | `data-model.md`'s Review entity and `contracts/action-interface.md`'s conclusion table encode the exact SPEC §9 classification; no new error path invents its own rule | PASS |
| IV. Untrusted Input Is Never Instruction | `contracts/findings-schema.json` locks the model to findings-only output (`additionalProperties: false`); sanitizer + delimiter + no-tools + base-branch-config are structural per SPEC §10, not left as plan-time discretion | PASS |
| V. Code Decides, Model Only Reports | Findings schema contract has no `verdict` field; `data-model.md`'s Finding entity states any `verdict` is ignored even if emitted (FR-013) | PASS |
| VI. Decoupled, Verified Dependencies | No dependency on `anthropics/claude-code-action`; `research.md` cites `SPEC.md`'s own verification table rather than re-deriving; new tooling choices (vitest, esbuild) are plan-level engineering choices, not unverified product claims | PASS |

No violations. Complexity Tracking section below is empty — the
two-workspace-package layout is a `SPEC.md` §7 requirement (locked
`actions/review` path), not a discretionary complexity addition.

*Post-Phase-1 re-check*: `data-model.md`, `contracts/*`, and
`quickstart.md` were all written directly from cited `SPEC.md` sections
with no new mechanism introduced beyond engineering-detail decisions in
`research.md`. Gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-v1-core-commands/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
│   ├── cli-commands.md
│   ├── findings-schema.json
│   ├── revieweragent-config-schema.md
│   └── action-interface.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
revieweragent/                       # repo root — npm package "revieweragent" (the CLI)
├── package.json                     # npm workspaces root; bin: revieweragent -> dist/cli/index.js
├── src/
│   ├── cli/
│   │   ├── init.ts                  # SPEC §5 setup flow + §4 non-interactive engine
│   │   ├── uninstall.ts             # SPEC §15
│   │   └── index.ts                 # command dispatch (@clack/prompts wrapper over the engine)
│   ├── core/
│   │   ├── config-schema.ts         # .revieweragent.yml shape + read/write rules (SPEC §7)
│   │   ├── findings-schema.ts       # SPEC §12 — mirrors contracts/findings-schema.json
│   │   ├── gate-evaluator.ts        # deterministic PASS/BLOCK from findings + block_severity (SPEC §12, Principle V)
│   │   ├── sanitizer.ts             # untrusted-text stripping (SPEC §10, Principle IV)
│   │   ├── error-classifier.ts      # fail-closed vs availability-skip (SPEC §9, Principle III)
│   │   └── idempotency.ts           # find-existing-review-by-marker, update-not-duplicate (SPEC §14)
│   ├── platform/
│   │   └── github/                  # the v1 Platform port implementation (SPEC §2)
│   │       ├── secrets.ts           # public-key encrypt + PUT (SPEC §6)
│   │       ├── reviews.ts           # Reviews API POST/PUT (SPEC §9, §14)
│   │       ├── checks.ts            # Checks API create/update (SPEC §9)
│   │       └── actor-rate-limit.ts  # Actions API actor-filtered runs query (SPEC §8 step 5)
│   └── provider/
│       └── claude/                  # the v1 provider registry entry (SPEC §3)
│           ├── subscription.ts      # spawns pinned `claude` CLI, verified argv (SPEC §8)
│           └── api-key.ts           # Anthropic Messages API call (SPEC §8)
├── actions/
│   └── review/                      # LOCKED PATH — SPEC §7 uses: owner/repo/actions/review@sha
│       ├── action.yml
│       └── dist/index.js            # esbuild-bundled entrypoint calling src/cli's review logic (built, committed)
├── tests/
│   ├── unit/                        # core/* logic in isolation
│   ├── contract/                    # validates contracts/*.md and findings-schema.json against implementation
│   └── integration/                 # simulated GitHub event fixtures (draft, fork, issue_comment, retry)
└── specs/
    └── 001-v1-core-commands/        # this feature's spec-kit artifacts
```

**Structure Decision**: Single repository, npm workspaces splitting the
CLI package (`src/cli`, `src/core`, `src/platform`, `src/provider` — full
dependency tree including `@clack/prompts`) from the Action's bundled
entrypoint (`actions/review/dist/index.js` — a minimal esbuild bundle of
only what `review` needs, sharing `src/core`/`src/platform`/`src/provider`
as source, not as a published dependency). The `actions/review` path
itself is not a structural choice — it is required verbatim by `SPEC.md`
§7 for the `uses: owner/repo/actions/review@sha` reference every
customer workflow pins.

## Complexity Tracking

*No entries — no Constitution Check violations.*
