/**
 * Resolves the location of the vendored skills directory.
 *
 * The orchestrated skills (master-plan, tdd, grill-with-docs, ...) are vendored
 * INTO the diablo package under `skills/`, so they ship with the npm package and
 * evolve lockstep with the plan parser. Their path must therefore be derived
 * from diablo's OWN module location — never the target project's cwd, since
 * `diablo run` executes inside an arbitrary project directory.
 *
 * Both layouts must work from one rule:
 *   - dev:   module at <root>/src/cli/main.ts, skills at <root>/skills
 *   - built: module at <root>/dist/main.js,   skills at <root>/skills
 *
 * Walking up from the module's directory until a `skills/` dir is found covers
 * both (and any nesting). Pure: the directory predicate is injected, so the
 * walk-up rule is unit-tested without touching the filesystem.
 */

/** Returns true if the given absolute path is an existing directory. */
export type DirExists = (path: string) => boolean;

/**
 * Walks up from `startDir`, returning the first ancestor (including startDir
 * itself) that contains a `skills/` directory. Throws if none is found.
 */
export function resolveSkillsDir(startDir: string, dirExists: DirExists): string {
  let dir = startDir;
  while (true) {
    const candidate = `${dir}/skills`;
    if (dirExists(candidate)) return candidate;

    const parent = dir.slice(0, dir.lastIndexOf("/"));
    if (parent === dir || parent === "") break;
    dir = parent;
  }
  throw new Error(
    `Vendored skills directory not found walking up from ${startDir}. ` +
      `Expected a 'skills/' directory in the diablo package.`,
  );
}

/** Builds the SKILL.md path for a named skill under a skills directory. */
export function skillFile(skillsDir: string, name: string): string {
  const base = skillsDir.endsWith("/") ? skillsDir.slice(0, -1) : skillsDir;
  return `${base}/${name}/SKILL.md`;
}
