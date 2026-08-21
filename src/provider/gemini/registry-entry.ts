import type { Provider } from "../registry.js";

export const geminiProvider: Provider = {
  id: "gemini",
  displayName: "Gemini",
  status: "live",
  authMethods: [
    {
      type: "api-key",
      secretName: "REVIEWERAGENT_GEMINI_API_KEY",
      acquireVia: "Google AI Studio API key (masked paste)",
      ciBackend: "Gemini generateContent, GEMINI_API_KEY, no tools",
    },
  ],
};
