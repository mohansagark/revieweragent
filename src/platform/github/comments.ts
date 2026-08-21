import type { Octokit } from "@octokit/rest";

const WORKFLOW_COMMENT_ACTOR = "github-actions[bot]";

export interface CommentPort {
  upsertComment(pr: number, marker: string, body: string): Promise<void>;
}

export function createGitHubCommentPort(octokit: Octokit, owner: string, repo: string): CommentPort {
  return {
    async upsertComment(pr: number, marker: string, body: string): Promise<void> {
      let existingId: number | undefined;
      for await (const response of octokit.paginate.iterator(octokit.issues.listComments, {
        owner,
        repo,
        issue_number: pr,
        per_page: 100,
      })) {
        const page = response.data as { id: number; body?: string | null; user?: { login?: string | null } | null }[];
        const match = page.find(
          (comment) => comment.user?.login === WORKFLOW_COMMENT_ACTOR && (comment.body ?? "").includes(marker),
        );
        if (match) {
          existingId = match.id;
          break;
        }
      }
      if (existingId !== undefined) {
        await octokit.issues.updateComment({ owner, repo, comment_id: existingId, body });
        return;
      }
      await octokit.issues.createComment({ owner, repo, issue_number: pr, body });
    },
  };
}

export async function postProgressComment(
  port: CommentPort,
  pr: number,
  marker: string,
  body: string,
): Promise<void> {
  try {
    await port.upsertComment(pr, marker, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`revieweragent: progress comment failed: ${message}`);
  }
}
