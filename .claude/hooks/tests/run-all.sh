#!/usr/bin/env bash
# Hook fixture runner. For every fixture under tests/fixtures/<hook>/, invoke
# ../<hook>.sh with the fixture's stdin and env, and compare the exit code and
# stdout/stderr substrings against the fixture's expectations.
#
# Run from anywhere:  bash .claude/hooks/tests/run-all.sh
#
# Fixture format (JSON):
#   {
#     "name":        "human readable",
#     "stdin":       <object passed to the hook as JSON on stdin>,
#     "env":         { "MDD_BRANCH": "main", ... },              // optional
#     "expect_exit": 0 | 2,
#     "expect_stdout_contains":     ["substring", ...],          // optional
#     "expect_stdout_not_contains": ["substring", ...],          // optional
#     "expect_stderr_contains":     ["substring", ...]           // optional
#   }
# Exit 0 if all pass, 1 if any fail.
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "$HOOKS_DIR/../.." && pwd)"
FIXTURES="$HOOKS_DIR/tests/fixtures"
cd "$PROJECT_ROOT"   # so relative env paths in fixtures resolve from the project root

if ! command -v jq >/dev/null 2>&1; then
  echo "FATAL: jq required to run the fixture suite" >&2
  exit 2
fi

PASS=0
FAIL=0
FAILED_NAMES=()

run_case() {
  local hook_name="$1" fixture="$2"
  local hook_path="$HOOKS_DIR/${hook_name}.sh"
  [[ -x "$hook_path" ]] || chmod +x "$hook_path" 2>/dev/null || true

  local name stdin expect_exit
  name=$(jq -r '.name' "$fixture")
  stdin=$(jq -c '.stdin' "$fixture")
  expect_exit=$(jq -r '.expect_exit' "$fixture")

  local out_file err_file actual_exit
  out_file=$(mktemp); err_file=$(mktemp)

  local env_exports
  env_exports=$(jq -r '(.env // {}) | to_entries | map("\(.key)=\(.value|tostring)") | .[]' "$fixture")

  if [[ -n "$env_exports" ]]; then
    printf '%s' "$stdin" | env $env_exports bash "$hook_path" >"$out_file" 2>"$err_file"
  else
    printf '%s' "$stdin" | bash "$hook_path" >"$out_file" 2>"$err_file"
  fi
  actual_exit=$?

  local ok=1
  [[ "$actual_exit" == "$expect_exit" ]] || ok=0

  check_subs() {
    local field="$1" file="$2" invert="$3" count i sub
    count=$(jq -r "(.${field} // []) | length" "$fixture")
    i=0
    while [[ $i -lt $count ]]; do
      sub=$(jq -r ".${field}[$i]" "$fixture")
      if [[ "$invert" == "no" ]]; then
        grep -qF -- "$sub" "$file" || ok=0
      else
        grep -qF -- "$sub" "$file" && ok=0
      fi
      i=$((i+1))
    done
  }
  check_subs "expect_stdout_contains"     "$out_file" "no"
  check_subs "expect_stdout_not_contains" "$out_file" "yes"
  check_subs "expect_stderr_contains"     "$err_file" "no"

  if [[ $ok -eq 1 ]]; then
    printf '  PASS  %s :: %s\n' "$hook_name" "$name"
    PASS=$((PASS+1))
  else
    printf '  FAIL  %s :: %s (exit=%s, expected=%s)\n' "$hook_name" "$name" "$actual_exit" "$expect_exit"
    printf '        stdout: %s\n' "$(head -c 400 "$out_file")"
    [[ -s "$err_file" ]] && printf '        stderr: %s\n' "$(head -c 400 "$err_file")"
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("$hook_name::$name")
  fi
  rm -f "$out_file" "$err_file"
}

for dir in "$FIXTURES"/*/; do
  [[ -d "$dir" ]] || continue
  hook_name=$(basename "$dir")
  [[ -f "$HOOKS_DIR/${hook_name}.sh" ]] || continue   # skip data-only dirs
  echo "== $hook_name =="
  for f in "$dir"*.json; do
    [[ -f "$f" ]] || continue
    run_case "$hook_name" "$f"
  done
done

# ---- Node lib smoke tests (mdd-notes2 1.1/1.2) ----
# Every .cjs lib must load and exit cleanly INSIDE a "type":"module" project,
# because that is the environment that killed all of them once: the host
# project's package.json set ESM scope and every CommonJS lib threw
# "require is not defined" while the wrappers failed open in silence.
echo "== node-libs =="
if command -v node >/dev/null 2>&1; then
  SMOKE="$(mktemp -d)"
  mkdir -p "$SMOKE/proj/.claude/hooks/lib" "$SMOKE/proj/.mdd"
  printf '{"type":"module"}\n' > "$SMOKE/proj/package.json"
  cp "$HOOKS_DIR"/lib/*.cjs "$SMOKE/proj/.claude/hooks/lib/" 2>/dev/null
  cp "$HOOKS_DIR/../statusline.cjs" "$SMOKE/proj/.claude/" 2>/dev/null
  cp -r "$HOOKS_DIR/lib/templates" "$SMOKE/proj/.claude/hooks/lib/" 2>/dev/null

  smoke() {  # name, command...
    local name="$1"; shift
    if (cd "$SMOKE/proj" && "$@" >/dev/null 2>"$SMOKE/err"); then
      printf '  PASS  node-libs :: %s loads and runs in an ESM project\n' "$name"
      PASS=$((PASS+1))
    else
      printf '  FAIL  node-libs :: %s failed in an ESM project: %s\n' "$name" "$(head -c 200 "$SMOKE/err")"
      FAIL=$((FAIL+1)); FAILED_NAMES+=("node-libs::$name")
    fi
  }

  smoke mdd-ensure           node .claude/hooks/lib/mdd-ensure.cjs
  smoke frontmatter-validate node .claude/hooks/lib/frontmatter-validate.cjs .mdd/no-such-doc.md
  smoke conformance-gen      env MDD_RULES_DIR=.claude/rules MDD_CONFORMANCE_OUT=out.test.ts node .claude/hooks/lib/conformance-gen.cjs
  smoke connections-gen      env MDD_DOCS=.mdd/docs MDD_CONNECTIONS=.mdd/connections.md node .claude/hooks/lib/connections-gen.cjs
  smoke statusbar            env CLAUDE_PROJECT_DIR="$SMOKE/proj" node .claude/hooks/lib/statusbar.cjs set smoke 1 2 testing
  smoke statusline           sh -c 'echo "{}" | node .claude/statusline.cjs'
  rm -rf "$SMOKE"
else
  echo "  SKIP  node not installed"
fi

echo
echo "RESULT: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
