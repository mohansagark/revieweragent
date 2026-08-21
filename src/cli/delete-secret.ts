import type { SecretsPort } from "../platform/types.js";
import type { AuthType, ProviderId } from "../core/config-schema.js";
import { secretNameFor } from "../core/secret-names.js";

export async function deleteRepoSecret(
  secrets: SecretsPort,
  auth: AuthType,
  confirmed: boolean,
  provider: ProviderId = "claude",
): Promise<boolean> {
  if (!confirmed) return false;
  await secrets.deleteSecret(secretNameFor(provider, auth));
  return true;
}
