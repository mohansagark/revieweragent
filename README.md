# revieweragent

Automatic AI review on every pull request. One `npx` command wires a GitHub Actions
workflow, a GitHub secret, and a local config file. After that, opening a PR is
enough — no extra bot, no per-PR command.

```bash
npx revieweragent init
```

Supports **Claude subscription** (Claude Code OAuth token from `claude setup-token`),
**Anthropic API key**, **Gemini** (Google AI Studio API key), and **Cursor**
(Dashboard / service-account API key, Agent ask-mode). Claude subscription is
the default. Init can optionally configure a **fallback** provider that runs
only when the primary hits HTTP 429 or Claude subscription plan-quota.

Marketing copy for a future public launch lives in [`RELEASE_NOTES.md`](./RELEASE_NOTES.md).
That file is a living list, not a promise that we have launched.

## Requirements

- Node.js 20+
- GitHub CLI (`gh`) authenticated to the repo you want to install into
- For Claude subscription: Claude Code CLI, with `claude setup-token` already run
- For Claude api-key: an Anthropic API key
- For Gemini: a Google AI Studio API key (`https://aistudio.google.com/apikey`)
- For Cursor: a Cursor Dashboard or team service-account API key. Init does not
  install the `agent` CLI; CI downloads a checksum-pinned tarball.

The installer talks to the GitHub API with `gh auth token`. Run `init` from a git
checkout whose `origin` is the target GitHub repository.

## Install

```bash
cd your-repo
npx revieweragent init
```

That writes:

- `.revieweragent.yml` — repo config (commit this)
- `.github/workflows/revieweragent.yml` — the review workflow (committed)
- A GitHub Actions secret (`REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN`,
  `REVIEWERAGENT_ANTHROPIC_API_KEY`, `REVIEWERAGENT_GEMINI_API_KEY`, or
  `REVIEWERAGENT_CURSOR_API_KEY`)
- A managed `CODEOWNERS` block when you pass `--codeowners @USER` (skipped by
  default in non-interactive mode)

Then commit and push those files. Later PRs get a review automatically.

`npx revieweragent` with no subcommand is the same as `npx revieweragent init`. You only run that **once per repo**. After the workflow is on the default branch, opening a PR is enough — do not re-run init for every review.

### Auth

`init` tries Claude subscription first (`claude setup-token` output). Pass `--auth api-key`
to use `ANTHROPIC_API_KEY`, `--provider gemini --auth api-key --gemini-api-key …` for
Gemini, or `--provider cursor --auth subscription --cursor-api-key …` for Cursor.
Optional fallback: `--fallback-provider gemini --fallback-gemini-api-key …`. Cursor has
no Model / Console API-key path. Gemini has no subscription path.

### Advisory vs gate

`--mode advisory` (default) posts the review and always concludes the check success.

`--mode gate` still posts the review, then concludes the GitHub Check **`revieweragent`**
as failure when findings at `block_severity` or higher are present. After the workflow
has run at least once on the default branch, require that check with:

```bash
npx revieweragent apply-protection
```

That command read-modify-writes classic branch protection and verifies the GET.
It will not invent a ruleset from scratch.

### Forks

Default `fork_policy` is `auto`: PRs from forks are reviewed, with a per-actor hourly
cap. The other value is `comment-gated` (only a write-access `/review` on a fork PR).
There is no `--fork-policy off|on` flag — edit `.revieweragent.yml`.

## Commands

| Command | Purpose |
|---|---|
| `init` | Install (also the default for a bare `npx revieweragent`) |
| `upgrade` | Refresh pinned action SHAs; does not change provider, auth, or mode |
| `rotate-secret` | PUT a new credential to the matching Actions secret |
| `apply-protection` | Add the `revieweragent` required check (RMW + verify) |
| `uninstall` | Remove managed files (and optionally the secret / local cache) |

Local credentials prefer the OS keychain (macOS Keychain / libsecret) and fall
back to `~/.config/revieweragent/credentials.json` (`0600`). Pass `--no-keychain`
to force the file.

## Uninstall

```bash
npx revieweragent uninstall
```

Removes the workflow, local config, the managed CODEOWNERS block, and optionally
the GitHub secret this installer created.

## Review runs in GitHub Actions only

There is no `npx revieweragent review --pr`. After init, opening a PR is enough.
`review` is the bundled `actions/review` entrypoint; running it outside Actions
exits 1.

Each review attempt posts start and complete timeline comments with
`Verdict: PASS | BLOCK | SKIPPED | FAILED`. Those comments are not the merge
gate — the GitHub Check named `revieweragent` is.

Merge-queue (`merge_group`) reuses a prior PASS when the PR mapping and base SHA
still match; otherwise it runs one extra inference on the merge commit.

## What this release does not do

These are **v3** (undesigned) unless noted:

- Does not support GitLab, Bitbucket, Azure DevOps, or GitHub Enterprise Server
- Does not offer Copilot, OpenAI, or Gemini
- Does not invent a branch-protection ruleset when classic protection is missing
  (`apply-protection` prints instructions instead)

## Upgrade

Already installed? Refresh pins without changing provider or auth:

```bash
npx revieweragent upgrade
```

Commit the workflow change. Re-running `init` still works and overwrites the
secret for the auth you select.

## License

MIT
