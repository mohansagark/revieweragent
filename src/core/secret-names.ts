import type { AuthType, FallbackConfig, ProviderId } from "./config-schema.js";

export const CLAUDE_SUBSCRIPTION_SECRET = "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN";
export const CLAUDE_API_KEY_SECRET = "REVIEWERAGENT_ANTHROPIC_API_KEY";
export const CURSOR_SUBSCRIPTION_SECRET = "REVIEWERAGENT_CURSOR_API_KEY";
export const GEMINI_API_KEY_SECRET = "REVIEWERAGENT_GEMINI_API_KEY";
export const FALLBACK_ANTHROPIC_JOB_ENV = "REVIEWERAGENT_FALLBACK_ANTHROPIC_API_KEY";

const ALL_SECRET_NAMES = [
  CLAUDE_SUBSCRIPTION_SECRET,
  CLAUDE_API_KEY_SECRET,
  CURSOR_SUBSCRIPTION_SECRET,
  GEMINI_API_KEY_SECRET,
] as const;

export function secretNameFor(provider: ProviderId, auth: AuthType): string {
  if (provider === "cursor") return CURSOR_SUBSCRIPTION_SECRET;
  if (provider === "gemini") return GEMINI_API_KEY_SECRET;
  return auth === "api-key" ? CLAUDE_API_KEY_SECRET : CLAUDE_SUBSCRIPTION_SECRET;
}

export function unusedSecretNames(
  provider: ProviderId,
  auth: AuthType,
  fallback?: FallbackConfig,
): string[] {
  const live = new Set<string>([secretNameFor(provider, auth)]);
  if (fallback) live.add(secretNameFor(fallback.provider, fallback.auth));
  return ALL_SECRET_NAMES.filter((name) => !live.has(name));
}

export function jobEnvFor(
  provider: ProviderId,
  auth: AuthType,
  opts?: { role?: "primary" | "fallback"; primary?: { provider: ProviderId; auth: AuthType } },
): { name: string; secret: string } {
  const secret = secretNameFor(provider, auth);
  if (provider === "cursor") {
    return { name: "CURSOR_API_KEY", secret };
  }
  if (provider === "gemini") {
    return { name: "GEMINI_API_KEY", secret };
  }
  if (auth === "api-key") {
    const mixWithClaudeCli =
      opts?.role === "fallback" && opts.primary?.provider === "claude" && opts.primary.auth === "subscription";
    return {
      name: mixWithClaudeCli ? FALLBACK_ANTHROPIC_JOB_ENV : "ANTHROPIC_API_KEY",
      secret,
    };
  }
  return { name: "CLAUDE_CODE_OAUTH_TOKEN", secret };
}

export function methodNeedsClaudeCli(provider: ProviderId, auth: AuthType): boolean {
  return provider === "claude" && auth === "subscription";
}

export function methodNeedsCursorCli(provider: ProviderId): boolean {
  return provider === "cursor";
}
