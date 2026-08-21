# Gemini Model + optional fallback provider

Date: 2026-08-21
Status: approved in conversation; awaiting spec review before implementation
Package: revieweragent (currently 1.2.0 on npm)

## Intent

Claude subscription (and Cursor) plan quota is an **availability skip**: the
`revieweragent` check succeeds with **Verdict: SKIPPED**. That is load-bearing
for public repos (`fork_policy: auto`) so an outsider cannot freeze merges by
draining quota (`SPEC.md` §9).

On installs that opt in, a **different** provider/auth pair should run after
primary 429/plan-quota instead of skip-and-pass. Gemini 3.7 Flash is the
recommended free Model for that role, and Gemini is also a valid **primary**
Model (same init list as Anthropic Console).

Fallback is optional. Installs that skip the question keep today’s behavior.

## Locked decisions

1. Gemini appears in **both** the primary init picker and the fallback picker
   (Model category, API key).
2. Fallback **must not** use the same method as primary. Method = `(provider, auth)`.
3. Fallback trigger is **primary 429 / plan-quota only**. Not E2BIG, not Claude
   CLI npm-install failure, not over-limit diffs, not invalid findings JSON.
4. No fallback configured → keep availability skip on that 429/quota.
5. Fallback configured and it also 429s/quota-fails, or the fallback secret is
   missing when config says it should exist → **fail-closed** (check failure).
   No silent PASS.
6. Claude subscription remains the default primary. Do not make Gemini the
   default init path.
7. OpenAI, Copilot, GitLab/Bitbucket/ADO stay v3 / undesigned.

## Spec / constitution impact

`SPEC.md` §0 / §3 currently lists Gemini as **v3**. This change **promotes
Gemini Model (`api-key`) into live scope** (same class as Anthropic Console).
It does **not** light up OpenAI, Copilot, or multi-primary workflows.

Constitution Principle II (release-scope) needs a MINOR amendment: Gemini
Model is live; other §18 Model/Agent rows stay undesigned.

Constitution “exactly one live credential” becomes:

- Exactly one **primary** credential, matching `provider` + `auth`.
- Optionally one **fallback** credential of a **different** method.
- Primary Claude subscription **must never** spawn the Claude CLI with
  `ANTHROPIC_API_KEY` in that child env (existing mix-billing fail-closed).

`SPEC.md` §7 “exactly one credential in the job env” is updated: the job may
contain primary env + fallback env when `fallback` is set, with the mixing
rule below.

## Init UX

After primary Agent/Model → provider → credential (and mode/gate as today):

1. Confirm: **“Configure a fallback provider?”** Default **no**.
2. If yes: the same Agent/Model → provider → credential path, with the
   **primary `(provider, auth)` pair omitted**.
3. Do not re-ask advisory/gate, severity, or CODEOWNERS.

Non-interactive:

- Omit fallback flags → no fallback (valid).
- `--fallback-provider <claude|cursor|gemini>` plus the matching credential
  flag/env (`--fallback-oauth-token`, `--fallback-api-key`,
  `--fallback-cursor-api-key`).
- Same-method pair → `MissingInputError` / exit 1.
- `--fallback-provider` without a credential → exit 1.
- Credential without `--fallback-provider` → exit 1.

Refuse at init (interactive and not):

- `provider: gemini` with `auth: subscription`
- `provider: cursor` with `auth: api-key` (unchanged)
- fallback method equal to primary method

## Config

Keep `version: 1`. `fallback` is optional; absent means no fallback.

```yaml
version: 1
provider: claude
auth: subscription
fallback:
  provider: gemini
  auth: api-key
```

Parse rules:

- Missing `fallback` → OK.
- `fallback` present → must have `provider` + `auth`, same validation as
  primary, and `(fallback.provider, fallback.auth) !== (provider, auth)`.
- Unknown `fallback` keys: ignore on write-merge like other unknown keys.

## Registry and secrets

| Method | Category | Secret | Job env (consumed by that backend only) |
|---|---|---|---|
| Claude `subscription` | Agent | `REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN` | `CLAUDE_CODE_OAUTH_TOKEN` |
| Claude `api-key` | Model | `REVIEWERAGENT_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` **or** `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY` |
| Cursor `subscription` | Agent | `REVIEWERAGENT_CURSOR_API_KEY` | `CURSOR_API_KEY` |
| Gemini `api-key` | Model | `REVIEWERAGENT_GEMINI_API_KEY` | `GEMINI_API_KEY` |

Gemini pin: **`gemini-3.7-flash`**. Override via `GEMINI_MODEL` (same class as
`ANTHROPIC_MODEL`). HTTP `generateContent` with the §12 findings schema;
no tools; same evaluator as other backends. Free-tier Google training-on-prompts
is an init note, not a blocker.

### Mixing rule (load-bearing)

If **primary** is Claude `subscription`, the Claude CLI child env **must not**
contain `ANTHROPIC_API_KEY`. When fallback is Claude `api-key`, the Actions
secret is still `REVIEWERAGENT_ANTHROPIC_API_KEY`, but the workflow maps it to
`REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY`. `callApiKeyBackend` reads that
when falling back. Gemini and Cursor fallback env names are safe to coexist
with the Claude CLI.

`unusedSecretNames` deletes secrets that are neither primary nor fallback
after confirm (init switch / uninstall).

## Workflow generation

`buildWorkflowYaml` takes primary + optional fallback.

- Install steps are the **union** of what primary and fallback need
  (Claude npm CLI and/or Cursor tarball). Each install stays
  `continue-on-error: true`.
- Review step env: `GITHUB_TOKEN`, primary credential, optional fallback
  credential (mapped per mixing rule), plus existing
  `REVIEWERAGENT_CLI_INSTALL_FAILED` / `REVIEWERAGENT_CURSOR_BIN` as needed.
- Gemini-only primary (no Claude/Cursor CLI) omits those install steps.

Dogfood on this repo after ship: primary Claude subscription, fallback Gemini.

## Review runtime

1. Run primary backend as today.
2. If it throws and `classifyError` is `availability-skip` **and** the
   classifiable kind is `http_429` or subscription/api-key **quota**
   (`http_400` + `quotaSignal`) **and** `config.fallback` is set:
   - If the mapped fallback secret is missing → fail-closed.
   - Else run fallback backend with the same system prompt + payload.
   - Fallback success → parse findings and publish a normal PASS/BLOCK
     (mention fallback in the complete comment, e.g. `fallback: gemini`).
   - Fallback throws 429/quota → fail-closed
     (`"Primary and fallback providers were rate-limited."`).
   - Fallback throws fail-closed (401, invalid JSON, …) → fail-closed as today.
3. Any other primary availability skip (CLI install fail, 5xx overload
   without quota, …) → **do not** fallback; keep skip-and-pass.
4. E2BIG, over-limit, invalid findings on a **successful** primary call →
   unchanged (no fallback).

## Other commands

- `upgrade`: rewrite pins; **keep** `fallback` in config; keep both secrets.
- `rotate-secret`: prompt primary vs fallback (or `--fallback`). Writes the
  matching Actions secret only.
- `uninstall`: delete primary secret and fallback secret if present.

## Tests (minimum)

- Config: missing fallback OK; same-method fallback rejected; gemini+subscription
  rejected.
- Init: fallback picker omits primary method; non-interactive flags.
- Workflow: primary Claude sub + fallback Gemini emits both env vars and does
  **not** set `ANTHROPIC_API_KEY`; Claude sub + Anthropic fallback uses
  `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY`.
- Review: primary 429 + Gemini success → PASS/BLOCK from Gemini; primary 429
  + no fallback → availability skip; primary 429 + Gemini 429 → fail-closed;
  primary CLI-install skip + fallback set → still availability skip (no
  fallback call).
- Gemini backend: 401 fail-closed, 429 availability-skip when primary.

## Out of scope

- OpenAI, Copilot, org rollout, in-thread replies.
- Fallback on E2BIG, diff over-limit, or npm/tarball install failure.
- Two primaries / round-robin / more than one fallback.
- Changing default init away from Claude subscription.
- npm 1.3.0 publish in this spec (implementation PR first; tag separately).

## Implementation notes

- New files: `src/provider/gemini/registry-entry.ts`, `src/provider/gemini/api-key.ts`.
- Extend `ProviderId`, `jobEnvFor` / fallback variant, `write-workflow.ts`,
  `init.ts` prompt + non-interactive, `review.ts` retry, config schema.
- Verify Gemini `generateContent` JSON mode against a live key before treating
  schema enforcement as fact (`SPEC.md` verification bar). If JSON mode cannot
  emit §12 output, fence-strip + `parseFindings` as the api-key path does;
  invalid JSON is fail-closed.
