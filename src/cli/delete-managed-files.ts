import { existsSync, rmSync } from "node:fs";
import { detectManagedWorkflow, detectManagedConfig } from "./detect-managed-files.js";

// SPEC.md §15 steps 1-2. Unmarked -> refuse (deletion, not overwrite, so
// the stakes of refusing wrong are lower, but the rule is identical).

const WORKFLOW_PATH = ".github/workflows/revieweragent.yml";
const CONFIG_PATH = ".revieweragent.yml";
const INSTRUCTIONS_DIR = ".revieweragent";

export interface DeleteResult {
  deleted: string[];
  refused: string[];
}

export function deleteManagedFiles(): DeleteResult {
  const deleted: string[] = [];
  const refused: string[] = [];

  const workflow = detectManagedWorkflow(WORKFLOW_PATH);
  if (workflow.exists) {
    if (workflow.managed) {
      rmSync(WORKFLOW_PATH);
      deleted.push(WORKFLOW_PATH);
    } else {
      refused.push(WORKFLOW_PATH);
    }
  }

  const config = detectManagedConfig(CONFIG_PATH);
  if (config.exists) {
    if (config.managed) {
      rmSync(CONFIG_PATH);
      deleted.push(CONFIG_PATH);
    } else {
      refused.push(CONFIG_PATH);
    }
  }

  // instructions.md is package-installed alongside the config; SPEC.md
  // §15 step 2 treats .revieweragent/ as installer-owned once the config
  // marker confirms this install belongs to us.
  if (config.managed && existsSync(INSTRUCTIONS_DIR)) {
    rmSync(INSTRUCTIONS_DIR, { recursive: true });
    deleted.push(INSTRUCTIONS_DIR);
  }

  return { deleted, refused };
}
