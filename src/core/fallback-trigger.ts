import type { ClassifiableError } from "./error-classifier.js";

/** Primary errors that may invoke an optional fallback backend (spec 2026-08-21). */
export function isFallbackTrigger(err: ClassifiableError): boolean {
  if (err.kind === "http_429") return true;
  return err.kind === "http_400" && err.auth === "subscription" && err.quotaSignal === true;
}
