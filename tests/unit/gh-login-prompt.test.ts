import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shouldPromptGhLogin } from "../../src/cli/dependency-checks.js";

describe("shouldPromptGhLogin", () => {
  it("prompts only when gh is installed but not authenticated", () => {
    expect(shouldPromptGhLogin({ ghCliPresent: true, ghAuthenticated: false })).toBe(true);
    expect(shouldPromptGhLogin({ ghCliPresent: true, ghAuthenticated: true })).toBe(false);
    expect(shouldPromptGhLogin({ ghCliPresent: false, ghAuthenticated: false })).toBe(false);
  });
});

describe("init gh login prompt default", () => {
  it("defaults Log in to gh CLI now? to yes", () => {
    const src = readFileSync("src/cli/init.ts", "utf8");
    expect(src).toMatch(/Log in to gh CLI now\?[\s\S]{0,80}initialValue:\s*true/);
  });
});
