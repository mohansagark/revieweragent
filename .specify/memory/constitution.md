<!--
Sync Impact Report
Version change: 1.2.0 → 1.3.0 (MINOR — Principle II: Gemini Model is live;
optional different-method fallback. Principle III: opt-in dual-quota
fail-closed exception. OpenAI / Copilot / multi-primary remain undesigned.)
Modified principles: II, III
Added sections: none
Removed sections: none
Deferred placeholders: none
Templates requiring follow-up: none
-->

# revieweragent Constitution

## Core Principles

### I. Spec Is the Source of Truth
`SPEC.md` at the repo root is the locked design. Every mechanism it
documents (CLI flags, API endpoints, error classification, schemas) has
been verified against source or an OpenAPI description, not assumed. No
implementation MAY silently diverge from `SPEC.md`. If reality forces a
divergence, `SPEC.md` MUST be updated in the same change — code and spec
never drift apart silently.

**Rationale**: The spec exists precisely because earlier drafts contained
unverified "if the API supports it" language that cost rework. Treating it
as authoritative, not aspirational, is what keeps that from repeating.

### II. Release-scope discipline (NON-NEGOTIABLE)
v1 shipped `init`, `review`, and `uninstall`, per `SPEC.md` §0, and is
done. **v2** ships `upgrade`, `rotate-secret`, `apply-protection`,
`merge_group` reuse with the locked `head_ref` mapping, CODEOWNERS writing,
OS keychain, and **Cursor** as an Agent provider — auth/CI locked in
`SPEC.md` §3 / §8 (Dashboard API key + `agent --mode ask`, not Copilot
GitHub-seat, not an unpinned install script). **Gemini Model (`api-key`)**
is live, including as an optional different-method **fallback** that runs
only on primary HTTP 429 or Claude subscription plan-quota 400. **v3** is
undesigned work in §18 (other git hosts, Copilot/OpenAI, org rollout, and
so on).
`/speckit-plan` and `/speckit-tasks` MUST NOT schedule v3 work inside a v2
plan. Branch protection auto-apply is v2 (`apply-protection`) and MUST NOT
run until the workflow exists on the default branch. GitHub.com / GHE Cloud
only; GHE Server is not a v1/v2 target.

**Rationale**: `SPEC.md` §0 slices the product down to the smallest thing
that answers "are the reviews any good?" — every command beyond that is
scaffolding that delays the only feedback that matters.

### III. Fail-Closed Security, Availability-Skip Reliability
Auth failures (expired token, 401, 403) MUST fail closed in gate mode —
never silently pass a PR. Transient/provider failures (429, 400 credit,
overload, 5xx) MUST be classified as availability skip, not fail-closed,
and MUST NOT block merges **unless the install opted into `fallback`**.
Primary 429 / subscription plan-quota remains an availability skip when no
fallback is configured. When fallback is set, exhaustion of both providers
(or a missing/empty fallback secret, or a fallback CLI that cannot start)
MUST fail-closed — that is an explicit operator choice, not the default.
This distinction is locked in `SPEC.md` §9/§11 and MUST be preserved in
every error path the runner adds.

**Rationale**: Conflating "we couldn't reach the model" with "the model
found a problem" either blocks merges on a provider outage or, worse,
silently waves PRs through on an auth failure. Neither is acceptable.

### IV. Untrusted Input Is Never Instruction
PR titles, bodies, filenames, diffs, review threads, and issue comments
are untrusted data, always wrapped in delimiters, never treated as
instructions to the model. The runner sanitizes untrusted text (HTML
comments, invisible characters, markdown image alt-text, hidden HTML
attributes, HTML entities) before every API call, per `SPEC.md` §10.
Sanitization is defense-in-depth, not the primary control — the primary
controls are structural: no tools, no PR-head checkout, config sourced
from the base branch, and a code-side gate the model cannot influence.
`instructions.md` may add review policy; it MUST NOT be able to disable
schema validation or the code-side gate.

**Rationale**: This is a GitHub Action that ingests attacker-controlled PR
content by design. Every other guarantee in the system is void if this one
breaks.

### V. Code Decides, the Model Only Reports
The model returns findings only (severity, file, line, message) — never a
verdict. Pass/block is computed in code from `block_severity` config
against the findings array, per `SPEC.md` §12. If a `verdict` key appears
in model output anyway, it MUST be ignored. Schema violations are treated
as infra failures, not silently coerced.

**Rationale**: A model-computed verdict is exactly the kind of instruction
a prompt injection would target. Keeping the gate deterministic and
code-owned removes that attack surface entirely.

### VI. Decoupled, Verified Dependencies
revieweragent does not depend on `anthropics/claude-code-action` at
runtime — it bundles its own review runner, a decision justified by the
actor-permission gate, not a false technical claim (locked in `SPEC.md`
§7). Where that action's prior art is genuinely reusable (its sanitizer
design, §10), read and adapt it explicitly rather than re-deriving it
worse. Every third-party API or CLI behavior this project depends on MUST
be verified against source/OpenAPI before being written into spec or code
— "the docs probably say" is not a verification.

**Rationale**: This project already reversed course once after finding an
unverified assumption baked into an early design. The cost of verification
is small next to the cost of shipping on a wrong assumption a second time.

## Security & Sanitization Requirements

- One **primary** auth secret per repo (`REVIEWERAGENT_ANTHROPIC_API_KEY`,
  `REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN`, `REVIEWERAGENT_CURSOR_API_KEY`,
  or `REVIEWERAGENT_GEMINI_API_KEY`), matching `provider` + `auth`.
  Optionally one **fallback** secret of a **different** `(provider, auth)`
  method. Primary Claude subscription MUST never spawn the Claude CLI with
  `ANTHROPIC_API_KEY` in that child env (use
  `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY` when Claude api-key is the
  fallback). Switching auth or provider deletes secrets that are neither
  primary nor fallback after confirmation.
- Secrets are never echoed to logs; debug paths MUST mask them.
- Workflow triggers use a single `on:` block — no `pull_request` /
  `pull_request_target` mixing (`SPEC.md` §9).
- Fork PRs are subject to the `auto` rate-limit policy by default; no
  unbounded fork-triggered spend.
- Findings render as GitHub Reviews API inline comments keyed on
  `file`/`line`, not free text alone — this keeps the gate auditable.

## Development Workflow

- Every feature or fix traces back to a numbered `SPEC.md` section; cite
  it in the PR description.
- Any CLI or API behavior newly relied upon during implementation MUST be
  verified (tested against a real invocation or checked against an
  OpenAPI/source reference) before it is treated as fact — matching the
  verification bar `SPEC.md` itself was held to.
- Changes that touch the fail-closed/availability-skip classification
  (Principle III) or the sanitization boundary (Principle IV) require
  explicit call-out in review; these are the two places a quiet regression
  is most dangerous.
- v1/v2/v3 scope (Principle II) is enforced at planning time: `/speckit-plan`
  and `/speckit-tasks` MUST NOT schedule v3 work in a v2 plan, or v2 work
  as a v1 patch, without an explicit constitution amendment.

## Governance

This constitution supersedes ad hoc practice for this repository. `SPEC.md`
governs product mechanism and behavior; this constitution governs how work
proceeds against that spec — the two are complementary, not duplicates.

Amendments require: the proposed change written out, its principle-level
impact classified (MAJOR/MINOR/PATCH per the versioning policy below), and
the Sync Impact Report at the top of this file updated in the same commit.
Removing or redefining a principle is a MAJOR bump; adding a principle or
materially expanding guidance is MINOR; wording/clarification is PATCH.

All plans and PRs are expected to be compliant with this constitution.
Any deviation must be justified in the PR description and, if it recurs,
resolved by amending this document rather than left as a standing
exception. Runtime development guidance for agents lives in `SPEC.md` and
the `.specify/` templates, not duplicated here.

**Version**: 1.3.0 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-21
