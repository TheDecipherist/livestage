---
paths:
  - "**/adapters/**"
  - "**/*.repository.*"
  - "**/repository.*"
  - "**/db/**"
  - "**/models/**"
  - "**/atlas/**"
  - "**/lib/db/**"
  - "**/lib/db.*"
  - "**/*mongo*"
  - "**/scripts/**"
  - "**/migrations/**"
  - "**/seeds/**"
conformance:
  - "mongo-no-mongoose-dep :: absent :: package.json :: .mongoose.:"
  - "mongo-no-negation-delete :: absent :: {src,app,server,api,worker,packages,scripts}/**/*.{ts,js,mjs,cjs} :: deleteMany\([^)]*\$(ne|nin|not)"
---

<!-- paths note: scripts/ is covered on purpose. The field case that forced it
     was a warm-cache script running deleteMany with a $ne filter; migrations,
     seeders, and warmers talk to the database as much as any adapter. -->

# MongoDB Data-Access Rules

Non-negotiable for this codebase. From production, not preference. The
mechanically checkable subset (mongoose, bare find, unanchored regex) is also
enforced by the mongo-lint hook.

## Driver and connection
- Prefer StrictDB, fall back to the native driver. Never Mongoose.
- Data access stays in the adapter, never raw collections scattered through feature code.
- One shared client for the whole app, created once at startup. The client is the pool. Never one per request.
- URI from an env var. Close the client on SIGTERM/SIGINT.

## Identity and types
- `_id` is an `ObjectId`, not a string. A string `_id` against an ObjectId document matches nothing, silently. Wrap incoming ids with `new ObjectId(id)`.
- Never put `_id` in the body of a write. Identity goes in the filter. Restating it after a JSON round-trip throws code 66.
- JSON strips ObjectId and Date to strings. Re-hydrate at the boundary before you query or save.

## Querying
- `null` is not "missing". `{ field: null }` matches null AND absent. Use `$exists: false` for missing.
- Reads are aggregation pipelines, not `find()`.
- Independent queries never await sequentially. Before a second `await`, check whether it needs the first result; if not, both go in one `Promise.all`. Sequential awaits on independent queries stack the round-trip latencies for nothing. Applies to every promise, not just the driver (same rule in nodejs.md).
- Arrays past about three levels deep are not queryable. If you need to, the model is wrong, flatten it.

## Writes
- Multi-document writes use `bulkWrite`. Build the ops in the loop, execute one bulkWrite after. Never call the database inside a loop.
- Direct `insertMany`/`updateMany`/`deleteMany` collection calls are the smell this rule exists to catch, in scripts and one-off tools as much as app code. Route them through bulkWrite; a deliberate exception says why in a comment.
- Make writes idempotent (stable keys, set-to-value over blind increments) so retry is safe.
- Upsert is `updateOne` with `upsert: true` and `$setOnInsert`, paired with a unique index.

## Destructive deletes
- `deleteMany` with an empty filter is a collection wipe and never ships outside test cleanup.
- Never build a delete filter on a negation (`$ne`, `$nin`, `$not`) against a version or status field: it deletes everything EXCEPT one value, so one wrong constant destroys the store while reading as a cleanup. Name what to delete, not what to keep.
- Count first: run the filter as a count or aggregation, log the number, then delete. A delete whose match count surprises you was about to be an incident.
- If the store upserts on a stable key, ask whether the delete is needed at all: overwriting in place makes most purges pointless.

## Indexing and modeling
- Compound index serves only a left-to-right prefix. Order fields to match the query, equality first. Follow ESR: Equality, Sort, Range.
- Embed bounded, read-together data. Reference unbounded data (comments, events, logs).
- `$elemMatch` usually signals a modeling problem. A field you query independently belongs on the document or in its own collection.

## Counting, uniqueness, retries
- `countDocuments` scans; `estimatedDocumentCount` reads metadata. Use estimated for "roughly how many", exact only when a filter demands it. `distinct` at high cardinality wants a `$group` pipeline instead.
- Uniqueness is a (partial) unique index, never an application-level check-then-insert; the race window between check and insert is real traffic.
- After a partial `bulkWrite` failure, never blindly retry the whole batch: retry only the failed operations (identified in the error), or make every op idempotent first.

## Regex and scale
- No unanchored regex. Anchor with `^` or it forces a full-collection scan.
- `$skip` does not scale. Use range/keyset pagination on an indexed sort key with `_id` as tie-breaker.
