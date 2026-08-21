import { claudeProvider } from "./claude/registry-entry.js";
import { cursorProvider } from "./cursor/registry-entry.js";

// SPEC.md §3 — registry-driven provider list. v1 live row: Claude.
// v2 lights up Cursor (Agent, subscription-oauth category, CURSOR_API_KEY).

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

export const providerRegistry: Provider[] = [claudeProvider, cursorProvider];

const categoryToAuthType: Record<PromptCategory, AuthMethodType> = {
  Agent: "subscription-oauth",
  Model: "api-key",
};

export function listProvidersForCategory(
  registry: Provider[],
  category: PromptCategory,
): Provider[] {
  const authType = categoryToAuthType[category];
  return registry
    .filter((p) => p.status === "live")
    .filter((p) => p.authMethods.some((m) => m.type === authType));
}
