#!/usr/bin/env bash
# Build-in-progress reminder. Stop hook. If the session ends while an MDD build
# is mid-flight (phase not idle), surface the state so it is not silently
# abandoned. Informational only, never blocks the stop.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_active || exit 0
phase="$(mdd_phase)"
[ "$phase" = "idle" ] && exit 0

gate=""
if [ -f "$MDD_STATE" ] && command -v jq >/dev/null 2>&1; then
  gate="$(jq -r '.gate // "none"' "$MDD_STATE" 2>/dev/null)"
  feature="$(jq -r '.feature // ""' "$MDD_STATE" 2>/dev/null)"
fi

msg="MDD build in progress: phase '$phase'"
[ -n "${feature:-}" ] && msg="$msg, feature '$feature'"
[ -n "$gate" ] && [ "$gate" != "none" ] && msg="$msg, gate '$gate'"
printf '%s. Resume with /status, or continue the build where it left off.\n' "$msg"
exit 0
