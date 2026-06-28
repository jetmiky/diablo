/**
 * loadConfig reads diablo.config.json from disk and parses it into a
 * fully-defaulted config. When the file is absent, the built-in defaults apply
 * unchanged — diablo runs with no config present, exactly as before this
 * feature existed. The pure parsing/precedence rules live in domain/config.ts;
 * this use-case only sequences the filesystem read around them.
 */
import type { FsPort } from "../ports/fs.ts";
import { defaultConfig, parseConfig, type DiabloConfig } from "../domain/config.ts";

export interface LoadConfigDeps {
  fs: FsPort;
}

export async function loadConfig(deps: LoadConfigDeps, configPath: string): Promise<DiabloConfig> {
  if (!(await deps.fs.exists(configPath))) {
    return defaultConfig();
  }
  const text = await deps.fs.read(configPath);
  return parseConfig(text);
}
