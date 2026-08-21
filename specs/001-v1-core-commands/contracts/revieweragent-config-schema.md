# Config Contract: `.revieweragent.yml`

Source: `SPEC.md` §7. Loaded from the **base branch** only, never PR head.

```yaml
version: 1                  # required; unrecognized -> fail job (gate: fail-closed, advisory: error review)
provider: claude             # claude | cursor | gemini
auth: subscription           # subscription | api-key — must match the live repo secret
# fallback:                  # optional different-method retry on 429 / subscription quota
#   provider: gemini
#   auth: api-key
mode: advisory                # advisory | gate
block_severity: high         # any | critical | high | medium | low
max_diff_lines: 4000
max_prompt_tokens: 80000
on_limit: skip                # advisory only: skip | block. Gate mode ignores this — always blocks over-limit.
max_fork_reviews_per_actor_per_hour: 5
fork_policy: auto             # auto | comment-gated
trigger_phrase: "/review"
exclude:
  - "**/package-lock.json"
  - "**/yarn.lock"
  - "**/pnpm-lock.yaml"
  - "**/bun.lockb"
  - "**/go.sum"
  - "**/Cargo.lock"
  - "**/dist/**"
  - "**/build/**"
  - "**/coverage/**"
  - "**/*.min.js"
  - "**/*.min.css"
  - "**/*.{png,jpg,jpeg,gif,webp,ico,pdf,zip,gz,tgz,wasm,bin}"
```

**Write contract**: Installer writes this file with a managed-file header
comment. Re-run overwrites only on confirm, and merges into any existing
file preserving unknown keys/comments where possible. If the file exists
and is not valid YAML, the installer refuses rather than clobbering it.

**Read contract** (`review` runtime): unknown keys are ignored with a CI
warning, not an error. `version` absent/unrecognized fails the job
(fail-closed in gate mode, error review in advisory). `auth` here must
correspond to the credential actually present in the job env — mismatches
are a fail-closed infra condition, not silently patched.
