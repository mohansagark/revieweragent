# revieweragent — marketing release notes

Living notes for a **public launch**, not a developer changelog.

npm already has a technical v1 (`revieweragent@1.1.0`). This file tracks what is
worth saying out loud. Keep appending shipped headlines here. When the list is
strong enough to launch, flip **Launch status** and cut a public post from this
page — do not invent copy at the last minute.

**Launch status:** not ready. Technical v1 is live; marketing v1 is not.

**How to update:** add a dated bullet under **Shipped** when a user-visible
capability lands. Move an item from **Would strengthen a launch** only after it
ships. Do not log pins, SHA bumps, or CI-only fixes.

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

Not yet: GitLab / Bitbucket / Azure DevOps, or “apply branch protection for me.”

---

## Shipped (say this)

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

## Would strengthen a launch (not shipped)

Hold the public post until at least one of these is real — or until the current
list feels enough on its own:

- One-command **upgrade** of an existing install (today: re-run init)
- **Apply branch protection** for the `revieweragent` check (today: print the
  settings link)
- **GitLab / Bitbucket / Azure DevOps**
- More providers than Claude (Cursor, Copilot, OpenAI, Gemini)
- Merge-queue (`merge_group`) so gated PRs stay green in the queue
- Auto-written `CODEOWNERS` (today: printed snippet)

---

## Do not lead with

- SHA pins, workflow job ids, trusted publishing, sanitizer internals
- “We have 171 tests”
- Features that are still “re-run init” or “flip this in GitHub settings”

---

## Cut line (fill in at launch)

> _One sentence. Then the install command. Then who it is for._
>
> _(empty until Launch status flips)_
