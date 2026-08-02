#!/usr/bin/env bash
# Quality Gate. PostToolUse (Edit|Write). Warns on files that exceed the size
# guideline. The hard block at the verify phase is enforced by the build skill's
# verify step, not here, because a PostToolUse hook cannot undo a write.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow

fp="$(mdd_field '.tool_input.file_path')"
[ -n "$fp" ] || exit 0
[ -f "$fp" ] || exit 0

case "$fp" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rs) ;;
  *) exit 0 ;;
esac

lines="$(wc -l < "$fp" 2>/dev/null | tr -d ' ')"
limit="${MDD_MAX_FILE_LINES:-300}"
if [ "${lines:-0}" -gt "$limit" ] 2>/dev/null; then
  mdd_note "Quality gate: $fp is $lines lines, over the ${limit}-line guideline. Point at WHAT to extract, not just the number: pure functions and transforms in an oversized route/component file are a mechanical extraction, and the pure parts are exactly what is testable. (Enforced hard at the verify phase.)"
fi

if grep -nE 'void[[:space:]]+this\.[A-Za-z_][A-Za-z0-9_]*' "$fp" >/dev/null 2>&1; then
  mdd_note "Quality gate: $fp uses 'void this.<field>', which suppresses an unused injected dependency. If a constructor-injected dependency is voided while a module singleton of the same type is used instead, the injection is a dead wire. Wire the injected instance or remove the parameter."
fi

exit 0
