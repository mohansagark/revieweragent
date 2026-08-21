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

  it("always sends optional classic booleans so PUT cannot reset omitted fields", () => {
    const next = mergeRequiredCheck(
      {
        required_status_checks: { strict: true, contexts: ["ci"], checks: [{ context: "ci" }] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: null,
        restrictions: null,
      },
      "revieweragent",
    );
    expect(next.allow_deletions).toBe(false);
    expect(next.block_creations).toBe(false);
    expect(next.required_conversation_resolution).toBe(false);
    expect(next.lock_branch).toBe(false);
    expect(next.allow_fork_syncing).toBe(false);
    expect(next.required_linear_history).toBe(false);
    expect(next.allow_force_pushes).toBe(false);
  });

  it("backfills checks from legacy contexts so other required checks are not dropped", () => {
    const next = mergeRequiredCheck(
      {
        required_status_checks: { strict: true, contexts: ["ci", "lint"] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: null,
        restrictions: null,
      },
      "revieweragent",
    );
    expect(next.required_status_checks.contexts).toEqual(["ci", "lint", "revieweragent"]);
    expect(next.required_status_checks.checks.map((c) => c.context)).toEqual(["ci", "lint", "revieweragent"]);
  });

  it("preserves app_id on existing required checks", () => {
    const next = mergeRequiredCheck(
      {
        required_status_checks: {
          strict: true,
          contexts: ["ci"],
          checks: [{ context: "ci", app_id: 15368 }],
        },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: null,
        restrictions: null,
      },
      "revieweragent",
    );
    expect(next.required_status_checks.checks).toEqual([
      { context: "ci", app_id: 15368 },
      { context: "revieweragent" },
    ]);
  });
});
