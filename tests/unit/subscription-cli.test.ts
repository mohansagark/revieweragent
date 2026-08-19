import { describe, it, expect, afterEach } from "vitest";
import {
  classifyCliSpawnError,
  isSubscriptionQuotaMessage,
  callSubscriptionBackend,
} from "../../src/provider/claude/subscription.js";

describe("classifyCliSpawnError", () => {
  it("treats ENOENT as fail-closed cli_missing when install did not fail", () => {
    expect(classifyCliSpawnError({ code: "ENOENT", message: "spawn claude ENOENT" }, false)).toEqual({
      kind: "cli_missing",
    });
  });

  it("treats EACCES as fail-closed cli_missing", () => {
    expect(classifyCliSpawnError({ code: "EACCES", message: "permission denied" }, false)).toEqual({
      kind: "cli_missing",
    });
  });

  it("reserves npm_fetch_fail_cache_miss for an actual npm install failure", () => {
    expect(classifyCliSpawnError({ code: "ENOENT", message: "spawn claude ENOENT" }, true)).toEqual({
      kind: "npm_fetch_fail_cache_miss",
    });
  });
});

describe("isSubscriptionQuotaMessage", () => {
  it("recognizes credit/quota/billing 400 text as a quota signal", () => {
    expect(isSubscriptionQuotaMessage("Credit balance is too low")).toBe(true);
    expect(isSubscriptionQuotaMessage("plan quota exceeded")).toBe(true);
    expect(isSubscriptionQuotaMessage("billing limit reached")).toBe(true);
  });

  it("does not treat a generic 400 / schema error as quota", () => {
    expect(isSubscriptionQuotaMessage("invalid json schema")).toBe(false);
    expect(isSubscriptionQuotaMessage("")).toBe(false);
    expect(isSubscriptionQuotaMessage("parameter value too low")).toBe(false);
  });
});

describe("callSubscriptionBackend credential check", () => {
  const original = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = original;
  });

  it("fail-closes with missing_secret when CLAUDE_CODE_OAUTH_TOKEN is unset", async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    await expect(callSubscriptionBackend("sys", "user")).rejects.toMatchObject({
      name: "ModelBackendError",
      classifiable: { kind: "missing_secret" },
    });
  });
});
