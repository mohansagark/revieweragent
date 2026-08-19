import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { AuthType } from "./config-schema.js";

// SPEC.md §3 / §11: optional local cache, plaintext 0600 (recorded
// tradeoff — keychain deferred, see SPEC.md §3). Independent of the repo's
// GitHub Actions secret; CI never reads this file (Constitution Principle
// VI security note).

export interface CachedCredential {
  auth: AuthType;
  value: string;
}

export function credentialCachePath(): string {
  return join(homedir(), ".config", "revieweragent", "credentials.json");
}

export function readCachedCredential(): CachedCredential | undefined {
  const path = credentialCachePath();
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as CachedCredential;
    if (!parsed.auth || !parsed.value) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeCachedCredential(credential: CachedCredential): void {
  const path = credentialCachePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(credential, null, 2), { mode: 0o600 });
}

export function deleteCachedCredential(): void {
  const path = credentialCachePath();
  if (existsSync(path)) {
    writeFileSync(path, "", { mode: 0o600 });
    unlinkSync(path);
  }
}
