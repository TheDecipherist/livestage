#!/usr/bin/env bash
# Branch Guard. PreToolUse (Edit|Write|NotebookEdit).
# Blocks editing files while on a protected branch in an MDD project.
# No-op outside an MDD project and on any non-protected branch.
#
# The guard exists to protect commit history, so it checks the TARGET PATH
# before denying (mdd-notes 3.1): a write outside the project root, or to a
# path git ignores, can never reach a commit and is allowed. Without this the
# guard blocked notes files and taught people to route around it with bash
# heredocs, which is worse than not having it.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow
mdd_active || exit 0

branch="$(mdd_branch)"
case "$branch" in
  main|master) ;;
  *) exit 0 ;;
esac

# Path exemptions: only deny writes that could actually touch commit history.
fp="$(mdd_field '.tool_input.file_path')"
# The agent scratch space is always free, gitignored or not (yet).
[ -n "$fp" ] && mdd_is_ai_temp "$fp" && exit 0
if [ -n "$fp" ]; then
  # Resolve the repo root (overridable for the fixture suite).
  root="${MDD_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
  # Normalize to an absolute path (MDD_REPO_ROOT may be relative in tests).
  [ -n "$root" ] && root="$(cd "$root" 2>/dev/null && pwd)"
  if [ -n "$root" ]; then
    # Normalize: expand ~ and make relative paths absolute against CWD.
    case "$fp" in
      "~/"*) abs="$HOME/${fp#\~/}" ;;
      /*) abs="$fp" ;;
      *) abs="$(pwd)/$fp" ;;
    esac
    # Outside the repo root: cannot reach a commit, allow.
    case "$abs" in
      "$root"/*|"$root") ;;
      *) exit 0 ;;
    esac
    # Gitignored inside the repo: cannot reach a commit, allow.
    if git -C "$root" check-ignore -q -- "$abs" 2>/dev/null; then
      exit 0
    fi
  fi
fi

mdd_deny "You are on protected branch '$branch'. Create a feature branch before editing: git checkout -b feat/<task-name>. Branching first costs one second, branching after being blocked wastes work. (Writes outside the repo or to gitignored paths are allowed, they cannot reach a commit.)"
