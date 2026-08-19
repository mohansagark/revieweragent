// SPEC.md §5 step 3: "Model / Claude: masked paste of the Console API
// key, or reuse cache." The masked-paste UI itself lives in the
// interactive CLI layer (@clack/prompts' `password` prompt); this module
// is the shared, UI-agnostic validation both interactive and
// non-interactive `init` call.

const API_KEY_PATTERN = /^sk-ant-[a-zA-Z0-9_-]+$/;

export class InvalidApiKeyError extends Error {
  constructor() {
    super("That doesn't look like an Anthropic Console API key (expected to start with sk-ant-).");
    this.name = "InvalidApiKeyError";
  }
}

export function validateApiKey(value: string): string {
  const trimmed = value.trim();
  if (!API_KEY_PATTERN.test(trimmed)) {
    throw new InvalidApiKeyError();
  }
  return trimmed;
}
