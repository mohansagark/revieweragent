import { spawnSync } from "node:child_process";
import { platform } from "node:os";

export const KEYCHAIN_SERVICE = "revieweragent";

export interface KeychainBackend {
  available: boolean;
  get(account: string): string | undefined;
  set(account: string, value: string): boolean;
  delete(account: string): void;
}

export interface KeychainSpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type KeychainSpawn = (
  command: string,
  args: readonly string[],
  options?: { input?: string },
) => KeychainSpawnResult;

function defaultSpawn(
  command: string,
  args: readonly string[],
  options?: { input?: string },
): KeychainSpawnResult {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    input: options?.input,
    timeout: 8_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function unavailable(): KeychainBackend {
  return {
    available: false,
    get: () => undefined,
    set: () => false,
    delete: () => undefined,
  };
}

function macosBackend(spawn: KeychainSpawn): KeychainBackend {
  const probe = spawn("which", ["security"]);
  if (probe.status !== 0) return unavailable();
  return {
    available: true,
    get(account) {
      const result = spawn("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
        "-w",
      ]);
      if (result.status !== 0) return undefined;
      const value = result.stdout.replace(/\n$/, "");
      return value.length > 0 ? value : undefined;
    },
    set(account, value) {
      const result = spawn("security", [
        "add-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
        "-w",
        value,
        "-U",
      ]);
      return result.status === 0;
    },
    delete(account) {
      spawn("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account]);
    },
  };
}

function linuxBackend(spawn: KeychainSpawn): KeychainBackend {
  const probe = spawn("which", ["secret-tool"]);
  if (probe.status !== 0) return unavailable();
  return {
    available: true,
    get(account) {
      const result = spawn("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "account", account]);
      if (result.status !== 0) return undefined;
      const value = result.stdout.replace(/\n$/, "");
      return value.length > 0 ? value : undefined;
    },
    set(account, value) {
      const result = spawn(
        "secret-tool",
        ["store", "--label", `${KEYCHAIN_SERVICE} ${account}`, "service", KEYCHAIN_SERVICE, "account", account],
        { input: value },
      );
      return result.status === 0;
    },
    delete(account) {
      spawn("secret-tool", ["clear", "service", KEYCHAIN_SERVICE, "account", account]);
    },
  };
}

export function osKeychainBackend(opts?: {
  platform?: NodeJS.Platform;
  spawn?: KeychainSpawn;
}): KeychainBackend {
  const plat = opts?.platform ?? platform();
  const spawn = opts?.spawn ?? defaultSpawn;
  if (plat === "darwin") return macosBackend(spawn);
  if (plat === "linux") return linuxBackend(spawn);
  return unavailable();
}

export function setKeychain(opts: {
  service: string;
  account: string;
  value: string;
  backend: KeychainBackend;
}): "keychain" | "unavailable" {
  if (!opts.backend.available) return "unavailable";
  return opts.backend.set(opts.account, opts.value) ? "keychain" : "unavailable";
}

export function getKeychain(opts: {
  service: string;
  account: string;
  backend: KeychainBackend;
}): string | undefined {
  if (!opts.backend.available) return undefined;
  return opts.backend.get(opts.account);
}

export function deleteKeychain(opts: { account: string; backend: KeychainBackend }): void {
  if (!opts.backend.available) return;
  opts.backend.delete(opts.account);
}
