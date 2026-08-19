import type { Octokit } from "@octokit/rest";
import { createRequire } from "node:module";
import type { SecretsPort } from "../types.js";

// libsodium-wrappers' published ESM entry (dist/modules-esm/*.mjs) has a
// broken relative import to its `libsodium` dependency's own .mjs build
// under Node's ESM resolver (reproduced on Node 25 with this package's
// current release) — `import sodium from "libsodium-wrappers"` throws
// ERR_MODULE_NOT_FOUND. The package's CJS entry (dist/modules/*.js) does
// not have this problem, so we load it via createRequire instead.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sodium = require("libsodium-wrappers") as typeof import("libsodium-wrappers");

// SPEC.md §6: encrypt with the repo's public key (libsodium seal), then
// PUT the encrypted value. SPEC.md §11: per-repo Actions secret, not
// org-level, in v1.
export function createGitHubSecretsPort(
  octokit: Octokit,
  owner: string,
  repo: string,
): SecretsPort {
  async function encrypt(publicKey: string, value: string): Promise<string> {
    await sodium.ready;
    const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
    const messageBytes = sodium.from_string(value);
    const sealed = sodium.crypto_box_seal(messageBytes, keyBytes);
    return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
  }

  return {
    async putSecret(name: string, value: string): Promise<void> {
      const { data: publicKeyData } = await octokit.actions.getRepoPublicKey({
        owner,
        repo,
      });
      const encryptedValue = await encrypt(publicKeyData.key, value);
      await octokit.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: name,
        encrypted_value: encryptedValue,
        key_id: publicKeyData.key_id,
      });
    },

    async deleteSecret(name: string): Promise<void> {
      try {
        await octokit.actions.deleteRepoSecret({ owner, repo, secret_name: name });
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status !== 404) throw err;
      }
    },

    async hasSecret(name: string): Promise<boolean> {
      try {
        await octokit.actions.getRepoSecret({ owner, repo, secret_name: name });
        return true;
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 404) return false;
        throw err;
      }
    },
  };
}
