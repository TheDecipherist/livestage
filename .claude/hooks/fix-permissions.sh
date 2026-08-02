#!/usr/bin/env bash
# Restores the executable bit on the hook scripts, then verifies settings.json.
#
# Two failures this fixes. The first is the obvious one: a fresh clone, a copy
# through Windows, or an editor rewriting a file drops +x and every hook starts
# failing with permission-denied. The second is quieter and is why this reads
# settings.json rather than only globbing: a hook registered under a name that
# does not exist, or registered as a bare path when it is not executable, fails
# at the point it was supposed to be guarding something.
#
# Run it directly: bash .claude/hooks/fix-permissions.sh
# session-start.sh also runs it automatically whenever it finds a hook missing
# the executable bit, so a broken clone self-heals at the first session.
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$HOOKS_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$CLAUDE_DIR/.." && pwd)"
SETTINGS="$CLAUDE_DIR/settings.json"

fixed=0
problems=()

# 0. Delete Windows mark-of-the-web artifacts (mdd-notes3 3.3). Copying the
#    kit from a Windows filesystem into WSL creates a ":Zone.Identifier"
#    sibling for every file. They serve no purpose here: they double the
#    apparent file count, clutter every listing, and travel with the same
#    copy operation that strips the executable bits this script repairs.
zone_count="$(find "$CLAUDE_DIR" "$PROJECT_DIR/.mdd" -name '*:Zone.Identifier' -type f 2>/dev/null | wc -l | tr -d ' ')"
if [ "${zone_count:-0}" -gt 0 ]; then
  find "$CLAUDE_DIR" "$PROJECT_DIR/.mdd" -name '*:Zone.Identifier' -type f -delete 2>/dev/null
  echo "Deleted $zone_count :Zone.Identifier artifact(s) (Windows copy residue, no purpose here)."
fi

# 1. Every shell script under .claude/, including lib/ and the fixture suite.
#    common.sh is only ever sourced and does not need +x, but giving it the bit
#    costs nothing and saves explaining the exception to the next person.
while IFS= read -r script; do
  [ -x "$script" ] && continue
  chmod 755 "$script" || { problems+=("chmod failed: $script"); continue; }
  echo "  +x  ${script#"$PROJECT_DIR"/}"
  fixed=$((fixed + 1))
done < <(find "$CLAUDE_DIR" -type f -name '*.sh')

# 2. Cross-check against what settings.json actually registers.
#
#    A command is either an interpreter invocation ("node .../foo.cjs"), where
#    the file has to exist but not be executable, or a bare path, where it needs
#    both. Anything registered but missing from disk is a dead hook that no
#    chmod can repair, so it is reported instead.
if [ ! -f "$SETTINGS" ]; then
  echo "No settings.json, skipped the registration check."
elif ! command -v jq >/dev/null 2>&1; then
  echo "jq not installed, skipped the registration check."
else
  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue

    # Split the leading interpreter, if any, off the script path.
    interpreter=""
    path="$cmd"
    case "$cmd" in
      node\ * | bash\ * | sh\ * | python3\ *)
        interpreter="${cmd%% *}"
        path="${cmd#* }"
        ;;
    esac

    # Only project-local hooks are ours to fix. A hook shelling out to some
    # system binary is not this script's business.
    case "$path" in
      *'$CLAUDE_PROJECT_DIR'*) ;;
      *) continue ;;
    esac
    path="${path//\$CLAUDE_PROJECT_DIR/$PROJECT_DIR}"
    path="${path//\"/}"

    if [ ! -f "$path" ]; then
      problems+=("registered in settings.json, not on disk: $cmd")
      continue
    fi
    # Run through an interpreter: existence is enough.
    [ -n "$interpreter" ] && continue
    [ -x "$path" ] && continue

    chmod 755 "$path" || { problems+=("chmod failed: $path"); continue; }
    echo "  +x  ${path#"$PROJECT_DIR"/}"
    fixed=$((fixed + 1))
  done < <(jq -r '.hooks // {} | .[] | .[] | .hooks[]? | .command // empty' "$SETTINGS")
fi

if [ "$fixed" -eq 0 ]; then
  echo "All hook scripts already executable."
else
  echo "Fixed $fixed file(s)."
fi

if [ "${#problems[@]}" -gt 0 ]; then
  echo
  echo "Problems a chmod cannot fix:"
  printf '  %s\n' "${problems[@]}"
  exit 1
fi
exit 0
