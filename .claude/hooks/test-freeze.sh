#!/usr/bin/env bash
# Test Freeze Gate. PreToolUse (Edit|Write). The flagship enforcement.
# During the implementation phase, tests are frozen: block any edit to a file
# listed in state.test_files. Fix the implementation, not the test.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow

# Only active during implementation.
[ "$(mdd_phase)" = "implement" ] || exit 0

fp="$(mdd_field '.tool_input.file_path')"
[ -n "$fp" ] || exit 0
[ -f "$MDD_STATE" ] || exit 0

# Is the edited path one of the frozen test files? Match exact, or either path
# being a suffix of the other, so relative vs absolute paths both resolve.
frozen="$(jq -r --arg f "$fp" '
  (.test_files // [])
  | map(select(. as $t | ($t == $f) or ($f | endswith($t)) or ($t | endswith($f))))
  | length' "$MDD_STATE" 2>/dev/null)"

if [ "${frozen:-0}" -gt 0 ] 2>/dev/null; then
  mdd_deny "Tests are frozen during implementation. '$fp' is a test file for the feature being built. Fix the implementation, not the test. If the test itself is wrong, exit build mode, revise the feature doc, and re-run the Red Gate."
fi
exit 0
