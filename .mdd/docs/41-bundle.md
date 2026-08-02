---
id: 41-bundle
title: Bundle
type: COMPONENT
path: Build / Bundle
source_files: [dist/livestage.js, package.json, src/hook/pretooluse.ts, src/cli/cli.ts, src/engine/engine-include.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [07-package-skeleton, 13-cli-router]
tags: [esbuild, single-file-bundle, cold-start, bin-target, no-runtime-deps]
known_issues:
  - "The plain `esbuild src/cli/cli.ts --bundle --platform=node --format=esm`
    invocation (package.json's original bundle script) crashed on the very
    first run: commander is CJS and esbuild's ESM output left a dynamic
    require() with no real require in scope
    ('Dynamic require of \"node:events\" is not supported'). Fixed with
    esbuild's documented createRequire(import.meta.url) banner recipe
    (--banner:js). Found live while building CR-8's e2e test (feature 37),
    not by any existing unit test, since no test exercised the bundle
    artifact itself before this feature."
  - "src/cli/cli.ts's package.json version read
    (join(__dirname, '../../package.json')) was hardcoded for the tsc
    dist/cli/ layout (two levels up); the bundle sits one level up with no
    cli/ subdirectory, and a true bare checkout may have no package.json at
    all. Every command, not just --version, crashed on this before the fix
    (the read ran unconditionally at module load). Fixed with a
    try-both-depths-then-fall-back-to-a-placeholder read
    (src/cli/cli.ts::readVersion). Same root cause, same fix shape, applied
    a second time to src/engine/engine-include.ts::loadStdlib for
    stdlib.md, which needed dist/stdlib.md added as a bundle-script copy
    step alongside dist/livestage.js (package.json's bundle script)."
  - "Business rule 3 ('init installs this bundle for the hook') was not
    actually implemented before this feature: pretooluse.ts's cliEntryPath()
    hardcoded dist/cli/cli.js (the tsc multi-file build), never
    dist/livestage.js, so the bundle this doc's own source_files pointed to
    was disconnected from the real render path entirely. Live-measured the
    gap directly: dist/cli/cli.js averaged ~110ms cold, dist/livestage.js
    ~65ms, both under the 200ms budget but the tsc path leaves noticeably
    less margin. Fixed cliEntryPath() to prefer dist/livestage.js when
    present, falling back to dist/cli/cli.js otherwise (dev/test checkouts
    that ran `npm run build` but not `npm run bundle`)."
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

- [x] `dist/livestage.js` alone (no `node_modules`) passes the bare-checkout
      e2e (CR-8, feature 37). tests/e2e/bare-checkout.test.ts.
- [x] A cold-start timing test on a trivial `.stage` doc through the hook
      measures under 200 ms. Live-measured ~65ms via the bundle (vs ~110ms
      via the previously-wired tsc dist/cli/cli.js); the through-the-hook
      test uses renderViaCli directly, not just a raw CLI spawn.
      tests/e2e/bare-checkout.test.ts::"renderViaCli spawns the bundle...".
- [x] If the 200 ms budget is not met with the plain bundle, step (1) of the
      mitigation ladder (dependency-free fast-path hook entry) is
      implemented and re-measured before escalating further up the ladder.
      N/A, not triggered: the plain bundle measures well inside budget
      (~65ms, over 130ms of headroom).

## Dependencies

07-package-skeleton (bundles the whole `src/` tree), 13-cli-router (the bin
entry point being bundled).

## Known Issues

See frontmatter `known_issues`. The esbuild invocation lives as a
`package.json` script (`bundle`), not a separate config file; confirmed
during Wave 6 build, no dedicated `esbuild.config.js` was needed.
