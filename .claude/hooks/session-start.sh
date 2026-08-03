#!/usr/bin/env bash
# Session orientation. SessionStart (start, resume, /clear, compact).
# Injects the .mdd/.startup.md brief plus branch and dirty state. This replaces
# the forty-file read: Claude is oriented before the first prompt. Silent when
# there is nothing to say.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

# The standing brief for this project (features, tags, open notes).
[ -f "$MDD_DIR/.startup.md" ] && cat "$MDD_DIR/.startup.md"

# Live git context, cheap.
if git rev-parse --git-dir >/dev/null 2>&1; then
  line=""
  b="$(mdd_branch)"
  if [ -n "$b" ]; then line="Branch: $b"; fi
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then line="$line | dirty"; fi
  # Any recorded drift is worth surfacing at the top of a session.
  if [ -s "$MDD_DRIFT" ]; then
    n="$(sort -u "$MDD_DRIFT" 2>/dev/null | grep -c .)"
    [ "${n:-0}" -gt 0 ] && line="$line | $n doc(s) flagged drifted, run /scan"
  fi
  [ -n "$line" ] && printf '%s\n' "$line"
  # Self-heal: a fresh clone or a Windows round trip drops +x and every hook
  # dies with permission-denied, silently. The same copy leaves
  # :Zone.Identifier artifacts behind. One find each is cheap; repair and say so.
  broken="$(find "$SCRIPT_DIR" -type f -name '*.sh' ! -perm -u+x 2>/dev/null | wc -l | tr -d ' ')"
  zones="$(find "$SCRIPT_DIR/.." -name '*:Zone.Identifier' -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${broken:-0}" -gt 0 ] || [ "${zones:-0}" -gt 0 ]; then
    bash "$SCRIPT_DIR/fix-permissions.sh" >/dev/null 2>&1
    msg="Self-heal (fix-permissions.sh):"
    [ "${broken:-0}" -gt 0 ] && msg="$msg restored the executable bit on $broken hook script(s)."
    [ "${zones:-0}" -gt 0 ] && msg="$msg deleted $zones :Zone.Identifier artifact(s)."
    printf '%s\n' "$msg"
  fi
  # And verify every Node lib actually loads, so an ESM/CJS or syntax problem
  # is one visible line at session start instead of weeks of silent no-op gates.
  if command -v node >/dev/null 2>&1; then
    libfail=""
    for lib in "$SCRIPT_DIR"/lib/*.cjs "$SCRIPT_DIR/../statusline.cjs"; do
      [ -f "$lib" ] || continue
      node --check "$lib" >/dev/null 2>&1 || libfail="$libfail ${lib##*/}"
    done
    [ -n "$libfail" ] && printf '%s\n' "BROKEN Node libs (hooks depending on them are silently dead):$libfail. Fix before trusting any gate."
  fi
  # Setup gaps worth one line each at the top of a session (mdd-notes 1.5, 10.1).
  if mdd_active; then
    [ ! -f "CLAUDE.md" ] && printf '%s\n' "Setup gap: no project CLAUDE.md. Rule discovery runs on path globs alone; offer to generate one."
    # Dead USER-LEVEL hook registrations (an old install like mdd2 left
    # entries in ~/.claude/settings.json): every edit in every project sprays
    # "not found" errors that look like this kit's fault. One line, once.
    if [ -f "$HOME/.claude/settings.json" ] && command -v jq >/dev/null 2>&1; then
      dead="$(jq -r '.hooks // {} | .[] | .[] | .hooks[]? | .command // empty' "$HOME/.claude/settings.json" 2>/dev/null | while IFS= read -r c; do
        pth="$c"; case "$c" in node\ *|bash\ *|sh\ *|python3\ *) pth="${c#* }";; esac
        pth="${pth//\"/}"; pth="${pth/#\~/$HOME}"
        case "$pth" in /*) [ ! -e "$pth" ] && printf '%s\n' "$c";; esac
      done | head -3)"
      [ -n "$dead" ] && printf '%s\n' "Setup gap: ~/.claude/settings.json registers hooks whose files no longer exist (stale entries from an old install, they fire in EVERY project):" "$dead" "Remove those entries from your USER settings; bash .claude/hooks/fix-permissions.sh lists them all."
    fi
    # MDD installed but never fed (mdd-notes3 2.2): the whole doc-driven flow is
    # inert with zero feature docs, and nothing else says so out loud.
    docs_n="$(find "$MDD_DIR/docs" -maxdepth 1 -name '*.md' ! -name '00-*' 2>/dev/null | wc -l | tr -d ' ')"
    [ "${docs_n:-0}" -eq 0 ] && printf '%s\n' "Setup gap: MDD is installed but .mdd/docs/ has no feature docs, so drift tracking, /audit, and /plan-execute have nothing to work on. Start with /import-spec (existing spec), /build (new feature), or /update (document existing code)."
    if git check-ignore -q .claude 2>/dev/null; then
      printf '%s\n' "Setup gap: .claude/ is gitignored. Every rule, hook, and gate is untracked: a fresh clone has none of them and changes leave no history. Ignoring only .claude/settings.local.json instead is the usual fix (human decision)."
    fi
  fi
fi
exit 0
