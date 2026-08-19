import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { decideSkip } from "../../src/cli/review-skip-rules.js";
import { defaultConfig } from "../../src/core/config-schema.js";
import type { EventContext } from "../../src/cli/review-event-context.js";

// SPEC.md §9's skip-vs-no-op table, exercised against simulated event
// contexts the way review-event-context.ts would produce them from the
// fixtures in tests/integration/fixtures/.

function mockOctokit(permission: string): Octokit {
  return {
    repos: {
      getCollaboratorPermissionLevel: vi.fn().mockResolvedValue({ data: { permission } }),
    },
  } as unknown as Octokit;
}

const baseCtx: EventContext = {
  eventName: "pull_request_target",
  action: "opened",
  prNumber: 42,
  headSha: "headsha1",
  baseSha: "basesha1",
  isDraft: false,
  isFork: false,
  prAuthorLogin: "alice",
  title: "",
  body: "",
};

describe("decideSkip", () => {
  it("skips draft PRs with no check on head (SPEC §9 draft row)", async () => {
    const octokit = mockOctokit("write");
    const decision = await decideSkip(octokit, "acme", "widgets", { ...baseCtx, isDraft: true }, defaultConfig());
    expect(decision).toEqual({ skip: true, reason: expect.stringContaining("draft") });
  });

  it("does not skip a same-repo, non-draft PR", async () => {
    const octokit = mockOctokit("write");
    const decision = await decideSkip(octokit, "acme", "widgets", baseCtx, defaultConfig());
    expect(decision).toEqual({ skip: false });
  });

  it("skips fork PRs under comment-gated policy with no /review yet", async () => {
    const octokit = mockOctokit("write");
    const forkCtx: EventContext = { ...baseCtx, isFork: true, prAuthorLogin: "outsider" };
    const decision = await decideSkip(
      octokit,
      "acme",
      "widgets",
      forkCtx,
      defaultConfig({ fork_policy: "comment-gated" }),
    );
    expect(decision.skip).toBe(true);
  });

  it("does not skip fork PRs under the default auto policy — that's the product intent", async () => {
    const octokit = mockOctokit("write");
    const forkCtx: EventContext = { ...baseCtx, isFork: true, prAuthorLogin: "outsider" };
    const decision = await decideSkip(octokit, "acme", "widgets", forkCtx, defaultConfig({ fork_policy: "auto" }));
    expect(decision).toEqual({ skip: false });
  });

  it("skips an issue_comment without the trigger phrase", async () => {
    const octokit = mockOctokit("write");
    const commentCtx: EventContext = {
      ...baseCtx,
      eventName: "issue_comment",
      action: "created",
      commentBody: "nice PR!",
      commenterLogin: "carol",
    };
    const decision = await decideSkip(octokit, "acme", "widgets", commentCtx, defaultConfig());
    expect(decision.skip).toBe(true);
  });

  it("skips an issue_comment with the trigger phrase from a non-write commenter", async () => {
    const octokit = mockOctokit("read");
    const commentCtx: EventContext = {
      ...baseCtx,
      eventName: "issue_comment",
      action: "created",
      commentBody: "/review",
      commenterLogin: "outsider",
    };
    const decision = await decideSkip(octokit, "acme", "widgets", commentCtx, defaultConfig());
    expect(decision.skip).toBe(true);
  });

  it("does not skip an issue_comment with the trigger phrase from a write-access commenter", async () => {
    const octokit = mockOctokit("write");
    const commentCtx: EventContext = {
      ...baseCtx,
      eventName: "issue_comment",
      action: "created",
      commentBody: "/review",
      commenterLogin: "maintainer",
    };
    const decision = await decideSkip(octokit, "acme", "widgets", commentCtx, defaultConfig());
    expect(decision).toEqual({ skip: false });
  });

  it("treats maintain permission as write access", async () => {
    const octokit = mockOctokit("maintain");
    const commentCtx: EventContext = {
      ...baseCtx,
      eventName: "issue_comment",
      action: "created",
      commentBody: "/review",
      commenterLogin: "org-maintainer",
    };
    const decision = await decideSkip(octokit, "acme", "widgets", commentCtx, defaultConfig());
    expect(decision).toEqual({ skip: false });
  });

  it("treats a 404 collaborator lookup as no write access, not a thrown job failure", async () => {
    const octokit = {
      repos: {
        getCollaboratorPermissionLevel: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 })),
      },
    } as unknown as Octokit;
    const commentCtx: EventContext = {
      ...baseCtx,
      eventName: "issue_comment",
      action: "created",
      commentBody: "/review",
      commenterLogin: "outsider",
    };
    const decision = await decideSkip(octokit, "acme", "widgets", commentCtx, defaultConfig());
    expect(decision).toEqual({ skip: true, reason: expect.stringContaining("write") });
  });
});
