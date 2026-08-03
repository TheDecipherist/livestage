#!/usr/bin/env bash
# End-of-turn corpus sweep. Stop + SubagentStop.
#
# The last line of defense. The write-time validator (frontmatter-validate.sh)
# only fires on Write/Edit tool calls, so it never sees a doc changed through
# `sed -i` in a Bash call, a doc rewritten by a script, or a doc edited outside
# the session entirely. That is exactly how 28 of 48 docs in a real project
# ended up claiming complete with empty test_files while their own prose cited
# the test files by name: each individual gap slipped a gate that was looking
# the other way, and nothing ever re-read the corpus as a whole.
#
# This hook re-validates EVERY doc in .mdd/docs/ at the end of every turn, in
# one node process. Cheap (a 50-doc corpus is well under a second) and total:
# it does not matter HOW a doc got invalid, only that it is.
#
# Blocking policy, deliberate:
#   - An invalid doc that was TOUCHED this session (dirty or untracked in git)
#     blocks the stop: the reason is fed back and the session must fix its own
#     mess before it is allowed to finish. Getting it right the first time
#     beats finishing fast; a green "done" over an invalid doc is the failure
#     mode this kit exists to kill.
#   - An invalid doc that is CLEAN in git is pre-existing debt: reported in
#     one line (run /audit or /upgrade), never held hostage, because blocking
#     every session over history nobody just touched teaches people to
#     disable the hook.
#   - stop_hook_active guard: when this stop is already the forced
#     continuation of a previous block, report but never block again, so a
#     doc the model genuinely cannot fix does not loop the session forever.
#
# Fixture seams: MDD_DOCS (corpus dir), MDD_SWEEP_TOUCHED (space-separated
# paths treated as touched this session, overrides git detection).
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow
mdd_active || exit 0
command -v node >/dev/null 2>&1 || exit 0
VALIDATOR="$SCRIPT_DIR/lib/frontmatter-validate.cjs"
[ -f "$VALIDATOR" ] || exit 0

# Collect the corpus.
docs=()
while IFS= read -r d; do docs+=("$d"); done < <(find "$MDD_DOCS" -maxdepth 1 -name '*.md' ! -name '00-*' 2>/dev/null | sort)
[ "${#docs[@]}" -eq 0 ] && exit 0

# Validate every doc in ONE node process (the lib exports validate()).
sweep="$(MDD_DIR="$MDD_DIR" MDD_DOCS="$MDD_DOCS" node -e "
const { validate } = require(process.argv[1]);
const bad = [];
for (const d of process.argv.slice(2)) {
  try {
    const r = validate(d);
    if (r.errors.length) bad.push({ doc: d, errors: r.errors });
  } catch (e) { bad.push({ doc: d, errors: ['validator threw: ' + e.message] }); }
}
process.stdout.write(JSON.stringify(bad));
" "$VALIDATOR" "${docs[@]}" 2>/dev/null)"
rc=$?
if [ $rc -ne 0 ] || [ -z "$sweep" ]; then
  # The sweep itself failed: say so, never fail silent (a dead last line of
  # defense is the most dangerous kind, it looks like a clean corpus).
  printf '%s\n' "MDD sweep FAILED to run (exit $rc). The corpus was NOT re-validated this turn. Check: node .claude/hooks/lib/frontmatter-validate.cjs <doc>"
  exit 0
fi
[ "$sweep" = "[]" ] && exit 0

# Which docs did this session touch? Overridable for fixtures; otherwise git
# dirty/untracked under the docs dir. No git = no attribution = report-only.
touched=""
if [ -n "${MDD_SWEEP_TOUCHED:-}" ]; then
  touched="$MDD_SWEEP_TOUCHED"
elif git rev-parse --git-dir >/dev/null 2>&1; then
  touched="$(git status --porcelain -- "$MDD_DOCS" 2>/dev/null | sed 's/^...//; s/^.* -> //' | tr '\n' ' ')"
fi

block_msg=""
debt_n=0
block_n=0
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  doc="$(printf '%s' "$entry" | jq -r '.doc')"
  base="$(basename "$doc")"
  is_touched=0
  for t in $touched; do
    [ "$t" = "$doc" ] || [ "$(basename "$t")" = "$base" ] && { is_touched=1; break; }
  done
  if [ "$is_touched" -eq 1 ]; then
    block_n=$((block_n + 1))
    errs="$(printf '%s' "$entry" | jq -r '.errors[:3][]' | sed 's/^/    - /')"
    block_msg="$block_msg"$'\n'"  $base:"$'\n'"$errs"
  else
    debt_n=$((debt_n + 1))
  fi
done < <(printf '%s' "$sweep" | jq -c '.[]' 2>/dev/null)

if [ "$block_n" -gt 0 ]; then
  stop_active="$(mdd_field '.stop_hook_active')"
  if [ "$stop_active" != "true" ]; then
    mdd_block "MDD sweep: $block_n doc(s) changed this session fail schema validation. The turn is not done until its own docs are valid (getting it right the first time is the product):$block_msg"
  fi
  printf '%s\n' "MDD sweep: $block_n touched doc(s) STILL invalid after a forced continuation:$block_msg"
fi
[ "$debt_n" -gt 0 ] && printf '%s\n' "MDD sweep: $debt_n doc(s) fail schema validation but were not touched this session (pre-existing debt). Run /audit for the full list, /upgrade to migrate legacy docs."
exit 0
