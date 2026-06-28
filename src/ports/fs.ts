/**
 * FsPort is the filesystem seam: read/write/exists on text files. Injecting it
 * keeps use-cases that touch disk (issue loading, progress writing) testable
 * with an in-memory fake. The live binding uses node:fs/promises.
 */
export interface FsPort {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
