import { deleteCachedCredential } from "../core/credential-cache.js";

// SPEC.md §15 step 5: local credentials untouched unless
// --delete-local-credentials.

export function deleteLocalCredentials(confirmed: boolean): boolean {
  if (!confirmed) return false;
  deleteCachedCredential();
  return true;
}
