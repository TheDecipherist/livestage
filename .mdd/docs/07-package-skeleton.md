---
id: 07-package-skeleton
title: Package Skeleton
type: COMPONENT
path: Build / Package Skeleton
source_files: [package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, eslint.config.js]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [01-seed-script, 03-cr2-one-package]
tags: [package-json, tsconfig, vitest, single-package, exports, esm]
known_issues:
  - "npm run build initially emitted nothing (tsconfig.json has noEmit:true for typecheck); fixed by adding tsconfig.build.json (rootDir src, outDir dist) and pointing the build script at it"
---

# Package Skeleton

## What to Build

`[verify]`. The single root `package.json`, `tsconfig.json`, merged
`vitest.config.ts`, and `eslint.config.js` that make the seeded repo build,
type-check, and test as one package. Copy-map: no single donor file, this is
the seed script's package.json/tsconfig assembly (spec Wave 0 steps 4 and 7,
lines 203-211) turned into a durable, checkable artifact.

## Architecture

Everything else in the build depends on this existing first: `npm install &&
npm run build` clean, strict TS, no `any` in new code (Success Criteria, line
789). Export subpaths `livestage/parser`, `livestage/engine`,
`livestage/renderer` mirror the CLI naming (line 147).

## Implementation Notes

- Language: TypeScript strict mode, no `any` in new code; copied donor code is
  not restyled beyond the mechanical rename and is covered by its own copied
  tests (line 130-131).
- Runtime: Node.js 22 LTS, ESM (line 132).
- Package manager: npm, single package, no workspaces (line 132-133).
- Testing: Vitest, one merged config at repo root; golden-file snapshots for
  the render surface; a fixture-based security matrix (line 133-134).
- Code organisation: one responsibility per file, max 400 lines for new files
  (line 144-145).
- Style: no em dashes anywhere in new source (copied donor code is exempt
  from style rewrites); use a comma or a single hyphen instead (Principle
  11, line 123-124, restated at line 840 and 857).

## Data Model

N/A (build configuration, not runtime data).

## API/Interface

`package.json` exports map: `livestage/parser` -> `src/parser`,
`livestage/engine` -> `src/engine`, `livestage/renderer` -> `src/renderer`;
`bin.livestage` -> the CLI entry.

## Business Rules

1. Single root `package.json`, name `livestage`, bin `livestage`, export
   subpaths as above (line 211, 147).
2. Strict TypeScript, `noImplicitAny`/equivalent such that no `any` appears
   in new (non-donor-copied) code.
3. One merged vitest config at repo root; no per-package configs.
4. `npm install && npm run build` completes cleanly.
5. No em dashes anywhere in new source; a comma or a single hyphen only
   (line 123-124). Copied donor code is exempt from this style rewrite.

## Acceptance Criteria

- [x] `npm install && npm run build` clean, strict TS, no `any` in new code
      (Success Criteria checklist item, line 789-790). Verified: `tsc -p
      tsconfig.build.json` emits to `dist/` cleanly; grep confirms no `: any`
      / `as any` / `<any>` anywhere in `src/`.
- [x] `npm test` runs the merged suite from repo root. 48 files, 671/671
      green.
- [x] Export subpaths resolve: importing `livestage/parser`,
      `livestage/engine`, `livestage/renderer` each work from a fixture
      consumer. Verified with a real ESM script (`node --input-type=module`)
      resolving all three subpaths via package self-reference against the
      built `dist/` output, not just the dev-time tsconfig/vitest aliases.
- [!] A lint/scan step finds zero em dashes in new source. The no-em-dash
      hook blocks any edit introducing one, so nothing written this session
      violates it, but no standalone repo-wide scan script exists yet; that
      is feature 42 (Contract Scans, wave 6) as the doc itself anticipated.

## Dependencies

01-seed-script (the skeleton is assembled from the seeded layout),
03-cr2-one-package (the skeleton is what makes CR-2 true).

## Known Issues

None.
