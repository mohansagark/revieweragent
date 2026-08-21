# revieweragent — marketing release notes

Living notes for a **public launch**, not a developer changelog.

npm already has a technical v2 (`revieweragent@1.2.0`). This file tracks what is
worth saying out loud. Keep appending shipped headlines here. When the list is
strong enough to launch, flip **Launch status** and cut a public post from this
page — do not invent copy at the last minute.

**Launch status:** not ready. Technical v2 is live on npm. Marketing v1 is not.

**How to update:** add a dated bullet under **Shipped** when a user-visible
capability lands. Do not log pins, SHA bumps, or CI-only fixes.

---

## Positioning (current)

**One `npx` command. After that, every pull request gets an AI review.**

No extra GitHub App. No per-PR slash command. The review runs on GitHub Actions
against the diff as **data** — it never checks out or executes the PR branch, so
it works on any language.

Default path is a **Claude subscription** (`claude setup-token`), not a console
API key. Cursor is an opt-in second Agent.

Install:

```bash
npx revieweragent init
```

Already installed from 1.1.0?

```bash
npx revieweragent upgrade
```

---

## Who it is for

Repo maintainers who already pay for Claude Code or Cursor and want that same
reviewer on every PR, without standing up another bot or sharing a team API key.

Not yet: GitLab / Bitbucket / Azure DevOps (**v3**). `apply-protection` is the
opt-in for requiring the `revieweragent` check on classic branch protection.

---

## Shipped (say this)

### 2026-08-21 — Gemini Model + optional fallback (in-tree; next npm after pin)

- **Gemini as a Model.** Google AI Studio API key, `gemini-3.7-flash` in CI.
  Same findings schema as Claude. Not the default — Claude subscription still is.
- **Optional fallback provider.** After primary 429 or Claude subscription
  plan-quota, a *different* method can retry. Dual-quota fails closed. Leave it
  off to keep skip-and-pass.

### 2026-08-21 — technical v2 (`npx revieweragent@1.2.0`)

- **Cursor as a second Agent.** Dashboard or service-account API key, ask-mode
  CLI in CI. Not Copilot, and not a console API-key path. Claude subscription
  stays the default.
- **`upgrade`.** Refresh the pinned Action without changing provider, auth, or
  mode. Re-run init only when you actually want to switch those.
- **`rotate-secret`.** Put a new credential in the matching GitHub Actions
  secret (the Claude token lasts about a year).
- **`apply-protection`.** Opt-in: add the `revieweragent` required check on
  classic branch protection, then verify it stuck. Will not invent a ruleset
  from scratch — it prints the settings link instead.
- **Merge queue.** Reuses a prior PASS when the mapping still holds; otherwise
  one extra review on the merge commit.
- **CODEOWNERS.** Init can write a managed block (`--codeowners @USER`);
  uninstall removes only that block.
- **OS keychain.** Local credential cache prefers macOS Keychain / libsecret,
  and falls back to a `0600` file.

### 2026-08-21 — technical v1.1.0 (`npx revieweragent@1.1.0`)

- **Init once per repo.** Bare `npx revieweragent` runs init. Later PRs review
  themselves.
- **Timeline you can see.** Each review posts start and complete comments, with
  an explicit **Verdict: PASS | BLOCK | SKIPPED | FAILED** — including on
  failures, without dumping raw errors on the PR.
- **Claude subscription by default**, Anthropic API key as an opt-in.
- **Advisory or gate.** Gate fails the GitHub Check named `revieweragent` at a
  chosen severity. You wire that check into branch protection; 1.1.0 did not
  flip repo rules for you (`apply-protection` is 1.2.0).
- **Forks.** Default `auto`: review fork PRs with a per-actor hourly cap.
- **Uninstall** removes the workflow, config, and the secret this tool created.
- **Any language.** The job never builds or runs the PR.

### 2026-08-21 — technical v1.0.0

First public npm package: install, automatic review, uninstall. **1.2.0** is
what to talk about if this ships tomorrow.

---

## v3 (no design yet — not a backlog)

- GitLab / Bitbucket / Azure DevOps
- GitHub Copilot, OpenAI, Gemini
- Org-wide `--org` rollout, usage dashboard, org-level secret
- Multi-provider in one repo
- Tuned / adaptive fork rate limiting

---

## Do not lead with

- SHA pins, workflow job ids, trusted publishing, sanitizer internals
- “We have 235 tests”
- Provider switches that still need a re-run of `init`
- Inventing a branch-protection ruleset when classic protection does not exist

---

## Cut line (fill in at launch)

> _One sentence. Then the install command. Then who it is for._
>
> _(empty until Launch status flips)_
