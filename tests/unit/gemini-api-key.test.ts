import { describe, it, expect, vi, afterEach } from "vitest";
import { callGeminiBackend, classifyGeminiHttp } from "../../src/provider/gemini/api-key.js";
import { ModelBackendError } from "../../src/provider/claude/subscription.js";
import { FINDINGS_JSON_SCHEMA } from "../../src/core/findings-schema.js";

describe("classifyGeminiHttp", () => {
  it("maps RESOURCE_EXHAUSTED in 429 or 403 bodies to http_429", () => {
    expect(classifyGeminiHttp(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')).toEqual({ kind: "http_429" });
    expect(classifyGeminiHttp(403, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota"}}')).toEqual({
      kind: "http_429",
    });
  });

  it("does not treat HTTP 400 RESOURCE_EXHAUSTED as a 429 trigger", () => {
    expect(classifyGeminiHttp(400, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')).toEqual({
      kind: "http_400",
      auth: "api-key",
    });
  });

  it("maps an invalid API key to http_403", () => {
    expect(classifyGeminiHttp(400, "API key not valid. Please pass a valid API key.")).toEqual({ kind: "http_403" });
    expect(classifyGeminiHttp(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toEqual({ kind: "http_403" });
  });
});

describe("callGeminiBackend", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes the findings schema and treats an empty key as missing_secret", async () => {
    await expect(callGeminiBackend("You are a reviewer.", "diff", "   ")).rejects.toMatchObject({
      classifiable: { kind: "missing_secret" },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "ok", findings: [] }) }] } }],
        }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await callGeminiBackend("You are a reviewer.", "diff", "AIza-test-key");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toMatch(/key=/);
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "AIza-test-key" });
    const body = JSON.parse((init as RequestInit).body as string) as {
      systemInstruction: { parts: { text: string }[] };
      generationConfig: { responseMimeType?: string };
    };
    expect(body.systemInstruction.parts[0]!.text).toContain(JSON.stringify(FINDINGS_JSON_SCHEMA));
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });

  it("classifies RESOURCE_EXHAUSTED as a ModelBackendError http_429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }),
    }) as unknown as typeof fetch;
    await expect(callGeminiBackend("sys", "user", "AIza-test-key")).rejects.toBeInstanceOf(ModelBackendError);
    await expect(callGeminiBackend("sys", "user", "AIza-test-key")).rejects.toMatchObject({
      classifiable: { kind: "http_429" },
    });
  });
});
