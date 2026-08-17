# Class 3 Construction Tests

*livestage - benchmarks - branch `bench/class3-construction-tests` - 2026-08-17*

Two tests, both class 3 (construction, where the model has to build something rather than fetch it). A dead-code detector built against ts-morph, verified against an independent compiler-API ground truth, six blind agent trials scored against it, plus a second, independent re-verification of the import-graph benchmark now that path aliases resolve.

Trial model disclosure: all six blind trials below (and the general-purpose agents that ran them) are Claude-family models, the same family running this session, not an independent model, same disclosure as prior benchmark sessions in this project.

---

## 0. readme:check, checked first

**Stale.** Already stale before this session started, from two prior sessions' merged work: the version bump to 1.0.2 (committed, README never regenerated) and two new `examples/` additions raising the worked-example count from 20 to 25. Verified by diffing a fresh render against the committed file, exactly those two lines differ, nothing else:

```diff
- **Version 1.0.1** | **1239+ tests** | MIT
+ **Version 1.0.2** | **1239+ tests** | MIT
- 20 worked examples, and every `npm run` script in this
+ 25 worked examples, and every `npm run` script in this
```

Per instruction, left it stale rather than regenerating, this session's new files live under `benchmarks/`, which `README.stage` never counts, so nothing here makes the existing drift worse. **Decision: leave stale, do not regenerate**, since regenerating would mix an unrelated version/example-count fix into this benchmark branch.

---

## 1. The dead-code test

Which exported symbols in `src/` are never imported anywhere in the repo. Ground truth this time is independently checkable by construction: a second, unrelated compiler-API pass either agrees with the first or it doesn't.

### 1.1 - the `@code` directive

`benchmarks/unused-exports/unused-exports.js`, driven from `unused-exports.stage`, uses ts-morph (a TypeScript compiler API wrapper), a devDependency of the *project*, not of the script; `@code` can reach for anything already in `package.json`. Policy grant is exactly `code.languages: ["javascript"]`, nothing else.

One real deviation from the literal brief template: `@render source="dead.items" type="table"` doesn't exist in the engine (verified by reading `render.ts` and `engine.ts`'s pipe mechanism, `@render` only works as a pipe sink over raw stdout lines, there's no lookup-by-label). Used the working pattern instead: the script pre-formats its own markdown table into a `table` string field, interpolated as `{{ dead.table }}`. A second, smaller gap: `@foreach` stringifies array elements with `String(item)`, so it can't do per-field access on an array of objects either, same reason the script formats its own table rather than looping in the document.

### 1.2 - ground truth, and the disagreement that stopped everything

`benchmarks/unused-exports/ground-truth.cjs`: a separate raw-`typescript`-compiler-API pass (no ts-morph, no shared code with the `@code` script), answering the question the other direction: build the set of every `(file, name)` pair actually imported anywhere in the program, then check each declared export against it, rather than searching per-symbol references.

> **First run: 107 vs 70, stopped, did not reconcile.**
> Per instruction, a disagreement between the two independent implementations is reported before anything else, not quietly resolved toward whichever number is convenient. Root cause in the **ts-morph script**: `findReferencesAsNodes()` counts a barrel's own re-export statement (`export { X } from './y'`) as a "reference" to X, even when nobody imports the barrel. Fixed with a recursive check that excludes the barrel's own re-export edge from counting as usage, tracking every file already explained along the recursion chain. Result: 70 -> 105.

> **Second run: 107 vs 105, stopped again.**
> This time the bug was in **ground-truth.cjs**: its handling of a bare `export { a }` (no `from` clause) assumed `a` was always a local declaration. `src/engine/engine.ts` does `export type { EngineContext }` / `export { FatalError }`, bare re-exports of names it only *imported* from `context.ts` / `engine-include.ts`. Ground-truth mis-attributed both to `engine.ts` as if declared there, and flagged them dead under the wrong file. Fixed by tracking each file's own imported-local-names and skipping (or re-routing to a proper re-export edge) any bare export that names one.

**Converged.** Both implementations now report **105**, item-for-item identical (verified by exact `file::symbol` set diff, not just count). The `@code` directive's own render also matches 105/105 exactly, **0 false positives, 0 false negatives** against the now-agreed ground truth.

### 1.3 / 1.4 - six blind trials, three unguided then three guided

Each trial: a fresh general-purpose agent in its own isolated git worktree (no access to `unused-exports.js`, the `.stage` file, or `ground-truth.cjs`, those live only in uncommitted working-tree state on this branch, so a worktree checked out at the branch's last real commit has none of them). Prompt for trials 1-3: exactly *"List every exported symbol in `src/` that is never imported anywhere in this repo."* Trials 4-6 add one sentence naming barrel re-exports explicitly, nothing else changes.

Scored against the 105-symbol, dual-verified ground truth. False positives = trial called it dead but it's used (the dangerous direction, reported separately, never merged into one accuracy figure). False negatives = trial missed a genuinely dead symbol. All 6 scripts are textually distinct (0 of 6 identical by hash).

| trial | mode | approach | false pos. | false neg. | tokens | tool calls | script lines |
|---|---|---|---:|---:|---:|---:|---:|
| 1 | unguided | raw `typescript` API, alias-symbol chains | **0** | **0** | 78,744 | 23 | 186 |
| 2 | unguided | raw `typescript` API, own re-export graph | **79** | 0 | 102,153 | 22 | 273 |
| 3 | unguided | ts-morph, `getExportedDeclarations` | 0 | **38** | 80,555 | 25 | 158 |
| 4 | guided | ts-morph, `findReferences` + ancestor-kind filter | **0** | **0** | 76,840 | 31 | 111 |
| 5 | guided | raw `ts.LanguageService`, `findReferences` | 0 | **35** | 80,483 | 23 | 137 |
| 6 | guided | ts-morph, `findReferences` (no export-specifier filter) | 0 | **35** | 55,295 | 20 | 73 |

**False positives, same symbol across all 3 unguided trials: 0 of 0.** **False negatives, identical across trials 3, 5 and 6: 35 of 35.**

> **The headline finding.** Only trial 2 produced any false positives (79, one implementation's mistake alone), so there is no shared false-positive convergence to report here, unlike the import-graph benchmark's 46-of-49-identical result, the dangerous-direction error in this test was isolated, not systemic, at n = 6.
>
> But the *false negatives* converge just as sharply as that import-graph finding did. Trials 3 (unguided), 5 (guided), and 6 (guided) all miss the **exact same 35 symbols**, every export reachable only through a barrel file. All three (independently) call `findReferences()`/`getExportedDeclarations()` and treat a barrel's own re-export statement as proof of real usage, the identical bug found and fixed in the `@code` script itself during 1.2. Trial 3's 38 misses are a strict superset: the same 35, plus 3 of its own. Telling: **two of these three were the guided round**, the added sentence named barrel re-exports as a concept, and both trials' own METHOD write-ups claim to handle them via `findReferences`' alias-chain following, but neither trial caught the specific gotcha (a reference landing inside an `ExportSpecifier` isn't real usage) that makes that claim false. General awareness of barrels didn't prevent the specific trap; only trials 1 and 4 (one from each round) implemented the exclusion correctly.

**Unguided vs. guided, in aggregate:** 3/3 unguided trials had at least one wrong symbol (117 combined FP+FN errors: 79 FP + 38 FN, both from single trials). 2/3 guided trials had errors (70 combined FN, 0 FP), better on the dangerous axis (no trial with the barrel-hint produced a false positive) but not obviously more *accurate* overall: trial 4 (guided) matched ground truth exactly, same as trial 1 (unguided). The one added sentence didn't reliably fix the barrel blind spot; it just changed which direction the errors that remained fell in.

---

## 2. Import graph, re-verified with aliases resolving

### 2.1 - does the edge count return to 336?

**No, it's now 346, ten higher**, not the 336 the old hardcoded script found. Re-rendering `@import-graph` with `tsconfig=` today gives 345 edges, one short of the 346 a fresh ground-truth pass finds. The remaining gap traced to a real, small bug in the shipped directive: `FROM_CLAUSE`'s regex had three alternatives for what follows `from` (a brace list, `* as name`, or a bare identifier) but no case for a lone `*` with no binding, so `export type * from './types.js'` (used in both `src/parser/index.ts` and `src/renderer/index.ts`) was silently dropped, masked in the parser case only because a second import from the same file happened to supply the edge anyway. Fixed in `src/engine/import-graph.ts`, with a new regression test; directive and ground truth now agree exactly at **346/346**.

The other +9 (346 vs. the original 336 reference) predate this session: a prior session's fix for TypeScript's inline type-only import form (`import('./x.js').Y`, commit `39404f3`) landed *after* the 336-edge measurement, so 336 was never counting that category at all.

### 2.2 - independent ground truth for the edge count

`benchmarks/import-graph-ground-truth.cjs`: a fresh raw-`typescript`-API AST walk plus `ts.resolveModuleName` per specifier, sharing no code with `import-graph.ts`'s regex-and-hand-rolled-resolver approach. This is the first time 336 (or any edge count from this benchmark) has been checked by anything other than the script that produced it.

### 2.3 - do the three existing agent trials still show 46-of-49 identical?

The three trials from the earlier session aren't re-runnable in the literal sense (their scripts and raw edge lists weren't persisted, only the aggregate: 288 edges each, 49 missed, 1 invented, "every trial missed the identical 46 of 49"). What re-verifies cleanly against the new 346-edge ground truth: it contains **exactly 49 edges resolved through a bare `livestage/*` specifier** (parser, engine, renderer aliases), the same count, the same category the earlier trials were described as blind to. Neither fix made this session (the inline-type-import capture, the `export type *` fix) touches alias-specifier resolution; both are purely relative-specifier edges. So the 49-edge blind spot the trials hit is structurally unchanged, and nothing here invalidates the earlier trials or requires a re-run. The exact 46-vs-49 split (which 3 were trial-specific) isn't independently re-confirmable without the original per-trial edge lists, flagged here rather than guessed at.

---

## 3. Verification

| check | result |
|---|---|
| build / bundle | pass |
| lint | pass |
| typecheck | pass* |
| claude-md:check | pass |
| examples:check | pass |
| test suite | 1477/1485 |

\* typecheck: 21 errors, all confined to the documented, tracked `tests/conformance/rules.conformance.test.ts` implicit-`any` gap, outside `build`'s scope. Test suite: 8 known-baseline failures (6 conformance rules N/A for this CLI project, 1 date-dependent golden snapshot, 1 pre-existing readme staleness), occasionally 9 under parallel load from a documented flaky proof-test, confirmed transient on re-run.

### What changed outside the two benchmark directories

- `src/engine/import-graph.ts`, the bare `export * from` regex fix (2.1), plus a regression test in `tests/unit/engine/import-graph.test.ts`.
- `eslint.config.js`, extended the existing `@code`-body require() exemption to the three new `.js`/`.cjs` ground-truth scripts, same rationale as the existing `examples/**/*.js` carve-out.
- `package.json`/`package-lock.json`, `ts-morph` added as a devDependency.
- Six `examples/*.md` files regenerated by `examples:render` after the import-graph fix; five of those six diffs are pre-existing environment/wall-clock drift unrelated to this fix (confirmed by the `checked: false` list in `example-render-targets.mjs`), the sixth (`examples/import-graph/import-graph.md`) is the one real, expected content change (+1 edge).

---

## 4. Decisions surfaced rather than guessed at

1. **`@render source="dead.items"` doesn't exist**, used `@code label=` + a pre-formatted table string instead (1.1).
2. **Fixed a real bug in shipped `src/` code** (the import-graph `export * from` regex gap) discovered while building this session's ground truth, rather than only reporting the discrepancy, consistent with this project's established pattern of fixing real bugs found during verification work, not just documenting them.
3. **readme:check left stale**, not regenerated, see section 0.
4. **Item 2.3 not literally re-diffable**, the earlier session's three import-graph trials' raw edge lists weren't persisted, only aggregate counts. Verified the underlying claim structurally instead of re-running a literal diff; said so rather than presenting it as a full re-confirmation.

---

*Branch `bench/class3-construction-tests`, committed, nothing pushed, no PR opened.*
