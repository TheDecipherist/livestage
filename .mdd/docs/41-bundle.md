---
id: 41-bundle
title: Bundle
type: COMPONENT
path: Build / Bundle
source_files: [dist/livestage.js]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [07-package-skeleton, 13-cli-router]
tags: [esbuild, single-file-bundle, cold-start, bin-target, no-runtime-deps]
known_issues: []
---

# Bundle

## What to Build

`[new]`. The esbuild single-file build to `dist/livestage.js` (bin target),
no runtime dependencies outside the bundle. This is what `init` (feature 31)
installs for the hook so cold start stays under budget, and what the bare-
checkout e2e (CR-8, feature 37) exercises directly.

## Architecture

Consumes the entire `src/` tree (feature 07's package skeleton and every
directive/engine/renderer/cli/hook component) and produces one artifact. The
esbuild config file itself is not separately named in the spec's Project
Structure listing; it is inferred to live alongside the other root config
files from feature 07 (e.g. `esbuild.config.js` or a build script in
`package.json`).

## Implementation Notes

Cold-start budget: under 200 ms for a trivial doc (Wave 6 demo-state, line
670). The spec's Known Gaps section lays out a full mitigation ladder if
measurement ever demands more (line 866-887): (1) a dependency-free fast-
path hook entry with an mtime/hash cache check (Wave 1, part of F-EXT); (2)
compile to a native binary (`bun build --compile` or Node SEA + V8 snapshot)
for ~10-25 ms spawns (F-BUNDLE stretch); (3) `livestage watch` as a cache
WARMER, never a server, resident and explicitly started, writing to
`.livestage/cache/`, with the hook's freshness check always rejecting stale
cache and a dead/absent/crashed watch simply meaning the hook renders itself
slower, never wrong; (4) LAST RESORT, evidence-gated only: an optional auto-
expiring render daemon over a unix socket, which must never be built
speculatively since it would amend CR-4 (feature 05). If the seeded
dependency graph resists single-file bundling anywhere, that resistance is a
Wave 6 finding to fix, not accept (line 864-866).

## Data Model

N/A.

## API/Interface

`dist/livestage.js` is the bin target for the `livestage` command; also
consumed directly by CR-8's bare-checkout e2e with no install step.

## Business Rules

1. esbuild single-file build to `dist/livestage.js` (line 135-136).
2. No runtime dependencies outside the bundle (line 136).
3. `init` installs this bundle for the hook (line 136-137).
4. Hook cold render of a trivial doc is under 200 ms (line 670).

## Acceptance Criteria

- [ ] `dist/livestage.js` alone (no `node_modules`) passes the bare-checkout
      e2e (CR-8, feature 37).
- [ ] A cold-start timing test on a trivial `.stage` doc through the hook
      measures under 200 ms.
- [ ] If the 200 ms budget is not met with the plain bundle, step (1) of the
      mitigation ladder (dependency-free fast-path hook entry) is
      implemented and re-measured before escalating further up the ladder.

## Dependencies

07-package-skeleton (bundles the whole `src/` tree), 13-cli-router (the bin
entry point being bundled).

## Known Issues

The exact esbuild config file location/name is inferred rather than named
explicitly by the spec's Project Structure listing; confirm during Wave 6
build and update `source_files` if a dedicated config file is added.
