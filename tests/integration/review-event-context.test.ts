import { describe, it, expect, afterEach } from "vitest";
import type { Octokit } from "@octokit/rest";
import { resolveEventContext } from "../../src/cli/review-event-context.js";

const FIXTURES = "tests/integration/fixtures";

describe("resolveEventContext", () => {
  const originalEventPath = process.env.GITHUB_EVENT_PATH;
  const originalEventName = process.env.GITHUB_EVENT_NAME;

  afterEach(() => {
    process.env.GITHUB_EVENT_PATH = originalEventPath;
    process.env.GITHUB_EVENT_NAME = originalEventName;
  });

  it("resolves a same-repo opened PR as not a fork", async () => {
    process.env.GITHUB_EVENT_NAME = "pull_request_target";
    process.env.GITHUB_EVENT_PATH = `${FIXTURES}/pull_request_target.same_repo.opened.json`;
    const ctx = await resolveEventContext({} as Octokit, "acme", "widgets");
    expect(ctx.isFork).toBe(false);
    expect(ctx.isDraft).toBe(false);
    expect(ctx.prNumber).toBe(42);
    expect(ctx.headSha).toBe("headsha1");
    expect(ctx.title).toBe("Add widgets");
    expect(ctx.body).toBe("Please review");
  });

  it("resolves a draft PR", async () => {
    process.env.GITHUB_EVENT_NAME = "pull_request_target";
    process.env.GITHUB_EVENT_PATH = `${FIXTURES}/pull_request_target.draft.json`;
    const ctx = await resolveEventContext({} as Octokit, "acme", "widgets");
    expect(ctx.isDraft).toBe(true);
  });

  it("resolves a fork PR as a fork", async () => {
    process.env.GITHUB_EVENT_NAME = "pull_request_target";
    process.env.GITHUB_EVENT_PATH = `${FIXTURES}/pull_request_target.fork.json`;
    const ctx = await resolveEventContext({} as Octokit, "acme", "widgets");
    expect(ctx.isFork).toBe(true);
    expect(ctx.prAuthorLogin).toBe("outsider");
  });

  it("maps a merge_group head_ref to the PR number", async () => {
    process.env.GITHUB_EVENT_NAME = "merge_group";
    process.env.GITHUB_EVENT_PATH = `${FIXTURES}/merge_group.mapped.json`;
    const octokit = {
      pulls: {
        get: async () => ({
          data: {
            number: 42,
            title: "Add widgets",
            body: "Please review",
            draft: false,
            user: { login: "alice" },
            head: { sha: "headsha1", repo: { full_name: "acme/widgets" } },
            base: { sha: "basesha1", repo: { full_name: "acme/widgets" } },
          },
        }),
      },
    } as unknown as Octokit;
    const ctx = await resolveEventContext(octokit, "acme", "widgets");
    expect(ctx.eventName).toBe("merge_group");
    expect(ctx.prNumber).toBe(42);
    expect(ctx.headSha).toBe("mgheadsha");
    expect(ctx.baseSha).toBe("mgbasesha");
  });
});
