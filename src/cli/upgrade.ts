import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseConfig } from "../core/config-schema.js";
import { loadPinnedShas } from "../core/pinned-shas.js";
import { buildWorkflowYaml, isManagedWorkflow, UnmarkedWorkflowConflictError } from "./write-workflow.js";

const WORKFLOW_PATH = ".github/workflows/revieweragent.yml";
const CONFIG_PATH = ".revieweragent.yml";

export function upgradeManagedWorkflow(existingRaw: string, configRaw: string): string {
  if (!isManagedWorkflow(existingRaw)) {
    throw new UnmarkedWorkflowConflictError(WORKFLOW_PATH);
  }
  const config = parseConfig(configRaw);
  return buildWorkflowYaml({
    auth: config.auth,
    provider: config.provider,
    shas: loadPinnedShas(),
  });
}

export async function upgrade(): Promise<number> {
  try {
    if (!existsSync(WORKFLOW_PATH) || !existsSync(CONFIG_PATH)) {
      throw new Error("No revieweragent install found. Run `npx revieweragent init` first.");
    }
    const next = upgradeManagedWorkflow(readFileSync(WORKFLOW_PATH, "utf8"), readFileSync(CONFIG_PATH, "utf8"));
    writeFileSync(WORKFLOW_PATH, next);
    console.log("Upgraded .github/workflows/revieweragent.yml pins. Commit and push to activate.");
    return 0;
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: "upgrade_failed", message: (err as Error).message }) + "\n");
    return 1;
  }
}
