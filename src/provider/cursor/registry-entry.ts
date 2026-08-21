import type { Provider } from "../registry.js";

export const cursorProvider: Provider = {
  id: "cursor",
  displayName: "Cursor",
  status: "live",
  authMethods: [
    {
      type: "subscription-oauth",
      secretName: "REVIEWERAGENT_CURSOR_API_KEY",
      acquireVia: "Cursor Dashboard / service-account API key (masked paste)",
      ciBackend: "Cursor CLI agent --mode ask, CURSOR_API_KEY, empty workspace",
    },
  ],
};
