import type { AuthType, FallbackConfig, ProviderId } from "../core/config-schema.js";
import type { PinnedShas } from "../core/pinned-shas.js";
import { jobEnvFor, methodNeedsClaudeCli, methodNeedsCursorCli } from "../core/secret-names.js";
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
  fallback?: FallbackConfig;
  shas: PinnedShas;
}

function credentialEnvLine(
  provider: ProviderId,
  auth: AuthType,
  opts?: { role?: "primary" | "fallback"; primary?: { provider: ProviderId; auth: AuthType } },
): string {
  const env = jobEnvFor(provider, auth, opts);
  return `          ${env.name}: \${{ secrets.${env.secret} }}`;
}

export function buildWorkflowYaml(opts: WorkflowOptions): string {
  const provider = opts.provider ?? "claude";
  const { auth, shas, fallback } = opts;
  const needClaude = methodNeedsClaudeCli(provider, auth) || (fallback ? methodNeedsClaudeCli(fallback.provider, fallback.auth) : false);
  const needCursor = methodNeedsCursorCli(provider) || (fallback ? methodNeedsCursorCli(fallback.provider) : false);
  const install = `${claudeCliInstallStep(needClaude, shas)}${needCursor ? cursorCliInstallStep() : ""}`;
  const credLines = [
    credentialEnvLine(provider, auth),
    fallback
      ? credentialEnvLine(fallback.provider, fallback.auth, {
          role: "fallback",
          primary: { provider, auth },
        })
      : "",
  ].filter(Boolean);
  const installEnv = reviewInstallEnv(needClaude, needCursor);
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
${credLines.join("\n")}
${installEnv}`;
}

function claudeCliInstallStep(need: boolean, shas: PinnedShas): string {
  if (!need) return "";
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

function reviewInstallEnv(needClaude: boolean, needCursor: boolean): string {
  const lines: string[] = [];
  if (needClaude) {
    lines.push(`          REVIEWERAGENT_CLI_INSTALL_FAILED: \${{ steps.install-claude.outcome == 'failure' }}`);
  }
  if (needCursor) {
    lines.push(`          REVIEWERAGENT_CURSOR_CLI_INSTALL_FAILED: \${{ steps.install-cursor.outcome == 'failure' }}`);
    lines.push(`          REVIEWERAGENT_CURSOR_BIN: \${{ runner.temp }}/cursor-agent/cursor-agent`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
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
