import { execFileSync } from "node:child_process";

// SPEC.md §4: --commit stages and commits only the files init wrote
// (never a broad `git add -A`); refuses if the working tree has other
// uncommitted changes outside what init wrote — never bundles unrelated
// work into its commit. --push (requires --commit) pushes that commit.

export class UncommittedUnrelatedChangesError extends Error {
  constructor(paths: string[]) {
    super(
      `Refusing to commit: uncommitted changes exist outside the files init wrote: ${paths.join(", ")}`,
    );
    this.name = "UncommittedUnrelatedChangesError";
  }
}

const COMMIT_MESSAGE = "chore: install revieweragent\n\nWritten by `npx revieweragent init --commit`.";

export function parsePorcelainPaths(out: string): string[] {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const rest = line.slice(3);
      const renamed = rest.split(" -> ");
      const path = renamed.length > 1 ? renamed[renamed.length - 1]! : rest;
      return path.replace(/^"(.*)"$/, "$1").trim();
    });
}

function gitStatusPorcelain(): string[] {
  const out = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  return parsePorcelainPaths(out);
}

export function commitAndMaybePush(writtenPaths: string[], push: boolean): void {
  const changed = gitStatusPorcelain();
  const unrelated = changed.filter((path) => !writtenPaths.includes(path));
  if (unrelated.length > 0) {
    throw new UncommittedUnrelatedChangesError(unrelated);
  }

  execFileSync("git", ["add", ...writtenPaths], { stdio: "inherit" });
  execFileSync("git", ["commit", "-m", COMMIT_MESSAGE], { stdio: "inherit" });
  console.log("Committed.");

  if (push) {
    execFileSync("git", ["push"], { stdio: "inherit" });
    console.log("Pushed.");
  }
}
