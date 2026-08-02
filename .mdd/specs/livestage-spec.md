# LiveStage — Specification

## What You Are Building

LiveStage is a live-document renderer and verifier for AI agents. A `.stage` file
mixes prose with executable directives, declaring its data instead of storing it:
file listings, frontmatter reads, git queries, hashes, test results, script output,
assertions. When the agent reads the file, the engine resolves every directive at
that moment and returns **pure markdown**, with zero directive syntax remaining.
Directive syntax exists only at rest, for authors; the agent consuming a render
needs no knowledge of LiveStage at all. The agent is the workflow engine; LiveStage
documents are its data. The engine gathers, computes, verifies, and renders. It
never judges, holds no memory between invocations, and mutates nothing it was not
explicitly told to.

The deliverable is **one npm package, `livestage`** (org and domain owned:
npm `livestage`, livestage.dev), containing five internal modules (parser, engine,
renderer, cli, hook), one bin (`livestage`), and a self-contained single-file
bundle. There is no server. The integration surface is: a PreToolUse hook that
renders `.stage` reads inline, a SessionStart hook that injects designated briefs,
and the CLI, which is identical in an agent session and in CI.

The load-bearing rule of this build, stated once here and enforced everywhere:

**Nothing that exists in the donor is ever written again. The donor codebase at
`~/projects/markdownai` (~1,200 passing tests) is copied, renamed, and verified,
never reimplemented, and the donor's feature-doc corpus at
`~/projects/markdownai/.mdd/docs/` is migrated, repathed, and verified, never
rewritten. Every wave task begins by looking in the donor: for a `[verify]`
component, the task IS the copy plus rename plus acceptance tests; for a `[new]`
component, the named donor subsystems are copied first and only the delta is
authored; for a feature doc, a donor doc with the same subject is migrated per its
§0.5 disposition, and a fresh doc is written only where §0.5 lists one. Writing
code the donor already has, or a doc the donor corpus already has, is a wave
failure (CR-D7), exactly as reaching around the repository is a failure in a
one-gateway system.**

Roughly 60 percent of the feature inventory arrives working from the seed; the
remaining new code concentrates in `@assert`, `@code`, doctor, schemas, args, and
glue, and even those lift named donor subsystems. This spec is the ONLY document
permitted to reference the donor.

**What this project is NOT:**
- Not a server. No MCP, no daemon, no listening socket, no session, no memory. The
  only cross-invocation artifact is an append-only render trace the engine writes
  and never reads back.
- Not a workflow engine. No phases, gates, runs, resume, progress events, event
  transports, or status-bar integration. Multi-step work is a shipped *pattern*
  (files as steps, frontmatter as state, assertions as gates), not machinery.
- Not a markdown executor. Only `.stage` files are ever parsed or executed; files
  of any other type are never routed to the engine, ever, under any flag.
- Not a scaffolder. Rendering is pure: no file or directory creation, no copies, no
  appends. The one sanctioned write is `@update-frontmatter`. Anything else goes
  through policy-granted `@code`, where the write is visible and traced.
- Not permissive. Every execution surface (filesystem, shell, code runners) is
  deny-by-default; allowlists are the only grant mechanism; immutable rules sit
  below the policy layer. There is no engine-issued network or database access at
  all: external reach exists only inside policy-granted `@code` scripts.

---

## Why This Shape

**Extension routing kills the detection problem.** The hook fires on a pure
`.stage` extension match. No content sniffing, no magic header, no byte peeking, no
false positives, and nothing readable can ever accidentally execute.

**No daemon means nothing can be half-up.** Health is a PATH check. Policy is
loaded fresh per invocation, so a policy edit is enforced by the very next render
with no restart and no stale-grant window. CI and interactive sessions run the same
commands, so there is no separate CI mode to drift. Every behavior tests as
files in, one stateless invocation, files/stdout/exit-code out.

**One package kills version skew.** One `package.json` (the file the donor's worst
environmental incident lived in), one version, one publish, one install line, and a
straight path to the single-file bundle that keeps hook cold-starts fast and makes
the tool insensitive to the host project's package setup.

**Pure markdown out means zero consumer integration.** The agent receives ordinary
markdown, the format it parses best, indistinguishable from an impossibly
up-to-date hand-written document. Render and strip are the same operation with
different data: render substitutes resolved results, strip substitutes declared
fallbacks; both emit pure markdown, which is why fail-open degradation works.

---

## Principles

1. **The agent decides; LiveStage computes.** The engine never judges, gates, or
   chooses. Deterministic data in, model judgment on top.
2. **The extension is the declaration.** `.stage` files are live; everything else
   is just files.
3. **Stateless, cold, memoryless.** Every invocation stands alone. `@set` scopes to
   a single render pass. The trace is a log, never a memory.
4. **Reads are pure.** One sanctioned write exists, `@update-frontmatter`,
   schema-validated and transactional. `@code` under policy is the escape hatch for
   everything else.
5. **Deny-by-default, one enforcement path, post-interpolation.** All execution
   surfaces (filesystem, shell, code runners) resolve through one allowlist
   layer; the engine itself issues no network or database calls. Enforcement happens after `{{ }}`
   expansion, so no interpolated value (including user arguments) can smuggle a
   command, path, host, or query past the policy.
6. **Copy first, never rewrite, code AND docs.** The donor at
   `~/projects/markdownai` is the source of truth for everything it already does,
   and its doc corpus at `~/projects/markdownai/.mdd/docs/` is the source of truth
   for everything it already describes. Waves copy source and tests and migrate
   docs, apply the rename/repath, and author only the delta. Fresh authoring is
   allowed only where the donor has nothing (the §0.5 "New" list, the [new]-only
   components), where donor code contradicts a principle, or where the seed
   exclusion list removed it. The first step of every wave task is a look inside
   the donor; skipping that look is the failure mode this principle exists to
   prevent.
7. **Checks can fail but never lie.** Contains-class assertions FAIL on zero
   matches; only `absent` may pass vacuously; every result carries its match count;
   dead specs die at validate time, not in production.
8. **Graceful absence is a contract.** Every directive declares static fallback
   text. A `.stage` file read without the engine, or after a render timeout, is a
   usable runbook that says it is degraded.
9. **Output is pure markdown.** No directive syntax survives a render or a strip.
10. **Two output channels only.** The render (markdown, for the agent) and plain
    JSON (trace, doctor, assert results, for anything else). Nothing pushes;
    consumers pull from files. No blessed consumer exists.
11. **No em dashes anywhere in the source.** Use a comma or a single hyphen.
    (Copied donor code is exempt from style rewrites; new code is not.)

---

## Tech Stack

**Language:** TypeScript, strict mode, no `any` in new code (copied donor code is
not restyled beyond the mechanical rename; it is covered by its own copied tests).
**Runtime:** Node.js 22 LTS, ESM. **Package manager:** npm, single package, no
workspaces. **Testing:** Vitest, one merged config at repo root; golden-file
snapshots for the render surface; a fixture-based security matrix.
**Bundle:** esbuild single-file build to `dist/livestage.js` (bin target), no
runtime dependencies outside the bundle; the bundle is what `init` installs for the
hook so cold start stays under budget.
**Config home:** `.livestage/` in the project root: `policy.json` (security),
`schemas/` (frontmatter document classes), `cache/`, `trace/`. User-level hook
install lives under `~/.livestage/`.
**Env prefix:** `LIVESTAGE_` (`LIVESTAGE_ARGS`, `LIVESTAGE_VAR_*`,
`LIVESTAGE_CONTEXT`, plus deterministic-mode overrides).

**Code organisation:** one responsibility per file, max 400 lines for new files.
Internal module boundaries (`parser` never imports `renderer`, `cli` orchestrates,
`hook` calls the same code path as `cli render`) enforced by lint. Export subpaths
`livestage/parser`, `livestage/engine`, `livestage/renderer` mirror the CLI naming.

---

## Provenance, Seed, and Doc Corpus (the reuse machinery)

**Donor:** `~/projects/markdownai` (read-only; outside the repo; never ships; never
enters the repo; outside CR-1 scan scope). Donor feature docs:
`~/projects/markdownai/.mdd/docs/`.

**The copy map.** Where a wave looks before writing anything:

| Building / verifying | Copy from |
|---|---|
| `src/parser/*` | `~/projects/markdownai/packages/parser/src/*` |
| `src/engine/*` (incl. security, cache, stripper, macros, interpolate) | `~/projects/markdownai/packages/engine/src/*` |
| `src/engine/trace/*` | `~/projects/markdownai/packages/engine/src/trace/*` (adapt) |
| `src/renderer/formats/*` | `~/projects/markdownai/packages/renderer/src/formats/*` |
| `src/cli/*`, `src/hook/*` | `~/projects/markdownai/packages/core/src/*` |
| `src/engine/code-runners.ts` | lift from donor `exec-ops`/`shell` + shell-inline handling |
| `src/engine/args.ts` | lift from donor skill-context-variables machinery |
| doctor probes | lift from donor `init` idempotence checks |
| unit tests | `~/projects/markdownai/packages/*/src/__tests__/*` + `e2e/*` (repathed) |
| `init` templates + CLAUDE.md marker mechanism | `~/projects/markdownai/packages/core/src/templates/*` + `scripts/postinstall.js` (mechanism only) |
| `security` command family | `~/projects/markdownai/packages/core/src/cli-register-security.ts` + `commands/security.ts` |
| `watch`, `--env` loading | `~/projects/markdownai/packages/core/src/commands/watch.ts` + `env-loader.ts` |
| `examples/showcase/` | `~/projects/markdownai/mai/*` (re-extensioned, renamed, removed directives stripped) |
| user guide seed | `~/projects/markdownai/.mdd/manual/manual.md` (migrate + rename) |
| feature docs | `~/projects/markdownai/.mdd/docs/*` per the §0.5 disposition table |

Only `@assert`, the schema engine, determinism glue, the bundle config, the
boundary lint, and the pattern example have no donor source at all.

**Wave 0 is a script, not agent work.** Before the build starts, a seed script run
by hand produces the repo in its final layout:

1. Fresh git repository, no donor history.
2. Copy `packages/parser/src` -> `src/parser`, `packages/engine/src` ->
   `src/engine`, `packages/renderer/src` -> `src/renderer`, `packages/core/src` ->
   `src/cli` + `src/hook`.
3. Exclude entirely: the MCP package and all transports; the event-transport
   subsystem (file/log/http/websocket/db/vscode transports, dispatch worker,
   AND `engine/src/event.ts` plus its engine wiring); the donor's npm lifecycle
   scripts (`packages/core/scripts/postinstall.js`, `preuninstall.js` - install
   side effects violate the all-or-nothing init contract; their marker-section
   CLAUDE.md mechanism is lifted into `init`, see F-INIT);
   `serve`; header/format-detection parser modules; workflow-spine directives
   (`phase`, `on-complete`, `event`); AI-consumer directives (`prompt`, `section`,
   `chunk-boundary`, `constraint`, `define-concept`, `note`); plugin directives
   (`plugin-*`); scaffolding write-ops (`touch`, `mkdir`, `copy`,
   `append-if-missing`, `render-template`); the db subsystem (`engine/src/db/`
   with adapters and the sync worker, the `db`/`connect` directives, the
   `mongodb` dependency, and the `row` renderer format whose only consumer was
   `@db as=row`); the `http` directive and the engine http source (external
   reach is `@code` under policy); `flow`/`timeline` renderer formats;
   the VS Code package; the docs website.
4. Merge test suites into one vitest config; re-extension executable fixtures to
   `.stage`; enumerate retired excluded-subsystem tests (this list is the CR-7
   baseline - it includes the MCP suites, the five `e2e/run-state-*.test.ts`
   suites (they test the removed cross-call session state), and the AI-consumer
   format suites).
5. Mechanical rename (old package scope/brand/bins -> `livestage`); completeness is
   verified by CR-1, not assumed.
6. `src/engine/stdlib.md` -> `stdlib.stage`.
7. Single root `package.json`: name `livestage`, bin `livestage`, export subpaths.
8. **Doc corpus mechanical pass:** copy migratable donor docs into `.mdd/docs/`,
   repath every `source_files`/`test_files` entry to the single-package layout,
   brand-rename bodies and frontmatter, recompute content hashes against the seeded
   code, reset `last_synced` to the seed date. Donor initiatives and waves are NOT
   migrated; this build's come from this spec.

Seed acceptance: repo compiles; merged suite runs (failures only in excluded
areas); CR-1 grep clean or remaining hits enumerated as Wave 1 tasks.

**Doc dispositions** (the import maps individual ids):
- **Carry-over** (mechanical pass, then a verification wave): frontmatter spec;
  parser; renderer; language docs for interpolation, env, macros, file resolution,
  include, import, conditionals, pipeline, and the source directives; security
  config + filesystem/shell/immutable-rules; caching; stdlib;
  shell-inline; match operator; skill context variables (adjusted per F-ARGS);
  e2e-suite doc (adjusted for merged layout).
- **Rewrite** (subject survives, architecture changed): engine (stateless + trace,
  no session), hook (extension match), CLI (single package, flat verbs +
  namespaces, no serve), stripper (render's static twin + fallback contract),
  package scaffold (one package), security config (gains `code` surface + `strict`
  profile).
- **Retire:** MCP + MCP e2e; phase/workflow; event/transport; AI-consumer suite;
  plugin descriptors; the entire db suite (query language, where clause, aggregate,
  raw escape hatch, queryplan types, executor) and the http source/security docs -
  the `@db` and `@http` directives are not carried; external reach is `@code`
  under policy; editor extension (parked); donor brand/site/integration docs.
- **New** (one per F-item marked new below).

A migrated doc is untrusted until its verification wave confirms paths resolve and
claims match seeded code (CR-9).

---

## Project Structure

```
livestage/
├── package.json / tsconfig.json / vitest.config.ts / eslint.config.js
├── .mdd/                                # this build's own docs/initiatives/waves
├── MDs/livestage-spec.md                # this spec
├── .livestage/                          # created by init in consumer projects;
│                                        # in THIS repo: fixtures only
├── src/
│   ├── parser/
│   │   ├── index.ts / types.ts / args.ts / grammar.ts        [seeded]
│   │   └── directives/                  # exactly the registry below, no more
│   │       ├── list.ts read.ts read-frontmatter.ts tree.ts count.ts date.ts env.ts
│   │       ├── hash.ts query.ts test.ts check.ts
│   │       ├── code.ts                  # NEW
│   │       ├── assert.ts                # NEW
│   │       ├── set.ts if.ts foreach.ts switch.ts define.ts call.ts
│   │       ├── include.ts import.ts template.ts data.ts
│   │       ├── pipe.ts render.ts
│   │       └── update-frontmatter.ts graph.ts
│   ├── engine/
│   │   ├── engine.ts context.ts conditions.ts                [seeded]
│   │   ├── sources.ts read-ops.ts write-ops.ts iter-ops.ts exec-ops.ts
│   │   ├── engine-interpolate.ts engine-include.ts engine-template.ts macros.ts
│   │   ├── pipe.ts shell.ts cache.ts stripper.ts frontmatter-utils.ts
│   │   ├── stdlib.stage
│   │   ├── security/                    # policy loader, allowlists, immutable
│   │   │   ├── policy.ts surfaces.ts immutable.ts masking.ts profiles.ts
│   │   ├── code-runners.ts              # NEW: language->runner resolution via shell path
│   │   ├── assert/                      # NEW: operators + vacuity semantics
│   │   │   ├── operators.ts liveness.ts results.ts
│   │   ├── schema/                      # NEW: frontmatter document classes
│   │   │   ├── loader.ts validate.ts
│   │   ├── args.ts                      # NEW: --args/--var -> context (F-ARGS)
│   │   ├── determinism.ts               # NEW: frozen clock, seeded uuid, mocks
│   │   └── trace/                       # render trace (adapted donor trace)
│   │       ├── record.ts writer.ts
│   ├── renderer/
│   │   └── formats/ table.ts tree.ts list.ts numbered.ts bar.ts code.ts json.ts inline.ts links.ts
│   ├── cli/
│   │   ├── index.ts                     # verb router (flat verbs + namespaces)
│   │   └── commands/
│   │       ├── render.ts strip.ts validate.ts assert.ts eval.ts
│   │       ├── doctor.ts init.ts
│   │       ├── parser-ast.ts parser-check.ts engine-eval.ts engine-trace.ts
│   │       ├── renderer-preview.ts cache.ts security.ts
│   └── hook/
│       ├── pretooluse.ts                # extension match -> render -> substitute
│       └── sessionstart.ts              # brief injection
├── examples/
│   ├── showcase/                        # migrated donor example corpus (docs hub,
│   │                                    # project report, API reference + data/)
│   ├── connections/                     # live cross-doc index (tree + mermaid +
│   │                                    # overlap.js) over a fixture corpus
│   └── multi-step/                      # F-PATTERN worked example
│       ├── index.stage state.stage 01-collect.stage 02-analyze.stage 03-report.stage
├── tests/
│   ├── unit/                            # mirrors src/ (merged donor tests live here)
│   ├── integration/                     # fixture-dir + CLI invocation + snapshot
│   ├── golden/                          # rendered-markdown snapshots
│   ├── security-matrix/                 # policy fixtures x surfaces x hostile args
│   ├── purity/                          # before/after fs snapshot harness (CR-10)
│   └── fixtures/
└── dist/livestage.js                    # esbuild single-file bundle
```

---

## The `.stage` Format

**Grammar** [seeded, donor v2 grammar unchanged]: three directive forms.
Self-closing (`@hash path="..." /`), block with attributes
(`@render ... @render-end`), block with attributes + body (`@if {{ x }} > ... @if-end`).
Close tags carry the directive name. YAML frontmatter is optional; the optional
engine version pin is frontmatter `livestage: 1` (no header directive exists).

**Resolution** [seeded]: `@include`/`@import`/`@template` resolve `.stage` files,
relative to the including document, subject to filesystem policy.

**Output contract:** rendering resolves every directive and emits pure markdown.
All `@render` formats emit plain markdown constructs (GFM tables, fenced blocks,
lists). No directive syntax survives render or strip (CR-11).

### Directive registry (authoritative; nothing else parses)

| Directive | Kind | Key attrs | Behavior |
|---|---|---|---|
| `@list` | source [seeded + F-FM-QUERY] | glob/`match`/`type`/`depth` (filesystem), `path`/`mode` (JSON), `columns`+`where` (structured rows), `label`, `as=` | files, dirs, JSON array/object items, CSV rows; in the seed, `where` filters STRUCTURED rows only - frontmatter-aware `where` and `fields=` projection over document globs is F-FM-QUERY (Wave 5) |
| `@read` | source [seeded] | file, `path=`(dot-notation, JSON/YAML/TOML), `column=`+`where=`(CSV), `key=`(.env, masked), `label`, `as=` | raw file content, or a value/table extracted from structured files; wrong access option for the format is a parse error |
| `@read-frontmatter` | source [seeded + ext] | `path`, `field` (single, seeded), `fields=`/struct `label` (F-FM-QUERY), | schema-validated (F-SCHEMA); seeded form reads ONE top-level field per call, arrays comma-joined; F-FM-QUERY adds multi-field struct capture (`label=doc` -> `{{ doc.status }}`) |
| `@tree` / `@count` | source [seeded] | path/glob | tree render / count |
| `@date` / `@env` | source [seeded] | format / `masked`, `fallback` | now / env value |
| `@hash` | compute [seeded] | `path`, `exclude-line`, `label` | content hash |
| `@query` | compute [seeded] | command | allowlisted shell, captured output |
| `@test` / `@check` | compute [seeded] | command | structured `_exit`, `_summary` |
| `@code` | compute **NEW** | `language`, `src?`, `label?`, `timeout?`, `interpolate=false` | see F-CODE |
| `@assert` | verify **NEW** | operator, `target`, `pattern`/`key`... | see F-ASSERT |
| `@set` | comp [seeded] | name, value | single-render scope |
| `@if`/`@foreach`/`@switch` | comp [seeded] | expr / `x in {{ }}` | control flow |
| `@define`/`@call` | comp [seeded] | name | macros |
| `@include`/`@import` | comp [seeded] | path | inline / import macros |
| `@template`/`@data` | comp [seeded] | `data=`, `as=` | bound-data partials |
| pipe `\|` | render [seeded] | source `\|` [grep/sort/head/tail/uniq/wc]* `\|` sink | Unix-style pipeline on any directive line: cross-platform Node built-ins never spawn processes; other shell utilities pass through the shell allowlist (stripped with WARN on Windows); a pipe ending in a command inlines the scalar (`@list ./src \| wc -l` renders a bare number) |
| `@render` | render [seeded] | type=`table|tree|list|numbered|bar|code|json|inline|links` | the pipe SINK, never standalone: last stage of a pipeline, chooses the markdown shape of the piped data (GFM table, bullet list, tree in a fenced block, bar chart, ...); `as="type"` on any source is shorthand for appending `\| @render type`; all output is plain markdown constructs |
| `@update-frontmatter` | write [seeded->ext] | `path`, fields | THE sanctioned write; schema-validated pre-write; atomic |
| `@graph` | fm [seeded->ext] | relation fields, `format=tree\|table\|mermaid`, `label` | native edges, cycle + broken-edge detection; mermaid emits a fenced block with status classDefs; structured counts (`_nodes`, `_edges`, `_cycles`, `_broken`) capturable |

**Not in the language (an internal build list: these donor directives are
excluded at seed, must never parse, and a document containing one fails as an
unknown directive - the CR scans grep for their parser modules):** `phase`,
`on-complete`, `event`, `gate`, `persist`, `prompt`, `section`, `chunk-boundary`,
`constraint`, `define-concept`, `note`, `plugin-*`, `header`, `touch`, `mkdir`,
`copy`, `append-if-missing`, `render-template`, `db`, `connect`, `http`. The
covering patterns live in the user guide, not in error messages: multi-step work
is the F-PATTERN example; file production, database, and HTTP work are `@code`
under policy (the Wave 6 reach-via-code examples).

### `@assert` semantics (authoritative)

| Operator | Passes when | Zero-match behavior |
|---|---|---|
| `file-exists` | every path matching `target` exists | **FAIL** (target glob matched nothing) |
| `contains` | every matched file contains `pattern` | **FAIL** |
| `some-contains` | at least one matched file contains `pattern` | **FAIL** |
| `contains-if-present` | every matched file that exists contains `pattern` | pass (explicitly conditional) |
| `absent` | no matched file contains `pattern` | pass (vacuous pass permitted, flagged `vacuous: true`) |
| `json-key` | key path present (optionally `equals=`) in matched JSON/frontmatter | **FAIL** |

Every result carries `{ operator, target, matches, passed, vacuous }`. A document
whose every assertion is inert is refused by `validate`. Suspicious regexes
(double-escape compiling to a literal backslash) warn at validate time.

### `@code` contract

Self-closing with `src` (language inferred from extension when omitted) or
block-with-body. Runner map in policy config
(`javascript -> node`, `python -> python3`, `bash -> bash`, extensible). Results:
`_exit`, `_stdout`, `_stderr`, `_duration`; if stdout parses as JSON it binds as
structured data under `label`. Context in via `LIVESTAGE_CONTEXT` (JSON: args,
vars, doc path) and stdin; `{{ }}` interpolation inside the body is opt-in
(`interpolate=true`). Runner invocations resolve through the shell enforcement
path: one enforcement layer, immutable rules apply, masking applies to output.
OFF in every profile until the project policy grants
`code: { languages: [...], timeout: <ms> }`. Ungranted language fails at
`validate` AND at runtime. Under Principle 4, `@code` is the sanctioned channel
for any file production a document needs; the write is granted, visible, traced.

---

## Security Model

**Policy file:** `.livestage/policy.json`, seeded by `init` with the `strict`
profile, loaded fresh on every invocation:

```json
{
  "profile": "strict",
  "shell": {
    "allow": [
      "git *",
      "cat *", "head *", "tail *", "wc *", "grep *", "sort *", "uniq *",
      "find *", "ls", "ls *", "pwd", "which *", "echo *", "date", "date *",
      "test *",
      "npx vitest*", "npx jest*", "npx playwright*", "vitest*",
      "npm test*", "npm run test*", "pnpm test*", "pnpm run test*",
      "pnpm typecheck*", "pnpm lint*", "pnpm build*",
      "tsc", "tsc *", "npx tsc*", "node --test*"
    ],
    "deny": [],
    "requireConfirmation": false,
    "auditLog": true
  },
  "code":   { "languages": [], "timeout": 30000, "runners": {} },
  "filesystem": { "deny": [], "allowOutside": [] }
}
```

The `strict` profile [seeded: the donor's curated read-only default] is
deliberately wider than bare git: `@query` is the general shell escape hatch
(anything the allowlist grants - `npm audit --json`, `docker ps --format json`
once granted), and `@test`/`@check` execute test runners **through this same
allowlist**, so the runner patterns MUST ship in the profile or those directives
are dead on arrival. `deny` patterns are checked after the allowlist and win.
`security shell test "<cmd>"` answers ALLOWED/BLOCKED with the reason.

**Immutable rules** [seeded], below the policy layer, unoverridable by any config:
the shell always-block list (destructive commands like `rm`/`dd`/`mkfs` and inline
code execution like `node -e`/`eval` are refused regardless of any allowlist);
path traversal checked on every file access including by the hook; secrets masked
before cache and before any trace record. **The `@code` carve-out, stated
precisely:** engine-constructed runner invocations - built by the engine from the
granted `code.runners` map, always executing a temp script file, never an inline
`-e`/`-c` string - are the single sanctioned exception to the inline-execution
always-block. A user's `@query "node -e ..."` remains always-blocked even if a
pattern would allow it; the only way to run code is `@code` under a language
grant. This interaction is a named Wave 4 acceptance test. (The donor's metadata-endpoint blocking
guarded engine-issued HTTP requests; the engine now issues none. Network conduct
inside a `@code` script is the script's granted, visible, traced responsibility.)
**Post-interpolation enforcement**
(Principle 5) is a tested invariant with hostile-argument fixtures.
`livestage security show` prints the effective policy; `doctor` reports per-surface
grant state.

---

## Arguments (F-ARGS)

`livestage render doc.stage --args "<raw user prompt>" --var k=v` exposes
`{{ args }}`, tokenized `{{ arg0 }}..{{ argN }}`, `{{ vars.k }}`; env mirrors
`LIVESTAGE_ARGS`/`LIVESTAGE_VAR_*`; the `allowed()` sandbox builtin [seeded]
performs validated dispatch (`@if {{ allowed(arg0, "list", "sync") }}`). The same
values reach `@code` via `LIVESTAGE_CONTEXT`. **Passive hook renders carry no
arguments** (the hook knows only the file path), so every document must render
sensibly with args absent; `validate` flags a document that dereferences args
without an absent-args fallback. Arguments are untrusted data; post-interpolation
enforcement means they can never escalate.

---

## Hook Contracts

**PreToolUse** (`src/hook/pretooluse.ts`): fires on file-read tool calls whose path
ends in `.stage` (pure extension match, nothing else). Renders via the same code
path as `cli render` (no args, deterministic-off, policy fresh) into
`.livestage/cache/`, substitutes the rendered file for the read. Render timeout
(default 5000 ms, configurable) fails **open**: the hook substitutes the strip
output (fallback texts) with a leading `> [!NOTE] degraded render` banner, and the
trace records `degraded: true`. Any hook error fails open to the raw file. The hook
never fires on any other extension (CR-3).

**SessionStart** (`src/hook/sessionstart.ts`): renders and injects documents the
project config designates as briefs. Same render path, same timeout, same
fail-open.

**Install** (`livestage init`): all-or-nothing. Registers both hooks (idempotent,
atomic, backed-up settings writes [seeded, donor init]), seeds
`.livestage/policy.json` (strict), verifies the bundle on PATH, and offers (opt-in
prompt, `--claude-md`/`--no-claude-md` flags) to write a marker-delimited LiveStage
section into the project's agent-instructions file (CLAUDE.md): what `.stage` files
are, the CLI verbs, and how to author them. The marker-section mechanism is lifted
from the donor's postinstall script; the content is new, and it never suggests
directive syntax in non-`.stage` files. NO npm lifecycle scripts exist: install
side effects are forbidden, `init` is the only installer. Partial failure rolls
back and reports; re-run is a no-op.

---

## Render Trace (F-TRACE)

Append-only JSONL at `.livestage/trace/<yyyy-mm-dd>.jsonl`, one record per
directive execution and one per render:

```json
{ "t": "directive", "render_id": "...", "doc": "...", "directive": "query",
  "line": 41, "ms": 12, "result_hash": "...", "degraded": false }
{ "t": "render", "render_id": "...", "doc": "...", "ms": 180, "directives": 14,
  "degraded": false, "exit": 0 }
```

Masked, size-capped, written directly by the trace writer (no transport
subsystem). The engine **never reads the trace** (CR-4). Consumers:
`livestage engine trace [--last | <render-id>]`, `doctor`.

---

## CLI

Flat workflow verbs; namespaced subsystem verbs. Exit codes are part of the
contract:

| Command | Exit 0 | Exit 1 | Exit 2 |
|---|---|---|---|
| `render <file> [--args] [--var]... [--env <file>] [--out] [--timeout] [--deterministic]` | rendered | render/policy error | usage/parse error |
| `strip <file> -o <file.md>` | written | error | usage |
| `validate <file|glob>` | all valid | any invalid (incl. inert assertions, removed directives, args w/o fallback, ungranted @code language) | usage |
| `assert <file|glob>` | all assertions pass | any fail (incl. zero-match fails) | document invalid |
| `eval '<expr>'` | value printed | eval error | usage |
| `doctor [--json] [--rules-for <file>]` | healthy | named failures | usage |
| `init` | installed (or already) | rolled-back failure | usage |
| `watch <file> [--out]` [seeded] | (runs until interrupted; re-renders on change) | render error printed, keeps watching | usage |
| `parser ast|check|directives|imports|macros` [seeded: list-imports/list-macros] | per subcommand | error | usage |
| `engine eval|trace`, `renderer preview --format`, `cache clear|status` | per subcommand | error | usage |
| `security show|init|disable|shell enable|add|remove|list|test <cmd>` [seeded: donor security command family, http subcommands dropped with the surface] | per subcommand | error | usage |

Donor `build` is not a verb; `render --out` subsumes it. `--env <file>` loads a dotenv file for `@env` via the seeded env-loader. `security shell test <cmd>` answers "would the current policy allow this command" - the policy-debugging front door.

`doctor` checks: binary version, hooks registered + executable, every project
`.stage` parses, policy loads with per-surface grant state, trace path writable,
assertion-liveness summary, schema files valid. One line when healthy; `--json`
emits machine-readable health (no blessed consumer). `--rules-for <file>` lists
the assertion documents whose targets match the file and their pass state, plus
coverage.

---

## Determinism (F-DETERMINISM)

`LIVESTAGE_DETERMINISTIC=1` (or `--deterministic`): frozen clock
(`LIVESTAGE_NOW`), seeded UUIDs (`LIVESTAGE_SEED`), env-overridable paths,
`@cache mock=fixture.json` serves fixtures for `@query` and `@code`.
Two deterministic runs of the same document are byte-identical; this is what makes
golden-file testing the default for the whole render surface.

---

## Build Order

Wave 0 is the seed script (by hand, above). Each wave has a demo-state and is not
done until it is demonstrable. Every feature is a build unit tagged COMPONENT (C)
or SPEC (S, a behavior contract a component satisfies); donor-backed components
name their copy source. `[verify]` = arrives from the seed, wave verifies against
the migrated doc and adds acceptance tests; `[new]` = built this wave, copy-first
where a donor subsystem is named.

**Standing instruction for every wave task (CR-D7):** step one is always the
donor. Open the copy-map row, read the donor source and its tests, read the
migrated doc. Only what the donor demonstrably lacks gets authored. The cheapest,
safest line of code in this build is one that already has a passing test in
`~/projects/markdownai`.

**Wave 1, Foundation.** Demo-state: `livestage render examples/hello.stage`
returns pure markdown via CLI; the PreToolUse hook renders the same file on a
simulated read and does NOT fire on `hello.md` containing directive-like text;
`livestage security show` prints the strict policy; a non-allowlisted `@query`
fails with a policy error; boundary lint and CR-1 scan green.
- (C) pkg-skeleton [verify]: single package, subpaths, tsconfig, vitest merge.
- (C) boundary-lint [new]: module import rules.
- (C) grammar-parser [verify]: donor v2 grammar, registry-only directive set.
- (C) security-core [verify: donor engine/security]: policy loader, surfaces,
  immutable rules, masking, strict profile; per-invocation reload.
- (C) ext-routing [new; donor hook plumbing]: extension-match PreToolUse,
  `.stage` resolution in include/import/template.
- (C) trace [new; donor trace subsystem]: record schema, writer, `engine trace`.
- (C) cli-router [new; donor cli.ts]: flat verbs + namespaces, exit codes.
- (S) CR-1 identity; (S) CR-2 one-package; (S) CR-3 stage-only; (S) CR-4
  no-daemon-no-memory; (S) CR-5 deny-by-default.

**Wave 2, Data plane.** Demo-state: a live-brief example document (`@list` +
`@read-frontmatter` + `@query git` + `@foreach` + `@render table`) renders current
project state in one CLI call; the same doc through the hook is identical; `strip`
emits the degraded twin; `--args "sync"` flips an `@if allowed(...)` branch and a
passive render takes the fallback branch; goldens green.
- (C) sources [verify]: list/read/read-frontmatter/tree/count/date/env.
- (C) compute [verify]: hash/query/test/check structured results.
- (C) composition [verify]: interpolation + builtins, set/if/foreach/switch,
  define/call, include/import, template/data.
- (C) render-formats [verify]: the nine formats (incl. `links`); flow, timeline,
  and row (its only consumer was the retired `@db as=row`) must not exist; all
  output plain markdown constructs.
- (C) cache [verify]; (C) pipe [verify].
- (C) args [new; donor skill-context-variables]: --args/--var/env, allowed(),
  LIVESTAGE_CONTEXT flow, absent-args behavior.
- (C) fallback-contract [new]: per-directive static fallback registry; strip as
  render's static twin; hook timeout fail-open with degraded banner.
- (S) CR-6 fallback-total; (S) CR-10 render-purity; (S) CR-11 markdown-out.

**Wave 3, Verification.** Demo-state: an assertion doc against a fixture tree goes
green; deleting the target files flips contains-class assertions to FAIL (not
vacuous green); `validate` refuses an all-inert doc, warns on a double-escaped
regex, and fails a document containing `@phase` as an unknown directive
(nothing outside the registry parses);
`livestage assert` exits 1 in a CI fixture repo with only the bundle present.
- (C) assert-operators [new]: the six operators, vacuity semantics, match counts.
- (C) assert-liveness [new]: validate-time glob liveness, regex lint, inert-doc
  refusal, args-fallback rule. (Directives outside the registry fail as unknown
  directives; no special-case handling exists.)
- (C) ci-mode [new]: exit-code semantics on bare checkout.
- (S) CR-7 suite-baseline holds through the wave.

**Wave 4, Code + Doctor.** Demo-state: a `.stage` doc runs a Python block that
emits JSON; `{{ analysis.total }}` renders and `@render table` shows its rows;
with `python` removed from the policy, `validate` fails the doc at authoring time
and `render` fails at runtime; `doctor` prints one healthy line, `--json`
validates against its schema, `--rules-for` answers for a fixture file.
- (C) code-runners [new; donor query/test exec plumbing + shell enforcement]:
  runner map via shell path, structured results, JSON binding,
  LIVESTAGE_CONTEXT/stdin, opt-in interpolation, timeout. *Accept additionally:*
  the always-block carve-out - engine-built runner invocations (temp script file)
  pass; `@query "node -e ..."` is refused even when allowlisted.
- (C) doctor [new; donor init checks as probes]: all probes, one-line output,
  --json, --rules-for + coverage.
- (C) init [new; donor init command]: all-or-nothing hook + policy install,
  rollback, idempotence.

**Wave 5, Frontmatter engine + determinism.** Demo-state: a schema declares the
project's doc class; an `@update-frontmatter` violating it is blocked pre-write
with a named error; a conforming update lands atomically; `@graph` renders the
dependency tree and reports a planted cycle; a one-line `@list ... where=...
fields=... | @render table` renders the filtered multi-column status table over a
25-doc fixture corpus; two `--deterministic` renders of the suite are
byte-identical.
- (C) schema-engine [new; donor frontmatter-utils]: class declaration in
  `.livestage/schemas/`, validated reads, doctor integration.
- (C) tx-update [verify->extend]: pre-write validation, atomic write.
- (C) graph [verify->extend]: native relation edges, cycle + broken-edge
  detection; NEW output `format=mermaid` emitting a fenced ```mermaid block
  (pure markdown per CR-11 - a fenced code block that happens to render as a
  diagram) with per-node status classDefs; structured results (`_nodes`,
  `_edges`, `_cycles`, `_broken`, `_broken_list`) following the @test/@code
  result pattern, label-capturable for `{{ }}`.
- (C) determinism [new; donor cache mocks + sandbox builtins]: frozen clock,
  seeded uuid, mock fixtures, byte-identical guarantee.
- (C) fm-query [new; donor whereMatches + frontmatter-utils, composed - neither
  wired to the other in the donor]: frontmatter-aware document querying.
  (1) `@list docs/*.stage where="status != 'complete' && known_issues != []"
  fields="id,status,wave,last_synced"` - the where clause evaluates against each
  matched file's frontmatter, arrays support emptiness/length predicates, and
  `fields=` projects frontmatter columns as rows for `| @render table`: the
  classic status table becomes ONE line instead of a 100-execution @foreach.
  (2) `@read-frontmatter path=... label=doc` struct mode: all fields captured,
  `{{ doc.status }}` dot-access inside loops. (3) `count-by <field>` pipe
  builtin over projected rows ("complete 18, in_progress 4"). Schema validation
  (F-SCHEMA) applies to every projected read. Cross-doc queries into NESTED
  frontmatter arrays (e.g. contract objects) are deliberately NOT a directive -
  that is a documented `@code` pattern in the user guide. (4) `@render tree` over projected rows: column one
  (a slash-delimited breadcrumb like the `path` field) is the tree key,
  remaining columns annotate the leaf - the grouped path-tree view in one line.
  *Accept:* the one-line status table golden; array predicates; struct capture
  in a loop; count-by; the path-tree golden; a nested-array query attempt via
  where fails with a pointer to the @code pattern.

**Wave 6, Pattern, bundle, enforcement floor.** Demo-state: the multi-step example
renders green in sequence and red out of sequence, state round-trips through
schema-validated frontmatter; `dist/livestage.js` alone passes the bare-checkout
e2e; hook cold render of a trivial doc under 200 ms; every CR scan and suite
green; all migrated docs verified (CR-9 clean).
- (C) pattern-example [new]: the worked multi-step directory + guide doc + e2e
  including skipped-step, stale-state, degraded-render failure modes.
- (C) bundle [new]: esbuild single file, cold-start budget test, init installs it.
- (C) contract-scans [new]: the CR scan suite (identity grep, stage-only, no-daemon,
  markdown-out registry test, fallback-total registry test, purity harness).
- (C) doc-verification-closeout [verify]: remaining migrated docs confirmed.
- (C) examples-showcase [verify: donor mai/ corpus]: re-extensioned, renamed,
  removed-directive-free, rendering green under the strict profile.
- (C) user-guide [verify: donor manual]: migrated, renamed, architecture-corrected
  (stateless, no server, .stage only).
- (C) connections-example [new]: `examples/connections/connections.stage` - the
  live replacement for a generated cross-doc index: `@date` + `@count` header,
  path tree via F-FM-QUERY projection + `@render tree`, dependency graph via
  `@graph format=mermaid` with `{{ deps._edges }}`/`{{ deps._broken }}` counts,
  source-file overlap as the canonical nested-array `@code` script
  (`overlap.js`), warnings from `{{ deps._broken_list }}`. The doc that proves
  "generated file" is a category LiveStage deletes. *Accept:* golden over a
  fixture doc corpus; planting a broken depends_on and an overlapping
  source_file flips the render.
- (C) reach-via-code [new]: two worked examples under `examples/`: a
  database-backed doc (driver code in a `@code` script, JSON out, `{{ label }}` +
  `@render table` in the doc) and an HTTP health-check doc (`fetch` in a `@code`
  script, structured status out); both accompanied by the policy grants they
  need, both linked from the user guide as the canonical reach patterns.
- (S) CR-8 bare-checkout; (S) CR-9 doc-corpus; (S) CR-D7 reuse-fidelity.

There is no Wave 7. External reach (databases, HTTP, anything beyond the
filesystem and the allowlisted shell) is not a directive tier; it is `@code`
under policy. Wave 6 ships the worked examples that make this concrete
(`reach-via-code`, above), and the editor grammar (TextMate/linguist for `.stage`)
stays parked as a separate post-v1.0 deliverable.

---

## The Cross-Cutting Contracts

Twelve contracts, each enforced by a scan, a registry-iterating test, or a harness,
verified on every `npm test`.

**CR-1 Standalone identity.** Zero occurrences of donor brand strings, former
package scopes, or former binary names in `src/`, `dist/`, shipped docs, CLI
output, or error messages. Case-insensitive scan. This spec is the sole exception
and does not ship; the donor checkout at `~/projects/markdownai` is outside the
repo and outside scan scope.

**CR-2 One package.** Exactly one root `package.json` defines the publishable
unit; no workspace configuration exists. Scan.

**CR-3 `.stage` only.** No code path parses or executes any non-`.stage` file;
`.md` appears in routing code only as `strip` output handling;
the hook test matrix proves a `.md` file full of directive-like text is never
routed. Scan plus hook matrix.

**CR-4 No daemon, no memory.** No listening socket, server entrypoint, daemon
lifecycle, or cross-invocation state store in `src/`; the trace is written and
never read by the engine (scan: no trace-read import outside `cli/commands` and
`doctor`). Scan.

**CR-5 Deny-by-default.** Every shipped profile denies all surfaces it does not
explicitly grant; a test proves each surface (fs-outside-project, shell, code)
unreachable without a grant, and that no policy file can defeat an immutable
rule. Security matrix.

**CR-6 Fallback totality.** Every directive in the registry declares static
fallback text; a registry-iterating test fails on any directive without one, so a
new directive cannot ship uncovered. Test.

**CR-7 Suite baseline.** Merged suite green; test count never below the seeded
baseline minus the enumerated excluded-subsystem tests. CI check.

**CR-8 Bare checkout.** `render`, `validate`, `assert` succeed on a fresh clone
with only `dist/livestage.js` present, no install step. E2e.

**CR-9 Doc corpus integrity.** Every migrated doc: paths resolve in the
single-package layout, content hash recorded against seeded code, verification
wave completed before its feature closes; no retire-disposition doc exists; no doc
references donor paths or brand. Scan plus wave gate.

**CR-10 Render purity.** Rendering any corpus document produces zero filesystem
mutations outside explicit `@update-frontmatter` targets; the before/after
snapshot harness wraps every integration test. Harness.

**CR-11 Markdown out.** Rendered and stripped output of every corpus document is
pure markdown containing zero directive syntax; registry-iterating test. Test.

**CR-D7 Reuse fidelity, code and docs.** For every `[verify]` component and every
`[new]` component with a named donor subsystem, the wave record names the donor
path copied from; implementing one without the donor copy is a wave failure. For
every feature doc whose subject has a carry-over or rewrite disposition in §0.5,
the doc must originate from the migrated donor doc (mechanical pass plus targeted
edits), never from scratch; a fresh doc written where a donor doc exists is a wave
failure. Wave review gate on both.

---

## Testing Strategy

Two layers only: pure-function unit tests on internal modules (the merged donor
suite lives here and is the regression floor), and CLI-level integration tests on
fixture directories, asserting stdout, exit codes, and trace records, the same
artifacts production consumers read. No lifecycle helpers, no protocol mocks, no
test-only introspection. Golden-file snapshots are the default for the entire
render surface under `--deterministic` (byte-identical guarantee): every
directive, every format, every fallback path. Security is a policy-fixture
matrix: every surface x granted/denied x immutable-override attempt x hostile
interpolated arguments, one policy file plus one invocation per case. Purity is
tested, not trusted: the before/after filesystem snapshot harness wraps every
integration test (CR-10). The hook is tested as a pure decision function
(path in, route/no-route out) plus an integration pass through the real render
path with timeout and fail-open cases. E2e: the bare-checkout run (CR-8) and the
multi-step pattern walk (in order, out of order, degraded). CI invokes the same
verbs as every test, so parity is by construction.

---

## Success Criteria

- [ ] `npm install && npm run build` clean, strict TS, no `any` in new code;
      `dist/livestage.js` builds; `livestage init` installs hooks + strict policy
      all-or-nothing and is idempotent
- [ ] The hook renders `.stage` reads and never fires on any other extension; a
      `.md` file full of directive-like text is returned untouched (CR-3)
- [ ] A render returns pure markdown, zero directive syntax, via CLI and hook
      identically (CR-11)
- [ ] Rendering mutates nothing except explicit `@update-frontmatter` targets;
      the purity harness wraps every integration test (CR-10)
- [ ] Every invocation is stateless: no socket, no session, no state store; the
      trace is write-only for the engine (CR-4)
- [ ] Policy is loaded fresh per invocation; a policy edit is enforced by the next
      render; every surface is deny-by-default and immutable rules are
      undefeatable (CR-5)
- [ ] `@query` and `@code` enforce through the one shell/allowlist; `@test`/
      `@check` run their runners through the same allowlist and work under the
      shipped `strict` profile
      path, post-interpolation; hostile-args fixtures cannot escalate
- [ ] `@code` runs granted languages only, binds JSON stdout as structured data,
      receives LIVESTAGE_CONTEXT, and fails ungranted languages at validate AND
      runtime
- [ ] Contains-class assertions FAIL on zero matches; only `absent` passes
      vacuously and is flagged; every result carries its match count; `validate`
      refuses inert docs and warns on double-escaped regexes
- [ ] Nothing outside the directive registry parses; a document containing any
      excluded donor directive fails as an unknown directive
- [ ] `--args`/`--var` reach `{{ args }}`/`{{ arg0..N }}`/`{{ vars.k }}` and
      `@code`; passive hook renders carry no args; a doc dereferencing args
      without a fallback fails `validate`
- [ ] Every directive has fallback text (registry test, CR-6); strip is render's
      static twin; hook timeout fails open with a degraded banner and a trace flag
- [ ] Frontmatter schemas block violating writes pre-write with named errors;
      `@update-frontmatter` is atomic; `@graph` detects cycles and broken edges
- [ ] One-line frontmatter querying: `where=` over document frontmatter with
      array predicates, `fields=` projection to `@render table`, struct-mode
      `@read-frontmatter`, and `count-by`; nested-array frontmatter queries are
      the documented `@code` pattern, not a directive
- [ ] Two `--deterministic` runs are byte-identical; goldens cover every
      directive, format, and fallback path
- [ ] `doctor` is one line healthy, `--json` machine-readable with no blessed
      consumer, `--rules-for` answers with coverage
- [ ] The multi-step example renders green in sequence, red out of sequence;
      state round-trips through schema-validated frontmatter
- [ ] Bare checkout with only the bundle passes render/validate/assert (CR-8);
      hook cold render of a trivial doc under 200 ms
- [ ] Zero donor identity strings anywhere shipped (CR-1); one package.json
      (CR-2); test count at or above the seeded baseline (CR-7); every migrated
      doc verified (CR-9)
- [ ] Every [verify] and donor-backed [new] component names its donor copy source
      in the wave record; every carry-over/rewrite doc originates from the
      migrated donor doc, never from scratch (CR-D7)
- [ ] No em dashes anywhere in new source

---

## Notes and Constraints

Never parse or execute a non-`.stage` file; never add content sniffing or a header
directive back; never open a socket or add a daemon; never let the engine read the
trace; never add a second cross-invocation store; never let a directive write to
disk outside `@update-frontmatter` and policy-granted `@code`; never emit
directive syntax in render or strip output; never let a contains-class assertion
pass on zero matches; never enforce policy before interpolation; never let a new
directive ship without fallback text (the registry test exists so this is
impossible); never rewrite donor code that could be copied; never write a fresh feature doc where a donor doc
with the same subject exists (migrate it); never start a wave task without first
opening the donor copy-map row; never reference the donor outside this spec; never bless an output consumer; never add an event
transport or status integration; never add an npm lifecycle script (install side
effects are forbidden, init is the only installer). No em dashes in new source.

**Known gaps and things to verify at build.** Donor `@template`/`@data` partials
interact with `@foreach` scoping in ways the copied tests cover, but the `.stage`
re-extension of fixtures must be verified early (Wave 2). The hook substitution
mechanism (rendered-cache path rewrite vs deny-and-replace) should be settled in
Wave 1 against the current Claude Code hook API and documented in the hook doc.
The 200 ms cold-start budget assumes the esbuild bundle; if the seeded dependency
graph resists single-file bundling anywhere, that resistance is a Wave 6 finding
to fix, not accept. The cold-start mitigation ladder, in order, if measurement
ever demands more: (1) the hook entry is a dependency-free fast-path script -
mtime/hash check, serve fresh cache, exit without loading the engine (Wave 1,
part of F-EXT); (2) compile the bundle to a native binary (`bun build --compile`
on the existing TS, or Node SEA + V8 snapshot) for ~10-25 ms spawns (F-BUNDLE
stretch); (3) `livestage watch` as a cache WARMER, never a server: a resident,
explicitly-started (or opt-in SessionStart-autostarted, idle-exit backstopped)
process that re-renders documents when their declared INPUTS change - the globs
they `@list`, `.git/HEAD` and index for docs that `@query git`, an interval
fallback for time-sensitive directives - writing results to `.livestage/cache/`.
Its only interface is the filesystem: the hook never talks to it, the hook's
freshness check rejects stale cache regardless, and a dead/absent/crashed watch
means the hook renders itself - slower, never wrong, never an error. This makes
cache hits both instant and FRESH, shrinking cache-miss frequency toward zero,
which beats accelerating misses; (4) LAST RESORT, evidence-gated: an optional auto-expiring render
daemon over a unix socket. (4) must never be built speculatively - it amends
CR-4, reintroduces stale-process and policy-freshness risk, breaks the
one-stateless-invocation testing model, and its ceiling is low anyway: the host
spawns the hook process per read regardless, so a socket only accelerates cache
MISSES while (3) eliminates them - and a session-scoped lifetime does not dodge
these costs, it adds them (no reliable exit signal on crash, orphaned daemons,
per-project socket ownership, upgrade handshakes). If ever built it must be a
pure accelerator (hook tries socket, falls back to spawn on ANY failure, so a
dead daemon is never a failure mode, only a slower render). The sandbox builtins `read_section` and
`parse_brief` predate the removal of the section/brief machinery; Wave 2 audits
them - keep if they are generic text utilities, drop if they encode removed-concept
formats. Linguist/TextMate grammar for
`.stage` on code hosts is parked with the editor work and is not a v1.0
dependency.
