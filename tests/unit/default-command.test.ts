import { describe, it, expect } from "vitest";
import { argvWithDefaultInitCommand } from "../../src/cli/default-command.js";

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

  it("does not rewrite --help or --version", () => {
    expect(argvWithDefaultInitCommand(["--help"])).toEqual(["--help"]);
    expect(argvWithDefaultInitCommand(["-h"])).toEqual(["-h"]);
    expect(argvWithDefaultInitCommand(["--version"])).toEqual(["--version"]);
  });
});
