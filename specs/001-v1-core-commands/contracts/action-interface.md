# GitHub Action Contract: `actions/review`

Source: `SPEC.md` §7 ("Files written to the target repo"), §8, §9. This is
the interface customer workflows depend on via a SHA pin — treat any
change to inputs/outputs here as a breaking change requiring a new commit
SHA customers must re-pin to, not something `upgrade` (later work) can
silently migrate underneath them.

**Location** (locked, not a design choice): `actions/review/action.yml` at
the root of this public repository. Consumed as:

```yaml
uses: <this-repo-owner>/<this-repo-name>/actions/review@<commit-sha>
```

## Required workflow shape around it (what `init` writes)

```yaml
permissions: {}

jobs:
  revieweragent-run:
    name: revieweragent-run      # job id/name; NOT the required check (SPEC §7)
    permissions:
      contents: read
      pull-requests: write
      checks: write
      actions: read
      issues: write              # timeline start/complete comments (v1.1.0)
    steps:
      - uses: actions/checkout@<sha>     # base ref only, no ref: override, persist-credentials: false
      - uses: <owner>/<repo>/actions/review@<sha>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # exactly one of:
          ANTHROPIC_API_KEY: ${{ secrets.REVIEWERAGENT_ANTHROPIC_API_KEY }}
          # or
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN }}
```

The required GitHub Check name is **`revieweragent`** (Checks API), not the
job id. `run-name: revieweragent <pr-head-sha>` is required for the fork cap.

## Inputs (via job env, not `with:`)

The action reads its credential from the job env var matching
`.revieweragent.yml`'s `auth` field — never both set at once (SPEC §7,
§8's verified CLI behavior table: API key present outranks subscription
login, so the "exactly one" rule is load-bearing, not hygiene).

## Outputs / side effects

| Output | Condition |
|---|---|
| PR Review, type `COMMENT` | Every non-no-op run (real review, availability skip, over-limit) |
| Check run `revieweragent` on head SHA, conclusion `success` | PASS, or availability skip (with `Review skipped:` prefix) |
| Check run `revieweragent` on head SHA, conclusion `failure` | BLOCK findings, over-limit in gate mode, or fail-closed infra |
| No check run | Draft PR no-op, comment-gated fork with no `/review`, per-actor fork cap exceeded |
| Process exit code | `1` on BLOCK/fail-closed-infra in gate mode; `0` otherwise |

`neutral` is never used as a conclusion (SPEC §9 — inconsistent handling
across GitHub's docs/UI for required checks).

## Non-goals of this contract

Does not define `merge_group` behavior — out of v1 scope per the feature
spec's Assumptions section; the event handling code should be structured
to accommodate it later (SPEC §8 step 4) without this contract needing to
change shape.
