import type { PrFile } from "./diff-limits.js";
import type { FindingComment } from "../platform/types.js";

export function formatFilePatches(files: PrFile[]): string {
  return files
    .map((f) => `diff --git a/${f.filename} b/${f.filename}\n--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch ?? ""}`)
    .join("\n");
}

export function rightSideLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const header = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      newLine = Number(header[1]);
      continue;
    }
    if (raw.startsWith("\\")) continue;
    if (raw.startsWith("-")) continue;
    if (raw.startsWith("+")) {
      lines.add(newLine);
      newLine += 1;
      continue;
    }
    if (raw.startsWith(" ") || raw === "") {
      if (newLine > 0) {
        lines.add(newLine);
        newLine += 1;
      }
    }
  }
  return lines;
}

export function commentsInDiff(files: PrFile[], comments: FindingComment[]): FindingComment[] {
  const byFile = new Map<string, Set<number>>();
  for (const file of files) {
    byFile.set(file.filename, rightSideLines(file.patch ?? ""));
  }
  return comments.filter((c) => byFile.get(c.path)?.has(c.line) === true);
}
