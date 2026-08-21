import { createRequire } from "node:module";
import { vi } from "vitest";
import type { Octokit } from "@octokit/rest";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sodium = require("libsodium-wrappers") as typeof import("libsodium-wrappers");

export class FakeHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FakeHttpError";
  }
}

export interface FakeCheckRun {
  id: number;
  name: string;
  headSha: string;
  conclusion?: string;
  output?: { title?: string; summary?: string };
}

export interface FakeIssueComment {
  id: number;
  body: string;
  user: { login: string };
}

export interface FakeReview {
  id: number;
  body: string;
  user: { login: string };
}

export interface FakePrFile {
  filename: string;
  changes: number;
  patch?: string;
}

export interface FakeWorkflowRun {
  head_sha?: string;
  name?: string;
  pull_requests?: Array<{ head?: { sha?: string } }>;
}

export interface FakeGithub {
  octokit: Octokit;
  keyId: string;
  publicKeyB64: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  secrets: Map<string, { encrypted_value: string; key_id: string }>;
  checks: FakeCheckRun[];
  reviews: FakeReview[];
  issueComments: FakeIssueComment[];
  files: FakePrFile[];
  workflowRuns: FakeWorkflowRun[];
  permissions: Map<string, string>;
  pullRequests: Map<number, {
    number: number;
    title: string;
    body: string;
    draft: boolean;
    user: { login: string };
    head: { sha: string; repo: { full_name: string } };
    base: { sha: string; repo: { full_name: string } };
  }>;
  associatedPulls: Array<{ head: { sha: string } }>;
  defaultBranch: string;
  contentPaths: Set<string>;
  branchProtection: {
    required_status_checks: {
      strict?: boolean;
      contexts?: string[];
      checks?: Array<{ context: string }>;
    } | null;
    enforce_admins?: { enabled?: boolean } | boolean | null;
    required_pull_request_reviews?: unknown;
    restrictions?: unknown;
  } | undefined;
  protectionPuts: unknown[];
  calls: {
    putSecret: Array<{ secret_name: string; encrypted_value: string; key_id: string }>;
    deleteSecret: string[];
    createReview: unknown[];
    updateReview: unknown[];
    createComment: unknown[];
    updateComment: unknown[];
    createCheck: unknown[];
    updateCheck: unknown[];
  };
  decryptSecret(encryptedValue: string): string;
}

function notFound(name: string): FakeHttpError {
  return new FakeHttpError(`${name} not found`, 404);
}

export async function createFakeGithub(): Promise<FakeGithub> {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  const keyId = "test-key-id";
  const publicKeyB64 = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);

  const secrets = new Map<string, { encrypted_value: string; key_id: string }>();
  const checks: FakeCheckRun[] = [];
  const reviews: FakeReview[] = [];
  const issueComments: FakeIssueComment[] = [];
  const files: FakePrFile[] = [
    {
      filename: "src/auth.ts",
      changes: 4,
      patch: "@@ -1,1 +1,3 @@\n function auth() {\n+  return db.query('SELECT * FROM users WHERE token = ' + token);\n }",
    },
  ];
  const workflowRuns: FakeWorkflowRun[] = [];
  const permissions = new Map<string, string>([["alice", "write"]]);
  const pullRequests = new Map();
  const associatedPulls: Array<{ head: { sha: string } }> = [];
  const contentPaths = new Set<string>();
  const protectionPuts: unknown[] = [];
  let branchProtection: FakeGithub["branchProtection"];
  const calls: FakeGithub["calls"] = {
    putSecret: [],
    deleteSecret: [],
    createReview: [],
    updateReview: [],
    createComment: [],
    updateComment: [],
    createCheck: [],
    updateCheck: [],
  };
  let nextCheckId = 1;
  let nextReviewId = 1;
  let nextCommentId = 1;

  const listFiles = vi.fn(async () => ({ data: files }));
  const listReviews = vi.fn(async () => ({ data: reviews }));
  const listComments = vi.fn(async () => ({ data: issueComments }));
  const listWorkflowRuns = vi.fn(async () => ({ data: { workflow_runs: workflowRuns } }));

  const actions = {
    getRepoPublicKey: vi.fn(async () => ({
      data: { key: publicKeyB64, key_id: keyId },
    })),
    createOrUpdateRepoSecret: vi.fn(
      async (params: { secret_name: string; encrypted_value: string; key_id: string }) => {
        secrets.set(params.secret_name, {
          encrypted_value: params.encrypted_value,
          key_id: params.key_id,
        });
        calls.putSecret.push(params);
        return { data: {} };
      },
    ),
    deleteRepoSecret: vi.fn(async (params: { secret_name: string }) => {
      if (!secrets.has(params.secret_name)) throw notFound(params.secret_name);
      secrets.delete(params.secret_name);
      calls.deleteSecret.push(params.secret_name);
      return { data: {} };
    }),
    getRepoSecret: vi.fn(async (params: { secret_name: string }) => {
      if (!secrets.has(params.secret_name)) throw notFound(params.secret_name);
      return { data: { name: params.secret_name } };
    }),
    listWorkflowRuns,
  };

  const octokit = {
    paginate: {
      iterator: async function* (method: unknown) {
        if (method === listFiles) {
          yield { data: files };
          return;
        }
        if (method === listReviews) {
          yield { data: reviews };
          return;
        }
        if (method === listComments) {
          yield { data: issueComments };
          return;
        }
        if (method === listWorkflowRuns) {
          yield { data: workflowRuns };
          return;
        }
        yield { data: [] };
      },
    },
    actions,
    pulls: {
      listFiles,
      listReviews,
      get: vi.fn(async ({ pull_number }: { pull_number: number }) => {
        const pr = pullRequests.get(pull_number);
        if (!pr) throw notFound(`pull ${pull_number}`);
        return { data: pr };
      }),
      createReview: vi.fn(async (params: { body: string; user?: { login: string } }) => {
        const review = {
          id: nextReviewId++,
          body: params.body,
          user: { login: "github-actions[bot]" },
        };
        reviews.push(review);
        calls.createReview.push(params);
        return { data: review };
      }),
      updateReview: vi.fn(async (params: { review_id: number; body: string }) => {
        const review = reviews.find((r) => r.id === params.review_id);
        if (!review) throw notFound(`review ${params.review_id}`);
        review.body = params.body;
        calls.updateReview.push(params);
        return { data: review };
      }),
    },
    checks: {
      listForRef: vi.fn(async ({ ref, check_name }: { ref: string; check_name?: string }) => {
        const matched = checks.filter(
          (c) => c.headSha === ref && (check_name === undefined || c.name === check_name),
        );
        return { data: { check_runs: matched } };
      }),
      create: vi.fn(
        async (params: {
          name: string;
          head_sha: string;
          conclusion: string;
          output?: { title?: string; summary?: string };
        }) => {
          const run: FakeCheckRun = {
            id: nextCheckId++,
            name: params.name,
            headSha: params.head_sha,
            conclusion: params.conclusion,
            output: params.output,
          };
          checks.push(run);
          calls.createCheck.push(params);
          return { data: run };
        },
      ),
      update: vi.fn(
        async (params: {
          check_run_id: number;
          conclusion: string;
          output?: { title?: string; summary?: string };
        }) => {
          const run = checks.find((c) => c.id === params.check_run_id);
          if (!run) throw notFound(`check ${params.check_run_id}`);
          run.conclusion = params.conclusion;
          run.output = params.output;
          calls.updateCheck.push(params);
          return { data: run };
        },
      ),
    },
    issues: {
      listComments,
      createComment: vi.fn(async (params: { issue_number: number; body: string }) => {
        const comment: FakeIssueComment = {
          id: nextCommentId++,
          body: params.body,
          user: { login: "github-actions[bot]" },
        };
        issueComments.push(comment);
        calls.createComment.push(params);
        return { data: comment };
      }),
      updateComment: vi.fn(async (params: { comment_id: number; body: string }) => {
        const comment = issueComments.find((c) => c.id === params.comment_id);
        if (!comment) throw notFound(`comment ${params.comment_id}`);
        comment.body = params.body;
        calls.updateComment.push(params);
        return { data: comment };
      }),
    },
    repos: {
      get: vi.fn(async () => ({ data: { default_branch: "main" } })),
      getContent: vi.fn(async ({ path }: { path: string }) => {
        if (!contentPaths.has(path)) throw notFound(path);
        return { data: { type: "file", path } };
      }),
      getBranchProtection: vi.fn(async () => {
        if (!branchProtection) throw notFound("branch protection");
        return { data: branchProtection };
      }),
      updateBranchProtection: vi.fn(async (params: Record<string, unknown>) => {
        protectionPuts.push(params);
        const checks = (params.required_status_checks as { contexts?: string[]; checks?: Array<{ context: string }> }) ?? {
          contexts: [],
          checks: [],
        };
        branchProtection = {
          required_status_checks: {
            strict: true,
            contexts: checks.contexts ?? [],
            checks: checks.checks ?? (checks.contexts ?? []).map((context) => ({ context })),
          },
          enforce_admins: { enabled: Boolean(params.enforce_admins) },
          required_pull_request_reviews: params.required_pull_request_reviews ?? null,
          restrictions: params.restrictions ?? null,
        };
        return { data: branchProtection };
      }),
      getCollaboratorPermissionLevel: vi.fn(async ({ username }: { username: string }) => {
        const permission = permissions.get(username);
        if (!permission) throw notFound(username);
        return { data: { permission } };
      }),
      listPullRequestsAssociatedWithCommit: vi.fn(async () => ({ data: associatedPulls })),
      compareCommits: vi.fn(async () => ({
        data: {
          files: files.map((f) => ({ filename: f.filename, changes: f.changes, patch: f.patch })),
        },
      })),
    },
    users: {
      getAuthenticated: vi.fn(async () => ({ data: { login: "alice" } })),
    },
  } as unknown as Octokit;

  return {
    octokit,
    keyId,
    publicKeyB64,
    secretKey: kp.privateKey,
    publicKey: kp.publicKey,
    secrets,
    checks,
    reviews,
    issueComments,
    files,
    workflowRuns,
    permissions,
    pullRequests,
    associatedPulls,
    defaultBranch: "main",
    contentPaths,
    get branchProtection() {
      return branchProtection;
    },
    set branchProtection(value) {
      branchProtection = value;
    },
    protectionPuts,
    calls,
    decryptSecret(encryptedValue: string): string {
      const sealed = sodium.from_base64(encryptedValue, sodium.base64_variants.ORIGINAL);
      const opened = sodium.crypto_box_seal_open(sealed, kp.publicKey, kp.privateKey);
      return sodium.to_string(opened);
    },
  };
}
