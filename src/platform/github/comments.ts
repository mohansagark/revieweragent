import type { Octokit } from "@octokit/rest";

export interface CommentPort {
  postComment(pr: number, body: string): Promise<void>;
}

export function createGitHubCommentPort(octokit: Octokit, owner: string, repo: string): CommentPort {
  return {
    async postComment(pr: number, body: string): Promise<void> {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: pr,
        body,
      });
    },
  };
}

export async function postProgressComment(port: CommentPort, pr: number, body: string): Promise<void> {
  try {
    await port.postComment(pr, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`revieweragent: progress comment failed: ${message}`);
  }
}
