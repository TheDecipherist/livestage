---
id: 53-import-graph-example
title: Import Graph Example
type: COMPONENT
path: Examples / Import Graph
source_files: [examples/import-graph/import-graph.stage,
  examples/import-graph/import-graph.js,
  examples/import-graph/.livestage/policy.json,
  examples/import-graph/import-graph.md]
test_files: [tests/e2e/import-graph-example.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
depends_on: [29-code-runners, 34-graph]
tags: [import-graph, mermaid, code-runners, dogfooding, examples]
known_issues: []
---

# Import Graph Example

## Purpose

A user asked directly: can `@graph` produce a Mermaid dependency graph of
this project's own `src/` folder, the way `examples/connections/
connections.stage` graphs `.mdd/docs/`'s relationships? Live-verified the
answer is no: `@graph` reads YAML frontmatter (`readFrontmatterField` in
`src/engine/graph.ts`), it has no notion of TypeScript `import` statements,
and `.ts` files carry no frontmatter, so `@graph target="src/**/*.ts"
format="mermaid"` renders an empty `graph TD` with zero nodes (confirmed
live before building this). This example is the answer: the same `@code`-
under-policy escape hatch `examples/connections/connections.stage`'s own
source-file-overlap section already uses for something a directive
structurally cannot do, applied to real `import` parsing.

## Architecture

`import-graph.js`, a policy-granted `@code` script (`node`, no
dependencies, matching `examples/database/query-enterprise.js` and
`examples/connections/overlap.js`'s own dependency-free convention), walks
`src/**/*.ts`, regex-extracts every `import`/`export ... from '...'`
clause (including multi-line brace lists), resolves relative imports to
real files on disk (this codebase's NodeNext convention: an import path
ending in `.js` refers to a `.ts` source of the same name) and the three
`livestage/*` path-alias imports (`tsconfig.json`'s `paths`), and emits
Mermaid `graph TD` syntax directly to stdout. The `.stage` document only
pipes that output into `@render type="code" lang="mermaid"`; it never
re-derives the graph itself.

## Implementation Notes

`@code` scripts execute from a copied, isolated tmpdir (`code-runners.ts`
writes the script source to `mkdtempSync(...)/script.js` before spawning),
not from the `.stage` file's own directory, so `__dirname` inside the
script points at the wrong place. The spawned process's `cwd` is
`ctx.docDir` instead (the `.stage` file's real directory), which is what
`import-graph.js` resolves `src/` relative to. Found live: an initial
`__dirname`-relative version silently produced an empty graph (no error,
since a nonexistent tmpdir-adjacent `src/` just yields zero files to
walk), not a crash, exactly the kind of failure a real render output
check catches and a "did it error" check would not.

## Data Model

N/A (the script is a pure function from `src/`'s real file tree to Mermaid
text; no persisted state).

## API/Interface

N/A new directive; composes `@code` (feature 29) exactly as documented,
piped into `@render type="code" lang="mermaid"` (feature 20, the `code`
format's `lang=` option, unchanged, already existed for fenced-block
syntax highlighting).

## Business Rules

1. The graph is a pure function of the checked-in `src/` tree: no time,
   random, or environment-dependent elements, so it is exact-matched by
   `examples:check` like the majority-checked example tier, and correctly
   goes stale whenever `src/` actually changes.
2. Needs exactly one policy grant, `code.languages: ["javascript"]`,
   nothing else (no shell, no HTTP), matching the minimal-grant convention
   `examples/database/`/`examples/http-health/` already establish.
3. Resolves only same-repo source files: `node:` builtins and npm package
   imports are dropped, not graphed as external nodes.

## Acceptance Criteria

- [x] `@graph target="src/**/*.ts" format="mermaid"` renders an empty
      graph, live-verified, confirming the capability gap this example
      answers is real, not assumed. Documented here, not asserted as a
      permanent regression test (the empty-graph behavior is `@graph`'s
      own correct, existing behavior for frontmatter-less files, not a bug
      to guard).
- [x] `import-graph.stage` produces a non-empty, valid Mermaid `graph TD`
      block. `tests/e2e/import-graph-example.test.ts`.
- [x] Every real `.ts` file under `src/` appears as exactly one graph
      node: live-verified 114 real files, 114 rendered nodes, exact match.
      Same file.
- [x] A specific, real, stable edge (`engine/macros.ts` importing from
      `engine/engine-include.ts`) is present, not just "some nodes exist":
      proof the extraction is correct, not merely non-empty. Same file.
- [x] The example's policy grant is exactly `code.languages: ["javascript"]`,
      no shell, no HTTP. Same file.

## Dependencies

29-code-runners (`@code` execution), 34-graph (the directive this example
demonstrates a real boundary of, and works around).

## Known Issues

None.
