import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createFakeGithub, type FakeGithub } from "../helpers/fake-octokit.js";
import { createTempGitRepo } from "../helpers/temp-git-repo.js";

const githubState = vi.hoisted(() => ({
  current: undefined as FakeGithub | undefined,
}));

vi.mock("../../src/platform/github/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/github/client.js")>();
  return {
    ...actual,
    createGitHubClient: () => githubState.current!.octokit,
    resolveGitHubToken: () => "ghs_test_token_not_real",
  };
});

import { runInit } from "../../src/cli/init.js";
import { WORKFLOW_MARKER } from "../../src/cli/write-workflow.js";
import { MANAGED_MARKER } from "../../src/core/config-schema.js";

describe("init e2e (temp git repo + real libsodium + fake GitHub)", () => {
  const originalCwd = process.cwd();
  let repo: ReturnType<typeof createTempGitRepo>;

  async function setup() {
    githubState.current = await createFakeGithub();
    repo = createTempGitRepo();
    process.chdir(repo.dir);
    process.env.GITHUB_TOKEN = "ghs_test_token_not_real";
    return githubState.current;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.GITHUB_TOKEN;
    repo?.cleanup();
  });

  it("writes managed workflow + config and seals the api-key secret", async () => {
    const github = await setup();
    await runInit({
      provider: "claude",
      auth: "api-key",
      mode: "gate",
      severity: "high",
      credential: "test-api-key-not-real",
      nonInteractive: true,
      commit: false,
      push: false,
    });

    const workflow = readFileSync(join(repo.dir, ".github/workflows/revieweragent.yml"), "utf8");
    const config = readFileSync(join(repo.dir, ".revieweragent.yml"), "utf8");
    expect(workflow).toContain(WORKFLOW_MARKER);
    expect(workflow).toContain("ANTHROPIC_API_KEY");
    expect(workflow).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(config).toContain(MANAGED_MARKER);
    expect(config).toContain("mode: gate");
    expect(config).toContain("auth: api-key");
    expect(github.calls.putSecret.map((s) => s.secret_name)).toEqual(["REVIEWERAGENT_ANTHROPIC_API_KEY"]);
    expect(github.decryptSecret(github.calls.putSecret[0]!.encrypted_value)).toBe("test-api-key-not-real");
    expect(github.calls.deleteSecret).toEqual([]);
  });

  it("writes the subscription secret and not the api-key secret", async () => {
    const github = await setup();
    await runInit({
      provider: "claude",
      auth: "subscription",
      mode: "advisory",
      severity: "high",
      credential: "oauth-test-token-not-real",
      nonInteractive: true,
      commit: false,
      push: false,
    });
    expect(github.calls.putSecret.map((s) => s.secret_name)).toEqual(["REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN"]);
    const workflow = readFileSync(join(repo.dir, ".github/workflows/revieweragent.yml"), "utf8");
    expect(workflow).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(workflow).not.toContain("ANTHROPIC_API_KEY");
  });

  it("deletes the unused auth secret after files land", async () => {
    const github = await setup();
    await github.octokit.actions.createOrUpdateRepoSecret({
      owner: "acme",
      repo: "widgets",
      secret_name: "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
      encrypted_value: "placeholder",
      key_id: github.keyId,
    });
    github.calls.putSecret.length = 0;

    await runInit({
      provider: "claude",
      auth: "api-key",
      mode: "advisory",
      severity: "high",
      credential: "test-api-key-not-real",
      nonInteractive: true,
      commit: false,
      push: false,
    });

    expect(github.calls.putSecret.map((s) => s.secret_name)).toEqual(["REVIEWERAGENT_ANTHROPIC_API_KEY"]);
    expect(github.calls.deleteSecret).toEqual(["REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN"]);
    const putIdx = github.calls.putSecret.length;
    expect(putIdx).toBe(1);
    expect(await github.octokit.actions.getRepoSecret({ secret_name: "REVIEWERAGENT_ANTHROPIC_API_KEY" })).toBeDefined();
    await expect(
      github.octokit.actions.getRepoSecret({ secret_name: "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an unmarked existing config without writing secrets", async () => {
    const github = await setup();
    writeFileSync(join(repo.dir, ".revieweragent.yml"), "version: 1\nmode: advisory\n");
    await expect(
      runInit({
        provider: "claude",
        auth: "api-key",
        mode: "advisory",
        severity: "high",
        credential: "test-api-key-not-real",
        nonInteractive: true,
        commit: false,
        push: false,
      }),
    ).rejects.toMatchObject({ name: "UnmanagedConfigConflictError" });
    expect(github.calls.putSecret).toHaveLength(0);
    expect(existsSync(join(repo.dir, ".github/workflows/revieweragent.yml"))).toBe(false);
  });

  it("refuses an unmarked existing workflow without writing secrets", async () => {
    const github = await setup();
    mkdirSync(join(repo.dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(repo.dir, ".github/workflows/revieweragent.yml"), "name: not-ours\n");
    await expect(
      runInit({
        provider: "claude",
        auth: "api-key",
        mode: "advisory",
        severity: "high",
        credential: "test-api-key-not-real",
        nonInteractive: true,
        commit: false,
        push: false,
      }),
    ).rejects.toMatchObject({ name: "UnmarkedWorkflowConflictError" });
    expect(github.calls.putSecret).toHaveLength(0);
  });
});
