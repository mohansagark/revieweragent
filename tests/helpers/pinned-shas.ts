import type { PinnedShas } from "../../src/core/pinned-shas.js";

export const TEST_SHAS: PinnedShas = {
  checkoutSha: "a".repeat(40),
  reviewActionSha: "b".repeat(40),
  cacheSha: "c".repeat(40),
  actionOwner: "revieweragent-org",
  actionRepo: "revieweragent",
  claudeCodeVersion: "2.1.235",
};
