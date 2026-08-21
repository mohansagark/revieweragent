import type { Provider } from "../registry.js";

// SPEC.md §3 — Claude v1 live row. Cursor is a separate registry entry.
export const claudeProvider: Provider = {
  id: "claude",
  displayName: "Claude",
  status: "live",
  authMethods: [
    {
      type: "subscription-oauth",
      secretName: "REVIEWERAGENT_CLAUDE_CODE_OAUTH_TOKEN",
      acquireVia: "claude setup-token",
      ciBackend: "Claude Code CLI, CLAUDE_CODE_OAUTH_TOKEN, no tools",
    },
    {
      type: "api-key",
      secretName: "REVIEWERAGENT_ANTHROPIC_API_KEY",
      acquireVia: "Console API key (masked paste)",
      ciBackend: "Anthropic Messages API, ANTHROPIC_API_KEY, no tools",
    },
  ],
};
