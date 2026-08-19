import { existsSync, readFileSync } from "node:fs";
import { isManagedWorkflow } from "./write-workflow.js";
import { isManagedConfig } from "./write-config.js";

// SPEC.md §15 steps 1-2: uninstall deletes only files this tool wrote,
// verified via the same ownership markers `init` checks before
// overwriting (T015/T016). Reused here rather than reimplemented so the
// two commands can never disagree about what counts as "managed."

export interface ManagedFileStatus {
  path: string;
  exists: boolean;
  managed: boolean;
}

export function detectManagedWorkflow(path: string): ManagedFileStatus {
  if (!existsSync(path)) return { path, exists: false, managed: false };
  return { path, exists: true, managed: isManagedWorkflow(readFileSync(path, "utf8")) };
}

export function detectManagedConfig(path: string): ManagedFileStatus {
  if (!existsSync(path)) return { path, exists: false, managed: false };
  return { path, exists: true, managed: isManagedConfig(readFileSync(path, "utf8")) };
}
