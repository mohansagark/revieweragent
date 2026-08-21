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
});
