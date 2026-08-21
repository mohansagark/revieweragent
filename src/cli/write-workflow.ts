import type { AuthType, ProviderId } from "../core/config-schema.js";
import type { PinnedShas } from "../core/pinned-shas.js";
import { jobEnvFor } from "../core/secret-names.js";
import { CURSOR_CLI_VERSION, CURSOR_TARBALL_SHA256 } from "../provider/cursor/agent.js";

export { CURSOR_CLI_VERSION };

export const WORKFLOW_MANAGED_HEADER = [
  "# Managed by revieweragent (npmjs.com/package/revieweragent)",
  "# Managed file — local edits are overwritten by init/upgrade.",
  "# Safe to delete; re-running init recreates it. Uninstall removes it.",
].join("\n");

export const WORKFLOW_MARKER = "Managed by revieweragent";

export const JOB_NAME = "revieweragent";
export const WORKFLOW_JOB_ID = "revieweragent-run";

export const CLAUDE_CLI_VERSION = "2.1.235";

export interface WorkflowOptions {
  auth: AuthType;
  provider?: ProviderId;
  shas: PinnedShas;
}

function credentialEnvLine(provider: ProviderId, auth: AuthType): string {
  const env = jobEnvFor(provider, auth);
  return `          ${env.name}: \${{ secrets.${env.secret} }}`;
}

export function buildWorkflowYaml(opts: WorkflowOptions): string {
  const provider = opts.provider ?? "claude";
  const { auth, shas } = opts;
  const install = provider === "cursor" ? cursorCliInstallStep() : claudeCliInstallStep(auth, shas);
  const installEnv = provider === "cursor" ? cursorInstallEnv() : subscriptionInstallEnv(auth);
  return `${WORKFLOW_MANAGED_HEADER}

# run-name carries the PR head SHA so the per-actor fork cap can find the
# revieweragent check when GitHub's Actions API leaves pull_requests empty
# (cross-repo / forked PRs). merge_group.head_sha covers the merge queue.
run-name: revieweragent \${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}

on:
  pull_request_target:
    types: [opened, synchronize, ready_for_review]
  issue_comment:
    types: [created]
  merge_group:

concurrency:
  group: revieweragent-\${{ github.event.pull_request.number || github.event.issue.number || github.event.merge_group.head_sha }}
  cancel-in-progress: true

permissions: {}

jobs:
  ${WORKFLOW_JOB_ID}:
    name: ${WORKFLOW_JOB_ID}
    # Drafts never run at all: GitHub natively blocks merging a draft PR
    # regardless of check status, so skipping here is safe (unlike the
    # other no-op cases, which stay code-side — see review-skip-rules.ts).
    # issue_comment noise (comments on issues, not PRs) is dropped the
    # same way — SPEC.md §9: "Job-level if: is allowed only to drop
    # obvious non-PR issue_comment noise."
    if: |-
      (github.event_name != 'pull_request_target' || github.event.pull_request.draft == false) &&
      (github.event_name != 'issue_comment' || github.event.issue.pull_request != null)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
      checks: write
      actions: read
    steps:
      - uses: actions/checkout@${shas.checkoutSha}
        with:
          persist-credentials: false
${install}      - uses: ${shas.actionOwner}/${shas.actionRepo}/actions/review@${shas.reviewActionSha}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
${credentialEnvLine(provider, auth)}
${installEnv}`;
}

function claudeCliInstallStep(auth: AuthType, shas: PinnedShas): string {
  if (auth !== "subscription") return "";
  return `      - uses: actions/cache@${shas.cacheSha}
        with:
          path: ~/.npm
          key: revieweragent-claude-code-${CLAUDE_CLI_VERSION}
      - id: install-claude
        continue-on-error: true
        run: npm install -g @anthropic-ai/claude-code@${CLAUDE_CLI_VERSION}
`;
}

function cursorCliInstallStep(): string {
  return `      - id: install-cursor
        continue-on-error: true
        env:
          CURSOR_CLI_VERSION: ${CURSOR_CLI_VERSION}
          CURSOR_SHA_X64: ${CURSOR_TARBALL_SHA256.x64}
          CURSOR_SHA_ARM64: ${CURSOR_TARBALL_SHA256.arm64}
        run: |
          set -euo pipefail
          ARCH="$(uname -m)"
          case "$ARCH" in
            x86_64|amd64) ARCH=x64; EXPECTED="$CURSOR_SHA_X64" ;;
            aarch64|arm64) ARCH=arm64; EXPECTED="$CURSOR_SHA_ARM64" ;;
            *) echo "unsupported arch $ARCH"; exit 1 ;;
          esac
          URL="https://downloads.cursor.com/lab/\${CURSOR_CLI_VERSION}/linux/\${ARCH}/agent-cli-package.tar.gz"
          curl -fsSL "$URL" -o "$RUNNER_TEMP/cursor-agent.tgz"
          GOT="$(sha256sum "$RUNNER_TEMP/cursor-agent.tgz" | awk '{print $1}')"
          test "$GOT" = "$EXPECTED"
          mkdir -p "$RUNNER_TEMP/cursor-agent"
          tar --strip-components=1 -xzf "$RUNNER_TEMP/cursor-agent.tgz" -C "$RUNNER_TEMP/cursor-agent"
`;
}

function subscriptionInstallEnv(auth: AuthType): string {
  if (auth !== "subscription") return "";
  return `          REVIEWERAGENT_CLI_INSTALL_FAILED: \${{ steps.install-claude.outcome == 'failure' }}
`;
}

function cursorInstallEnv(): string {
  return `          REVIEWERAGENT_CLI_INSTALL_FAILED: \${{ steps.install-cursor.outcome == 'failure' }}
          REVIEWERAGENT_CURSOR_BIN: \${{ runner.temp }}/cursor-agent/cursor-agent
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
