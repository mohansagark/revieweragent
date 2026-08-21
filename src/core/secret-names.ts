import type { AuthType, ProviderId } from "./config-schema.js";

export const CLAUDE_SUBSCRIPTION_SECRET = "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN";
export const CLAUDE_API_KEY_SECRET = "REVIEWERAGENT_ANTHROPIC_API_KEY";
export const CURSOR_SUBSCRIPTION_SECRET = "REVIEWERAGENT_CURSOR_API_KEY";

const ALL_SECRET_NAMES = [CLAUDE_SUBSCRIPTION_SECRET, CLAUDE_API_KEY_SECRET, CURSOR_SUBSCRIPTION_SECRET] as const;

export function secretNameFor(provider: ProviderId, auth: AuthType): string {
  if (provider === "cursor") return CURSOR_SUBSCRIPTION_SECRET;
  return auth === "api-key" ? CLAUDE_API_KEY_SECRET : CLAUDE_SUBSCRIPTION_SECRET;
}

export function unusedSecretNames(provider: ProviderId, auth: AuthType): string[] {
  const live = secretNameFor(provider, auth);
  return ALL_SECRET_NAMES.filter((name) => name !== live);
}

export function jobEnvFor(provider: ProviderId, auth: AuthType): { name: string; secret: string } {
  if (provider === "cursor") {
    return { name: "CURSOR_API_KEY", secret: CURSOR_SUBSCRIPTION_SECRET };
  }
  if (auth === "api-key") {
    return { name: "ANTHROPIC_API_KEY", secret: CLAUDE_API_KEY_SECRET };
  }
  return { name: "CLAUDE_CODE_OAUTH_TOKEN", secret: CLAUDE_SUBSCRIPTION_SECRET };
}
