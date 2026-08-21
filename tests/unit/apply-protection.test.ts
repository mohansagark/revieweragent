import { describe, expect, it } from "vitest";
import { mergeRequiredCheck, getProtectionHasCheck } from "../../src/platform/github/apply-protection.js";

describe("apply-protection RMW (v2)", () => {
  it("adds revieweragent to classic required_status_checks.contexts", () => {
    const next = mergeRequiredCheck(
      {
        required_status_checks: { strict: true, contexts: ["ci"], checks: [{ context: "ci" }] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: null,
        restrictions: null,
      },
      "revieweragent",
    );
    expect(next.required_status_checks.contexts).toEqual(["ci", "revieweragent"]);
    expect(next.required_status_checks.checks.map((c) => c.context)).toEqual(["ci", "revieweragent"]);
    expect(next.enforce_admins).toBe(true);
  });

  it("is idempotent when the check is already required", () => {
    const existing = {
      required_status_checks: {
        strict: false,
        contexts: ["revieweragent"],
        checks: [{ context: "revieweragent" }],
      },
      enforce_admins: { enabled: false },
      required_pull_request_reviews: null,
      restrictions: null,
    };
    const next = mergeRequiredCheck(existing, "revieweragent");
    expect(next.required_status_checks.contexts).toEqual(["revieweragent"]);
  });

  it("enables required_status_checks when the branch had none", () => {
    const next = mergeRequiredCheck(
      {
        required_status_checks: null,
        enforce_admins: { enabled: false },
        required_pull_request_reviews: null,
        restrictions: null,
      },
      "revieweragent",
    );
    expect(next.required_status_checks.contexts).toEqual(["revieweragent"]);
    expect(next.required_status_checks.strict).toBe(true);
  });

  it("getProtectionHasCheck reads the GET payload without adding the check", () => {
    expect(
      getProtectionHasCheck(
        {
          required_status_checks: { strict: true, contexts: ["ci"], checks: [{ context: "ci" }] },
          enforce_admins: { enabled: true },
          required_pull_request_reviews: null,
          restrictions: null,
        },
        "revieweragent",
      ),
    ).toBe(false);
    expect(
      getProtectionHasCheck(
        {
          required_status_checks: {
            strict: true,
            contexts: ["ci", "revieweragent"],
            checks: [{ context: "ci" }, { context: "revieweragent" }],
          },
          enforce_admins: { enabled: true },
          required_pull_request_reviews: null,
          restrictions: null,
        },
        "revieweragent",
      ),
    ).toBe(true);
  });

  it("sanitizes review/restriction actor objects into PUT login/slug lists", () => {
    const next = mergeRequiredCheck(
      {
        required_status_checks: { strict: true, contexts: ["ci"], checks: [{ context: "ci" }] },
        enforce_admins: { enabled: false },
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          required_approving_review_count: 2,
          dismissal_restrictions: { users: [{ login: "alice" }], teams: [{ slug: "core" }] },
        },
        restrictions: { users: [{ login: "bob" }], teams: [{ slug: "ops" }], apps: [] },
        required_linear_history: { enabled: true },
      },
      "revieweragent",
    );
    expect(next.required_pull_request_reviews).toMatchObject({
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 2,
      dismissal_restrictions: { users: ["alice"], teams: ["core"] },
    });
    expect(next.restrictions).toEqual({ users: ["bob"], teams: ["ops"], apps: [] });
    expect(next.required_linear_history).toBe(true);
  });
});
