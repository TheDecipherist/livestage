---
paths:
  - "**/tsconfig*.json"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/vite.config.*"
  - "**/vitest.config.*"
conformance:
  - "ts-strict :: json-key :: tsconfig.json :: compilerOptions.strict :: true"
  - "ts-linter-exists :: file-exists :: {eslint.config.js,eslint.config.mjs,eslint.config.ts,.eslintrc.json,.eslintrc.cjs,.eslintrc.js,biome.json,biome.jsonc,.oxlintrc.json}"
---

# TypeScript and build configuration

Build configuration is the cheapest, most reliable rule target there is: one
file, machine-checkable, and `json-key` specs can never pass vacuously. The
`ts-strict` spec above targets `tsconfig.json`; when /mdd-init installs this rule
into a project whose flags live elsewhere (a `tsconfig.base.json`, a
`tsconfig.vite.json`), it MUST rewrite the spec's file to the config that
actually carries `compilerOptions`, or the spec fails on the wrong file.

## Compiler flags
- `strict: true` everywhere, no exceptions.
- `noUncheckedIndexedAccess: true`. Codebases usually already write `arr[0] ??
  fallback` by hand; the flag makes the pattern enforced instead of habitual,
  and turning it on late costs hours, not days. Hoist `const first = arr[0]`
  where the checker cannot narrow through an optional chain.
- `verbatimModuleSyntax: true`, matching the `import type` discipline.
- `noUnusedLocals` and `noFallthroughCasesInSwitch` on: the compiler is the
  only unused-import check in a project with no linter.
- `checkJs: true` when any load-bearing `.js` exists (a bootstrap `server.js`
  carrying the whole lifecycle deserves typechecking too).

## Project layout
- Project references done properly: a root config with `files: []` splitting
  node-side and app-side configs beats one config with a compromise `lib`.
- A path alias has ONE source of truth. If tsconfig defines `~/*`, the
  bundler resolves it via tsconfig (`tsconfigPaths`), and the test runner
  must not re-declare it by hand; a hand-copied alias silently diverges in
  whichever tool was forgotten.
- When a codegen step feeds the types (framework typegen, generated clients),
  the typecheck script runs it first (`"typecheck": "codegen && tsc -b"`), so
  a fresh clone does not report a wall of false errors, and LSP-backed
  tooling resolves against real types.

## A linter exists
- The project has a linter (eslint, biome, or oxlint) with at least
  unused-imports and `no-floating-promises` enabled. Fire-and-forget calls
  are fine only when they are explicit (`void promise` with a comment), which
  is exactly what that lint forces. No linter means nothing catches the
  import that was never used or the promise that was never awaited.
