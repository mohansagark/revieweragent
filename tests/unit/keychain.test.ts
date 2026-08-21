import { describe, expect, it } from "vitest";
import { getKeychain, osKeychainBackend, setKeychain, type KeychainSpawn } from "../../src/core/keychain.js";

describe("OS keychain (v2)", () => {
  it("stores and reads via an injected backend, falling back when the backend is missing", () => {
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
    expect(setKeychain({ service: "revieweragent", account: "cursor:subscription", value: "k", backend })).toBe(
      "keychain",
    );
    expect(getKeychain({ service: "revieweragent", account: "cursor:subscription", backend })).toBe("k");
  });

  it("returns unavailable when the backend cannot store", () => {
    const backend = {
      available: false,
      get: () => undefined,
      set: () => false,
      delete: () => undefined,
    };
    expect(setKeychain({ service: "revieweragent", account: "claude:subscription", value: "k", backend })).toBe(
      "unavailable",
    );
  });

  it("uses macOS security when available", () => {
    const spawn: KeychainSpawn = (command, args) => {
      if (command === "which" && args[0] === "security") {
        return { status: 0, stdout: "/usr/bin/security", stderr: "" };
      }
      if (args.includes("add-generic-password")) return { status: 0, stdout: "", stderr: "" };
      if (args.includes("find-generic-password")) return { status: 0, stdout: "secret\n", stderr: "" };
      return { status: 1, stdout: "", stderr: "" };
    };
    const backend = osKeychainBackend({ platform: "darwin", spawn });
    expect(backend.available).toBe(true);
    expect(backend.set("cursor:subscription", "k")).toBe(true);
    expect(backend.get("cursor:subscription")).toBe("secret");
  });

  it("uses Linux secret-tool when available and falls back when it is missing", () => {
    const missing = osKeychainBackend({
      platform: "linux",
      spawn: () => ({ status: 1, stdout: "", stderr: "" }),
    });
    expect(missing.available).toBe(false);

    const spawn: KeychainSpawn = (command, args, options) => {
      if (command === "which" && args[0] === "secret-tool") {
        return { status: 0, stdout: "/usr/bin/secret-tool", stderr: "" };
      }
      if (args[0] === "store") return { status: options?.input === "k" ? 0 : 1, stdout: "", stderr: "" };
      if (args[0] === "lookup") return { status: 0, stdout: "k\n", stderr: "" };
      return { status: 1, stdout: "", stderr: "" };
    };
    const backend = osKeychainBackend({ platform: "linux", spawn });
    expect(backend.available).toBe(true);
    expect(backend.set("claude:subscription", "k")).toBe(true);
    expect(backend.get("claude:subscription")).toBe("k");
  });

  it("treats Windows as unavailable so the 0600 file remains the fallback", () => {
    expect(osKeychainBackend({ platform: "win32" }).available).toBe(false);
  });
});
