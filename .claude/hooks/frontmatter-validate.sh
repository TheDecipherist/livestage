#!/usr/bin/env bash
# Frontmatter Validation. PostToolUse (Edit|Write).
# The feature docs are the product, so their frontmatter is ENFORCED against
# .mdd/00-frontmatter-spec.md on every write. Hard schema violations block (the
# reason is fed back to Claude to fix); soft issues warn. Validation logic lives
# in lib/frontmatter-validate.cjs (robust parsing + cross-doc checks).
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow

fp="$(mdd_field '.tool_input.file_path')"
[ -n "$fp" ] || exit 0

# Only MDD feature docs (MDD_DOCS, default .mdd/docs). The old */docs/*.md
# pattern matched ANY docs/ directory anywhere in the repo, not just the MDD
# corpus, false-firing on a project's own shipped docs/ (e.g. this project's
# docs/user-guide.md, feature 45) and on unrelated fixture directories named
# docs/ (feature 46's connections example, worked around there by naming its
# fixture corpus/ instead; this fix means that workaround is no longer
# required for future docs/-named fixtures, though the file stays as-is).
case "$fp" in
  */"$MDD_DOCS"/*.md|"$MDD_DOCS"/*.md) ;;
  *) exit 0 ;;
esac
[ -f "$fp" ] || exit 0

# Fail open if node is missing, MDD never halts a session over a dependency.
command -v node >/dev/null 2>&1 || exit 0
VALIDATOR="$SCRIPT_DIR/lib/frontmatter-validate.cjs"
[ -f "$VALIDATOR" ] || exit 0

errfile="$(mktemp)"
result="$(MDD_DIR="$MDD_DIR" MDD_DOCS="$MDD_DOCS" node "$VALIDATOR" "$fp" 2>"$errfile")"
rc=$?
if [ $rc -ne 0 ]; then
  # The validator CRASHED. Failing open silently here is how a blocking gate
  # becomes a no-op for weeks (mdd-notes2 1.1). Allow the write but say so.
  err="$(head -c 300 "$errfile" 2>/dev/null | tr '\n' ' ')"; rm -f "$errfile"
  mdd_note "MDD frontmatter validator FAILED to run (exit $rc): ${err:-no stderr}. Docs are NOT being validated until this is fixed. Try: bash .claude/hooks/fix-permissions.sh, and check node can load .claude/hooks/lib/frontmatter-validate.cjs"
fi
rm -f "$errfile"
[ -n "$result" ] || exit 0

errors="$(printf '%s' "$result" | jq -r '.errors[]?' 2>/dev/null)"
warnings="$(printf '%s' "$result" | jq -r '.warnings[]?' 2>/dev/null)"

if [ -n "$errors" ]; then
  msg="MDD frontmatter invalid in $fp (see .mdd/00-frontmatter-spec.md). Fix these before continuing:"
  while IFS= read -r e; do
    [ -n "$e" ] && msg="$msg"$'\n'"  - $e"
  done <<EOF
$errors
EOF
  mdd_block "$msg"
fi

if [ -n "$warnings" ]; then
  msg="MDD frontmatter warning in $fp:"
  while IFS= read -r w; do
    [ -n "$w" ] && msg="$msg"$'\n'"  - $w"
  done <<EOF
$warnings
EOF
  mdd_note "$msg"
fi

exit 0
