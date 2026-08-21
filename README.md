# revieweragent

Automatic AI review on every pull request. One `npx` command wires a GitHub Actions
workflow, a GitHub secret, and a local config file. After that, opening a PR is
enough — no extra bot, no per-PR command.

```bash
npx revieweragent init
```

v1 supports **Claude subscription** (Claude Code OAuth token from `claude setup-token`)
and **Anthropic API key**. Subscription is the default.

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

- `.revieweragent.yml` — local config (gitignored)
- `.github/workflows/revieweragent.yml` — the review workflow (committed)
- A GitHub Actions secret (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`)

Then commit and push the workflow file. Later PRs get a review automatically.

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
cap. `--fork-policy off` skips fork PRs. `--fork-policy on` reviews them with no cap.

## Uninstall

```bash
npx revieweragent uninstall
```

Removes the workflow, local config, and the GitHub secret this installer created.

## Review locally (optional)

```bash
npx revieweragent review --pr 42
```

Same engine as CI. Needs the same GitHub token and Claude/Anthropic credentials.

## What v1 does not do

- Does not apply branch protection or merge-queue rules
- Does not write `CODEOWNERS` (it prints a snippet you can paste)
- Does not ship `upgrade`, `rotate-secret`, or `apply-protection`

## License

MIT
