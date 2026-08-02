#!/usr/bin/env bash
# Env contract sync. Stop hook, warn-only (never blocks).
#
# .env is readable and private; .env.example is the committed contract that
# tells every other developer which variables exist. This hook keeps the
# contract honest: it reports keys present in .env but missing from
# .env.example. SECURITY: reads key NAMES only, never values.
set -uo pipefail

ENV_FILE="${MDD_ENV_FILE:-.env}"
EXAMPLE_FILE="${MDD_ENV_EXAMPLE:-.env.example}"

[ -f "$ENV_FILE" ] || exit 0
[ -f "$EXAMPLE_FILE" ] || exit 0

keys() {
  grep -E '^(export )?[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null \
    | sed 's/^export //' | cut -d= -f1 | sort -u
}

missing="$(comm -23 <(keys "$ENV_FILE") <(keys "$EXAMPLE_FILE"))"
[ -z "$missing" ] && exit 0

printf 'env contract drift: keys in %s missing from %s (other developers will not know these exist):\n' "$ENV_FILE" "$EXAMPLE_FILE"
printf '  %s\n' $missing
printf 'Add them to %s with placeholder values.\n' "$EXAMPLE_FILE"
exit 0
