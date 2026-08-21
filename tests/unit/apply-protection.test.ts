import { describe, expect, it } from "vitest";
import { mergeRequiredCheck } from "../../src/platform/github/apply-protection.js";

describe("apply-protection RMW (v2)", () => {
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
