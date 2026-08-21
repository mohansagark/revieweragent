export class InvalidGeminiApiKeyError extends Error {
  constructor() {
    super("That doesn't look like a Gemini API key.");
    this.name = "InvalidGeminiApiKeyError";
  }
}

export function validateGeminiApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    throw new InvalidGeminiApiKeyError();
  }
  return trimmed;
}
