#!/usr/bin/env bash
# Drift Sentinel. PostToolUse (Edit|Write).
# Catches the case that makes docs drift: code edited outside a /command.
# If the edited file is referenced by a feature doc's frontmatter, that doc just
# went stale, so tell Claude to update it now. Never blocks. Only speaks when a
# controlling doc exists. Silent during an active build (the build owns its doc).
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow
mdd_active || exit 0

# A running build already owns and syncs its doc. Only watch ad-hoc edits.
[ "$(mdd_phase)" = "idle" ] || exit 0

fp="$(mdd_field '.tool_input.file_path')"
[ -n "$fp" ] || exit 0

# Only source code drifts a doc. Skip docs, config, and the workspace itself.
case "$fp" in
  *.md|*.json|*.yaml|*.yml|*.toml|*.lock|*.txt) exit 0 ;;
  */"$MDD_DIR"/*|"$MDD_DIR"/*) exit 0 ;;
esac

[ -d "$MDD_DOCS" ] || exit 0
ls "$MDD_DOCS"/*.md >/dev/null 2>&1 || exit 0

# Find a feature doc whose frontmatter references this file. Try the full path
# first, then the basename, so both relative and absolute edits resolve.
match="$(grep -rl -F -- "$fp" "$MDD_DOCS"/*.md 2>/dev/null | head -1)"
if [ -z "$match" ]; then
  base="$(basename "$fp")"
  match="$(grep -rl -F -- "$base" "$MDD_DOCS"/*.md 2>/dev/null | head -1)"
fi
[ -n "$match" ] || exit 0

docid="$(basename "$match" .md)"

# Insurance: record the drift so /scan and /status catch anything an
# inline update misses. The mark is the deterministic backstop.
printf '%s\n' "$docid" >> "$MDD_DRIFT" 2>/dev/null || true

mdd_note "MDD drift: you edited '$fp', controlled by feature doc $docid ($match). Update that doc now to match this change: add any new route to 'routes', any new model to 'models', and refresh 'last_synced'. If this changed behavior, contracts, or data flow rather than just adding a surface, run /update $docid for a full resync instead of patching the frontmatter inline. Do not stamp last_synced unless the doc content actually reflects the change."
