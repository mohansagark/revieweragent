# revieweragent — marketing release notes

Living notes for a **public launch**, not a developer changelog.

npm already has a technical v1 (`revieweragent@1.1.0`). This file tracks what is
worth saying out loud. Keep appending shipped headlines here. When the list is
strong enough to launch, flip **Launch status** and cut a public post from this
page — do not invent copy at the last minute.

**Launch status:** not ready. Technical v1 is live; v2 is specified and
implemented in-tree. Marketing v1 is not.

**How to update:** add a dated bullet under **Shipped** when a user-visible
capability lands. Do not log pins, SHA bumps, or CI-only fixes.

---

## Positioning (current)

**One `npx` command. After that, every pull request gets an AI review.**

No extra GitHub App. No per-PR slash command. The review runs on GitHub Actions
against the diff as **data** — it never checks out or executes the PR branch, so
it works on any language.

Default path is a **Claude subscription** (`claude setup-token`), not a console
API key.

Install:

```bash
npx revieweragent init
```

---

## Who it is for

Repo maintainers who already pay for Claude Code and want that same reviewer on
every PR, without standing up another bot or sharing a team API key.

Not yet: GitLab / Bitbucket / Azure DevOps (**v3**). Cursor is a second Agent
in v2. `apply-protection` is the opt-in for requiring the `revieweragent` check.

---

## Shipped (say this)

### 2026-08-21 — technical v2 (`npx revieweragent@1.2.0`)

- **`upgrade`**, **`rotate-secret`**, and **`apply-protection`**.
- **Cursor** as a second Agent (Dashboard / service-account API key, ask-mode CLI).
- Merge-queue (`merge_group`) reuses a prior PASS when the mapping still holds.
- Managed **CODEOWNERS** block on init; uninstall removes only that block.
- OS keychain for the optional local credential cache, with the `0600` file as fallback.

### 2026-08-21 — technical v1.1.0 (`npx revieweragent@1.1.0`)

- **Init once per repo.** Bare `npx revieweragent` runs init. Later PRs review
  themselves.
- **Timeline you can see.** Each review posts start and complete comments, with
  an explicit **Verdict: PASS | BLOCK | SKIPPED | FAILED** — including on
  failures, without dumping raw errors on the PR.
- **Claude subscription by default**, Anthropic API key as an opt-in.
- **Advisory or gate.** Gate fails the GitHub Check named `revieweragent` at a
  chosen severity. You wire that check into branch protection; the installer
  does not flip repo rules for you.
- **Forks.** Default `auto`: review fork PRs with a per-actor hourly cap.
- **Uninstall** removes the workflow, config, and the secret this tool created.
- **Any language.** The job never builds or runs the PR.

### 2026-08-21 — technical v1.0.0

First public npm package: install, automatic review, uninstall. 1.1.0 is what
to talk about if this ships tomorrow.

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
- “We have 171 tests”
- Features that are still “re-run init” for provider switches, or “flip this in
  GitHub settings” when classic protection does not exist

---

## Cut line (fill in at launch)

> _One sentence. Then the install command. Then who it is for._
>
> _(empty until Launch status flips)_
