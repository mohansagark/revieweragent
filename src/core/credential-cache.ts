import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { AuthType, ProviderId } from "./config-schema.js";
import {
  KEYCHAIN_SERVICE,
  deleteKeychain,
  getKeychain,
  osKeychainBackend,
  setKeychain,
  type KeychainBackend,
} from "./keychain.js";

// SPEC.md §11 / §11.1: optional local cache. v1 shape was `{auth,value}`
// (Claude only). v2 is a map keyed `{provider}:{auth}` so Claude and
// Cursor can both be cached. CI never reads this file.

export interface CachedCredential {
  auth: AuthType;
  value: string;
}

export interface NamedCachedCredential extends CachedCredential {
  provider: ProviderId;
}

type CacheMap = Record<string, { value: string }>;

const KEYCHAIN_ACCOUNTS = ["claude:subscription", "claude:api-key", "cursor:subscription", "gemini:api-key"] as const;

export function cacheKey(provider: ProviderId, auth: AuthType): string {
  return `${provider}:${auth}`;
}

export function credentialCachePath(): string {
  const home = process.env.REVIEWERAGENT_CONFIG_HOME ?? join(homedir(), ".config");
  return join(home, "revieweragent", "credentials.json");
}

function readMap(): CacheMap {
  const path = credentialCachePath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CacheMap & CachedCredential;
    if (parsed.auth && parsed.value && typeof parsed.auth === "string") {
      const migrated: CacheMap = { [cacheKey("claude", parsed.auth)]: { value: parsed.value } };
      writeMap(migrated);
      return migrated;
    }
    const map: CacheMap = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry === "object" && typeof (entry as { value?: unknown }).value === "string") {
        map[key] = { value: (entry as { value: string }).value };
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeMap(map: CacheMap): void {
  const path = credentialCachePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(map, null, 2), { mode: 0o600 });
}

export function readCachedCredentialFor(
  provider: ProviderId,
  auth: AuthType,
): NamedCachedCredential | undefined {
  const entry = readMap()[cacheKey(provider, auth)];
  if (!entry?.value) return undefined;
  return { provider, auth, value: entry.value };
}

export function writeCachedCredentialFor(provider: ProviderId, auth: AuthType, value: string): void {
  const map = readMap();
  map[cacheKey(provider, auth)] = { value };
  writeMap(map);
}

/** v1 helper: Claude-only `{auth,value}` view of the map. */
export function readCachedCredential(): CachedCredential | undefined {
  const sub = readCachedCredentialFor("claude", "subscription");
  if (sub) return { auth: sub.auth, value: sub.value };
  const key = readCachedCredentialFor("claude", "api-key");
  if (key) return { auth: key.auth, value: key.value };
  return undefined;
}

export function writeCachedCredential(credential: CachedCredential): void {
  writeCachedCredentialFor("claude", credential.auth, credential.value);
}

export function deleteCachedCredential(opts?: { backend?: KeychainBackend }): void {
  const path = credentialCachePath();
  if (existsSync(path)) {
    writeFileSync(path, "", { mode: 0o600 });
    unlinkSync(path);
  }
  const backend = opts?.backend ?? osKeychainBackend();
  for (const account of KEYCHAIN_ACCOUNTS) {
    deleteKeychain({ account, backend });
  }
}

function removeFileKey(provider: ProviderId, auth: AuthType): void {
  const map = readMap();
  delete map[cacheKey(provider, auth)];
  if (Object.keys(map).length === 0) {
    const path = credentialCachePath();
    if (existsSync(path)) {
      writeFileSync(path, "", { mode: 0o600 });
      unlinkSync(path);
    }
    return;
  }
  writeMap(map);
}

/** Prefer OS keychain; fall back to the 0600 file. CI never calls this. */
export function persistCachedCredential(
  provider: ProviderId,
  auth: AuthType,
  value: string,
  opts?: { noKeychain?: boolean; backend?: KeychainBackend },
): "keychain" | "file" {
  if (!opts?.noKeychain) {
    const backend = opts?.backend ?? osKeychainBackend();
    const stored = setKeychain({
      service: KEYCHAIN_SERVICE,
      account: cacheKey(provider, auth),
      value,
      backend,
    });
    if (stored === "keychain") {
      removeFileKey(provider, auth);
      return "keychain";
    }
  }
  writeCachedCredentialFor(provider, auth, value);
  return "file";
}

export function loadPersistedCredential(
  provider: ProviderId,
  auth: AuthType,
  opts?: { noKeychain?: boolean; backend?: KeychainBackend },
): NamedCachedCredential | undefined {
  if (!opts?.noKeychain) {
    const backend = opts?.backend ?? osKeychainBackend();
    const value = getKeychain({
      service: KEYCHAIN_SERVICE,
      account: cacheKey(provider, auth),
      backend,
    });
    if (value) return { provider, auth, value };
  }
  return readCachedCredentialFor(provider, auth);
}
