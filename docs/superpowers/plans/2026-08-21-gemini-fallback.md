# Gemini Model + optional fallback Implementation Plan

> **For agentic workers:** Execute inline in this session. Spec: `docs/superpowers/specs/2026-08-21-gemini-fallback-design.md`.

**Goal:** Add Gemini as a live Model provider and an optional different-method fallback that runs only on primary 429/subscription-quota.

**Architecture:** Registry + config `fallback` block; split CLI-failed env vars; `isFallbackTrigger`; `review.ts` dispatches by provider then retries fallback; workflow emits the union of CLIs and mapped secrets.

**Tech Stack:** TypeScript, vitest, existing GitHub Action bundle (`npm run build:action`).

## Global Constraints

- Fallback method !== primary `(provider, auth)`
- Trigger = 429 or subscription quota 400 only
- Dual-quota / missing fallback secret → fail-closed
- Never put `ANTHROPIC_API_KEY` in Claude CLI env when primary is subscription
- No OpenAI/Copilot; Claude subscription stays default
- Rebuild action dist in this PR; pin SHA only after dist is on main (follow-up if squash)

## File map

- Create: `src/core/fallback-trigger.ts`, `src/provider/gemini/registry-entry.ts`, `src/provider/gemini/api-key.ts`, `src/provider/gemini/api-key-credential.ts`
- Modify: config-schema, secret-names, write-workflow, review.ts, init.ts, upgrade.ts, rotate-secret.ts, uninstall, index.ts, registry, cursor backend, credential-cache, SPEC.md, constitution, README, RELEASE_NOTES
- Tests: unit fallback-trigger, config, secrets/workflow, gemini classify; e2e review fallback; init-options

## Tasks

1. `isFallbackTrigger` + tests
2. Config: `gemini` provider + optional `fallback`
3. Secrets + workflow union + split CLI flags
4. Gemini HTTP backend + credential validation
5. `review.ts` provider dispatch + fallback retry
6. init / upgrade / rotate / uninstall
7. Docs (SPEC, constitution, README, release notes)
8. Full test + lint + typecheck; rebuild action dist
