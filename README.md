# revieweragent

Automatic AI review on every pull request. One `npx` command wires a GitHub Actions
workflow, a GitHub secret, and a local config file. After that, opening a PR is
enough — no extra bot, no per-PR command.

```bash
npx revieweragent init
```

v1 supports **Claude subscription** (Claude Code OAuth token from `claude setup-token`)
and **Anthropic API key**. Subscription is the default.

Marketing copy for a future public launch lives in [`RELEASE_NOTES.md`](./RELEASE_NOTES.md).
That file is a living list, not a promise that we have launched.

## Requirements

- Node.js 20+
- GitHub CLI (`gh`) authenticated to the repo you want to install into
- For subscription mode: Claude Code CLI, with `claude setup-token` already run
- For api-key mode: an Anthropic API key

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
- A GitHub Actions secret (`REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN` or `REVIEWERAGENT_ANTHROPIC_API_KEY`)

Then commit and push those files. Later PRs get a review automatically.

`npx revieweragent` with no subcommand is the same as `npx revieweragent init`. You only run that **once per repo**. After the workflow is on the default branch, opening a PR is enough — do not re-run init for every review.

### Auth

`init` tries subscription first (`claude setup-token` output). Pass `--auth api-key`
to use `ANTHROPIC_API_KEY` instead.

### Advisory vs gate

`--mode advisory` (default) posts the review and always concludes the check success.

`--mode gate` still posts the review, then concludes the GitHub Check **`revieweragent`**
as failure when findings at `block_severity` or higher are present. Wire that check
name into branch protection yourself — v1 does not apply protection rules.

### Forks

Default `fork_policy` is `auto`: PRs from forks are reviewed, with a per-actor hourly
cap. The other value is `comment-gated` (only a write-access `/review` on a fork PR).
There is no `--fork-policy off|on` flag — edit `.revieweragent.yml`.

## Uninstall

```bash
npx revieweragent uninstall
```

Removes the workflow, local config, and the GitHub secret this installer created.

## Review runs in GitHub Actions only

There is no `npx revieweragent review --pr`. After init, opening a PR is enough.
`review` is the bundled `actions/review` entrypoint; running it outside Actions
exits 1.

Each review attempt posts start and complete timeline comments with
`Verdict: PASS | BLOCK | SKIPPED | FAILED`. Those comments are not the merge
gate — the GitHub Check named `revieweragent` is.

## What v1 does not do

These are **v2** (already specified) unless noted:

- Does not apply branch protection or merge-queue rules (`apply-protection`, `merge_group`)
- Does not write `CODEOWNERS` (it prints a snippet you can paste)
- Does not ship `upgrade`, `rotate-secret`, or `apply-protection`
- Does not offer Cursor (v2; Dashboard API key, not Copilot) or other git hosts / Copilot / OpenAI / Gemini (v3)

## Upgrade

Already installed `1.0.0`? Re-run init to refresh the workflow pin (progress comments, verdicts, and `issues: write` live in the action SHA, not in the npm CLI alone):

```bash
npx revieweragent@1.1.0 init
```

Init confirms before overwriting a managed workflow. It writes the GitHub secret for the auth you select (same as first install). Commit the workflow change.

## License

MIT
