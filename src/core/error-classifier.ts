import type { AuthType, Mode } from "./config-schema.js";

// SPEC.md §9 "Fail-closed vs availability" table / Constitution Principle
// III. The test, applied literally per failure: can someone without repo
// access cause this, and does it end on its own? Both true -> skip.
// Either false -> fail closed.

export type ErrorClass = "fail-closed" | "availability-skip";

export type ClassifiableError =
  | { kind: "missing_secret" }
  | { kind: "cli_missing" }
  | { kind: "http_401" }
  | { kind: "http_403" }
  | { kind: "http_429" }
  | { kind: "http_400"; auth: AuthType; quotaSignal?: boolean }
  | { kind: "http_5xx" }
  | { kind: "npm_fetch_fail_cache_miss" }
  | { kind: "invalid_json" }
  | { kind: "e2big" };

export function classifyError(err: ClassifiableError): ErrorClass {
  switch (err.kind) {
    case "missing_secret":
    case "cli_missing":
    case "http_401":
    case "http_403":
    case "invalid_json":
    case "e2big":
      return "fail-closed";
    case "http_429":
    case "http_5xx":
    case "npm_fetch_fail_cache_miss":
      return "availability-skip";
    case "http_400":
      if (err.auth === "api-key") return "fail-closed";
      return err.quotaSignal ? "availability-skip" : "fail-closed";
  }
}

export type CheckOutcomeKind = "PASS" | "BLOCK" | "availability-skip" | "fail-closed-infra";

export interface CheckOutcome {
  conclusion: "success" | "failure";
  titlePrefix?: "Review skipped:";
  exitCode: 0 | 1;
}

/**
 * Computes the check-run conclusion and process exit code for a given
 * outcome kind and mode (SPEC.md §9's conclusions table + "Job exit code"
 * note). Advisory mode is never fail-closed — it always exits 0.
 */
export function checkOutcomeFor(kind: CheckOutcomeKind, mode: Mode): CheckOutcome {
  if (mode === "advisory") {
    if (kind === "BLOCK") return { conclusion: "failure", exitCode: 0 };
    if (kind === "availability-skip") {
      return { conclusion: "success", titlePrefix: "Review skipped:", exitCode: 0 };
    }
    if (kind === "fail-closed-infra") return { conclusion: "failure", exitCode: 0 };
    return { conclusion: "success", exitCode: 0 };
  }

  // gate mode
  switch (kind) {
    case "PASS":
      return { conclusion: "success", exitCode: 0 };
    case "BLOCK":
      return { conclusion: "failure", exitCode: 1 };
    case "availability-skip":
      return { conclusion: "success", titlePrefix: "Review skipped:", exitCode: 0 };
    case "fail-closed-infra":
      return { conclusion: "failure", exitCode: 1 };
  }
}
