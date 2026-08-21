import { describe, expect, it } from "vitest";
import {
  CODEOWNERS_END,
  CODEOWNERS_START,
  applyManagedCodeowners,
  codeownersBlock,
  removeManagedCodeowners,
} from "../../src/cli/codeowners.js";

describe("managed CODEOWNERS block (v2)", () => {
  it("creates a file with the marker block when missing", () => {
    const result = applyManagedCodeowners(undefined, "alice");
    expect(result.action).toBe("create");
    expect(result.content).toContain(CODEOWNERS_START);
    expect(result.content).toContain("@alice");
    expect(result.content).toContain(CODEOWNERS_END);
  });

  it("appends the block when a file exists without the marker", () => {
    const existing = "* @maintainers\n";
    const result = applyManagedCodeowners(existing, "alice");
    expect(result.action).toBe("append");
    expect(result.content).toContain("* @maintainers");
    expect(result.content).toContain(codeownersBlock("alice"));
  });

  it("replaces only the managed block when the marker is present", () => {
    const existing = ["* @maintainers", CODEOWNERS_START, ".revieweragent.yml  @old", CODEOWNERS_END, "docs/ @docs"].join(
      "\n",
    );
    const result = applyManagedCodeowners(existing, "alice");
    expect(result.action).toBe("replace");
    expect(result.content).toContain("* @maintainers");
    expect(result.content).toContain("docs/ @docs");
    expect(result.content).toContain("@alice");
    expect(result.content).not.toContain("@old");
  });

  it("uninstall removes only the managed block", () => {
    const existing = ["* @maintainers", "", codeownersBlock("alice"), "", "docs/ @docs"].join("\n");
    const result = removeManagedCodeowners(existing);
    expect(result.action).toBe("update");
    expect(result.content).toContain("* @maintainers");
    expect(result.content).toContain("docs/ @docs");
    expect(result.content).not.toContain(CODEOWNERS_START);
  });

  it("uninstall deletes the file when only the managed block remains", () => {
    const result = removeManagedCodeowners(codeownersBlock("alice"));
    expect(result.action).toBe("delete");
  });

  it("uninstall is a no-op when the marker is absent", () => {
    const result = removeManagedCodeowners("* @maintainers\n");
    expect(result.action).toBe("noop");
  });
});
