# Test Coverage Map

The old way: a "known gaps" doc somebody wrote after a coverage review,
already stale by the time the next file lands with no test.

The new way: list both directories, live, side by side. No shell grant
needed, `@list` is filesystem-policy only.

## Source files

sample-project/src/add.ts
sample-project/src/multiply.ts
sample-project/src/subtract.ts

## Test files

sample-project/tests/add.test.ts
sample-project/tests/subtract.test.ts

---

`multiply.ts` has no matching entry under `tests/`. That gap is exactly
as visible here as `add.ts`'s and `subtract.ts`'s coverage, because
nothing here was hand-maintained; both lists are read from disk on every
render. This is the same shape as this project's own frontmatter/
`test_files` pairing, generalized to any codebase.
