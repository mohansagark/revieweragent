// SPEC.md §7 CODEOWNERS: v2 writes a managed marker block. Uninstall
// removes only that block.

export const CODEOWNERS_START = "# revieweragent:start";
export const CODEOWNERS_END = "# revieweragent:end";

export function codeownersBlock(user: string): string {
  const owner = user.startsWith("@") ? user : `@${user}`;
  return [
    CODEOWNERS_START,
    `.github/workflows/revieweragent.yml  ${owner}`,
    `.revieweragent.yml                   ${owner}`,
    `.revieweragent/                      ${owner}`,
    CODEOWNERS_END,
  ].join("\n");
}

export type CodeownersWriteAction = "create" | "append" | "replace";
export type CodeownersRemoveAction = "update" | "delete" | "noop";

export function applyManagedCodeowners(
  existing: string | undefined,
  user: string,
): { action: CodeownersWriteAction; content: string } {
  const block = codeownersBlock(user);
  if (existing === undefined || existing.trim() === "") {
    return { action: "create", content: `${block}\n` };
  }
  if (!existing.includes(CODEOWNERS_START) || !existing.includes(CODEOWNERS_END)) {
    const trimmed = existing.endsWith("\n") ? existing : `${existing}\n`;
    return { action: "append", content: `${trimmed}\n${block}\n` };
  }
  return { action: "replace", content: replaceBlock(existing, block) };
}

export function removeManagedCodeowners(
  existing: string | undefined,
): { action: CodeownersRemoveAction; content: string } {
  if (!existing || !existing.includes(CODEOWNERS_START) || !existing.includes(CODEOWNERS_END)) {
    return { action: "noop", content: existing ?? "" };
  }
  const next = replaceBlock(existing, "").replace(/\n{3,}/g, "\n\n").trim();
  if (next === "") return { action: "delete", content: "" };
  return { action: "update", content: `${next}\n` };
}

function replaceBlock(existing: string, replacement: string): string {
  const start = existing.indexOf(CODEOWNERS_START);
  const end = existing.indexOf(CODEOWNERS_END);
  if (start === -1 || end === -1 || end < start) return existing;
  const before = existing.slice(0, start).replace(/\s+$/, "");
  const after = existing.slice(end + CODEOWNERS_END.length).replace(/^\s+/, "");
  const pieces = [before, replacement, after].filter((part) => part.length > 0);
  return `${pieces.join("\n\n")}\n`;
}
