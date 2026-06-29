/**
 * The package managers diablo's bootstrap can drive. husky and commitlint are
 * Node tools, so these are all Node package managers; a project that wants
 * neither (e.g. Go/Rust/Python) skips bootstrap entirely rather than picking
 * one of these — see init-diablo's bootstrap policy.
 */
export const PACKAGE_MANAGERS = ["bun", "npm", "pnpm"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** A single command invocation: a binary and its argument vector. */
export interface Command {
  cmd: string;
  args: string[];
}

/** The two commands that install + initialise husky/commitlint for a manager. */
export interface BootstrapCommands {
  install: Command;
  huskyInit: Command;
}

/** The dev dependencies bootstrap installs, regardless of package manager. */
const TOOLING = ["husky", "@commitlint/cli", "@commitlint/config-conventional"];

/**
 * Maps a package manager to its dev-dependency install command and its husky
 * init command. Pure: the same input always yields the same commands, so the
 * mapping is unit-tested directly and the side-effecting runner is injected
 * elsewhere.
 */
export function bootstrapCommands(pm: PackageManager): BootstrapCommands {
  switch (pm) {
    case "bun":
      return {
        install: { cmd: "bun", args: ["add", "-d", ...TOOLING] },
        huskyInit: { cmd: "bunx", args: ["husky", "init"] },
      };
    case "npm":
      return {
        install: { cmd: "npm", args: ["install", "--save-dev", ...TOOLING] },
        huskyInit: { cmd: "npx", args: ["husky", "init"] },
      };
    case "pnpm":
      return {
        install: { cmd: "pnpm", args: ["add", "-D", ...TOOLING] },
        huskyInit: { cmd: "pnpm", args: ["exec", "husky", "init"] },
      };
  }
}
