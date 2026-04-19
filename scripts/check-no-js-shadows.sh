#!/bin/sh
# Guard against compiled .js shadows in packages/*/src/ directories.
# .js files alongside .ts files silently override them at runtime because
# package.json 'exports' reference paths without extensions. This has caused
# real outages. Source of truth is .ts — never .js.

set -e

violations=$(find packages/*/src -type f -name "*.js" \
  -not -name "*.d.ts" \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  2>/dev/null)

if [ -n "$violations" ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  BUILD BLOCKED: .js shadow files in packages/*/src/          ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  These .js files override .ts sources at runtime.            ║"
  echo "║  Source of truth is .ts. Delete these files before building. ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Offending files:"
  echo "$violations" | sed 's/^/  /'
  echo ""
  echo "Fix: rm the listed files, then rebuild."
  echo "Prevention: never run 'tsc' in this repo without --noEmit."
  echo ""
  exit 1
fi

echo "[shadow-guard] no .js shadows found in packages/*/src/ — OK"
