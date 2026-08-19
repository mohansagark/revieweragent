// SPEC.md §3 — registry-driven provider list. v1 has exactly one live
// row (Claude); planned rows exist as data (status: "planned") so the
// installer core does not get rewritten when they light up, but they are
// never shown as fake disabled menu items in v1.

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
