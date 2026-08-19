# Phase 1 Data Model: revieweragent v1 Core Commands

Entities from the feature spec's Key Entities section, expanded with
fields and validation rules sourced from `SPEC.md` §7, §11, §12, §14.

## Install

Represents the state of revieweragent inside one repository. Not a single
persisted record — it is the composite of three artifacts (workflow file,
config file, repo secret), each independently detectable, per FR-001–FR-006.

| Field | Type | Source | Notes |
|---|---|---|---|
| `provider` | `"claude"` (v1 only value) | `.revieweragent.yml` | Registry-driven; only one live row in v1 (SPEC §3) |
| `auth` | `"subscription" \| "api-key"` | `.revieweragent.yml` | Exactly one active per repo (FR-002) |
| `mode` | `"advisory" \| "gate"` | `.revieweragent.yml` | FR-003 |
| `block_severity` | `"any" \| "critical" \| "high" \| "medium" \| "low"` | `.revieweragent.yml` | Gate-mode threshold; default `high` (SPEC §5 step 5) |
| `max_diff_lines` | integer | `.revieweragent.yml` | FR-018 |
| `max_prompt_tokens` | integer | `.revieweragent.yml` | FR-018 |
| `on_limit` | `"skip" \| "block"` | `.revieweragent.yml` | Advisory only; gate always blocks (FR-014) |
| `fork_policy` | `"auto" \| "comment-gated"` | `.revieweragent.yml` | Default `auto` (SPEC §9) |
| `max_fork_reviews_per_actor_per_hour` | integer | `.revieweragent.yml` | Default 5 (FR-016) |
| `exclude` | string[] (glob patterns) | `.revieweragent.yml` | FR-018 |
| `version` | integer, currently `1` | `.revieweragent.yml` | Required; unknown → fail job (SPEC §7) |
| secret name | `REVIEWERAGENT_ANTHROPIC_API_KEY` \| `REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN` | GitHub Actions repo secret | Exactly one exists at a time (FR-004) |
| workflow ownership marker | comment block | `.github/workflows/revieweragent.yml` | Presence gates overwrite-vs-refuse (FR-006) |
| config ownership marker | comment block | `.revieweragent.yml` | Same rule as workflow |

**Validation rules**:
- `auth` and the live secret name must always correspond 1:1 — never both
  secrets present at once (FR-004).
- `version` must be present and recognized; unrecognized → fail-closed in
  gate mode, error review in advisory (SPEC §7).
- Unknown top-level keys are preserved on rewrite, not stripped (SPEC §7).

**State transitions**: `install` → (re-run `init`) → `install` (overwritten
under marker + confirm rules) → (`uninstall`) → absent, with the
"branch protection still configured" state possibly outliving the install
(flagged at uninstall, FR-020).

## Review

The output of processing one pull-request head commit (FR-010, FR-017).

| Field | Type | Source | Notes |
|---|---|---|---|
| `pr_number` | integer | event payload | Part of idempotency key (SPEC §14) |
| `head_sha` | string | event payload | Part of idempotency key |
| `summary` | string | model output → posted review body | Includes `<!-- revieweragent-commit:<head_sha> -->` marker (SPEC §14) |
| `findings` | Finding[] | model output | See Finding entity below |
| `check_conclusion` | `"success" \| "failure" \| null` | computed | `null` = no check emitted (draft/no-op cases, FR-015/FR-016); never `"neutral"` (SPEC §9) |
| `check_reason` | enum | computed | One of: PASS, BLOCK, availability-skip, fail-closed-infra — drives conclusion + message prefix (SPEC §9 table) |
| `review_id` (platform) | string/int | GitHub Reviews API | Looked up by commit marker before deciding create-vs-update (FR-017) |

**Validation rules**:
- Given the same `(pr_number, head_sha)`, at most one visible Review object
  exists — re-processing updates it in place (FR-017, SC-005).
- `check_conclusion` is `"failure"` only for: BLOCK findings, over-limit in
  gate mode, or fail-closed-infra reasons. It is `"success"` for PASS and
  for availability-skip (with `Review skipped:` prefix). It is entirely
  absent (no check row) for draft/no-op cases (SPEC §9's three-way table).

## Finding

A single reported issue from the AI backend (SPEC §12).

| Field | Type | Notes |
|---|---|---|
| `severity` | `"critical" \| "high" \| "medium" \| "low" \| "note"` | Enum, rank order fixed |
| `file` | string | Repo-relative path |
| `line` | integer ≥ 1, or `null` | `null` = cross-file note, summary-only rendering |
| `message` | non-empty string | |

**Validation rules**:
- No `verdict` field is ever honored, even if the model emits one — the
  gate evaluator ignores it entirely (FR-013, SPEC §12).
- A finding is rendered as an inline PR comment only if it has both `file`
  and `line`, and that `line` falls within the PR's diff hunks; otherwise
  it appears in the summary text only (SPEC §9 "Review object vs gate").
- Additional/unknown properties on a finding cause schema validation to
  reject the whole model response (treated as invalid-JSON infra failure,
  fail-closed per FR-014).

## Credential

Either a subscription-style token or an API key (SPEC §3, §11).

| Field | Type | Notes |
|---|---|---|
| `type` | `"subscription" \| "api-key"` | Matches `install.auth` |
| `value` | secret string | Never logged; masked in any debug path (SPEC §11) |
| `acquired_via` | `"setup-token subprocess" \| "masked paste" \| "local cache reuse"` | For audit/UX messaging only, not persisted state |
| local cache entry | `{ auth, value }` at `~/.config/revieweragent/credentials.json`, mode `0600` | Optional; independent lifecycle from the repo secret (SPEC §11) |

**Validation rules**:
- Local cache and the repo's Actions secret are two independent copies —
  updating one never implicitly updates the other (SPEC §11).
- CI never reads the local cache file; only the repo secret reaches the
  Action's job env (SPEC §3, §9 Permissions).
