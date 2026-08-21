# Gemini Model + optional fallback provider

Date: 2026-08-21
Status: design review applied (gaps below are locked, not open questions)
Package: revieweragent (currently 1.2.0 on npm)

## Intent

Claude subscription (and Cursor) plan quota is an **availability skip**: the
`revieweragent` check succeeds with **Verdict: SKIPPED**. That is load-bearing
for public repos (`fork_policy: auto`) so an outsider cannot freeze merges by
draining quota (`SPEC.md` §9 / Constitution Principle III).

On installs that **opt in**, a **different** provider/auth pair should run after
primary 429/plan-quota instead of skip-and-pass. Gemini 3.7 Flash is the
recommended free Model for that role, and Gemini is also a valid **primary**
Model (same init list as Anthropic Console).

Fallback is optional. Installs that skip the question keep today’s behavior.

## Locked decisions

1. Gemini appears in **both** the primary init picker and the fallback picker
   (Model category, API key).
2. Fallback **must not** use the same method as primary. Method = `(provider, auth)`.
   Claude `subscription` and Claude `api-key` are different methods.
3. Fallback trigger is **only** `isFallbackTrigger` (below). Not E2BIG, not
   over-limit diffs, not invalid findings JSON, not 5xx overload, not
   `api-key` HTTP 400 credit-balance, not a **needed** CLI-install failure
   on the backend that was about to run.
4. No fallback configured → keep availability skip on that 429/quota.
5. Fallback configured and it also 429s/quota-fails, the fallback secret is
   missing/empty, or the fallback backend cannot start (e.g. Cursor tarball
   failed and fallback is Cursor) → **fail-closed**. No silent PASS.
6. Claude subscription remains the default primary. Do not make Gemini the
   default init path.
7. OpenAI, Copilot, GitLab/Bitbucket/ADO stay v3 / undesigned.
8. **Constitution III exception (opt-in):** dual-quota fail-closed **can**
   block merges, including on fork PRs. That is the point of configuring
   fallback on a gate-mode repo. Init MUST warn on public + `fork_policy:
   auto` that an outsider can burn both quotas and freeze the required
   check. Operators who want the old freeze-proof skip leave fallback off.

## Gaps closed in review

These were missing or wrong in the first draft. They are now locked.

### Trigger is not “any availability-skip”

`classifyError` today: Anthropic **api-key HTTP 400** is always **fail-closed**,
even with a quota-looking body. Fallback must not treat that as a skip-then-retry.

`isFallbackTrigger(err)` is true only when:

- `kind === "http_429"`, or
- `kind === "http_400" && err.auth === "subscription" && err.quotaSignal === true`

False for: `http_5xx`, `npm_fetch_fail_cache_miss`, `e2big`, `invalid_json`,
`http_401`/`403`, `missing_secret`, api-key `http_400`.

Gemini `RESOURCE_EXHAUSTED` / quota language in a 429 **or** 403 body maps to
`http_429` (availability), not auth `http_403`. Invalid Gemini API key stays
`http_403` (fail-closed).

5xx overload stays skip-and-pass with **no** fallback. The live pain on this
repo is Claude **rate limited** (429), not 5xx. Do not widen the trigger in
this change.

### One shared `REVIEWERAGENT_CLI_INSTALL_FAILED` cannot represent two CLIs

Today Claude and Cursor both read the same env var. A workflow that installs
**both** (primary Claude + fallback Cursor, or the reverse) would mark the
whole job as “CLI failed” if either step failed.

Lock split env:

| Env | Meaning |
|---|---|
| `REVIEWERAGENT_CLI_INSTALL_FAILED` | Claude npm install step failed (keep the name for existing workflows) |
| `REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED` | Cursor tarball step failed |

Each backend reads **only** its own flag. An HTTP backend (Gemini, Anthropic
Messages) **never** short-circuits on either flag.

Consequence, which the first draft got wrong:

- Primary **Gemini**, fallback Claude subscription, Claude npm install fails:
  **Gemini still runs**. If Gemini 429s, fallback Claude cannot start →
  fail-closed (fallback opted in but unusable).
- Primary **Claude subscription**, Claude npm install fails, Gemini fallback
  configured: **no fallback** (CLI-install is not `isFallbackTrigger`) →
  availability skip. Gemini could have reviewed; that is an explicit
  non-goal so the trigger stays quota-only.

### Dispatch on `provider`, not `auth === "api-key"`

`review.ts` today sends every `api-key` install to Anthropic. Gemini primary
would silently call Anthropic. Runtime switch:

- `cursor` + `subscription` → Cursor CLI
- `claude` + `subscription` → Claude CLI
- `claude` + `api-key` → Anthropic Messages
- `gemini` + `api-key` → Gemini `generateContent`

### Non-interactive flags must not overload `--api-key`

| Method | Primary flag / env | Fallback flag |
|---|---|---|
| Claude subscription | `--oauth-token` / `CLAUDE_CODE_OAUTH_TOKEN` | `--fallback-oauth-token` |
| Claude api-key | `--api-key` / `ANTHROPIC_API_KEY` | `--fallback-api-key` |
| Cursor | `--cursor-api-key` / `CURSOR_API_KEY` | `--fallback-cursor-api-key` |
| Gemini | `--gemini-api-key` / `GEMINI_API_KEY` | `--fallback-gemini-api-key` |

Do **not** run Anthropic `validateApiKey` (`sk-ant` …) on Gemini keys.

### Re-init must not wipe fallback by default

If `.revieweragent.yml` already has `fallback` and the operator re-runs init:

- “Configure a fallback provider?” defaults to **yes**.
- Offer reuse of the cached fallback credential.
- If they answer **no**, after confirm: drop `fallback` from config, omit
  fallback env from the workflow, delete the leftover fallback secret
  (same confirm-or-abort as unused-secret deletion today).

Non-interactive re-init: omitting fallback flags **removes** fallback if the
existing config had one (flags are the source of truth). To keep it, pass
the fallback flags again.

### `upgrade` must emit fallback env

`upgradeManagedWorkflow` currently calls `buildWorkflowYaml({ auth, provider, shas })`.
It MUST pass `fallback` from parsed config or a re-pin would drop Gemini
from the job env while leaving it in config (secret present, never used,
429 still skip-and-pass).

### Constitution III vs dual-429 fail-closed

Principle III says 429 must not block merges. Fallback dual-exhaustion
**does**. Amend Principle III in the same change: primary 429 remains skip;
**opt-in fallback** exhaustion of both is fail-closed. Init warning on
public/`auto` is mandatory so this is not a silent freeze.

Gemini free tier may train on prompts. Init note: fork PR diffs (untrusted
authors) go to Google when Gemini runs as primary or fallback.

### Other runtime details the first draft skipped

- **merge_group:** same primary-then-maybe-fallback path. Reuse of a prior
  PR `PASS` still applies even if that PASS came from fallback. An
  availability-skip on the PR still forces merge_group inference (existing
  mapping).
- **Fork cap:** one job = one cap tick, even if both backends run.
- **Empty secret:** GitHub interpolates empty string when the secret is
  missing. Treat empty like missing → fail-closed if `fallback` is set.
- **Pre-flight mix check** (`ANTHROPIC_API_KEY` set while primary is Claude
  subscription) stays. It must **not** treat `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY`
  as a mix.
- **Progress comments:** still one start + one complete. Complete may say
  the review used fallback (`fallback: gemini`) on PASS/BLOCK. Dual-429
  public text is the existing fail-closed boilerplate — no raw quota
  strings (existing `publicProgressDetails` rule).
- **Advisory vs gate:** dual-429 uses the existing fail-closed table (gate
  exit 1; advisory conclusion `failure`, exit 0). Do not invent a new kind.
- **Credential cache:** add `gemini:api-key` to the keychain account list.
- **Model prompt copy:** change “I have an Anthropic Console API key” to
  “Model — I have a provider API key”, then list Claude and Gemini.

## Spec / constitution impact

`SPEC.md` §0 / §3 currently lists Gemini as **v3**. This change **promotes
Gemini Model (`api-key`) into live scope** (same class as Anthropic Console).
It does **not** light up OpenAI, Copilot, or multi-primary workflows.

Constitution Principle II (release-scope): MINOR — Gemini Model is live;
other §18 rows stay undesigned.

Constitution Principle III: MINOR — document the opt-in dual-quota
fail-closed exception.

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

1. Confirm: **“Configure a fallback provider?”** Default **no** on a fresh
   install; default **yes** when config already has `fallback`.
2. If yes: the same Agent/Model → provider → credential path, with the
   **primary `(provider, auth)` pair omitted**.
3. Do not re-ask advisory/gate, severity, or CODEOWNERS.
4. If Gemini is chosen (primary or fallback), show the free-tier training
   note and, on public + `auto`, the dual-quota freeze warning.

Refuse at init (interactive and not):

- `provider: gemini` with `auth: subscription`
- `provider: cursor` with `auth: api-key` (unchanged)
- fallback method equal to primary method
- `--fallback-provider` without its credential flag, or credential flag
  without `--fallback-provider`

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
- `fallback: null` / empty mapping → treat as absent.
- Unknown `fallback` keys: ignore on write-merge like other unknown keys.

## Registry and secrets

| Method | Category | Secret | Job env (consumed by that backend only) |
|---|---|---|---|
| Claude `subscription` | Agent | `REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN` | `CLAUDE_CODE_OAUTH_TOKEN` |
| Claude `api-key` | Model | `REVIEWERAGENT_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` **or** `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY` |
| Cursor `subscription` | Agent | `REVIEWERAGENT_CURSOR_API_KEY` | `CURSOR_API_KEY` |
| Gemini `api-key` | Model | `REVIEWERAGENT_GEMINI_API_KEY` | `GEMINI_API_KEY` |

Gemini pin: **`gemini-3.7-flash`**. Override via `GEMINI_MODEL` (same class as
`ANTHROPIC_MODEL`). HTTP `generateContent`, no tools, same §12 evaluator.
Verify JSON mode / `responseSchema` against a live key before treating it as
fact. If Google cannot constrain to §12, fence-strip + `parseFindings` like
the Anthropic api-key path; invalid JSON is fail-closed.

### Mixing rule (load-bearing)

If **primary** is Claude `subscription`, the Claude CLI child env **must not**
contain `ANTHROPIC_API_KEY`. When fallback is Claude `api-key`, the Actions
secret is still `REVIEWERAGENT_ANTHROPIC_API_KEY`, but the workflow maps it to
`REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY`. `callApiKeyBackend` reads that
when falling back. Gemini (`GEMINI_API_KEY`) and Cursor (`CURSOR_API_KEY`)
fallback names are safe to coexist with the Claude CLI.

`unusedSecretNames(primary, fallback?)` deletes secrets that are neither
primary nor fallback after confirm (init switch / uninstall).

## Workflow generation

`buildWorkflowYaml` takes primary + optional fallback.

- Install steps are the **union** of CLIs that **either** role needs.
  Each install stays `continue-on-error: true`.
- Review step env: `GITHUB_TOKEN`, primary credential, optional fallback
  credential (mapped per mixing rule), plus the **split** CLI-failed flags
  and `REVIEWERAGENT_CURSOR_BIN` when a Cursor install step exists.
- Gemini-only (no Claude subscription and no Cursor in either role) omits
  both CLI install steps.

Dogfood on this repo after ship: primary Claude subscription, fallback
Gemini. Retrofit is re-run init (keep primary, say yes to fallback) or
hand-edit config + `gh secret set REVIEWERAGENT_GEMINI_API_KEY` +
`upgrade` so the workflow gains `GEMINI_API_KEY`. Config on base without
the workflow env is a dead fallback (429 still skips) — `upgrade` after
config edit is required.

## Review runtime

1. Run **primary** backend as today (provider switch above). CLI-install
   flags only affect the backend that needs that CLI.
2. If it throws `ModelBackendError` and `isFallbackTrigger(err.classifiable)`
   and `config.fallback` is set:
   - Fallback secret missing/empty → fail-closed.
   - Fallback backend cannot start (its CLI-install flag) → fail-closed.
   - Else run fallback with the same system prompt + payload.
   - Fallback success → parse findings and publish PASS/BLOCK; complete
     comment may note `fallback: <id>`.
   - Fallback `isFallbackTrigger` → fail-closed
     (`"Primary and fallback providers were rate-limited."` in the check
     summary; public comment stays generic fail-closed text).
   - Other fallback errors → existing classifyError path (401, invalid
     JSON, …).
3. Primary availability skip that is **not** `isFallbackTrigger` → skip,
   even if fallback is configured.
4. E2BIG, over-limit, invalid findings after a **successful** primary
   HTTP/CLI response → unchanged (no fallback).

## Other commands

- `upgrade`: rewrite pins; **keep** `fallback` in config; pass it into
  `buildWorkflowYaml`; keep both secrets.
- `rotate-secret`: prompt primary vs fallback (or `--fallback`). Writes the
  matching Actions secret only. Gemini uses `--gemini-api-key`.
- `uninstall`: delete primary secret and fallback secret if present.
- `apply-protection`: unchanged (check name is still `revieweragent`).

## Tests (minimum)

- Config: missing fallback OK; same-method rejected; gemini+subscription
  rejected; `fallback: {}` invalid.
- Init: picker omits primary method; Model list includes Gemini; Gemini
  keys are not Anthropic-validated; re-init default-yes when fallback
  exists; non-interactive flag matrix including `--gemini-api-key`.
- Workflow: Claude sub + Gemini fallback emits `CLAUDE_CODE_OAUTH_TOKEN` and
  `GEMINI_API_KEY`, not `ANTHROPIC_API_KEY`; Claude sub + Anthropic fallback
  uses `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY`; Claude+Cursor union emits
  **both** install steps and **both** CLI-failed env vars.
- Review: primary 429 + Gemini success → PASS/BLOCK from Gemini; primary
  429 + no fallback → skip; primary 429 + Gemini 429 → fail-closed; primary
  Claude CLI-install skip + Gemini fallback set → still skip (no Gemini
  call); primary Gemini + Claude CLI-install fail → Gemini still called;
  `auth: api-key` still dispatches Claude vs Gemini by provider.
- Gemini backend: invalid key → 403 fail-closed; RESOURCE_EXHAUSTED → 429
  trigger; empty `GEMINI_API_KEY` → missing_secret.
- `upgrade` round-trip preserves fallback env.
- Mix pre-flight: `REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY` does not trip
  the subscription mix check; `ANTHROPIC_API_KEY` still does.

## Out of scope

- OpenAI, Copilot, org rollout, in-thread replies.
- Fallback on E2BIG, diff over-limit, 5xx, or primary Claude CLI npm
  install failure.
- Two primaries / round-robin / more than one fallback.
- Changing default init away from Claude subscription.
- npm publish in this spec (implementation PR first; tag separately).

## Implementation notes

- New files: `src/provider/gemini/registry-entry.ts`,
  `src/provider/gemini/api-key.ts`, `src/core/fallback-trigger.ts`
  (`isFallbackTrigger`).
- Extend `ProviderId`, secret helpers, `write-workflow.ts` (`WorkflowOptions.fallback`),
  `init.ts`, `upgrade.ts`, `rotate-secret.ts`, `review.ts`, config schema,
  credential-cache accounts.
- Live-verify Gemini `generateContent` before claiming JSON mode.
- Rebuild `actions/review/dist` in the implementation PR (not this spec
  commit). Pin `reviewActionSha` only after that dist is on `main`.
