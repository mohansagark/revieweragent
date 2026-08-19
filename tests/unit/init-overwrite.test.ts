import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveConfigWrite, UnmanagedConfigConflictError } from "../../src/cli/write-config.js";
import { defaultConfig } from "../../src/core/config-schema.js";
import { decideOtherSecretDeletion } from "../../src/cli/init.js";
import { parsePorcelainPaths } from "../../src/cli/commit-push.js";
import { parseOwnerRepo } from "../../src/platform/github/client.js";
import { printBranchProtectionInstructions } from "../../src/cli/print-protection-instructions.js";

describe("resolveConfigWrite", () => {
  it("refuses to overwrite an unmarked .revieweragent.yml even if confirmed", () => {
    expect(() =>
      resolveConfigWrite(".revieweragent.yml", "version: 1\nmode: advisory\n", defaultConfig(), true),
    ).toThrow(UnmanagedConfigConflictError);
    expect(() =>
      resolveConfigWrite(".revieweragent.yml", "version: 1\nmode: advisory\n", defaultConfig(), true),
    ).toThrow(/rename or remove it manually/);
    expect(() =>
      resolveConfigWrite(".revieweragent.yml", "version: 1\nmode: advisory\n", defaultConfig(), true),
    ).not.toThrow(/without confirmation/);
  });

  it("overwrites a managed file when confirmed", () => {
    const existing = [
      "# Managed by revieweragent — schema version below is required.",
      "version: 1",
      "provider: claude",
      "auth: subscription",
      "mode: advisory",
    ].join("\n");
    const result = resolveConfigWrite(".revieweragent.yml", existing, defaultConfig({ mode: "gate" }), true);
    expect(result.wasOverwrite).toBe(true);
    expect(result.content).toContain("mode: gate");
  });
});

describe("decideOtherSecretDeletion", () => {
  it("aborts when the other secret exists and deletion was not confirmed", () => {
    expect(decideOtherSecretDeletion({ hasOtherSecret: true, confirmed: false })).toBe("abort");
  });

  it("deletes when confirmed", () => {
    expect(decideOtherSecretDeletion({ hasOtherSecret: true, confirmed: true })).toBe("delete");
  });

  it("is a no-op when the other secret is absent", () => {
    expect(decideOtherSecretDeletion({ hasOtherSecret: false, confirmed: false })).toBe("noop");
  });
});

describe("parsePorcelainPaths", () => {
  it("parses rename lines as the destination path, not 'old -> new'", () => {
    expect(parsePorcelainPaths("R  src/old.ts -> src/new.ts\n")).toEqual(["src/new.ts"]);
  });

  it("parses ordinary untracked and modified lines", () => {
    expect(parsePorcelainPaths("?? .revieweragent.yml\n M src/cli/init.ts\n")).toEqual([
      ".revieweragent.yml",
      "src/cli/init.ts",
    ]);
  });
});

describe("parseOwnerRepo", () => {
  it("keeps dots in the repository name", () => {
    expect(parseOwnerRepo("git@github.com:acme/foo.bar.git")).toEqual({ owner: "acme", repo: "foo.bar" });
    expect(parseOwnerRepo("https://github.com/acme/foo.bar")).toEqual({ owner: "acme", repo: "foo.bar" });
  });
});

describe("printBranchProtectionInstructions", () => {
  it("does not tell the user that requiring the check now makes every PR merge", () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      logs.push(String(msg ?? ""));
    };
    try {
      printBranchProtectionInstructions("acme", "widgets");
    } finally {
      console.log = original;
    }
    const text = logs.join("\n");
    expect(text).toContain("revieweragent");
    expect(text.toLowerCase()).toContain("until you require");
    expect(text).not.toMatch(/Do this now and every PR merges/);
  });
});

describe("runInit mutation order", () => {
  const runInitSrc = () => {
    const src = readFileSync("src/cli/init.ts", "utf8");
    const start = src.indexOf("export async function runInit");
    const end = src.indexOf("\nfunction writeFile");
    return src.slice(start, end);
  };

  it("plans file overwrites before putting or deleting secrets", () => {
    const src = runInitSrc();
    const resolveWorkflow = src.indexOf("resolveWorkflowWrite");
    const resolveConfig = src.indexOf("resolveConfigWrite");
    const putSecret = src.indexOf("putSecret");
    const deleteSecret = src.indexOf("deleteSecret");
    expect(resolveWorkflow).toBeGreaterThan(-1);
    expect(resolveConfig).toBeGreaterThan(-1);
    expect(putSecret).toBeGreaterThan(resolveWorkflow);
    expect(putSecret).toBeGreaterThan(resolveConfig);
    expect(deleteSecret).toBeGreaterThan(putSecret);
  });

  it("prompts for managed overwrites before mutating secrets", () => {
    const src = runInitSrc();
    const workflowPrompt = src.indexOf("Overwrite existing .github/workflows/revieweragent.yml?");
    const configPrompt = src.indexOf("Overwrite existing .revieweragent.yml?");
    const putSecret = src.indexOf("putSecret");
    expect(workflowPrompt).toBeGreaterThan(-1);
    expect(configPrompt).toBeGreaterThan(-1);
    expect(putSecret).toBeGreaterThan(workflowPrompt);
    expect(putSecret).toBeGreaterThan(configPrompt);
  });
});
