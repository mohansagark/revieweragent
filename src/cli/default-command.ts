const COMMANDS = new Set(["init", "uninstall", "review", "help"]);

/** `npx revieweragent` with no subcommand runs `init` (one-time install). */
export function argvWithDefaultInitCommand(argv: string[]): string[] {
  const askingHelp = argv.includes("-h") || argv.includes("--help") || argv.includes("-V") || argv.includes("--version");
  if (askingHelp) return argv;
  const first = argv[0];
  if (first && !first.startsWith("-") && COMMANDS.has(first)) return argv;
  return ["init", ...argv];
}
