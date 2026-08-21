import type { AuthType, ProviderId } from "../core/config-schema.js";
import { claudeProvider } from "./claude/registry-entry.js";
import { cursorProvider } from "./cursor/registry-entry.js";
import { geminiProvider } from "./gemini/registry-entry.js";

// SPEC.md §3 — registry-driven provider list. Live: Claude, Cursor (Agent),
// Gemini (Model). OpenAI / Copilot stay undesigned.

export type AuthMethodType = "subscription-oauth" | "api-key";

export interface AuthMethod {
  type: AuthMethodType;
  secretName: string;
  acquireVia: string;
  ciBackend: string;
}

export type ProviderStatus = "live" | "planned";

export interface Provider {
  id: string;
  displayName: string;
  status: ProviderStatus;
  authMethods: AuthMethod[];
}

export type PromptCategory = "Agent" | "Model";

export const providerRegistry: Provider[] = [claudeProvider, cursorProvider, geminiProvider];

const categoryToAuthType: Record<PromptCategory, AuthMethodType> = {
  Agent: "subscription-oauth",
  Model: "api-key",
};

export function listProvidersForCategory(
  registry: Provider[],
  category: PromptCategory,
  omit?: { provider: ProviderId; auth: AuthType },
): Provider[] {
  const authType = categoryToAuthType[category];
  const omitAuthType: AuthMethodType | undefined = omit
    ? omit.auth === "api-key"
      ? "api-key"
      : "subscription-oauth"
    : undefined;
  return registry
    .filter((p) => p.status === "live")
    .filter((p) => p.authMethods.some((m) => m.type === authType))
    .filter((p) => {
      if (!omit || omitAuthType !== authType) return true;
      return p.id !== omit.provider;
    });
}
