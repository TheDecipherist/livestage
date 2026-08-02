#!/usr/bin/env bash
# Shared helpers for MDD 2 hooks. Source this at the top of every hook:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "$SCRIPT_DIR/lib/common.sh"
#
# Every piece of external state a hook reads is overridable by an env var so the
# fixture suite can drive it deterministically. Defaults are the real runtime.

MDD_DIR="${MDD_DIR:-.mdd}"
MDD_STATE="${MDD_STATE:-$MDD_DIR/.state.json}"
MDD_DOCS="${MDD_DOCS:-$MDD_DIR/docs}"
MDD_DRIFT="${MDD_DRIFT:-$MDD_DIR/.drift}"

# Read all of stdin once into HOOK_INPUT.
mdd_read_input() { HOOK_INPUT="$(cat)"; }

# Extract a field from the hook JSON. Usage: mdd_field '.tool_input.file_path'
mdd_field() {
  printf '%s' "$HOOK_INPUT" | jq -r "$1 // empty" 2>/dev/null
}

# jq is required for JSON parsing. Workflow hooks fail OPEN (allow) without it,
# so MDD never halts a session over a missing dependency. Call this first.
mdd_require_jq_or_allow() {
  command -v jq >/dev/null 2>&1 || exit 0
}

# Is this an MDD project? (the workspace directory exists)
mdd_active() { [ -d "$MDD_DIR" ]; }

# Is the path inside the agent scratch space? .ai_temp/ (and the legacy
# _ai_temp/) is the agent's free zone: always gitignored (mdd-ensure adds the
# entry), and the write-gating hooks skip it entirely so "just do something
# temp" never fights the guards. Usage: mdd_is_ai_temp "$fp" && exit 0
mdd_is_ai_temp() {
  case "$1" in
    .ai_temp/*|*/.ai_temp/*|_ai_temp/*|*/_ai_temp/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Current MDD phase, or "idle" when there is no state file.
mdd_phase() {
  if [ -f "$MDD_STATE" ] && command -v jq >/dev/null 2>&1; then
    jq -r '.phase // "idle"' "$MDD_STATE" 2>/dev/null || echo idle
  else
    echo idle
  fi
}

# Current git branch (overridable for tests via MDD_BRANCH).
mdd_branch() { printf '%s' "${MDD_BRANCH:-$(git branch --show-current 2>/dev/null)}"; }

# PreToolUse: deny the tool call and exit 2. The reason is fed back to Claude.
mdd_deny() {
  local reason="${1//\"/\\\"}"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
  exit 2
}

# PreToolUse: warn and let the user decide, then exit 2.
mdd_ask() {
  local reason="${1//\"/\\\"}"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
  exit 2
}

# PostToolUse: surface an informational note to Claude, then exit 0 (never blocks).
mdd_note() { printf '%s\n' "$1"; exit 0; }

# PostToolUse: block and feed the reason back to Claude to fix, then exit 0.
# Used for hard schema violations the model must correct before continuing.
mdd_block() {
  local reason="$1"
  reason="${reason//\\/\\\\}"
  reason="${reason//\"/\\\"}"
  reason="${reason//$'\n'/\\n}"
  printf '{"decision":"block","reason":"%s"}\n' "$reason"
  exit 0
}
