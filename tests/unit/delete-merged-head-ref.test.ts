import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const script = join(process.cwd(), "scripts/delete-merged-head-ref.sh");

function classify(code: string): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("bash", [script, "--classify", code], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (err) {
    const failed = err as { status?: number; stdout?: string };
    return { status: failed.status ?? 1, stdout: failed.stdout ?? "" };
  }
}

describe("delete-merged-head-ref status handling", () => {
  it("treats 204 as deleted", () => {
    const result = classify("204");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("deleted");
  });

  it("treats 404 and 422 as already gone", () => {
    expect(classify("404")).toEqual({ status: 0, stdout: "already-gone\n" });
    expect(classify("422")).toEqual({ status: 0, stdout: "already-gone\n" });
  });

  it("fails other HTTP codes", () => {
    expect(classify("403").status).toBe(1);
    expect(classify("500").status).toBe(1);
  });

  it("refuses to delete the default branch", () => {
    const stdout = execFileSync(
      "bash",
      [script],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HEAD_REF: "main",
          DEFAULT_BRANCH: "main",
          GH_TOKEN: "test",
          GITHUB_REPOSITORY: "acme/widgets",
        },
      },
    );
    expect(stdout).toMatch(/refusing to delete default branch/);
  });
});
