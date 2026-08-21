import { describe, it, expect } from "vitest";
import { classifyError, checkOutcomeFor } from "../../src/core/error-classifier.js";

describe("classifyError", () => {
  it("classifies 401/403/missing-secret/invalid-json/cli-missing as fail-closed", () => {
    expect(classifyError({ kind: "http_401" })).toBe("fail-closed");
    expect(classifyError({ kind: "http_403" })).toBe("fail-closed");
    expect(classifyError({ kind: "missing_secret" })).toBe("fail-closed");
    expect(classifyError({ kind: "invalid_json" })).toBe("fail-closed");
    expect(classifyError({ kind: "cli_missing" })).toBe("fail-closed");
    expect(classifyError({ kind: "e2big" })).toBe("fail-closed");
  });

  it("classifies 429/5xx/npm-fetch-fail as availability-skip", () => {
    expect(classifyError({ kind: "http_429" })).toBe("availability-skip");
    expect(classifyError({ kind: "http_5xx" })).toBe("availability-skip");
    expect(classifyError({ kind: "npm_fetch_fail_cache_miss" })).toBe("availability-skip");
  });

  it("splits HTTP 400: api-key always fail-closed; subscription only skips quota/billing", () => {
    expect(classifyError({ kind: "http_400", auth: "api-key" })).toBe("fail-closed");
    expect(classifyError({ kind: "http_400", auth: "subscription", quotaSignal: true })).toBe(
      "availability-skip",
    );
    expect(classifyError({ kind: "http_400", auth: "subscription", quotaSignal: false })).toBe(
      "fail-closed",
    );
    expect(classifyError({ kind: "http_400", auth: "subscription" })).toBe("fail-closed");
  });
});

describe("checkOutcomeFor", () => {
  it("gate mode: BLOCK and fail-closed-infra exit 1 with failure conclusion", () => {
    expect(checkOutcomeFor("BLOCK", "gate")).toEqual({ conclusion: "failure", exitCode: 1 });
    expect(checkOutcomeFor("fail-closed-infra", "gate")).toEqual({ conclusion: "failure", exitCode: 1 });
  });

  it("gate mode: availability-skip is success with the skip prefix and exits 0", () => {
    expect(checkOutcomeFor("availability-skip", "gate")).toEqual({
      conclusion: "success",
      titlePrefix: "Review skipped:",
      exitCode: 0,
    });
  });

  it("gate mode: PASS is success and exits 0", () => {
    expect(checkOutcomeFor("PASS", "gate")).toEqual({ conclusion: "success", exitCode: 0 });
  });

  it("advisory mode never fails closed — always exits 0", () => {
    expect(checkOutcomeFor("BLOCK", "advisory").exitCode).toBe(0);
    expect(checkOutcomeFor("fail-closed-infra", "advisory").exitCode).toBe(0);
    expect(checkOutcomeFor("availability-skip", "advisory").exitCode).toBe(0);
  });
});
