# Test Coverage Map

The old way: a "known gaps" doc somebody wrote after a coverage review,
already stale by the time the next file lands with no test.

An earlier version of this example listed both directories side by side
and left the reader to eyeball the difference (still here, as
[`test-coverage-map-side-by-side.stage`](test-coverage-map-side-by-side.stage),
for the contrast). That reformats, it does not reduce: the model still
has to do the diffing. This version computes the actual gap, `@list`
captures both directory listings, `@set` computes the set difference
between them, no shell grant needed, filesystem-policy only.

## Result


**1 file(s) with no matching test:**

- sample-project/src/multiply.ts

---

`multiply.ts` is the only line above; `add.ts` and `subtract.ts` never
appear at all, because they have coverage. That is the actual answer,
not both directories for the reader to cross-reference by hand. This is
the same shape as this project's own frontmatter/`test_files` pairing,
generalized to any codebase.
