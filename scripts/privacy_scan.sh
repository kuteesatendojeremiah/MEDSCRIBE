#!/usr/bin/env bash
# Blueprint §15.2: search the repo, temp dirs and log output for the synthetic marker.
# Exits non-zero if the marker is found anywhere it should not be.
# Usage: ./scripts/privacy_scan.sh [extra_dir ...]
MARKER="SYNTHETIC-MARKER-7Q4Z"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=0

# Files that intentionally define/seed the marker (tests, the scan itself).
ALLOW=(
  --exclude=privacy_scan.sh --exclude=eval_report.py
  --exclude-dir=tests --exclude-dir=e2e  # test code names the marker to seed it
  --exclude-dir=docs  # documentation names the marker; it holds no session content
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv
  --exclude-dir=__pycache__ --exclude-dir=.pytest_cache --exclude-dir=.ruff_cache
)

scan() {
  local label="$1"; shift
  local hits
  hits=$(grep -rIl "${ALLOW[@]}" -- "$MARKER" "$@" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "FOUND marker in $label:"
    echo "$hits"
    status=1
  fi
}

scan "repo" "$ROOT"
[ -d "$ROOT/logs" ] && scan "logs" "$ROOT/logs"
for t in "${TMPDIR:-}" /tmp "${TEMP:-}" "$@"; do
  [ -n "$t" ] && [ -d "$t" ] || continue
  # skip the Claude Code working area, which holds tool transcripts, not app output
  hits=$(grep -rIl --exclude-dir=claude --exclude-dir=playwright-transform-cache --exclude=privacy_scan.sh -- "$MARKER" "$t" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FOUND marker in temp dir $t:"; echo "$hits"; status=1; fi
done

if [ $status -eq 0 ]; then echo "privacy_scan: 0 hits"; fi
exit $status
