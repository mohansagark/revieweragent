import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeGithub, type FakeGithub } from "../helpers/fake-octokit.js";
import { createTempGitRepo, type TempGitRepo } from "../helpers/temp-git-repo.js";
import { serializeConfig, defaultConfig } from "../../src/core/config-schema.js";
import { WORKFLOW_MANAGED_HEADER } from "../../src/cli/write-workflow.js";

const githubState = vi.hoisted(() => ({
  current: undefined as FakeGithub | undefined,
}));

vi.mock("../../src/platform/github/client.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../src/platform/github/client.js");
  return {
    ...actual,
    createGitHubClient: () => githubState.current!.octokit,
    resolveGitHubToken: () => "ghs_test_token_not_real",
  };
});

import { upgrade } from "../../src/cli/upgrade.js";
import { rotateSecret } from "../../src/cli/rotate-secret.js";
import { applyProtection } from "../../src/cli/apply-protection.js";

describe("v2 commands e2e", () => {
  const originalCwd = process.cwd();
  let repo: TempGitRepo;

  async function setup() {
    githubState.current = await createFakeGithub();
    repo = createTempGitRepo();
    process.chdir(repo.dir);
    process.env.GITHUB_TOKEN = "ghs_test_token_not_real";
    mkdirSync(join(repo.dir, ".github/workflows"), { recursive: true });
    writeFileSync(
      join(repo.dir, ".github/workflows/revieweragent.yml"),
      `${WORKFLOW_MANAGED_HEADER}\non:\n  pull_request_target:\n`,
    );
    writeFileSync(
      join(repo.dir, ".revieweragent.yml"),
      serializeConfig(defaultConfig({ provider: "cursor", auth: "subscription" })),
    );
    return githubState.current;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.GITHUB_TOKEN;
    delete process.env.CURSOR_API_KEY;
    repo?.cleanup();
  });

  it("upgrade rewrites merge_group into a managed workflow", async () => {
    await setup();
    await expect(upgrade()).resolves.toBe(0);
    const yaml = readFileSync(join(repo.dir, ".github/workflows/revieweragent.yml"), "utf8");
    expect(yaml).toContain("merge_group:");
    expect(yaml).toContain("CURSOR_API_KEY");
  });

  it("rotate-secret PUTs the Cursor secret", async () => {
    const github = await setup();
    process.env.CURSOR_API_KEY = "rotated-cursor-key";
    await expect(rotateSecret({ nonInteractive: true, yes: true })).resolves.toBe(0);
    expect(github.calls.putSecret.map((s) => s.secret_name)).toEqual(["REVIEWERAGENT_CURSOR_API_KEY"]);
    expect(github.decryptSecret(github.calls.putSecret[0]!.encrypted_value)).toBe("rotated-cursor-key");
  });

  it("apply-protection RMW-adds revieweragent and verifies the GET", async () => {
    const github = await setup();
    github.contentPaths.add(".github/workflows/revieweragent.yml");
    github.branchProtection = {
      required_status_checks: { strict: true, contexts: ["ci"], checks: [{ context: "ci" }] },
      enforce_admins: { enabled: true },
      required_pull_request_reviews: null,
      restrictions: null,
    };
    await expect(applyProtection({ nonInteractive: true, yes: true })).resolves.toBe(0);
    expect(github.protectionPuts).toHaveLength(1);
    expect(getProtectionHasCheckAfter(github)).toBe(true);
  });

  it("apply-protection is a hard-gated no-op when the workflow is not on the default branch", async () => {
    const github = await setup();
    await expect(applyProtection({ nonInteractive: true, yes: true })).resolves.toBe(0);
    expect(github.protectionPuts).toHaveLength(0);
  });
});

function getProtectionHasCheckAfter(github: FakeGithub): boolean {
  const contexts = github.branchProtection?.required_status_checks?.contexts ?? [];
  return contexts.includes("revieweragent");
}
