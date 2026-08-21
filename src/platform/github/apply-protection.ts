export interface ClassicProtection {
  required_status_checks: {
    strict?: boolean;
    contexts?: string[];
    checks?: Array<{ context: string; app_id?: number | null }>;
  } | null;
  enforce_admins?: { enabled?: boolean } | boolean | null;
  required_pull_request_reviews?: unknown;
  restrictions?: unknown;
  required_linear_history?: { enabled?: boolean } | boolean | null;
  allow_force_pushes?: { enabled?: boolean } | boolean | null;
  allow_deletions?: { enabled?: boolean } | boolean | null;
  block_creations?: { enabled?: boolean } | boolean | null;
  required_conversation_resolution?: { enabled?: boolean } | boolean | null;
  lock_branch?: { enabled?: boolean } | boolean | null;
  allow_fork_syncing?: { enabled?: boolean } | boolean | null;
}

export interface ClassicProtectionPut {
  required_status_checks: {
    strict: boolean;
    contexts: string[];
    checks: Array<{ context: string }>;
  };
  enforce_admins: boolean;
  required_pull_request_reviews: unknown;
  restrictions: unknown;
  required_linear_history?: boolean;
  allow_force_pushes?: boolean | null;
  allow_deletions?: boolean;
  block_creations?: boolean;
  required_conversation_resolution?: boolean;
  lock_branch?: boolean;
  allow_fork_syncing?: boolean;
}

function asBoolean(value: { enabled?: boolean } | boolean | null | undefined): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  return Boolean(value.enabled);
}

function names(list: unknown, key: "login" | "slug"): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const value = (item as Record<string, unknown>)[key];
        if (typeof value === "string") return value;
      }
      return "";
    })
    .filter((name) => name.length > 0);
}

function sanitizeActorLists(raw: unknown): { users: string[]; teams: string[]; apps: string[] } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const obj = raw as { users?: unknown; teams?: unknown; apps?: unknown };
  return {
    users: names(obj.users, "login"),
    teams: names(obj.teams, "slug"),
    apps: names(obj.apps, "slug"),
  };
}

function sanitizeReviews(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {
    dismiss_stale_reviews: Boolean(obj.dismiss_stale_reviews),
    require_code_owner_reviews: Boolean(obj.require_code_owner_reviews),
    required_approving_review_count: Number(obj.required_approving_review_count ?? 1),
  };
  if (typeof obj.require_last_push_approval === "boolean") {
    out.require_last_push_approval = obj.require_last_push_approval;
  }
  const dismissal = sanitizeActorLists(obj.dismissal_restrictions);
  if (dismissal) out.dismissal_restrictions = dismissal;
  const bypass = sanitizeActorLists(obj.bypass_pull_request_allowances);
  if (bypass) out.bypass_pull_request_allowances = bypass;
  return out;
}

export function getProtectionHasCheck(existing: ClassicProtection, checkName: string): boolean {
  const current = existing.required_status_checks;
  if (!current) return false;
  if ((current.contexts ?? []).includes(checkName)) return true;
  return (current.checks ?? []).some((check) => check.context === checkName);
}

export function mergeRequiredCheck(existing: ClassicProtection, checkName: string): ClassicProtectionPut {
  const current = existing.required_status_checks;
  const contexts = [...(current?.contexts ?? [])];
  const checks = [...(current?.checks ?? [])].map((check) => ({ context: check.context }));
  if (!contexts.includes(checkName)) contexts.push(checkName);
  if (!checks.some((check) => check.context === checkName)) checks.push({ context: checkName });
  if (checks.length === 0) {
    for (const context of contexts) checks.push({ context });
  }

  const next: ClassicProtectionPut = {
    required_status_checks: {
      strict: current?.strict ?? true,
      contexts,
      checks,
    },
    enforce_admins: asBoolean(existing.enforce_admins) ?? false,
    required_pull_request_reviews: sanitizeReviews(existing.required_pull_request_reviews),
    restrictions: sanitizeActorLists(existing.restrictions),
  };

  const linear = asBoolean(existing.required_linear_history);
  if (linear !== undefined) next.required_linear_history = linear;
  const forcePushes = asBoolean(existing.allow_force_pushes);
  if (existing.allow_force_pushes === null) next.allow_force_pushes = null;
  else if (forcePushes !== undefined) next.allow_force_pushes = forcePushes;
  const deletions = asBoolean(existing.allow_deletions);
  if (deletions !== undefined) next.allow_deletions = deletions;
  const blockCreations = asBoolean(existing.block_creations);
  if (blockCreations !== undefined) next.block_creations = blockCreations;
  const conversations = asBoolean(existing.required_conversation_resolution);
  if (conversations !== undefined) next.required_conversation_resolution = conversations;
  const lockBranch = asBoolean(existing.lock_branch);
  if (lockBranch !== undefined) next.lock_branch = lockBranch;
  const forkSync = asBoolean(existing.allow_fork_syncing);
  if (forkSync !== undefined) next.allow_fork_syncing = forkSync;

  return next;
}

export function protectionContainsCheck(payload: ClassicProtectionPut, checkName: string): boolean {
  return (
    payload.required_status_checks.contexts.includes(checkName) ||
    payload.required_status_checks.checks.some((check) => check.context === checkName)
  );
}
