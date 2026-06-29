#!/usr/bin/env bash
#
# release-local.sh — build, pack, and (re)install diablo as a GLOBAL bun binary
# from the working tree, so `diablo` on your PATH runs the code you just edited.
#
# This exists because a source-only fix is invisible until the published artifact
# is rebuilt: the global `diablo` runs dist/main.js out of an installed tarball,
# not src/. This script closes that gap in one command and guards the three
# papercuts that bit us by hand:
#
#   1. husky/bun not on the PATH git+bun hand to lifecycle scripts (prepare,
#      pre-commit) -> we prepend node_modules/.bin and bun's dir.
#   2. `bun add -g <tgz>` from INSIDE the repo hits a DependencyLoop (it resolves
#      the package back to the local path) -> we install from a temp dir.
#   3. a stale global pinned to the same path blocks reinstall -> we remove it
#      first.
#
# Idempotent and self-verifying: it greps the installed artifact to prove the
# build actually shipped, and fails loudly if not.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- locate bun, then put bun + local bins on PATH for lifecycle scripts -------
BUN_BIN="${BUN_BIN:-$HOME/.bun/bin/bun}"
if [ ! -x "$BUN_BIN" ]; then
  if command -v bun >/dev/null 2>&1; then BUN_BIN="$(command -v bun)"; else
    echo "release-local: cannot find the 'bun' binary (set BUN_BIN=/path/to/bun)" >&2
    exit 1
  fi
fi
BUN_DIR="$(dirname "$BUN_BIN")"
export PATH="$REPO_ROOT/node_modules/.bin:$BUN_DIR:$PATH"

PKG_NAME="$("$BUN_BIN" -e 'console.log(require("./package.json").name)')"

echo "==> [1/5] build (rebuild dist/ from src/)"
"$BUN_BIN" run build

echo "==> [2/5] remove any stale global ($PKG_NAME) to avoid a reinstall dep-loop"
"$BUN_BIN" remove -g "$PKG_NAME" >/dev/null 2>&1 || true

echo "==> [3/5] pack a fresh tarball"
rm -f ./*.tgz
"$BUN_BIN" pm pack >/dev/null
TGZ="$(ls -t ./*.tgz | head -n1)"
TGZ_ABS="$REPO_ROOT/$(basename "$TGZ")"
echo "    packed: $(basename "$TGZ_ABS")"

echo "==> [4/5] install globally from the tarball (from a temp dir, not the repo)"
( cd "$(mktemp -d)" && "$BUN_BIN" add -g "$TGZ_ABS" )

echo "==> [5/5] verify the installed binary carries the build"
GLOBAL="$(readlink -f "$BUN_DIR/diablo")"
if grep -q 'stdio: *"inherit"' "$GLOBAL"; then
  echo "    OK  -> $GLOBAL"
  echo "    interactive stdio present in the installed artifact."
else
  echo "release-local: installed artifact at $GLOBAL is MISSING the expected build" >&2
  echo "  (no 'stdio: \"inherit\"' found — the global may not have updated)" >&2
  exit 1
fi

# The tarball is a throwaway build artifact; don't leave it in the tree.
rm -f "$TGZ_ABS"

echo
echo "Done. \`diablo\` on your PATH now runs the current working tree."
