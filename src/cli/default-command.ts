const COMMANDS = new Set(["init", "uninstall", "review", "help"]);

/** `npx revieweragent` with no subcommand runs `init` (one-time install). */
export function argvWithDefaultInitCommand(argv: string[]): string[] {
  const askingHelp = argv.includes("-h") || argv.includes("--help") || argv.includes("-V") || argv.includes("--version");
  if (askingHelp) return argv;
  const hasCommand = argv.some((arg) => COMMANDS.has(arg));
  if (hasCommand) return argv;
  return ["init", ...argv];
}
