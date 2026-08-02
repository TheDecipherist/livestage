#!/usr/bin/env bash
# Scans content for accidental secrets before writing. PreToolUse (Edit|Write).
# Uses "ask" (not deny) so the user can override for a genuine test fixture.
# Ported from the dotclaude reference kit.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL_NAME" = "Write" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
elif [ "$TOOL_NAME" = "Edit" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
else
  exit 0
fi
[ -z "$CONTENT" ] && exit 0

MATCHES=""
echo "$CONTENT" | grep -qE 'AKIA[0-9A-Z]{16}' && MATCHES="$MATCHES AWS access key (AKIA...);"
echo "$CONTENT" | grep -qiE '(aws_secret_access_key|secret_key)[[:space:]]*[=:][[:space:]]*["'\''"]?[A-Za-z0-9/+=]{40}' && MATCHES="$MATCHES AWS secret key;"
echo "$CONTENT" | grep -qE '(ghp_|gho_|ghs_|ghr_|github_pat_)[a-zA-Z0-9_]{20,}' && MATCHES="$MATCHES GitHub token;"
echo "$CONTENT" | grep -qE 'sk-[a-zA-Z0-9-]{20,}' && MATCHES="$MATCHES API key (sk-...);"
echo "$CONTENT" | grep -qE 'xox[bpras]-[0-9a-zA-Z-]{10,}' && MATCHES="$MATCHES Slack token;"
echo "$CONTENT" | grep -qE -- '-----BEGIN[[:space:]]+(RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' && MATCHES="$MATCHES private key block;"
echo "$CONTENT" | grep -qE '(mongodb|postgres|mysql|redis|amqp|smtp)(\+[a-z]+)?://[^:[:space:]]+:[^@[:space:]]+@' && MATCHES="$MATCHES connection string with credentials;"
if echo "$CONTENT" | grep -qiE '(password|secret|token|api_key|apikey|api_secret)[[:space:]]*[=:][[:space:]]*["'\''"][^"'\''"]{8,}["'\''"]' && \
   ! echo "$CONTENT" | grep -qiE '(password|secret|token|api_key|apikey|api_secret)[[:space:]]*[=:][[:space:]]*["'\''"]?(process\.env|os\.environ|getenv|\$\{|ENV\[|env\()'; then
  MATCHES="$MATCHES hardcoded credential;"
fi

if [ -n "$MATCHES" ]; then
  REASON="Possible secret detected in content:$MATCHES Review carefully before allowing."
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"$REASON\"}}"
  exit 2
fi
exit 0
