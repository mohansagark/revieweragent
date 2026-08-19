import { FINDINGS_JSON_SCHEMA } from "../../core/findings-schema.js";
import type { ClassifiableError } from "../../core/error-classifier.js";
import { ModelBackendError } from "./subscription.js";

// SPEC.md §8: api-key backend uses the Anthropic Messages API directly,
// no tools, same schema/evaluator as the subscription path. The model id
// is release-configurable (ANTHROPIC_MODEL env var) rather than hardcoded
// to a single fixed string here — unlike the workflow SHA pins, a wrong
// model id fails loudly via the API's own error response rather than
// silently weakening a security boundary, so a documented default with
// an override is the appropriate level of rigor.
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export async function callApiKeyBackend(
  systemPrompt: string,
  userPayload: string,
  apiKey = process.env.ANTHROPIC_API_KEY,
): Promise<string> {
  if (!apiKey) {
    throw new ModelBackendError("ANTHROPIC_API_KEY is not set", { kind: "missing_secret" });
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: `${systemPrompt}\n\nFindings JSON schema:\n${JSON.stringify(FINDINGS_JSON_SCHEMA)}`,
        messages: [{ role: "user", content: userPayload }],
      }),
    });
  } catch (err) {
    throw new ModelBackendError(`Network error calling Anthropic Messages API: ${(err as Error).message}`, {
      kind: "http_5xx",
    });
  }

  if (!response.ok) {
    const classification = classifyHttpStatus(response.status);
    throw new ModelBackendError(`Anthropic Messages API returned HTTP ${response.status}`, classification);
  }

  const body = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new ModelBackendError("Anthropic Messages API response had no text content", { kind: "invalid_json" });
  }
  return text;
}

function classifyHttpStatus(status: number): ClassifiableError {
  if (status === 401) return { kind: "http_401" };
  if (status === 403) return { kind: "http_403" };
  if (status === 429) return { kind: "http_429" };
  if (status === 400) return { kind: "http_400", auth: "api-key" };
  if (status >= 500) return { kind: "http_5xx" };
  return { kind: "invalid_json" };
}
