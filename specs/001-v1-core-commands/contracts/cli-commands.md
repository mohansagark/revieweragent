# CLI Contract: `init`, `review`, `uninstall`

Source: `SPEC.md` §4, §5, §8, §15. This is the non-interactive contract —
the interactive prompt flow wraps the same engine (SPEC §4: "The prompt UI
is a layer over a non-interactive engine").

## `revieweragent init`

```
npx revieweragent init \
  --provider claude \
  --auth subscription|api-key \
  --mode advisory|gate \
  --severity <critical|high|medium|low> \
  [--oauth-token <token> | --api-key <key>] \
  [--commit [--push]] \
  --non-interactive
```

**Preconditions** (non-interactive mode): GitHub auth available (`gh` logged
in, or `GH_TOKEN`/`GITHUB_TOKEN` with §6 scopes) AND the matching credential
flag/env for the chosen `--auth`.

**Exit codes**:
| Code | Meaning |
|---|---|
| 0 | Install written successfully |
| 1 | Missing required input (non-interactive) — machine-readable error to stderr, no prompts (FR-007) |
| 1 | Unmarked file conflict at a managed path — refused (FR-006) |

**Side effects**: writes `.github/workflows/revieweragent.yml`,
`.revieweragent.yml`; prints (never writes) the CODEOWNERS block and
branch-protection instructions; creates/updates exactly one repo secret
matching `--auth`; deletes the other auth's secret if switching (after
confirm in interactive mode). Never touches git working tree/remote unless
`--commit`/`--push` passed (FR-009).

**Idempotency**: safe to re-run; managed files with the ownership marker are
overwritten (warn first in interactive mode); files without the marker are
never touched.

## `revieweragent review`

Not a user-facing CLI entrypoint — invoked only by the bundled GitHub
Action (`actions/review`) inside the Actions runtime. Exits 1 immediately
if invoked outside an Actions environment (SPEC §8, "Runs only in GitHub
Actions").

**Inputs** (from the Actions event context, not CLI flags): event name
(`pull_request_target` | `issue_comment` | `merge_group`), PR number, head
SHA, base SHA, `.revieweragent.yml` + `.revieweragent/instructions.md` from
the base-branch checkout.

**Exit codes**:
| Code | Condition |
|---|---|
| 0 | PASS, advisory mode (any outcome), or availability skip |
| 1 | BLOCK findings or fail-closed infra failure, in gate mode |

**Side effects**: posts/updates one PR Review (type `COMMENT`); creates or
updates one check run named `revieweragent` on the relevant head SHA, when
a conclusion applies (FR-010, FR-014, FR-015, FR-017).

## `revieweragent uninstall`

```
npx revieweragent uninstall \
  [--delete-secret] \
  [--delete-local-credentials] \
  --non-interactive --yes
```

**Preconditions** (non-interactive): `--yes` required or the command
refuses to perform destructive steps (FR-019).

**Exit codes**:
| Code | Meaning |
|---|---|
| 0 | Uninstall completed (files removed per marker rules) |
| 1 | `--non-interactive` without `--yes` |

**Side effects**: deletes `.github/workflows/revieweragent.yml` only if
ownership marker present (refuses otherwise); deletes
`.revieweragent.yml`/`.revieweragent/` if installer-written; deletes repo
secret only if `--delete-secret` (or interactive confirm); leaves local
credential cache untouched unless `--delete-local-credentials`; prints a
loud manual-removal warning for any required-check setting, since v1 never
applied it automatically (FR-020).
