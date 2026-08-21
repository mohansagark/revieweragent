import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: () => {
    throw Object.assign(new Error("spawn E2BIG"), { code: "E2BIG" });
  },
}));

import { callSubscriptionBackend } from "../../src/provider/claude/subscription.js";

describe("callSubscriptionBackend spawn E2BIG", () => {
  const original = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = original;
  });

  it("rejects with ModelBackendError e2big when spawn throws synchronously", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-token-not-real";
    await expect(callSubscriptionBackend("sys", "user")).rejects.toMatchObject({
      name: "ModelBackendError",
      classifiable: { kind: "e2big" },
    });
  });
});
