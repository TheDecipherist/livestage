#!/usr/bin/env bash
# Secrets at the commit boundary. Stop hook, exit 2 BLOCKS.
#
# The kit deliberately allows READING .env: in a real coding environment Claude
# needs env access to wire config and debug. The line that must hold is secrets
# LEAVING the machine, and this hook is that line: it scans what is STAGED at
# the end of a turn. Complements scan-secrets.sh (write-time content) by
# catching what content scanning cannot: a sensitive FILE staged via bash
# (git add .env), key material added outside Edit/Write, a credentials file
# renamed into the tree.
#
# Three passes over `git diff --cached --name-only`:
#   1. sensitive filenames (.env family, credentials.json, .npmrc, ...)
#   2. private-key basenames (id_rsa, *.pem, *.key)
#   3. content patterns in staged hunks (AWS/GitHub/Slack/Stripe keys, PEM
#      blocks, generic hardcoded credentials that do not read from env)
# Ported from the starter kit; env-overridable repo dir for the fixture suite.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

REPO="${MDD_SECRETS_REPO:-.}"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

staged="$(git -C "$REPO" diff --cached --name-only 2>/dev/null)"
[ -n "$staged" ] || exit 0

findings=""

# Pass 1: sensitive filenames, basename-anchored.
while IFS= read -r f; do
  base="${f##*/}"
  case "$base" in
    .env|.env.local|.env.production|.env.staging|.env.development|secrets.json|credentials.json|service-account.json|.npmrc)
      findings="$findings
  staged sensitive file: $f" ;;
  esac
  # Pass 2: private key material by name.
  case "$base" in
    id_rsa|id_ed25519|id_ecdsa|id_dsa|*.pem|*.key)
      findings="$findings
  staged key material: $f" ;;
  esac
done <<EOF
$staged
EOF

# Pass 3: content patterns in the staged diff itself (added lines only).
diff_added="$(git -C "$REPO" diff --cached 2>/dev/null | grep '^+' | grep -v '^+++' || true)"
if [ -n "$diff_added" ]; then
  printf '%s' "$diff_added" | grep -qE 'AKIA[0-9A-Z]{16}' && findings="$findings
  AWS access key in staged diff"
  printf '%s' "$diff_added" | grep -qE '(ghp_|gho_|ghs_|ghr_)[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{22,}' && findings="$findings
  GitHub token in staged diff"
  printf '%s' "$diff_added" | grep -qE 'xox[bpras]-[0-9A-Za-z-]{10,}' && findings="$findings
  Slack token in staged diff"
  printf '%s' "$diff_added" | grep -qE '(sk_live_|pk_live_|rk_live_)[A-Za-z0-9]{10,}' && findings="$findings
  Stripe live key in staged diff"
  printf '%s' "$diff_added" | grep -qE -- '-----BEGIN[[:space:]]+(RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' && findings="$findings
  private key block in staged diff"
  if printf '%s' "$diff_added" | grep -qiE '(password|secret|token|api_key|apikey|api_secret)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/=_-]{16,}["'"'"']' \
     && ! printf '%s' "$diff_added" | grep -qiE '(process\.env|os\.environ|getenv|\$\{|ENV\[|env\()'; then
    findings="$findings
  hardcoded credential in staged diff"
  fi
fi

if [ -n "$findings" ]; then
  printf 'BLOCKED: secrets staged for commit.%s\n\nUnstage before continuing (git restore --staged <file>), move values to .env (readable, never committed), and if a real credential was exposed rotate it. .env.example with placeholders is the shareable contract.\n' "$findings"
  exit 2
fi
exit 0
