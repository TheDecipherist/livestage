#!/usr/bin/env bash
# No em dashes. PreToolUse (Edit|Write). Kit-wide writing rule: no em dashes
# anywhere in the source, use a comma or a single hyphen. Models emit em dashes
# habitually, so this is enforced, not suggested. Denies code files outright.
# Markdown is covered too, except .claude/ (kit files legitimately use them)
# and .mdd/specs/ (verbatim spec snapshots are immutable imports).
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow

fp="$(mdd_field '.tool_input.file_path')"
[ -n "$fp" ] || exit 0

# Never police the kit's own files or imported spec snapshots.
case "$fp" in
  *.claude/*|*/.mdd/specs/*|*node_modules/*) exit 0 ;;
esac

case "$fp" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.yaml|*.yml|*.md) ;;
  *) exit 0 ;;
esac

content="$(mdd_field '.tool_input.content')"
[ -z "$content" ] && content="$(mdd_field '.tool_input.new_string')"
[ -z "$content" ] && exit 0

# U+2014 em dash (and U+2013 en dash, same fix applies).
if printf '%s' "$content" | grep -q $'—\|–'; then
  mdd_deny "No em dashes in source (project rule). Replace every em/en dash in $fp with a comma or a single hyphen, then retry the write."
fi

exit 0
