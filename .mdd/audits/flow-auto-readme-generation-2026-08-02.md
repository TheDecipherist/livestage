# Data flow: auto-readme-generation

## Values traced

### 1. Directive names and count
- Origin: `src/parser/registry.ts`'s `getAvailableDirectives()` (compiled from the 27-entry `modules` array). This is the single authoritative source, nothing else in the codebase enumerates directives independently.
- Transport into README.stage: NOT read directly (a `.stage` file cannot import TS). Instead, README.stage's directive-reference section is driven by which `.mdd/docs/*.md` files exist and what they document (see #2). The registry is consulted separately, only by the coverage test (see Impact).
- Consistency check performed: live-tested `@list ".mdd/docs/*.md" where="path.startsWith('Directives') || path == 'Renderer / Formats' || path == 'Engine / Code Runners'" fields="id"` against the real corpus, returns exactly the 11 docs that between them cover all 27 registered directives (verified by hand: 17 covers 7, 18 covers 4, 19 covers 10, 20 covers 1, 22 covers 0 new directives (pipe syntax modifies other directives, not a directive itself), 26/27 cover @assert, 29 covers 1, 33 covers 1, 34 covers 1, totals 27 covered).

### 2. Per-directive documentation prose (syntax, args, behavior)
- Origin: each directive-owning `.mdd/docs/*.md` file's `## API/Interface` and `## Business Rules` body sections, written by the normal MDD build flow (Phase 3) for every feature, already current as of every merge to main.
- Transport: live, via `read_section(path, heading_contains)` (the sandbox builtin backed by `readMarkdownSection` in `src/engine/sources.ts`), invoked once per doc inside a `@foreach` over the frontmatter-query above.
- Live-verified exact pipeline (proven working end to end against the real corpus, not simulated):
  ```
  @foreach docid in @list ".mdd/docs/*.md" where="path.startsWith('Directives') || path == 'Renderer / Formats' || path == 'Engine / Code Runners'" fields="id"
  @if docid != "id"
  @read-frontmatter path=".mdd/docs/{{ docid }}.md" field="title" label="doc_title" visible="false" /
  ### {{ doc_title }}
  {{ read_section(".mdd/docs/" + docid + ".md", "API/Interface") }}
  {{ read_section(".mdd/docs/" + docid + ".md", "Business Rules") }}
  @if-end
  @foreach-end
  ```
  Renders correctly today, live, producing all 11 docs' real API/Interface and Business Rules content with real syntax tables (`@list`'s attrs, `@assert`'s operator table, etc.), zero placeholders.
- Gotchas found and worked around (documented so the design survives re-derivation):
  - `@list <dir> match="*.ext"` (plain listing) and `@list "<glob>" where=... fields=...` (frontmatter-query) are two different code paths, gated on whether the path itself contains glob characters. The glob must be IN the path string for frontmatter-query to activate.
  - The CLI's default data jail is the entry file's own directory, not `--cwd`. A `.stage` file testing `.mdd/docs/*.md` access must live at (or under) the actual project root for the glob to resolve, a copy in `/tmp` fails closed (returns zero rows, no error) because `.mdd/docs` doesn't exist relative to the temp file. This is not a bug, it confirms README.stage will work correctly once it lives at the real repo root, which is exactly where it belongs.
  - `@foreach docid in @list ... | grep ...` (a pipe stage inside a `@foreach`'s inline source) is parsed as "pipe FROM @foreach", which is explicitly disallowed (`"@foreach" cannot be used as a pipe source`), even though the pipe was intended for the nested `@list`. Fixed by skipping the header row with `@if docid != "id"` instead of piping through `grep -v`.

### 3. Package metadata (name, version, description, bin, scripts)
- Origin: `package.json` at the repo root.
- Transport: `@read "package.json" path="name"` (and `path="version"`, `path="description"`, etc.), the same structured-JSON-read pattern already proven in `tests/golden/fixtures.ts`'s `read` fixture.

### 4. Real-world example files (the "N bash calls to one render" demonstration)
- Origin: 2-3 new `.stage` files to be written under `examples/`, following the existing `examples/http-health/`, `examples/showcase/` pattern (real, runnable, policy-scoped where needed).
- Transport: `@read` (embed a live excerpt of the actual file) inside README.stage's "Real-World Scenarios" section, so the shown code can never drift from the actual runnable file.

### 5. Test count / project health signal
- Origin: `scripts/test-baseline.json`'s `baseline` field (the CR-7 floor, already live-updated by this project's own `test:baseline:update` script).
- Transport: `@read "scripts/test-baseline.json" path="baseline"`.

## Consistency issues found

One real, small, pre-existing gap: `@read-frontmatter` does not honor `visible=`/`silent=` the way `@list`/`@read`/`@tree`/`@code` all do (confirmed live: `visible="false"` on a `@read-frontmatter` call still prints the value inline). Every other source-shaped directive got this suppression convention (most recently `@code`, task 31 of the prior known_issues sweep), `@read-frontmatter` was missed. This directly blocks README.stage's own design (the per-doc `doc_title` capture needs to stay invisible, only surfacing via `{{ doc_title }}` in the heading). Grepped every existing `@read-frontmatter` call site in the repo (11 files: examples, tests, docs), none currently pass `visible=`/`silent=`, so adding support is purely additive and changes no existing output.

Not a conflict, a scope decision: MDD docs document directive GROUPS (one doc often covers 4 to 10 directives), not one doc per directive. README.stage's directive reference is therefore organized the same way (grouped by owning doc), not forced into an artificial one-heading-per-directive structure that doesn't match how the source material is actually written.

## Impact (files touched, call sites affected)

| File | Change | Call sites affected |
|---|---|---|
| `src/engine/engine.ts` (`case 'read-frontmatter'`, around line 315) | Add `visible=`/`silent=` suppression, matching the existing `case 'code'` convention | 11 existing call sites (examples, tests, docs), none pass `visible=`/`silent=` today, additive only, verified via grep, no LSP findReferences needed (this is a directive-args convention, not a symbol) |
| `.mdd/docs/17-source-directives.md` | `known_issues` entry documenting the fix (this is the doc owning `read-frontmatter.ts`) | N/A, doc-only |
| `README.stage` (new, repo root) | New file | N/A |
| `README.md` (repo root) | Fully replaced (currently a 6-line placeholder) | Zero code consumers import or parse README.md (grepped: nothing in `src/`/`tests/` reads it), safe to replace wholesale |
| `examples/*.stage` (2-3 new files) | New files | N/A |
| `package.json` | Add `readme`, `readme:check` scripts | Additive |
| `.github/workflows/ci.yml` | Add a `readme:check` step | Additive, will correctly FAIL if README.md ever drifts from README.stage's output, which is the intended behavior |
| `tests/e2e/readme-generation.test.ts` (new) | New test: renders README.stage, asserts every directive name from `getAvailableDirectives()` appears in the output (registry-vs-docs coverage/drift guard), asserts zero leftover `@`-directive syntax (CR-11 style), asserts key package.json fields appear | N/A |

## Gate

Presented to the user 2026-08-02: proceed with documentation (Phase 3), architecture confirmed (live `.mdd/docs` sourcing, no hand-maintained sidecar), one small `@read-frontmatter visible=` fix folded into this feature's implementation.
