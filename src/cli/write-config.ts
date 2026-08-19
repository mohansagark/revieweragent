import {
  serializeConfig,
  isManagedConfig,
  InvalidConfigYamlError,
  type RevieweragentConfig,
} from "../core/config-schema.js";

// SPEC.md §7: re-run overwrites only if the user confirms (the confirm
// step itself lives in the interactive CLI layer, T020); preserves
// unknown keys/comments when possible. If the existing file isn't valid
// YAML, refuse rather than clobber.

export class UnmanagedConfigConflictError extends Error {
  constructor(path: string) {
    super(
      `${path} exists without the revieweragent managed-file header. Refusing to overwrite without confirmation.`,
    );
    this.name = "UnmanagedConfigConflictError";
  }
}

export interface ConfigWriteResult {
  content: string;
  wasOverwrite: boolean;
}

/**
 * Pure resolution of what to write. `confirmed` must be true for any
 * overwrite of an existing file — the CLI layer is responsible for
 * obtaining that confirmation (interactively or via a non-interactive
 * flag) before calling this with `confirmed: true`.
 */
export function resolveConfigWrite(
  path: string,
  existingRaw: string | undefined,
  config: RevieweragentConfig,
  confirmed: boolean,
): ConfigWriteResult {
  if (existingRaw === undefined) {
    return { content: serializeConfig(config), wasOverwrite: false };
  }

  if (!isManagedConfig(existingRaw)) {
    throw new UnmanagedConfigConflictError(path);
  }

  if (!confirmed) {
    throw new UnmanagedConfigConflictError(path);
  }

  // Not valid YAML at all -> refuse regardless of confirmation
  // (serializeConfig itself throws InvalidConfigYamlError in that case).
  try {
    const content = serializeConfig(config, existingRaw);
    return { content, wasOverwrite: true };
  } catch (err) {
    if (err instanceof InvalidConfigYamlError) throw err;
    throw err;
  }
}

export { isManagedConfig };
