# Test Coverage Map (side by side)

Kept for contrast with [`test-coverage-map.stage`](test-coverage-map.stage),
the headline version. This one lists both directories, live, side by
side. No shell grant needed, `@list` is filesystem-policy only, but it
reformats rather than reduces: the reader still has to cross-reference
the two lists by eye to find `multiply.ts`'s missing entry. The headline
version computes that difference directly.

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
render.
