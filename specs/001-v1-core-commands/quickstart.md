# Quickstart: Validating revieweragent v1 Core Commands

Proves User Stories 1–3 end to end. Assumes the CLI package builds to
`dist/` and the Action bundle builds to `actions/review/dist/index.js`
(see `research.md` for the build decisions).

## Prerequisites

- Node.js ≥20, npm, `git`.
- `gh` CLI authenticated (`gh auth status`), or a `GH_TOKEN` with the
  scopes in `SPEC.md` §6.
- A disposable test GitHub repo you administer, with at least one file
  committed on its default branch.
- One credential ready: either a Claude Console API key, or access to run
  `claude setup-token` interactively (subscription path).

## Scenario A — Install (User Story 1)

```bash
cd <disposable-test-repo>
npx revieweragent init \
  --provider claude \
  --auth api-key \
  --mode gate \
  --severity high \
  --api-key "$ANTHROPIC_API_KEY" \
  --non-interactive
```

**Expected**: exit code 0. `.github/workflows/revieweragent.yml` and
`.revieweragent.yml` exist with the ownership marker (see
`contracts/revieweragent-config-schema.md`). `.revieweragent.yml` shows
`mode: gate`, `auth: api-key`. Repo secret
`REVIEWERAGENT_ANTHROPIC_API_KEY` exists (`gh secret list`);
`REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN` does not. Command output includes
the exact required-check name (`revieweragent`) and a branch-protection
settings link — it must not have changed any branch-protection setting
itself.

**Negative check (FR-006)**: re-run the same command. Expect a warning
that managed files will be overwritten, then a clean re-write — not a
silent clobber and not a crash.

## Scenario B — Review (User Story 2)

```bash
git checkout -b test-pr-1
echo "// trivial change" >> some-file.js
git commit -am "test PR"
git push -u origin test-pr-1
gh pr create --fill
```

**Expected**: within the workflow's normal run time, `gh pr checks` shows a
`revieweragent` check on the PR's head commit with conclusion `success` or
`failure` (never `neutral`), and `gh pr view --comments` shows exactly one
`COMMENT`-type review from the installed identity (see
`contracts/action-interface.md` for the conclusion matrix).

**Idempotency check (FR-017, SC-005)**: push an empty commit
(`git commit --allow-empty -m "retrigger" && git push`) and confirm the
review count on the PR stays at exactly one (updated in place, not
duplicated).

**Draft check (FR-015)**: open a second PR as a draft. Expect no check run
appears on its head SHA until it is marked ready for review.

## Scenario C — Uninstall (User Story 3)

```bash
npx revieweragent uninstall --non-interactive --yes --delete-secret
```

**Expected**: exit code 0. `.github/workflows/revieweragent.yml` and
`.revieweragent.yml` are gone. `gh secret list` no longer shows either
revieweragent secret. Output includes a prominent warning if a
required-check setting for `revieweragent` may still be configured on the
repo (manual removal — v1 never applied it automatically, per
`contracts/cli-commands.md`).

**Refusal check (FR-019)**: run
`npx revieweragent uninstall --non-interactive` (no `--yes`) against a
freshly re-installed test repo. Expect exit code 1 and no files removed.

## Mapping back to the spec

| Scenario | Covers |
|---|---|
| A | FR-001–FR-009, SC-001 |
| B | FR-010–FR-018, SC-002, SC-003, SC-004, SC-005 |
| C | FR-019–FR-021, SC-006 |
