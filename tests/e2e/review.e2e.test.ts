import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeGithub, type FakeGithub } from "../helpers/fake-octokit.js";
import { createTempGitRepo, writeEventPayload } from "../helpers/temp-git-repo.js";
import { serializeConfig, defaultConfig } from "../../src/core/config-schema.js";
import { ModelBackendError } from "../../src/provider/claude/subscription.js";

const githubState = vi.hoisted(() => ({
  current: undefined as FakeGithub | undefined,
  subscription: vi.fn(),
  apiKey: vi.fn(),
}));

vi.mock("../../src/platform/github/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/github/client.js")>();
  return {
    ...actual,
    createGitHubClient: () => githubState.current!.octokit,
    resolveGitHubToken: () => "ghs_test_token_not_real",
  };
});

vi.mock("../../src/provider/claude/subscription.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/provider/claude/subscription.js")>();
  return {
    ...actual,
    callSubscriptionBackend: (...args: unknown[]) => githubState.subscription(...args),
  };
});

vi.mock("../../src/provider/claude/api-key.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/provider/claude/api-key.js")>();
  return {
    ...actual,
    callApiKeyBackend: (...args: unknown[]) => githubState.apiKey(...args),
  };
});

import { runReview } from "../../src/cli/review.js";

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PASS_JSON = JSON.stringify({ summary: "Looks good", findings: [] });
const BLOCK_JSON = JSON.stringify({
  summary: "SQL injection",
  findings: [
    {
      severity: "high",
      file: "src/auth.ts",
      line: 2,
      message: "string-concatenated SQL",
    },
  ],
});

function sameRepoEvent() {
  return {
    action: "opened",
    pull_request: {
      number: 42,
      draft: false,
      title: "Add widgets",
      body: "Please review",
      head: { sha: HEAD, repo: { full_name: "acme/widgets" }, user: { login: "alice" } },
      base: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", repo: { full_name: "acme/widgets" } },
      user: { login: "alice" },
    },
    repository: { full_name: "acme/widgets" },
  };
}

function forkEvent() {
  const event = sameRepoEvent();
  event.pull_request.head.repo = { full_name: "outsider/widgets" };
  event.pull_request.head.user = { login: "outsider" };
  event.pull_request.user = { login: "outsider" };
  return event;
}

describe("review e2e (temp repo + fake GitHub + mocked model)", () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let repo: ReturnType<typeof createTempGitRepo>;

  async function setup(opts?: {
    config?: Parameters<typeof defaultConfig>[0];
    event?: unknown;
    eventName?: string;
    extraEnv?: Record<string, string>;
  }) {
    githubState.current = await createFakeGithub();
    githubState.subscription.mockReset();
    githubState.apiKey.mockReset();
    githubState.subscription.mockResolvedValue(PASS_JSON);
    githubState.apiKey.mockResolvedValue(PASS_JSON);

    repo = createTempGitRepo();
    process.chdir(repo.dir);
    writeFileSync(join(repo.dir, ".revieweragent.yml"), serializeConfig(defaultConfig(opts?.config)));
    const eventPath = writeEventPayload(repo.dir, opts?.event ?? sameRepoEvent());
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_REPOSITORY = "acme/widgets";
    process.env.GITHUB_TOKEN = "ghs_test_token_not_real";
    process.env.GITHUB_EVENT_NAME = opts?.eventName ?? "pull_request_target";
    process.env.GITHUB_EVENT_PATH = eventPath;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    Object.assign(process.env, opts?.extraEnv ?? {});
    return githubState.current;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    repo?.cleanup();
  });

  it("returns 1 outside GitHub Actions", async () => {
    await setup();
    delete process.env.GITHUB_ACTIONS;
    await expect(runReview()).resolves.toBe(1);
  });

  it("posts a COMMENT review and a success check on PASS (advisory)", async () => {
    const github = await setup({ config: { mode: "advisory", auth: "subscription" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(1);
    expect(github.calls.createCheck).toHaveLength(1);
    expect(github.calls.createComment.map((c) => (c as { body: string }).body)).toEqual([
      "🔍 **Review starting**",
      "✅ **Review completed**",
    ]);
    expect(github.checks[0]?.conclusion).toBe("success");
    expect(github.checks[0]?.headSha).toBe(HEAD);
  });

  it("gate mode BLOCKs on a high finding and exits 1", async () => {
    const github = await setup({ config: { mode: "gate", auth: "subscription", block_severity: "high" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    githubState.subscription.mockResolvedValue(BLOCK_JSON);
    await expect(runReview()).resolves.toBe(1);
    expect(github.checks[0]?.conclusion).toBe("failure");
    expect(github.calls.createComment.map((c) => (c as { body: string }).body)).toEqual([
      "🔍 **Review starting**",
      "⚠️ **Review completed** — findings posted on the diff.",
    ]);
    const review = github.calls.createReview[0] as { comments?: unknown[] };
    expect(review.comments?.length).toBeGreaterThan(0);
  });

  it("advisory BLOCK still exits 0", async () => {
    await setup({ config: { mode: "advisory", auth: "subscription" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    githubState.subscription.mockResolvedValue(BLOCK_JSON);
    await expect(runReview()).resolves.toBe(0);
  });

  it("fail-closes when config is missing", async () => {
    const github = await setup();
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    writeFileSync(join(repo.dir, ".revieweragent.yml"), "");
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(repo.dir, ".revieweragent.yml"));
    await expect(runReview()).resolves.toBe(1);
    expect(github.checks[0]?.conclusion).toBe("failure");
    expect(github.checks[0]?.output?.summary).toMatch(/not found/);
  });

  it("fail-closes on invalid config enums", async () => {
    const github = await setup();
    writeFileSync(join(repo.dir, ".revieweragent.yml"), "version: 1\nauth: oauth\nmode: advisory\n");
    await expect(runReview()).resolves.toBe(1);
    expect(github.checks[0]?.conclusion).toBe("failure");
  });

  it("no-ops a draft PR without posting a check", async () => {
    const event = sameRepoEvent();
    event.pull_request.draft = true;
    const github = await setup({ event });
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createCheck).toHaveLength(0);
    expect(github.calls.createReview).toHaveLength(0);
    expect(github.calls.createComment).toHaveLength(0);
  });

  it("no-ops comment-gated fork PRs", async () => {
    const github = await setup({
      event: forkEvent(),
      config: { fork_policy: "comment-gated" },
    });
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(0);
    expect(github.calls.createComment).toHaveLength(0);
  });

  it("enforces the per-actor fork cap and no-ops when exceeded", async () => {
    const github = await setup({
      event: forkEvent(),
      config: { fork_policy: "auto", max_fork_reviews_per_actor_per_hour: 1, auth: "subscription" },
    });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    github.workflowRuns.push({ name: `revieweragent ${HEAD}` });
    github.checks.push({ id: 9, name: "revieweragent", headSha: HEAD, conclusion: "success" });
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(0);
    expect(github.calls.createComment).toHaveLength(0);
  });

  it("reviews a fork PR under the cap", async () => {
    const github = await setup({
      event: forkEvent(),
      config: { fork_policy: "auto", auth: "subscription" },
    });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(1);
  });

  it("skips issue_comment without the trigger phrase", async () => {
    const github = await setup({
      eventName: "issue_comment",
      event: {
        action: "created",
        issue: { number: 42, pull_request: {} },
        comment: { body: "lgtm", user: { login: "alice" } },
        repository: { full_name: "acme/widgets" },
      },
    });
    github.pullRequests.set(42, {
      number: 42,
      title: "Add widgets",
      body: "",
      draft: false,
      user: { login: "alice" },
      head: { sha: HEAD, repo: { full_name: "acme/widgets" } },
      base: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", repo: { full_name: "acme/widgets" } },
    });
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(0);
    expect(github.calls.createComment).toHaveLength(0);
  });

  it("runs on a write-access /review comment", async () => {
    const github = await setup({
      eventName: "issue_comment",
      config: { auth: "subscription" },
      event: {
        action: "created",
        issue: { number: 42, pull_request: {} },
        comment: { body: "/review please", user: { login: "alice" } },
        repository: { full_name: "acme/widgets" },
      },
    });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    github.pullRequests.set(42, {
      number: 42,
      title: "Add widgets",
      body: "",
      draft: false,
      user: { login: "alice" },
      head: { sha: HEAD, repo: { full_name: "acme/widgets" } },
      base: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", repo: { full_name: "acme/widgets" } },
    });
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(1);
  });

  it("gate-blocks an over-limit diff", async () => {
    const github = await setup({
      config: { mode: "gate", max_diff_lines: 1, auth: "subscription" },
    });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    github.files[0]!.changes = 50;
    await expect(runReview()).resolves.toBe(1);
    expect(githubState.subscription).not.toHaveBeenCalled();
    expect(github.checks[0]?.conclusion).toBe("failure");
    expect(github.checks[0]?.output?.summary).toMatch(/too large/i);
  });

  it("availability-skips an over-limit advisory diff", async () => {
    const github = await setup({
      config: { mode: "advisory", on_limit: "skip", max_diff_lines: 1, auth: "subscription" },
    });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    github.files[0]!.changes = 50;
    await expect(runReview()).resolves.toBe(0);
    expect(github.checks[0]?.conclusion).toBe("success");
    expect(github.checks[0]?.output?.title).toMatch(/Review skipped/);
  });

  it("fail-closes when ANTHROPIC_API_KEY is mixed into a subscription job", async () => {
    const github = await setup({
      config: { auth: "subscription" },
      extraEnv: { ANTHROPIC_API_KEY: "test-api-key-not-real", CLAUDE_CODE_OAUTH_TOKEN: "oauth-test-token-not-real" },
    });
    await expect(runReview()).resolves.toBe(0);
    expect(github.checks[0]?.conclusion).toBe("failure");
    expect(github.checks[0]?.output?.summary).toMatch(/mix credentials/);
  });

  it("availability-skips subscription quota 400s", async () => {
    const github = await setup({ config: { mode: "gate", auth: "subscription" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    githubState.subscription.mockRejectedValue(
      new ModelBackendError("Claude Code plan-quota error", {
        kind: "http_400",
        auth: "subscription",
        quotaSignal: true,
      }),
    );
    await expect(runReview()).resolves.toBe(0);
    expect(github.checks[0]?.conclusion).toBe("success");
    expect(github.checks[0]?.output?.title).toMatch(/Review skipped/);
  });

  it("fail-closes invalid model JSON in gate mode", async () => {
    const github = await setup({ config: { mode: "gate", auth: "subscription" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    githubState.subscription.mockResolvedValue("not json");
    await expect(runReview()).resolves.toBe(1);
    expect(github.checks[0]?.conclusion).toBe("failure");
  });

  it("updates an existing bot review instead of stacking a second COMMENT", async () => {
    const github = await setup({ config: { auth: "subscription" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    github.reviews.push({
      id: 77,
      user: { login: "github-actions[bot]" },
      body: `old\n\n<!-- revieweragent-commit:${HEAD} -->`,
    });
    await expect(runReview()).resolves.toBe(0);
    expect(github.calls.createReview).toHaveLength(0);
    expect(github.calls.updateReview).toHaveLength(1);
  });

  it("still writes a failure check when the Reviews API rejects the review", async () => {
    const github = await setup({ config: { mode: "gate", auth: "subscription" } });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    github.octokit.pulls.createReview = async () => {
      throw new Error("Validation Failed: line not part of the diff");
    };
    await expect(runReview()).rejects.toThrow(/Validation Failed/);
    expect(github.checks[0]?.conclusion).toBe("failure");
    expect(github.checks[0]?.headSha).toBe(HEAD);
    expect(github.calls.createComment.map((c) => (c as { body: string }).body)).toEqual([
      "🔍 **Review starting**",
      "⚠️ **Review completed** — findings posted on the diff.",
    ]);
  });

  it("uses the api-key backend when config.auth is api-key", async () => {
    await setup({
      config: { auth: "api-key" },
      extraEnv: { ANTHROPIC_API_KEY: "test-api-key-not-real" },
    });
    await expect(runReview()).resolves.toBe(0);
    expect(githubState.apiKey).toHaveBeenCalledOnce();
    expect(githubState.subscription).not.toHaveBeenCalled();
  });
});
