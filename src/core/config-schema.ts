import { parseDocument, Document } from "yaml";

// SPEC.md §7 / contracts/revieweragent-config-schema.md — the
// .revieweragent.yml shape. Loaded from the base branch only; never PR
// head (SPEC.md §9, Constitution Principle IV).

export const CONFIG_SCHEMA_VERSION = 1;

export type AuthType = "subscription" | "api-key";
export type Mode = "advisory" | "gate";
export type Severity = "critical" | "high" | "medium" | "low" | "note";
export type BlockSeverity = "any" | Exclude<Severity, "note">;
export type ForkPolicy = "auto" | "comment-gated";
export type OnLimit = "skip" | "block";

export interface RevieweragentConfig {
  version: number;
  provider: "claude";
  auth: AuthType;
  mode: Mode;
  block_severity: BlockSeverity;
  max_diff_lines: number;
  max_prompt_tokens: number;
  on_limit: OnLimit;
  max_fork_reviews_per_actor_per_hour: number;
  fork_policy: ForkPolicy;
  trigger_phrase: string;
  exclude: string[];
}

export const DEFAULT_EXCLUDE = [
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lockb",
  "**/go.sum",
  "**/Cargo.lock",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.{png,jpg,jpeg,gif,webp,ico,pdf,zip,gz,tgz,wasm,bin}",
];

export function defaultConfig(overrides: Partial<RevieweragentConfig> = {}): RevieweragentConfig {
  return {
    version: CONFIG_SCHEMA_VERSION,
    provider: "claude",
    auth: "subscription",
    mode: "advisory",
    block_severity: "high",
    max_diff_lines: 4000,
    max_prompt_tokens: 80000,
    on_limit: "skip",
    max_fork_reviews_per_actor_per_hour: 5,
    fork_policy: "auto",
    trigger_phrase: "/review",
    exclude: DEFAULT_EXCLUDE,
    ...overrides,
  };
}

export const MANAGED_HEADER = [
  "# Managed by revieweragent — schema version below is required.",
].join("\n");

export const MANAGED_MARKER = "Managed by revieweragent";

export class UnrecognizedConfigVersionError extends Error {
  constructor(found: unknown) {
    super(`Unrecognized .revieweragent.yml version: ${String(found)}`);
    this.name = "UnrecognizedConfigVersionError";
  }
}

export class InvalidConfigYamlError extends Error {
  constructor(cause: unknown) {
    super(`.revieweragent.yml is not valid YAML: ${String(cause)}`);
    this.name = "InvalidConfigYamlError";
  }
}

/** Read + validate contract for the `review` runtime (fail-closed on bad version). */
export function parseConfig(raw: string): RevieweragentConfig {
  let doc: Document;
  try {
    doc = parseDocument(raw, { strict: true });
    if (doc.errors.length > 0) throw doc.errors[0];
  } catch (err) {
    throw new InvalidConfigYamlError(err);
  }

  const obj = doc.toJSON() ?? {};
  if (obj.version !== CONFIG_SCHEMA_VERSION) {
    throw new UnrecognizedConfigVersionError(obj.version);
  }

  // Unknown keys are ignored (with a warning left to the caller), not
  // stripped from what we return — the installer's write path preserves
  // them; the review runtime just doesn't need them.
  return { ...defaultConfig(), ...obj };
}

/**
 * Write contract for `init`: preserve unknown keys/comments when a prior
 * managed file exists (parse + merge known fields); write fresh with the
 * managed header otherwise. Refuses (throws) if an existing file isn't
 * valid YAML — never clobbers unparseable content.
 */
export function serializeConfig(
  config: RevieweragentConfig,
  existingRaw?: string,
): string {
  if (existingRaw !== undefined) {
    let doc: Document;
    try {
      doc = parseDocument(existingRaw, { strict: true });
      if (doc.errors.length > 0) throw doc.errors[0];
    } catch (err) {
      throw new InvalidConfigYamlError(err);
    }
    for (const [key, value] of Object.entries(config)) {
      doc.set(key, value);
    }
    // Real bug found in manual testing: MANAGED_HEADER is a YAML comment,
    // so parseDocument() preserves it as a leading comment on the
    // round-tripped document — doc.toString() already includes it. Simply
    // prepending MANAGED_HEADER again stacked a fresh copy on every
    // re-run. Strip any already-present copies (however many accumulated
    // from prior buggy runs) before adding exactly one back.
    const withoutHeader = stripLeadingManagedHeader(doc.toString());
    return `${MANAGED_HEADER}\n${withoutHeader}`;
  }

  const doc = new Document(config);
  return `${MANAGED_HEADER}\n${doc.toString()}`;
}

export function isManagedConfig(raw: string): boolean {
  return raw.includes(MANAGED_MARKER);
}

const MANAGED_HEADER_LINE = MANAGED_HEADER.split("\n")[0]!;

function stripLeadingManagedHeader(raw: string): string {
  const lines = raw.split("\n");
  let start = 0;
  while (lines[start] === MANAGED_HEADER_LINE) start += 1;
  return lines.slice(start).join("\n");
}
