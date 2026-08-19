import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeGithub, type FakeGithub } from "../helpers/fake-octokit.js";
import { createTempGitRepo } from "../helpers/temp-git-repo.js";
import { serializeConfig, defaultConfig, MANAGED_HEADER } from "../../src/core/config-schema.js";
import { WORKFLOW_MANAGED_HEADER } from "../../src/cli/write-workflow.js";

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

import { runUninstall, uninstall, RefusedWithoutConsentError } from "../../src/cli/uninstall.js";

describe("uninstall e2e (temp git repo + fake GitHub)", () => {
  const originalCwd = process.cwd();
  let repo: ReturnType<typeof createTempGitRepo>;

  async function setup(opts?: { configRaw?: string; workflowRaw?: string; seedSecret?: string }) {
    githubState.current = await createFakeGithub();
    repo = createTempGitRepo();
    process.chdir(repo.dir);
    process.env.GITHUB_TOKEN = "ghs_test_token_not_real";
    mkdirSync(join(repo.dir, ".github/workflows"), { recursive: true });
    writeFileSync(
      join(repo.dir, ".github/workflows/revieweragent.yml"),
      opts?.workflowRaw ?? `${WORKFLOW_MANAGED_HEADER}\nname: revieweragent\n`,
    );
    writeFileSync(
      join(repo.dir, ".revieweragent.yml"),
      opts?.configRaw ?? serializeConfig(defaultConfig({ auth: "api-key" })),
    );
    if (opts?.seedSecret) {
      await githubState.current.octokit.actions.createOrUpdateRepoSecret({
        owner: "acme",
        repo: "widgets",
        secret_name: opts.seedSecret,
        encrypted_value: "placeholder",
        key_id: githubState.current.keyId,
      });
      githubState.current.calls.deleteSecret.length = 0;
    }
    return githubState.current;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.GITHUB_TOKEN;
    repo?.cleanup();
  });

  it("refuses --non-interactive without --yes and leaves files in place", async () => {
    await setup();
    await expect(
      runUninstall({
        nonInteractive: true,
        yes: false,
        deleteSecret: false,
        deleteLocalCredentials: false,
      }),
    ).rejects.toBeInstanceOf(RefusedWithoutConsentError);
    expect(existsSync(join(repo.dir, ".revieweragent.yml"))).toBe(true);
    expect(existsSync(join(repo.dir, ".github/workflows/revieweragent.yml"))).toBe(true);
  });

  it("removes managed files and optionally the repo secret", async () => {
    const github = await setup({ seedSecret: "REVIEWERAGENT_ANTHROPIC_API_KEY" });
    await runUninstall({
      nonInteractive: true,
      yes: true,
      deleteSecret: true,
      deleteLocalCredentials: false,
    });
    expect(existsSync(join(repo.dir, ".revieweragent.yml"))).toBe(false);
    expect(existsSync(join(repo.dir, ".github/workflows/revieweragent.yml"))).toBe(false);
    expect(github.calls.deleteSecret).toEqual(["REVIEWERAGENT_ANTHROPIC_API_KEY"]);
  });

  it("leaves the secret in place when --delete-secret is not set", async () => {
    const github = await setup({ seedSecret: "REVIEWERAGENT_ANTHROPIC_API_KEY" });
    await runUninstall({
      nonInteractive: true,
      yes: true,
      deleteSecret: false,
      deleteLocalCredentials: false,
    });
    expect(github.calls.deleteSecret).toEqual([]);
    expect(await github.octokit.actions.getRepoSecret({ secret_name: "REVIEWERAGENT_ANTHROPIC_API_KEY" })).toBeDefined();
  });

  it("still deletes managed files when config is corrupt, without touching secrets", async () => {
    const github = await setup({
      configRaw: `${MANAGED_HEADER}\n::: not yaml\n`,
      seedSecret: "REVIEWERAGENT_ANTHROPIC_API_KEY",
    });
    await runUninstall({
      nonInteractive: true,
      yes: true,
      deleteSecret: true,
      deleteLocalCredentials: false,
    });
    expect(existsSync(join(repo.dir, ".revieweragent.yml"))).toBe(false);
    expect(existsSync(join(repo.dir, ".github/workflows/revieweragent.yml"))).toBe(false);
    expect(github.calls.deleteSecret).toEqual([]);
  });

  it("refuses to delete an unmarked workflow", async () => {
    await setup({ workflowRaw: "name: not-ours\non: push\n" });
    await runUninstall({
      nonInteractive: true,
      yes: true,
      deleteSecret: false,
      deleteLocalCredentials: false,
    });
    expect(existsSync(join(repo.dir, ".github/workflows/revieweragent.yml"))).toBe(true);
    expect(readFileSync(join(repo.dir, ".github/workflows/revieweragent.yml"), "utf8")).toContain("not-ours");
    expect(existsSync(join(repo.dir, ".revieweragent.yml"))).toBe(false);
  });

  it("uninstall() maps refused-without-consent to exit 1", async () => {
    await setup();
    await expect(
      uninstall({ nonInteractive: true, yes: false }),
    ).resolves.toBe(1);
  });
});
