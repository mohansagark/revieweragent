// SPEC.md §3 — registry-driven provider list. v1 live row: Claude.
// v2 lights up Cursor (Agent, subscription-oauth). v3: Copilot / OpenAI / Gemini.
// Planned rows may exist as data (status: "planned") so the installer core
// is not rewritten when they light up; they are not shown as menu items
// until their release.

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
