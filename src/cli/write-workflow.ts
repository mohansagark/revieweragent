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

// Locked — renaming breaks every gate-mode install (SPEC.md §7).
export const JOB_NAME = "revieweragent";

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
  ${JOB_NAME}:
    name: ${JOB_NAME}
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
      - uses: ${shas.actionOwner}/${shas.actionRepo}/actions/review@${shas.reviewActionSha}
        env:
${credentialEnvLine(auth)}
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
