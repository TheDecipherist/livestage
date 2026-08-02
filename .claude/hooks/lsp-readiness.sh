#!/usr/bin/env bash
# LSP readiness check. SessionStart (start, resume, /clear, compact).
# The build, audit, bug, and review skills route reference-finding through the
# LSP tool and fall back to grep only when no language server covers a file
# type. That fallback is SILENT: a half-configured LSP setup degrades every one
# of those skills to grep with no signal. This hook makes the half-configured
# state loud.
#
# It warns only when the setup is PARTIAL:
#   - plugin enabled but the language-server binary is missing, or
#   - the binary is present but no LSP plugin is enabled.
# Both present is silent (working). Both absent is silent (a deliberate no-LSP
# project, where the grep fallback is the correct behavior, no surprise).
#
# Every external input is overridable so the fixture suite drives it
# deterministically. Defaults are the real runtime.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

# jq is needed to read enabledPlugins. Fail open (silent) without it, matching
# the rest of the spine: MDD never halts or nags a session over a missing dep.
command -v jq >/dev/null 2>&1 || exit 0

LSP_SETTINGS="${MDD_LSP_SETTINGS:-.claude/settings.json}"
LSP_BIN="${MDD_LSP_BIN:-typescript-language-server}"
LSP_PLUGIN_KEY="${MDD_LSP_PLUGIN_KEY:-typescript-lsp}"

# Is the language-server binary on PATH?
bin_present=0
command -v "$LSP_BIN" >/dev/null 2>&1 && bin_present=1

# Is a matching LSP plugin enabled? (a true-valued enabledPlugins key whose name
# contains LSP_PLUGIN_KEY, e.g. typescript-lsp@claude-plugins-official)
plugin_enabled=0
if [ -f "$LSP_SETTINGS" ]; then
  match="$(jq -r --arg k "$LSP_PLUGIN_KEY" \
    '(.enabledPlugins // {}) | to_entries[] | select(.key | contains($k)) | select(.value == true) | .key' \
    "$LSP_SETTINGS" 2>/dev/null | head -n1)"
  [ -n "$match" ] && plugin_enabled=1
fi

# Both present, or both absent: nothing to say.
[ "$bin_present" = "$plugin_enabled" ] && exit 0

# Partial setup. Name the missing half and the one command that fixes it.
if [ "$plugin_enabled" = 1 ]; then
  printf 'LSP not ready: plugin enabled but "%s" is not on PATH. The build, audit, bug, and review skills will SILENTLY fall back to grep. Fix: npm install -g %s typescript, then restart Claude Code.\n' "$LSP_BIN" "$LSP_BIN"
else
  printf 'LSP not ready: "%s" is installed but no LSP plugin is enabled in %s. The LSP tool will not register a server, so the skills SILENTLY fall back to grep. Fix: claude plugin install %s@claude-plugins-official --scope project, then restart Claude Code.\n' "$LSP_BIN" "$LSP_SETTINGS" "$LSP_PLUGIN_KEY"
fi
exit 0
