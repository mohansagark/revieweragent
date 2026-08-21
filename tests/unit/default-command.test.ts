import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { argvWithDefaultInitCommand, SUBCOMMANDS } from "../../src/cli/default-command.js";

describe("argvWithDefaultInitCommand", () => {
  it("defaults a bare invocation to init", () => {
    expect(argvWithDefaultInitCommand([])).toEqual(["init"]);
  });

  it("inserts init before flags when no subcommand is present", () => {
    expect(argvWithDefaultInitCommand(["--auth", "api-key"])).toEqual(["init", "--auth", "api-key"]);
  });

  it("leaves explicit subcommands alone", () => {
    expect(argvWithDefaultInitCommand(["uninstall", "--yes"])).toEqual(["uninstall", "--yes"]);
    expect(argvWithDefaultInitCommand(["init", "--mode", "gate"])).toEqual(["init", "--mode", "gate"]);
  });

  it("does not treat a flag value as a subcommand", () => {
    expect(argvWithDefaultInitCommand(["--auth", "review"])).toEqual(["init", "--auth", "review"]);
    expect(argvWithDefaultInitCommand(["--mode", "help"])).toEqual(["init", "--mode", "help"]);
  });

  it("does not rewrite --help, --version, or the help subcommand", () => {
    expect(argvWithDefaultInitCommand(["--help"])).toEqual(["--help"]);
    expect(argvWithDefaultInitCommand(["-h"])).toEqual(["-h"]);
    expect(argvWithDefaultInitCommand(["--version"])).toEqual(["--version"]);
    expect(argvWithDefaultInitCommand(["help"])).toEqual(["help"]);
  });

  it("lists every commander subcommand registered in index.ts", () => {
    const src = readFileSync("src/cli/index.ts", "utf8");
    const registered = [...src.matchAll(/\.command\("([^"]+)"\)/g)].map((match) => match[1]);
    expect([...registered].sort()).toEqual([...SUBCOMMANDS].sort());
  });
});
