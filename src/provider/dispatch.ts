import type { AuthType, ProviderId } from "../core/config-schema.js";
import { presentSecret } from "../core/present-secret.js";
import { FALLBACK_ANTHROPIC_JOB_ENV, methodNeedsClaudeCli, methodNeedsCursorCli } from "../core/secret-names.js";
import { callApiKeyBackend } from "./claude/api-key.js";
import { callSubscriptionBackend, ModelBackendError } from "./claude/subscription.js";
import { callCursorBackend, cursorCliInstallFailed } from "./cursor/backend.js";
import { callGeminiBackend } from "./gemini/api-key.js";

export function claudeCliInstallFailed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REVIEWERAGENT_CLI_INSTALL_FAILED === "true";
}

export function backendCliInstallFailed(provider: ProviderId, auth: AuthType): boolean {
  if (methodNeedsClaudeCli(provider, auth)) return claudeCliInstallFailed();
  if (methodNeedsCursorCli(provider)) return cursorCliInstallFailed();
  return false;
}

export function credentialValueFor(
  provider: ProviderId,
  auth: AuthType,
  role: "primary" | "fallback",
): string | undefined {
  if (provider === "cursor") return presentSecret(process.env.CURSOR_API_KEY);
  if (provider === "gemini") return presentSecret(process.env.GEMINI_API_KEY);
  if (auth === "api-key") {
    if (role === "fallback") {
      return presentSecret(process.env[FALLBACK_ANTHROPIC_JOB_ENV]) ?? presentSecret(process.env.ANTHROPIC_API_KEY);
    }
    return presentSecret(process.env.ANTHROPIC_API_KEY);
  }
  return presentSecret(process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

export async function callProviderBackend(opts: {
  provider: ProviderId;
  auth: AuthType;
  role: "primary" | "fallback";
  systemPrompt: string;
  userPayload: string;
}): Promise<string> {
  const { provider, auth, role, systemPrompt, userPayload } = opts;
  if (provider === "cursor") {
    return callCursorBackend(systemPrompt, userPayload);
  }
  if (provider === "gemini") {
    return callGeminiBackend(systemPrompt, userPayload);
  }
  if (auth === "subscription") {
    return callSubscriptionBackend(systemPrompt, userPayload);
  }
  return callApiKeyBackend(systemPrompt, userPayload, credentialValueFor("claude", "api-key", role));
}

export { ModelBackendError };
