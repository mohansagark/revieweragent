import { describe, it, expect, vi, afterEach } from "vitest";
import { callApiKeyBackend } from "../../src/provider/claude/api-key.js";
import { FINDINGS_JSON_SCHEMA } from "../../src/core/findings-schema.js";

describe("callApiKeyBackend", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes the findings JSON schema in the system prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify({ summary: "ok", findings: [] }) }],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await callApiKeyBackend("You are a reviewer.", "diff", "sk-ant-test");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { system: string };
    expect(body.system).toContain("You are a reviewer.");
    expect(body.system).toContain(JSON.stringify(FINDINGS_JSON_SCHEMA));
  });
});
