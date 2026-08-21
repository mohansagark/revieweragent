import { describe, expect, it } from "vitest";
import { isFallbackTrigger } from "../../src/core/fallback-trigger.js";

describe("isFallbackTrigger", () => {
  it("is true for HTTP 429", () => {
    expect(isFallbackTrigger({ kind: "http_429" })).toBe(true);
  });

  it("is true for subscription plan-quota 400", () => {
    expect(
      isFallbackTrigger({ kind: "http_400", auth: "subscription", quotaSignal: true }),
    ).toBe(true);
  });

  it("is false for api-key HTTP 400 even with a quota-looking body", () => {
    expect(isFallbackTrigger({ kind: "http_400", auth: "api-key", quotaSignal: true })).toBe(false);
    expect(isFallbackTrigger({ kind: "http_400", auth: "api-key" })).toBe(false);
  });

  it("is false for 5xx, CLI install fail, E2BIG, 401, and invalid JSON", () => {
    expect(isFallbackTrigger({ kind: "http_5xx" })).toBe(false);
    expect(isFallbackTrigger({ kind: "npm_fetch_fail_cache_miss" })).toBe(false);
    expect(isFallbackTrigger({ kind: "e2big" })).toBe(false);
    expect(isFallbackTrigger({ kind: "http_401" })).toBe(false);
    expect(isFallbackTrigger({ kind: "http_403" })).toBe(false);
    expect(isFallbackTrigger({ kind: "invalid_json" })).toBe(false);
    expect(isFallbackTrigger({ kind: "missing_secret" })).toBe(false);
  });

  it("is false for subscription 400 without a quota signal", () => {
    expect(isFallbackTrigger({ kind: "http_400", auth: "subscription" })).toBe(false);
    expect(isFallbackTrigger({ kind: "http_400", auth: "subscription", quotaSignal: false })).toBe(false);
  });
});
