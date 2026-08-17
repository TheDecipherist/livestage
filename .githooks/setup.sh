#!/usr/bin/env bash
# Run once per checkout: node .githooks/setup.sh (or bash .githooks/setup.sh)
#
# .git/hooks is not versioned, so wiring these up is a setup step, not
# something that happens automatically on clone. This project keeps its
# dependency footprint minimal on purpose (see CLAUDE.md), so this is a
# plain script rather than a package-manager postinstall hook or a hooks
# manager dependency.
set -e
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push
echo "githooks: core.hooksPath set to .githooks. pre-commit and pre-push are now active for this checkout."
