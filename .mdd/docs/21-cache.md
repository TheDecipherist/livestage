---
id: 21-cache
title: Cache
type: COMPONENT
path: Engine / Cache
source_files: [src/engine/cache.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [10-security-policy-core]
tags: [cache, livestage-cache-dir, mock-fixtures, hook-render-cache]
known_issues:
  - "readCache/writeCache (session/persist modes) were, and remain, uncalled from the actual directive-execution path in engine.ts: nothing currently caches a @query/@code result during a real render. Deterministic mode's @cache mock=fixture.json substitution is explicitly owned by feature 35 (Determinism, wave 5) per this doc's own Architecture section; this component's scope is the read/write path itself, now correctly implemented and tested, not the wiring into directive execution."
  - "Fixed a real bug found while writing this component's first tests: CACHE_DIR was a module-level constant computed once from process.cwd() at import time. --cwd is threaded as a value everywhere else in this codebase (render.ts never calls process.chdir()), so cache show/clear --cwd path accepted the flag and silently did nothing with it, reading/clearing whatever directory the process happened to launch from instead. Fixed by turning CACHE_DIR into a cacheDir(cwd) function threaded through readCache/writeCache/clearPersistCache/showCacheEntries, cli/commands/cache.ts, and cli.ts's cache show/clear action handlers."
  - "Fixed a second real bug in the same pass: readCache's mock mode validated config.mockPath against docRoot via checkFilePath (correct), but then read the file via readFileSync using the raw mockPath string, not the resolved path. For a relative mockPath (the realistic case, e.g. mock=./fixtures/x.json) this resolves against process.cwd(), not docRoot, so it would silently miss the fixture in any project not run from exactly the right directory. Fixed to read the same resolved path that was validated."
  - "checkFilePath blocks all absolute paths outside a small built-in safe-root allowlist (LiveStage/MDD/Claude system dirs); an absolute mock= path pointing at a legitimate project fixture is blocked. Relative mock= paths, resolved against docRoot, are the correct usage. Not a bug, but worth documenting since it is surprising on first encounter."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/engine/cache.test.ts::a relative mock path that escapes the document root via .. is blocked (checkFilePath traversal gate)"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "tests/unit/engine/cache.test.ts::round-trips a value through .livestage/cache/ under the given cwd, not process.cwd()"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "tests/unit/engine/cache.test.ts::a different cwd does not see entries written under this one (the bug this fixes)"
---

# Cache

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/engine/src/*` (cache subsystem). Directive
results are cached under `.livestage/cache/` via `readCache`/`writeCache`
(session and persist modes). Deterministic mode's `@cache mock=fixture.json`
serves fixtures for `@query`/`@code`, owned functionally by feature 35
(Determinism) but the underlying cache read/write path is this component.

## Architecture

The hook (feature 11) does NOT go through this component: it writes its own
render-cache artifact via a separate, ad-hoc file scheme
(`<docDir>/.livestage/cache/<hash>.md`, one file per rendered document),
invisible to `cache show`/`cache clear`. This doc originally claimed the two
were the same mechanism; corrected, see Known Issues and 11's own known
issues for the masking bug that separation caused. Consumed by feature 35
(Determinism) for mock-fixture serving.

## Implementation Notes

Cache home is `.livestage/cache/` under the project's `.livestage/` config
directory (line 138-140).

## Data Model

Cache entry: keyed by a content/render-input hash, storing the resolved
markdown (for hook renders) or a directive's structured result (for mock
fixtures).

## API/Interface

`livestage cache show|clear` (the subcommand is `show`, not `status` as an
earlier draft of this doc and the spec line had it, matching feature 13's
own correction). Both accept `--cwd <path>` to target a project other than
the process's own launch directory.

## Business Rules

1. Cache lives under `.livestage/cache/` (line 139).
2. Cache entries are masked before write (shared rule with feature 10's
   masking requirement, line 435).
3. In deterministic mode, `@cache mock=fixture.json` serves a fixture instead
   of executing `@query`/`@code` live (line 545).

## Acceptance Criteria

- [x] `cache show` reports current cache state (entry count / size);
      `cache clear` empties `.livestage/cache/`. Live-verified against the
      real binary, and `tests/unit/engine/cache.test.ts`
      (`showCacheEntries`/`clearPersistCache`, 5 tests).
- [x] A cached write and a subsequent identical read serve consistently, and
      are correctly scoped by `--cwd`, not the process's own launch
      directory: `cache.test.ts`'s persist-mode block (6 tests), plus a
      live `--cwd`-scoped check against the real binary.
- [!] `@cache mock=fixture.json` correctly substitutes fixture data for a
      `@query`/`@code` call under `--deterministic`. The read/write path
      itself works and is tested (mock mode, 3 tests, including two real
      bugs found and fixed: the resolved-vs-raw path mismatch, and the
      absolute-path safe-root gate). The wiring that decides WHEN to call
      it during a live `@query`/`@code` execution does not exist yet; owned
      by feature 35 (Determinism, wave 5), see Known Issues.

## Dependencies

10-security-policy-core (cache writes are subject to masking).

## Known Issues

See the frontmatter `known_issues` above for the two real bugs fixed while
building this component's first test coverage (the `--cwd` ignored by
`CACHE_DIR`, and the resolved-vs-raw mock path mismatch), and the
architectural note that this cache is a distinct mechanism from the hook's
own render-cache file (feature 11).

`@cache mock=fixture.json`'s live wiring into `@query`/`@code` execution
does not exist yet; feature 35 (Determinism, wave 5) owns deciding when to
call `readCache`'s mock mode instead of executing live.
