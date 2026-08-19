import type { SecretsPort } from "../platform/types.js";
import type { AuthType } from "../core/config-schema.js";

// SPEC.md §15 step 3: prompt --delete-secret (default: ask interactively;
// false in non-interactive unless flagged).

const SECRET_NAMES: Record<AuthType, string> = {
  "api-key": "REVIEWERAGENT_ANTHROPIC_API_KEY",
  subscription: "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
};

export async function deleteRepoSecret(secrets: SecretsPort, auth: AuthType, confirmed: boolean): Promise<boolean> {
  if (!confirmed) return false;
  await secrets.deleteSecret(SECRET_NAMES[auth]);
  return true;
}
