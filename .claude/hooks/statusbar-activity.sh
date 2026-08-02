#!/usr/bin/env bash
# Status bar activity feed. PostToolUse (all tools), async. Records the last
# tool + file target, and separately the most recent Bash command, into
# .mdd/.status-activity.json so the status bar's line 2 shows what Claude is
# touching AND what command it last ran:
#   Line 2: [branch dirty ahead/behind] | [last tool target] | [$ current command] | [elapsed]
# Ported from mdd2's activity-writer, slimmed to the fields the bar renders.
# Best-effort, never blocks.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow
mdd_active || exit 0

tool="$(mdd_field '.tool_name')"
[ -n "$tool" ] || exit 0

target="$(mdd_field '.tool_input.file_path')"
[ -z "$target" ] && target="$(mdd_field '.tool_input.path')"
[ -z "$target" ] && target="$(mdd_field '.tool_input.pattern')"

cmd=""
if [ "$tool" = "Bash" ]; then
  cmd="$(mdd_field '.tool_input.command')"
  cmd="$(printf '%.60s' "$cmd")"
fi

out="${MDD_STATUS_ACTIVITY:-$MDD_DIR/.status-activity.json}"
tmp="$out.tmp"
prev="{}"
[ -f "$out" ] && prev="$(cat "$out" 2>/dev/null || printf '{}')"

# Merge: Bash updates only lastCommand (so the last touched file stays visible
# in its own group); every other tool updates lastTool/lastTarget.
printf '%s' "$prev" | jq -c --arg t "$tool" --arg g "$target" --arg c "$cmd" '
  (if $t != "Bash" then . + {lastTool: $t} + (if $g != "" then {lastTarget: $g} else {lastTarget: ""} end) else . end)
  + (if $c != "" then {lastCommand: $c} else {} end)
' > "$tmp" 2>/dev/null && mv "$tmp" "$out" 2>/dev/null
exit 0
