import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  credentialCachePath,
  deleteCachedCredential,
  loadPersistedCredential,
  persistCachedCredential,
  readCachedCredential,
  readCachedCredentialFor,
  writeCachedCredentialFor,
} from "../../src/core/credential-cache.js";

describe("credential cache map (v2)", () => {
  const originalHome = process.env.REVIEWERAGENT_CONFIG_HOME;
  let dir: string;

  function isolateHome() {
    dir = mkdtempSync(join(tmpdir(), "ra-cache-"));
    process.env.REVIEWERAGENT_CONFIG_HOME = dir;
  }

  afterEach(() => {
    if (originalHome === undefined) delete process.env.REVIEWERAGENT_CONFIG_HOME;
    else process.env.REVIEWERAGENT_CONFIG_HOME = originalHome;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("stores Claude and Cursor credentials under separate keys", () => {
    isolateHome();
    writeCachedCredentialFor("claude", "subscription", "claude-token");
    writeCachedCredentialFor("cursor", "subscription", "cursor-key");
    expect(readCachedCredentialFor("claude", "subscription")).toEqual({
      provider: "claude",
      auth: "subscription",
      value: "claude-token",
    });
    expect(readCachedCredentialFor("cursor", "subscription")).toEqual({
      provider: "cursor",
      auth: "subscription",
      value: "cursor-key",
    });
  });

  it("migrates the v1 {auth,value} file as claude:${auth}", () => {
    isolateHome();
    const path = credentialCachePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ auth: "subscription", value: "legacy-token" }),
      { mode: 0o600 },
    );
    expect(readCachedCredentialFor("claude", "subscription")?.value).toBe("legacy-token");
    const rewritten = JSON.parse(readFileSync(path, "utf8")) as Record<string, { value: string }>;
    expect(rewritten["claude:subscription"]).toEqual({ value: "legacy-token" });
    expect(rewritten.auth).toBeUndefined();
  });

  it("keeps readCachedCredential as Claude-shaped for v1 callers, reading the map", () => {
    isolateHome();
    writeCachedCredentialFor("claude", "api-key", "sk-ant-legacy");
    expect(readCachedCredential()).toEqual({ auth: "api-key", value: "sk-ant-legacy" });
  });

  it("deleteCachedCredential removes the file", () => {
    isolateHome();
    writeCachedCredentialFor("claude", "subscription", "x");
    deleteCachedCredential();
    expect(readCachedCredentialFor("claude", "subscription")).toBeUndefined();
  });

  it("prefers an injected keychain and removes the file copy after a successful store", () => {
    isolateHome();
    writeCachedCredentialFor("cursor", "subscription", "file-copy");
    const memory = new Map<string, string>();
    const backend = {
      available: true,
      get: (account: string) => memory.get(account),
      set: (account: string, value: string) => {
        memory.set(account, value);
        return true;
      },
      delete: (account: string) => {
        memory.delete(account);
      },
    };
    expect(persistCachedCredential("cursor", "subscription", "keychain-copy", { backend })).toBe("keychain");
    expect(loadPersistedCredential("cursor", "subscription", { backend })?.value).toBe("keychain-copy");
    expect(readCachedCredentialFor("cursor", "subscription")).toBeUndefined();
  });

  it("--no-keychain forces the 0600 file even when a backend is available", () => {
    isolateHome();
    const backend = {
      available: true,
      get: () => "should-not-read",
      set: () => true,
      delete: () => undefined,
    };
    expect(persistCachedCredential("claude", "api-key", "file-only", { noKeychain: true, backend })).toBe("file");
    expect(loadPersistedCredential("claude", "api-key", { noKeychain: true, backend })?.value).toBe("file-only");
  });
});
