import { describe, it, expect } from "vitest";
import { createGitHubSecretsPort } from "../../src/platform/github/secrets.js";
import { createFakeGithub } from "../helpers/fake-octokit.js";

describe("GitHub secrets port (real libsodium + fake Actions API)", () => {
  it("seals the credential with the repo public key and PUTs it", async () => {
    const github = await createFakeGithub();
    const secrets = createGitHubSecretsPort(github.octokit, "acme", "widgets");

    await secrets.putSecret("REVIEWERAGENT_ANTHROPIC_API_KEY", "test-api-key-not-real");

    expect(github.calls.putSecret).toHaveLength(1);
    expect(github.calls.putSecret[0]?.secret_name).toBe("REVIEWERAGENT_ANTHROPIC_API_KEY");
    expect(github.calls.putSecret[0]?.key_id).toBe(github.keyId);
    expect(github.decryptSecret(github.calls.putSecret[0]!.encrypted_value)).toBe("test-api-key-not-real");
  });

  it("reports hasSecret true only after a successful put", async () => {
    const github = await createFakeGithub();
    const secrets = createGitHubSecretsPort(github.octokit, "acme", "widgets");

    expect(await secrets.hasSecret("REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN")).toBe(false);
    await secrets.putSecret("REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN", "oauth-test-token-not-real");
    expect(await secrets.hasSecret("REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN")).toBe(true);
  });

  it("deleteSecret is a no-op on 404 and removes a live secret otherwise", async () => {
    const github = await createFakeGithub();
    const secrets = createGitHubSecretsPort(github.octokit, "acme", "widgets");

    await expect(secrets.deleteSecret("REVIEWERAGENT_ANTHROPIC_API_KEY")).resolves.toBeUndefined();
    expect(github.calls.deleteSecret).toEqual([]);

    await secrets.putSecret("REVIEWERAGENT_ANTHROPIC_API_KEY", "test-api-key-not-real");
    await secrets.deleteSecret("REVIEWERAGENT_ANTHROPIC_API_KEY");
    expect(github.calls.deleteSecret).toEqual(["REVIEWERAGENT_ANTHROPIC_API_KEY"]);
    expect(await secrets.hasSecret("REVIEWERAGENT_ANTHROPIC_API_KEY")).toBe(false);
  });

  it("hasSecret rethrows non-404 failures", async () => {
    const github = await createFakeGithub();
    github.octokit.actions.getRepoSecret = async () => {
      const err = new Error("boom") as Error & { status: number };
      err.status = 500;
      throw err;
    };
    const secrets = createGitHubSecretsPort(github.octokit, "acme", "widgets");
    await expect(secrets.hasSecret("REVIEWERAGENT_ANTHROPIC_API_KEY")).rejects.toThrow("boom");
  });
});
