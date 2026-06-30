/**
 * DirPort is the directory-listing seam: list the entry names directly inside a
 * directory. Separate from FsPort (read/write/exists on files) because directory
 * enumeration is a distinct capability — folding it into FsPort would force every
 * FsPort fake in the suite to grow a method it does not use.
 *
 * `listDir` returns the entry names (not full paths) on success, or `null` when
 * the path is not a readable directory — whether it is absent OR is a file. That
 * single null case is exactly what the issue-discovery helpers treat as "nothing
 * to enumerate here", so callers never branch on why.
 *
 * The live binding uses node:fs; use-cases take the port so they unit-test
 * against an in-memory fake.
 */
export interface DirPort {
  /** Entry names directly inside `path`, or null if it is not a readable directory. */
  listDir(path: string): string[] | null;
}
