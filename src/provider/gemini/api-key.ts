import { FINDINGS_JSON_SCHEMA } from "../../core/findings-schema.js";
import { presentSecret } from "../../core/present-secret.js";
import type { ClassifiableError } from "../../core/error-classifier.js";
import { ModelBackendError } from "../claude/subscription.js";

const DEFAULT_MODEL = "gemini-3.7-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function callGeminiBackend(
  systemPrompt: string,
  userPayload: string,
  apiKey = process.env.GEMINI_API_KEY,
): Promise<string> {
  const key = presentSecret(apiKey);
  if (!key) {
    throw new ModelBackendError("GEMINI_API_KEY is not set", { kind: "missing_secret" });
  }

  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const system = `${systemPrompt}\n\nFindings JSON schema:\n${JSON.stringify(FINDINGS_JSON_SCHEMA)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
        },
      }),
    });
  } catch (err) {
    throw new ModelBackendError(`Network error calling Gemini generateContent: ${(err as Error).message}`, {
      kind: "http_5xx",
    });
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw new ModelBackendError(
      `Gemini generateContent returned HTTP ${response.status}`,
      classifyGeminiHttp(response.status, bodyText),
    );
  }

  let parsed: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    throw new ModelBackendError("Gemini generateContent response was not JSON", { kind: "invalid_json" });
  }

  if (parsed.promptFeedback?.blockReason) {
    throw new ModelBackendError("Gemini generateContent blocked the prompt", { kind: "invalid_json" });
  }

  const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new ModelBackendError("Gemini generateContent response had no text content", { kind: "invalid_json" });
  }
  return text;
}

/** Gemini quota is 429, or 403 with RESOURCE_EXHAUSTED / quota language. Invalid keys stay 403. */
export function classifyGeminiHttp(status: number, bodyText: string): ClassifiableError {
  const lower = bodyText.toLowerCase();
  if (status === 429) return { kind: "http_429" };
  const exhausted = /resource_exhausted|quota|rate.?limit|exceeded/.test(lower);
  if (status === 403 && exhausted) return { kind: "http_429" };
  if (/api key not valid|invalid.?api.?key|api_key_invalid/.test(lower)) return { kind: "http_403" };
  if (status === 401) return { kind: "http_401" };
  if (status === 403) return { kind: "http_403" };
  if (status === 400) return { kind: "http_400", auth: "api-key" };
  if (status >= 500) return { kind: "http_5xx" };
  return { kind: "invalid_json" };
}
