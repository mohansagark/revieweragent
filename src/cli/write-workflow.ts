import type { AuthType } from "../core/config-schema.js";
import type { PinnedShas } from "../core/pinned-shas.js";

// SPEC.md §7 / §9: the generated workflow. Every line here traces to a
// locked decision — do not add `pull_request`, do not add `merge_group`
// (not in v1, SPEC §0/§8 step 4), never set `ref:` on checkout, never
// both credential env vars.

export const WORKFLOW_MANAGED_HEADER = [
  "# Managed by revieweragent (npmjs.com/package/revieweragent)",
  "# Managed file — local edits are overwritten by init/upgrade.",
  "# Safe to delete; re-running init recreates it. Uninstall removes it.",
].join("\n");

export const WORKFLOW_MARKER = "Managed by revieweragent";

// Locked — renaming breaks every gate-mode install (SPEC.md §7). This is
// the Checks API name required in branch protection, NOT the workflow
// job id/name — GitHub auto-creates its own check run named after the
// job the instant the job starts, and (per a Feb 2025 GitHub policy
// change, confirmed empirically) blocks the default GITHUB_TOKEN from
// updating that auto-check's conclusion via the API. Giving the job a
// different id than this check name avoids that collision entirely.
export const JOB_NAME = "revieweragent";
export const WORKFLOW_JOB_ID = "revieweragent-run";

// SPEC.md §7/§8: "CI uses a pinned copy, not the operator's global CLI."
// Real bug found in manual testing: this install step didn't exist at
// all — the subscription backend spawned `claude` assuming it was
// already on PATH, which it never is on a fresh runner. The spawn failed
// with ENOENT, silently misclassified as an availability-skip (no
// logging), and reported a false "pass" — the model was never actually
// called. Version matches the CLI build SPEC.md §8 verified end-to-end.
export const CLAUDE_CLI_VERSION = "2.1.235";

export interface WorkflowOptions {
  auth: AuthType;
  shas: PinnedShas;
}

function credentialEnvLine(auth: AuthType): string {
  return auth === "api-key"
    ? "          ANTHROPIC_API_KEY: ${{ secrets.REVIEWERAGENT_ANTHROPIC_API_KEY }}"
    : "          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN }}";
}

export function buildWorkflowYaml(opts: WorkflowOptions): string {
  const { auth, shas } = opts;
  return `${WORKFLOW_MANAGED_HEADER}

# run-name carries the PR head SHA so the per-actor fork cap can find the
# revieweragent check when GitHub's Actions API leaves pull_requests empty
# (cross-repo / forked PRs). github.sha is the fallback for issue_comment.
run-name: revieweragent \${{ github.event.pull_request.head.sha || github.sha }}

on:
  pull_request_target:
    types: [opened, synchronize, ready_for_review]
  issue_comment:
    types: [created]

concurrency:
  group: revieweragent-\${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: true

permissions: {}

jobs:
  ${WORKFLOW_JOB_ID}:
    name: ${WORKFLOW_JOB_ID}
    # Drafts never run at all: GitHub natively blocks merging a draft PR
    # regardless of check status, so skipping here is safe (unlike the
    # other no-op cases, which stay code-side — see review-skip-rules.ts).
    if: github.event_name != 'pull_request_target' || github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
      actions: read
    steps:
      - uses: actions/checkout@${shas.checkoutSha}
        with:
          persist-credentials: false
${claudeCliInstallStep(auth)}      - uses: ${shas.actionOwner}/${shas.actionRepo}/actions/review@${shas.reviewActionSha}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
${credentialEnvLine(auth)}
${subscriptionInstallEnv(auth)}`;
}

function claudeCliInstallStep(auth: AuthType): string {
  if (auth !== "subscription") return "";
  // continue-on-error: SPEC.md §7/§9 — npm install failure is an
  // availability skip, not fail-closed. The review step reads
  // REVIEWERAGENT_CLI_INSTALL_FAILED and classifies ENOENT accordingly.
  return `      - id: install-claude
        continue-on-error: true
        run: npm install -g @anthropic-ai/claude-code@${CLAUDE_CLI_VERSION}
`;
}

function subscriptionInstallEnv(auth: AuthType): string {
  if (auth !== "subscription") return "";
  return `          REVIEWERAGENT_CLI_INSTALL_FAILED: \${{ steps.install-claude.outcome == 'failure' }}
`;
}

export class UnmarkedWorkflowConflictError extends Error {
  constructor(path: string) {
    super(
      `${path} already exists without the revieweragent ownership marker. Refusing to overwrite — ` +
        "rename or remove it manually, then re-run init.",
    );
    this.name = "UnmarkedWorkflowConflictError";
  }
}

export function isManagedWorkflow(raw: string): boolean {
  return raw.includes(WORKFLOW_MARKER);
}

/**
 * SPEC.md §7: re-run with marker present -> warn + overwrite (the warning
 * itself is the CLI layer's job, not this pure function's). File exists
 * without the marker -> refuse.
 */
export function resolveWorkflowWrite(
  path: string,
  existingRaw: string | undefined,
  newContent: string,
): { content: string; wasOverwrite: boolean } {
  if (existingRaw === undefined) {
    return { content: newContent, wasOverwrite: false };
  }
  if (!isManagedWorkflow(existingRaw)) {
    throw new UnmarkedWorkflowConflictError(path);
  }
  return { content: newContent, wasOverwrite: true };
}
