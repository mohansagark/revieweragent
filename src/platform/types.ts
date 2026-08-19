// The v1 Platform port (SPEC.md §2). GitHub is the only implementation;
// this interface is the seam future platforms (GitLab, Bitbucket, Azure
// DevOps) would implement against without changing init/review.

export interface RepoIdentity {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export interface SecretsPort {
  putSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  hasSecret(name: string): Promise<boolean>;
}

export interface FindingComment {
  path: string;
  line: number;
  severity: string;
  message: string;
}

export interface ReviewPort {
  findExistingReview(
    pr: number,
    headSha: string,
  ): Promise<{ id: number } | undefined>;
  createReview(
    pr: number,
    headSha: string,
    summary: string,
    comments: FindingComment[],
  ): Promise<void>;
  updateReview(reviewId: number, pr: number, headSha: string, summary: string): Promise<void>;
}

export type CheckConclusion = "success" | "failure";

export interface CheckPort {
  upsertCheck(
    headSha: string,
    conclusion: CheckConclusion,
    title: string,
    summary: string,
  ): Promise<void>;
}

export interface ProtectionPort {
  // v1: not implemented — apply-protection is later work (SPEC.md §0, §13).
  // The port declares the shape so a future platform/version can add it
  // without reshaping init/review.
  describeRequiredCheckSetup(checkName: string): { settingsUrl: string };
}

export interface Platform {
  repoIdentity(): Promise<RepoIdentity>;
  secrets: SecretsPort;
  reviews: ReviewPort;
  checks: CheckPort;
  protection: ProtectionPort;
}
