---
name: reverse-engineer
description: Generate MDD feature docs from existing source code. Single-target mode documents one feature; corpus mode partitions a whole undocumented project into a dependency-ordered feature map, previews it as a mandatory dry run, then writes every doc batch by batch with a resumable manifest. Infers purpose, models, routes, and rules in parallel, discloses what could not be inferred. Invoke with /reverse-engineer (or /reverse), optionally with a path or feature id; no argument on an undocumented project offers corpus mode.
disable-model-invocation: true
user-invocable: true
argument-hint: "[path or feature id, empty for corpus mode]"
arguments: [target]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Document existing code as MDD feature docs: $target

The one place docs are written AFTER the code. That inversion is a limitation, not the
norm, and it must be disclosed in every doc produced.

Schema discipline (both modes): docs use ONLY valid enum values, the
frontmatter-validate hook blocks anything else. An inferred doc is written
`status: complete`, `phase: all` (the code exists and runs; the DOC is what is new),
`last_synced: today` (true, it was verified against the code today). The
inferred-not-confirmed caveat is carried where the kit tracks open items: a
`known_issues` entry, `[gap] Purpose and business rules inferred from code by
/reverse-engineer, not confirmed by a human`, so /status, /audit's backlog, and
/fix-known-issues all surface every unconfirmed doc until someone reviews it and
moves the entry to Fixed Issues. Never invent status or phase values for
"draftness"; the known_issues gap IS the draft marker.

## R1, scope
Say: `[reverse-engineer 1/4] Resolving scope.`
- `$target` matches an existing doc: load it for comparison (regenerate mode).
- `$target` is a file or directory path: that is the source (single new-doc mode).
- Empty `$target`: cross-reference every source file against all docs'
  `source_files`. A handful of unregistered files: ask which to document (single
  mode). A largely or wholly undocumented project (most files unregistered, or
  zero docs): offer CORPUS MODE below, it is the only honest way to document a
  big existing project; one-doc-at-a-time invocations produce ids in arbitrary
  order, which the schema's depends_on-points-lower rule then rejects.

## R2, read the source (parallel over 4+ files)
Say: `[reverse-engineer 2/4] Reading source (N files, M agents).`
Three or fewer files: read directly. Four or more: batch into explore agents, each
reading a subset and returning structured inference (not raw files), never writing.
Per file infer: purpose (what problem it solves), data models (interfaces, types,
schemas), API routes (method and path), business rules (validation, state
transitions), dependencies (project imports), edge cases (error handling, guards),
consumer-callable surfaces (routes, CLI verbs, exported directives, public API), and
gate-function candidates (auth checks, validation choke points, "check before X"
functions other code calls). Fall back to direct reads if an agent fails,
synthesize in the main thread.

## R3, draft
Say: `[reverse-engineer 3/4] Drafting the doc.`
Read `.mdd/00-frontmatter-spec.md` for the schema. Draft a full feature doc
following the build Phase 3 structure, including: the enum-valid frontmatter above,
inferred `tags` (concepts, not file paths), `primitives` for every consumer-callable
surface found (block style, exact identifiers, free-form kebab kind) WITH the full
three-part `## Interface Overview` the schema then requires (prose overview, quick
table, per-primitive sub-sections, stranger-readable, the validator blocks a doc
that declares primitives without it), and `integration_contracts` entries for gate
functions this feature provides that other code demonstrably calls (the call sites
are the evidence; consumers get `satisfies_contracts` wiring in corpus mode where
both sides are being written). In regenerate mode, show the existing doc against
the new draft section by section and ask: merge, keep existing, or show full diff.
In new-doc mode, show the full draft and ask what to add or change.

## R4, save
Say: `[reverse-engineer 4/4] Saving and reporting.`
On confirmation, write the doc, then offer to generate test skeletons from the
inferred endpoints and rules (the build Phase 4 logic). Always disclose the
limitations before treating it as source of truth: the Purpose is inferred,
implicit constraints (SLAs, compliance, product decisions) are not captured, and
the known_issues `[gap]` entry stays until a human confirms. Connections regenerate
via the sync hook as docs are written.

## Corpus mode (a big project that was not built with MDD)

The import-spec shape applied to code instead of a spec: partition, order, preview,
then write with a resumable manifest. Statusbar mirrors `reverse-engineer <N> 4`.

1. PARTITION. Fan out explore agents over the whole source tree (shard by
   directory, batch sizes like /audit's scaling). Each returns, per file: what it
   is, what it imports (project-internal), what surfaces it exposes. From the
   merged map, partition files into candidate FEATURES (a coherent purpose a doc
   can own: a route family plus its service and models, a subsystem, a CLI verb
   group). Every source file lands in exactly one feature's `source_files` or an
   explicit "shared infra" feature; no file silently unassigned. TEST files are
   partitioned the same pass: each test file lands in the `test_files` of the
   feature whose code it exercises (match by import targets, then by path
   convention). This is not optional bookkeeping: reverse-engineered docs are
   written `status: complete`, and the validator hard-rejects a complete
   COMPONENT with real `source_files` and empty `test_files`. A feature whose
   code genuinely has no tests records `[gap] no tests found for this feature`
   in `known_issues`, loud, so the backlog carries it. Detect SPECs
   sparingly (an existing written contract, a schema file consumed by many);
   most reverse-engineered docs are COMPONENTs.
2. ORDER AND NUMBER. Build the dependency graph from the import map, then number
   features so `depends_on` only points to lower ids (the import-spec hard rule;
   the validator enforces it doc by doc). Group into waves only if the user wants
   them (an already-built project usually takes a flat numbered list, `initiative:
   none`).
3. DRY-RUN GATE, mandatory, one interaction: present the full feature map (id,
   title, files, depends_on, surfaces found, gate-function candidates), the count
   of files per feature, and any files that fit nowhere. Ask approve / adjust /
   abort. Nothing is written before approval.
4. WRITE, batch by batch, resumable: create `.mdd/jobs/reverse-<date>/MANIFEST.md`
   listing every doc in id order (`[ ]`/`[~]`/`[x]`). Generate docs in id order in
   batches (R2+R3 logic per feature, agents for the reading, synthesis in main),
   marking the manifest as each lands, so an interrupted run resumes from the
   first `[ ]` and compaction loses at most one batch. Wire `satisfies_contracts`
   on consumers as provider docs land (both sides exist in this run). Every doc
   carries the inferred `[gap]` known_issues entry.
5. FINISH: rebuild `.mdd/.startup.md`, regenerate connections
   (`node .claude/hooks/lib/connections-gen.cjs`), delete the job folder, and
   report: docs written, files covered / total source files (say the number
   plainly, uncovered files are listed, not glossed), primitives found, contract
   candidates flagged, and the standing caveat that every doc is inferred until
   its `[gap]` entry is cleared by review. Natural next steps: /audit (it now has
   contracts to verify) and /fix-known-issues (to review the inferred gaps).

## Messaging

Print one plain `[reverse-engineer] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set reverse-engineer <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done reverse-engineer` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
