---

description: "Task list for revieweragent v1 core commands (init/review/uninstall)"

---

# Tasks: revieweragent v1 Core Commands

**Input**: Design documents from `/specs/001-v1-core-commands/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: Not explicitly requested in spec.md as a TDD gate, so no dedicated
per-story test-first subsections. Safety-critical modules (gate evaluator,
sanitizer, error classifier — Constitution Principles III–V) get dedicated
unit-test tasks in Polish, and contracts/quickstart get validation tasks
there too.

**Organization**: Tasks are grouped by user story (spec.md: US1 install P1,
US2 review P1, US3 uninstall P2) so each is independently testable per its
spec.md "Independent Test" note.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to US1/US2/US3

## Path Conventions

Single repo, npm workspaces, per `plan.md`'s Project Structure:
`src/cli/`, `src/core/`, `src/platform/github/`, `src/provider/claude/`,
`actions/review/` (locked path, SPEC §7), `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — no product logic yet

- [ ] T001 Create npm workspace root `package.json` (package name `revieweragent`, `bin.revieweragent -> dist/cli/index.js`, workspaces for the CLI and `actions/review`) plus base `tsconfig.json`
- [ ] T002 [P] Configure vitest (`vitest.config.ts`, `npm test` script) per `research.md`
- [ ] T003 [P] Configure eslint + prettier for TypeScript
- [ ] T004 [P] Configure build scripts: `tsc` for CLI `dist/`, esbuild bundle producing `actions/review/dist/index.js` (single self-contained file, per `research.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared modules two or more user stories depend on. Nothing
story-specific lives here — see `data-model.md` for which entities are
truly cross-story (only `Install`'s config shape is; findings/gate/
sanitizer are US2-only and live in that phase instead).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Define the GitHub Platform port interface (repo identity, secrets ops, review/comment ops, check ops, protection ops signatures — SPEC §2) in `src/platform/types.ts`
- [ ] T006 [P] Implement shared GitHub REST client wrapper (auth via `gh`/`GH_TOKEN` for the CLI, `GITHUB_TOKEN` inside Actions) in `src/platform/github/client.ts`
- [ ] T007 [P] Implement `.revieweragent.yml` schema, parse/validate, managed-header read/write, unknown-key preservation, `version` handling per `contracts/revieweragent-config-schema.md` in `src/core/config-schema.ts`
- [ ] T008 [P] Define the provider registry types (`id`, `displayName`, `authMethods[]` per SPEC §3) in `src/provider/registry.ts`

**Checkpoint**: Foundation ready — US1 and US2 can now proceed (US3 also depends on US1's file-detection logic, built in Phase 3)

---

## Phase 3: User Story 1 - Install automatic PR review into a repo (Priority: P1) 🎯 MVP

**Goal**: `npx revieweragent init` produces a working workflow file, config
file, and repo secret, per FR-001–FR-009.

**Independent Test**: Run `init` against a fresh test repo (quickstart.md
Scenario A) and confirm the three artifacts exist — no PR or `review`
invocation required.

### Implementation for User Story 1

- [ ] T009 [US1] Implement the Claude registry entry (both `subscription-oauth` and `api-key` auth methods, SPEC §3 table) in `src/provider/claude/registry-entry.ts`
- [ ] T010 [P] [US1] Implement local credential cache read/write at `~/.config/revieweragent/credentials.json`, mode `0600` (SPEC §3, §11) in `src/core/credential-cache.ts`
- [ ] T011 [US1] Implement GitHub Actions secrets ops — public-key fetch, libsodium encrypt, PUT, DELETE (SPEC §6, §11) in `src/platform/github/secrets.ts` (depends on T006)
- [ ] T012 [US1] Implement subscription credential acquisition — spawn `claude setup-token` as a subprocess, capture stdout in memory only, no temp file (SPEC §5, §11) in `src/provider/claude/setup-token.ts`
- [ ] T013 [P] [US1] Implement api-key credential handling (masked-paste input contract + validation, no acquisition subprocess) in `src/provider/claude/api-key-credential.ts`
- [ ] T014 [US1] Implement dependency checks — `gh` presence/auth (`gh auth login` if unauthenticated), `claude` CLI presence for subscription installs, confirm-gated install commands (SPEC §6) in `src/cli/dependency-checks.ts`
- [ ] T015 [US1] Implement workflow-file writer: ownership marker, SHA-pinned `actions/checkout` + `owner/repo/actions/review@sha`, locked job name `revieweragent`, refuse-if-unmarked rule (SPEC §7) in `src/cli/write-workflow.ts`
- [ ] T016 [US1] Implement config-file writer using `config-schema.ts`: marker header, confirm-gated overwrite, merge/preserve unknown keys (SPEC §7) in `src/cli/write-config.ts` (depends on T007)
- [ ] T017 [P] [US1] Implement CODEOWNERS recommendation printer — print-only in v1, never writes the file (SPEC §7, Constitution Principle II) in `src/cli/print-codeowners.ts`
- [ ] T018 [P] [US1] Implement branch-protection instructions printer — exact required-check name + settings link, never applies protection itself (SPEC §5 step 8, Constitution Principle II) in `src/cli/print-protection-instructions.ts`
- [ ] T019 [US1] Implement `init`'s non-interactive engine: flag/env parsing, precondition checks, exit-1 machine-readable error on missing input, no prompts (FR-007) in `src/cli/init.ts`
- [ ] T020 [US1] Implement `init`'s interactive flow wrapping the engine with `@clack/prompts` (Agent-or-Model, registry-filtered provider list, mode/severity, confirm-gated dependency fixes, pre-secret disclosures from SPEC §5 step 4) in `src/cli/init.ts` (depends on T019)
- [ ] T021 [US1] Implement opt-in `--commit [--push]` flow: stage only files `init` wrote, refuse if other uncommitted changes exist, fixed commit message (FR-009) in `src/cli/commit-push.ts`
- [ ] T022 [US1] Wire the `init` command into the CLI dispatcher in `src/cli/index.ts`

**Checkpoint**: User Story 1 fully functional and independently testable (quickstart.md Scenario A)

---

## Phase 4: User Story 2 - Get an automatic review on a pull request (Priority: P1)

**Goal**: The bundled Action produces a review comment and, in gate mode, a
correct check-run conclusion for every qualifying PR event, per
FR-010–FR-018.

**Independent Test**: Exercise `review` against simulated GitHub event
payloads (opened/synchronize/draft/fork/issue_comment/retry fixtures) and
confirm review/check-run output matches `contracts/action-interface.md` —
no dependency on `init` having actually run against a real repo.

### Implementation for User Story 2

- [ ] T023 [P] [US2] Implement the findings JSON schema (mirrors `contracts/findings-schema.json`, `additionalProperties: false`, no `verdict` field) in `src/core/findings-schema.ts`
- [ ] T024 [P] [US2] Implement the sanitizer — strip HTML comments, invisible Unicode/ASCII characters, markdown image alt-text, hidden HTML attributes, HTML entities (SPEC §10, Constitution Principle IV) in `src/core/sanitizer.ts`
- [ ] T025 [US2] Implement the deterministic gate evaluator — PASS/BLOCK from `findings` + `block_severity`, explicitly ignores any `verdict` key (SPEC §12, Constitution Principle V) in `src/core/gate-evaluator.ts` (depends on T023)
- [ ] T026 [US2] Implement the fail-closed vs availability-skip error classifier, split by `auth` type per SPEC §9's table (Constitution Principle III) in `src/core/error-classifier.ts`
- [ ] T027 [US2] Implement review idempotency — find existing review by `<!-- revieweragent-commit:<head_sha> -->` marker, `PUT` to update in place, never dismiss, never stack (SPEC §14) in `src/core/idempotency.ts`
- [ ] T028 [US2] Implement GitHub Reviews API ops — `POST`/`PUT` COMMENT review, inline `comments[]` for in-diff findings, summary-only for out-of-hunk findings (SPEC §9, §14) in `src/platform/github/reviews.ts` (depends on T006, T027)
- [ ] T029 [P] [US2] Implement GitHub Checks API ops — create/update the `revieweragent` check run on the correct head SHA, `success`/`failure` only, never `neutral` (SPEC §9) in `src/platform/github/checks.ts` (depends on T006)
- [ ] T030 [P] [US2] Implement the Actions API actor-filtered rate-limit query and per-actor hourly cap enforcement, counting inference-only runs (SPEC §8 step 5) in `src/platform/github/actor-rate-limit.ts` (depends on T006)
- [ ] T031 [US2] Implement PR file-list fetch, `exclude` glob filtering, and diff-size/prompt-token limit calculation with gate-vs-advisory `on_limit` handling (SPEC §8 step 6) in `src/core/diff-limits.ts`
- [ ] T032 [US2] Implement the subscription backend — pinned `claude` CLI, verified argv (`--tools ""`, `--model sonnet`, `--disable-slash-commands`, `--strict-mcp-config`, `--json-schema`, `--system-prompt`), Node `spawn` with `stdin: "ignore"`, never `--bare` (SPEC §8) in `src/provider/claude/subscription.ts` (depends on T023, T024)
- [ ] T033 [US2] Implement the api-key backend — Anthropic Messages API call, schema-constrained output, no tools (SPEC §8) in `src/provider/claude/api-key.ts` (depends on T023, T024)
- [ ] T034 [US2] Implement event-context resolution — PR number/head/base SHA from `pull_request_target` or `issue_comment` payloads; `merge_group` explicitly left unhandled per v1 scope (SPEC §8 step 4, spec.md Assumptions) in `src/cli/review-event-context.ts`
- [ ] T035 [US2] Implement skip/no-op rules — draft PRs, `comment-gated` fork PRs without the trigger phrase, non-PR `issue_comment` noise, commenter write-access checks; no check run emitted for these cases (SPEC §9's skip-vs-no-op table, FR-015) in `src/cli/review-skip-rules.ts`
- [ ] T036 [US2] Implement the review orchestrator wiring SPEC §8 steps 1–7 together (resolve event → skip rules → load base-branch config/instructions → diff/limits → call model backend by `auth` → evaluate gate → post review + check run) plus the Actions-environment guard (exit 1 outside Actions) in `src/cli/review.ts` (depends on T025, T026, T028, T029, T030, T031, T032, T033, T034, T035)
- [ ] T037 [US2] Wire the bundled Action entrypoint — `actions/review/action.yml` plus `actions/review/src/index.ts` calling the orchestrator, matching `contracts/action-interface.md`'s inputs/outputs (SPEC §7) in `actions/review/`

**Checkpoint**: User Story 2 fully functional and independently testable (quickstart.md Scenario B)

---

## Phase 5: User Story 3 - Remove revieweragent from a repo (Priority: P2)

**Goal**: `npx revieweragent uninstall` removes only what it installed and
warns loudly about the one thing it never touches automatically in v1
(branch protection), per FR-019–FR-021.

**Independent Test**: Install into a test repo, then uninstall, and confirm
managed files/secret are gone per marker rules (quickstart.md Scenario C)
— independent of whether any PR was ever reviewed.

### Implementation for User Story 3

- [ ] T038 [P] [US3] Implement managed-file detection reusing the ownership-marker check from `write-workflow.ts`/`write-config.ts` (SPEC §15 step 1–2) in `src/cli/detect-managed-files.ts`
- [ ] T039 [US3] Implement deletion of the workflow file, config file, and `.revieweragent/` — marker-gated refuse rule (SPEC §15 steps 1–2) in `src/cli/delete-managed-files.ts` (depends on T038)
- [ ] T040 [US3] Implement confirm-gated secret deletion, `--delete-secret` flag (SPEC §15 step 3) in `src/cli/delete-secret.ts` (depends on T011)
- [ ] T041 [P] [US3] Implement local-credential-cache deletion, `--delete-local-credentials` flag, untouched by default (SPEC §15 step 5) in `src/cli/delete-local-credentials.ts` (depends on T010)
- [ ] T042 [P] [US3] Implement the loud manual-branch-protection-removal warning printer plus commit/push reminder (SPEC §15 steps 4, 6, Constitution Principle II) in `src/cli/print-uninstall-warning.ts`
- [ ] T043 [US3] Implement `uninstall`'s engine — interactive per-step confirm, `--non-interactive` requires `--yes` or refuses (FR-019) — and wire into the CLI dispatcher in `src/cli/uninstall.ts` (depends on T039, T040, T041, T042)

**Checkpoint**: All three user stories independently functional (quickstart.md Scenarios A, B, C all pass)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification and hardening across all three stories

- [ ] T044 [P] Unit tests for the safety-critical modules — `gate-evaluator.ts`, `sanitizer.ts`, `error-classifier.ts`, `idempotency.ts` (Constitution Principles III–V; SPEC §9/§10/§12/§14 scenarios) in `tests/unit/`
- [ ] T045 [P] Contract tests validating the implementation against `contracts/findings-schema.json`, `contracts/revieweragent-config-schema.md`, and `contracts/action-interface.md` in `tests/contract/`
- [ ] T046 [P] Integration tests using simulated GitHub event fixtures — draft PR, fork PR (auto and comment-gated), non-write commenter, retry/duplicate `synchronize`, over-limit diff (spec.md Edge Cases + Acceptance Scenarios) in `tests/integration/`
- [ ] T047 Run `quickstart.md` Scenarios A, B, C end to end against a disposable real GitHub repo
- [ ] T048 [P] Fill in package metadata for npm publish — `files` whitelist, `bin`, `repository`, `engines.node >=20` in `package.json`
- [ ] T049 Security hardening pass — confirm credentials are never logged, masked on any debug path, and the exactly-one-credential invariant holds end to end across `init`/`review`/`uninstall` (SPEC §11, Constitution Security & Sanitization Requirements)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only — independently
  testable via fixtures even though in a real deployment it runs inside the
  workflow US1 writes
- **User Story 3 (Phase 5)**: Depends on Foundational, and on US1's
  `write-workflow.ts`/`write-config.ts` marker logic (T015/T016) and
  secrets ops (T011) being in place to delete against
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependency on US2/US3
- **US2 (P1)**: No dependency on US1/US3 for its own testability (fixture-driven); shares no files with US1
- **US3 (P2)**: Reuses US1's file-detection and secret-ops modules (T011, T015, T016) — cannot be meaningfully implemented before US1

### Within Each User Story

- Shared/reusable pieces (marked [P]) before the orchestrating task that wires them together
- Each story's final task wires everything into the CLI dispatcher or Action entrypoint
- Story complete and independently testable before moving to the next priority

### Parallel Opportunities

- T002, T003, T004 (Setup) in parallel
- T006, T007, T008 (Foundational) in parallel after T005
- Within US1: T010, T013, T017, T018 in parallel; T009/T011/T012/T014 have light sequencing (credential + secret plumbing) before T015/T016 (file writers) before T019/T020 (engine/UI) before T021/T022
- Within US2: T023, T024 in parallel first; then T029, T030 in parallel with T028; T032/T033 in parallel once T023/T024 land; T036 waits on all of them
- Within US3: T038 first, then T040/T041/T042 in parallel, then T043
- US1 and US2 can be built in parallel by different contributors once Foundational is done
- T044, T045, T046, T048 (Polish) in parallel

---

## Parallel Example: User Story 1

```bash
# After T009/T011/T012 land, these can run together:
Task: "Implement local credential cache read/write in src/core/credential-cache.ts"
Task: "Implement api-key credential handling in src/provider/claude/api-key-credential.ts"
Task: "Implement CODEOWNERS recommendation printer in src/cli/print-codeowners.ts"
Task: "Implement branch-protection instructions printer in src/cli/print-protection-instructions.ts"
```

## Parallel Example: User Story 2

```bash
# First, in parallel:
Task: "Implement the findings JSON schema in src/core/findings-schema.ts"
Task: "Implement the sanitizer in src/core/sanitizer.ts"

# Then, in parallel (each only needs the client wrapper from Foundational):
Task: "Implement GitHub Checks API ops in src/platform/github/checks.ts"
Task: "Implement the Actions API actor rate-limit query in src/platform/github/actor-rate-limit.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (`init` writes a working install)
4. **STOP and VALIDATE**: quickstart.md Scenario A against a disposable repo
5. This alone doesn't answer "are the reviews any good" (that needs US2) but proves the install path

### Incremental Delivery (recommended — matches `SPEC.md` §0's sequencing intent)

1. Setup + Foundational → foundation ready
2. US1 (install) → validate Scenario A
3. US2 (review) → validate Scenario B — **this is the point the product's
   central question ("are the reviews any good?") becomes answerable**
4. US3 (uninstall) → validate Scenario C — closes the "not a one-way door" gap
5. Polish

### Parallel Team Strategy

With two contributors: one takes US1 (Phase 3) while the other takes US2
(Phase 4) once Foundational is done — they share no files. US3 waits for
US1's file-detection/secret-ops pieces to exist.

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] label maps every story-phase task to US1/US2/US3 for traceability back to spec.md
- No task deletes or rewrites another task's file without an explicit depends-on note
- Every task cites its `SPEC.md` section — do not deviate from the cited mechanism without updating `SPEC.md` first (Constitution Principle I)
- Commit after each task or logical group
- Stop at each Checkpoint to validate that story independently before continuing
