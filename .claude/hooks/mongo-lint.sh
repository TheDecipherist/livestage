#!/usr/bin/env bash
# mongo-lint. PreToolUse (Edit|Write). The mechanically checkable subset of the
# mongodb-rules rule. Blocks the unambiguous violation (a mongoose import),
# warns on the fuzzy ones. Everything judgment-based stays in the rule.
# PreToolUse so the mongoose block actually prevents the write.
#
# Triggering is by CONTENT, not path (mdd-notes3 2.1): a migration, seeder,
# backfill, or scratch script that talks to the database gets linted wherever
# it lives, .ai_temp/ included (only the branch guard exempts the scratch
# space). A throwaway script pointed at production Atlas is exactly the write
# that must not slip through ungated. Data-layer paths trigger on weaker
# signals.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/common.sh"

mdd_read_input
mdd_require_jq_or_allow

fp="$(mdd_field '.tool_input.file_path')"
[ -n "$fp" ] || exit 0

# The content being written (Write.content or Edit.new_string).
content="$(mdd_field '.tool_input.content')"
[ -z "$content" ] && content="$(mdd_field '.tool_input.new_string')"
[ -z "$content" ] && exit 0

# Trigger 1: the file lives in the data layer (lint even weak signals there).
in_data_layer=0
case "$fp" in
  *adapters/*|*.repository.*|*.repository|*/repository.*|*/db/*|*/db.*|*/models/*|*/atlas/*|*mongo*) in_data_layer=1 ;;
esac

# Trigger 2: the content itself talks to MongoDB, wherever the file lives.
mongo_signal=0
if printf '%s' "$content" | grep -qE "mongoose|mongodb(\+srv)?://|MongoClient|StrictDB|db\.collection\(|\.bulkWrite\(|\.aggregate\(|\.insertOne\(|\.insertMany\(|\.updateOne\(|\.updateMany\(|\.deleteOne\(|\.deleteMany\(|\.findOne\(|\.countDocuments\(|\\\$setOnInsert"; then
  mongo_signal=1
fi

[ "$in_data_layer" = "1" ] || [ "$mongo_signal" = "1" ] || exit 0

# Block: Mongoose is never used, native driver or StrictDB only.
if printf '%s' "$content" | grep -qE "require\((['\"])mongoose\1\)|from[[:space:]]+(['\"])mongoose\2|import[[:space:]]+.*mongoose"; then
  mdd_deny "mongodb-rules: Mongoose is not used in this codebase. Use the native MongoDB driver or StrictDB in $fp. Remove the mongoose import."
fi

# Destructive-delete gates (mongodb-rules, Destructive deletes). Test files are
# exempt: deleteMany({}) is the standard between-test cleanup.
is_test=0
case "$fp" in
  *test*|*spec*|*fixtures/*) is_test=1 ;;
esac
if [ "$is_test" = "0" ]; then
  # Block: empty-filter deleteMany is a collection wipe.
  if printf '%s' "$content" | grep -qE "deleteMany\([[:space:]]*(\{[[:space:]]*\})?[[:space:]]*\)"; then
    mdd_deny "mongodb-rules: deleteMany with an empty filter wipes the collection. Name what to delete, or if the store upserts on a stable key ask whether the delete is needed at all. ($fp)"
  fi
  # Block: a delete filter built on a negation deletes everything EXCEPT one
  # value, so one wrong constant destroys the store while reading as cleanup.
  if printf '%s' "$content" | grep -qE "deleteMany\([^)]*\\\$(ne|nin|not)"; then
    mdd_deny "mongodb-rules: deleteMany with a negation filter (\$ne/\$nin/\$not) deletes everything except the named value, one wrong constant nukes the store. Name what to delete, not what to keep, and count the matches first. ($fp)"
  fi
  # Block: dropping a database from application/script code.
  if printf '%s' "$content" | grep -qE "dropDatabase[[:space:]]*\("; then
    mdd_deny "mongodb-rules: dropDatabase() in code. If this is real, it is an ops runbook action with a human gate, not a script line. ($fp)"
  fi
fi

warn=""
# Warn: bare .find( when the content shows real mongo usage or the file is
# data-layer (Array.find outside those contexts stays unflagged).
if printf '%s' "$content" | grep -qE "\.find\("; then
  warn="$warn Uses .find(): reads should be aggregation pipelines, not find(). (If this is Array.find, ignore.)"
fi
# Warn: direct multi-document write calls, bulkWrite is the rule.
if [ "$is_test" = "0" ] && printf '%s' "$content" | grep -qE "\.(insertMany|updateMany|deleteMany)\("; then
  warn="$warn Direct insertMany/updateMany/deleteMany call: multi-document writes go through bulkWrite (mongodb-rules). A deliberate one-off says why in a comment."
fi
# Warn: an unanchored regex operator.
if printf '%s' "$content" | grep -qE "\\\$regex|new RegExp\(" && ! printf '%s' "$content" | grep -qF '^'; then
  warn="$warn Unanchored regex: anchor it with ^ or it forces a full-collection scan."
fi
# Warn: a hardcoded connection string (env is the only correct source).
if printf '%s' "$content" | grep -qE "mongodb(\+srv)?://[^\"'\\\$ ]*[@.]"; then
  if ! printf '%s' "$content" | grep -qE "process\.env|os\.environ|getenv"; then
    warn="$warn Hardcoded MongoDB connection string: the URI comes from an env var, always."
  fi
fi

[ -n "$warn" ] && mdd_note "mongo-lint on $fp:$warn"
exit 0
