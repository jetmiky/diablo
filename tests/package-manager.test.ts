import { describe, expect, test } from "bun:test";
import {
  bootstrapCommands,
  PACKAGE_MANAGERS,
  type PackageManager,
} from "../src/domain/package-manager.ts";

const TOOLING = ["husky", "@commitlint/cli", "@commitlint/config-conventional"];

describe("bootstrapCommands", () => {
  test("bun installs dev deps with `bun add -d` and inits husky with bunx", () => {
    const cmds = bootstrapCommands("bun");
    expect(cmds.install).toEqual({ cmd: "bun", args: ["add", "-d", ...TOOLING] });
    expect(cmds.huskyInit).toEqual({ cmd: "bunx", args: ["husky", "init"] });
  });

  test("npm installs dev deps with `npm install --save-dev` and inits husky with npx", () => {
    const cmds = bootstrapCommands("npm");
    expect(cmds.install).toEqual({ cmd: "npm", args: ["install", "--save-dev", ...TOOLING] });
    expect(cmds.huskyInit).toEqual({ cmd: "npx", args: ["husky", "init"] });
  });

  test("pnpm installs dev deps with `pnpm add -D` and inits husky with `pnpm exec`", () => {
    const cmds = bootstrapCommands("pnpm");
    expect(cmds.install).toEqual({ cmd: "pnpm", args: ["add", "-D", ...TOOLING] });
    expect(cmds.huskyInit).toEqual({ cmd: "pnpm", args: ["exec", "husky", "init"] });
  });

  test("PACKAGE_MANAGERS lists exactly the three supported managers", () => {
    expect(PACKAGE_MANAGERS).toEqual(["bun", "npm", "pnpm"]);
  });

  test("every supported manager yields a complete command pair", () => {
    for (const pm of PACKAGE_MANAGERS as PackageManager[]) {
      const cmds = bootstrapCommands(pm);
      expect(cmds.install.cmd.length).toBeGreaterThan(0);
      expect(cmds.install.args).toContain("husky");
      expect(cmds.huskyInit.args).toEqual(expect.arrayContaining(["husky", "init"]));
    }
  });
});
