---
name: import-spec
description: Turn an external spec into a tree of MDD docs numbered in build-dependency order. Reads the spec (chunked for large files), extracts features with their source line ranges, detects the project type to order waves, classifies each as COMPONENT or SPEC, previews the whole tree as a mandatory dry run, then writes initiative, wave, and feature docs re-reading the source for each. Runs forked. Invoke with /import-spec followed by the spec path.
disable-model-invocation: true
user-invocable: true
context: fork
argument-hint: "[path(s) to spec file]"
arguments: [spec]
---

Import the spec at $spec into MDD docs. Spec to docs is a mechanical transform with no
live requirements loop, so it runs forked. Feature docs are BUILD INSTRUCTIONS, not
reference documentation: every section answers "what exactly do I build and how do I
know it is done," not "what does this feature do."

Progress and quiet-running: the user cannot see this skill run and does not care about
the shell. The `[import-spec N/6]` status line is their ONLY window, so at the START of every
step print exactly the one plain ASCII line that step gives (no preamble, no formatting),
then do that step's work SILENTLY. Do not narrate or explain individual commands. Read
files with the Read tool, never `cat`/`for` loops in bash. Run ONLY the steps below: no
exploring, no `git diff` of this skill, no reading `.mdd_bak` or any backup directory, no
comparing against prior output. The only source of truth is $spec (plus existing
`.mdd/docs` `path` values for vocabulary). Keep shell to the few commands the steps
actually require.

Micro-status for an import: `set import-spec 2 6 "extracting: 14 features so
far"`, `set import-spec 5 6 "wrote 07-parser (9/23)"`, and during handed-off
waves the wave micro-status format takes over (same run, same timer).

Task checklist shape for an import: create it at IS1 with the six IS steps; on
approval at IS3 in modes (a)/(b) append one entry per wave to be built, checked
off as each wave's merge to main lands, so the whole unattended run stays
visible on one list end to end.

Status bar mirror: at IS1 run `node .claude/hooks/lib/statusbar.cjs run-start import-spec` (import-spec is always user-invoked). Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally. Then alongside every `Say:` line also run
`node .claude/hooks/lib/statusbar.cjs set import-spec <N> 6 "<label>"` (pre-approved,
best-effort). During IS4 refresh it per file batch. On abort, `clear`. On finish,
mode (c) only: `node .claude/hooks/lib/statusbar.cjs done import-spec`. In modes
(a) and (b) DO NOT call done here: the elapsed timer belongs to the whole run
(import through the handed-off waves) and the main thread freezes it with
`run-done` after the last wave completes.

## IS1, read the spec (in full)
First ensure the workspace exists: run `node .claude/hooks/lib/mdd-ensure.cjs`. It is idempotent, on a bare project it creates `.mdd/` with `00-frontmatter-spec.md`, `.startup.md`, `.state.json`, and empty `docs/` and `waves/`; on an existing workspace it is a silent no-op and never overwrites anything. This guarantees IS4 has the frontmatter schema to read even on a first run in a fresh project.
Say: `[import-spec 1/6] Reading the spec in full.`
Stale-job check: if `.mdd/jobs/import-*/` exists, read its MANIFEST and offer Resume
(write only the `[ ]` files) or Discard. Verify each spec path exists. Read the WHOLE
file, never stop early: under 2000 lines in one read, larger in sequential 2000-line
chunks (offset 0, 2000, 4000, ...) appended to a working document, reporting progress.
After reading, copy each verified spec file verbatim to `.mdd/specs/<basename>` as the
immutable import-time snapshot. Never modify it. If a file of that name already exists
in `.mdd/specs` and differs, write `<basename>-vN` instead.
Merge multiple files into one working document, tagging each section with its source
internally for traceability.

## IS2, extract, order, classify
Say: `[import-spec 2/6] Extracting features, ordering into build waves, classifying COMPONENT vs SPEC.`
- Extract every distinct feature (a topic that could be a standalone doc: a purpose, decisions, constraints, scope). For each, record its EXACT source line ranges, including secondary ranges where it is re-discussed (syntax section AND security section AND changelog). This line-range map is the most important output, IS4 re-reads it. Merge sections that cover the same concept, do not make duplicate docs. Changelog/decision-log sections are not features, fold each decision into the feature it concerns.
- Assign each feature a `path` from the project's product vocabulary (read existing docs' `path` values for casing), Title Case, 1 to 3 levels, siblings spelled identically.
- Detect the project type from the spec's signals, then order features into waves by that type (features are numbered in BUILD order, not spec order):
  - Language/toolchain: W1 infra skeleton (parser, AST, CLI entry), W2 first shippable artifact, W3 language features + engine, W4 dynamic/live features, W5 security and hardening, W6 CLI and packaging.
  - Web API: W1 scaffold + DB + models, W2 auth, W3 core endpoints, W4 business logic, W5 integrations, W6 admin and hardening.
  - Frontend: W1 routing + layout, W2 auth + core state, W3 core features, W4 secondary + integrations, W5 polish/perf/a11y.
  - Library/SDK: W1 core types + core algorithm, W2 full public API, W3 extensions/plugins, W4 distribution and docs.
  - Extension/plugin: order by user-facing value, each wave independently usable, infrastructure last.
  Each wave has a concrete demo-state ("can parse a file and print the AST"), and is not done until that is demonstrable.
- Classify every feature: COMPONENT (results in code, the thing you write) or SPEC (a behavior contract a COMPONENT must satisfy, consulted while building). A SPEC lives in the same wave as its implementing COMPONENT, and the COMPONENT `depends_on` its SPECs.
- Dependency direction (HARD rule, never inverted): a SPEC's `depends_on` MUST NOT contain any COMPONENT. A SPEC depends on nothing, or only on other SPECs it builds on. The COMPONENT depends on its SPECs (and on lower COMPONENTs). If a SPEC's text references a function or type that a COMPONENT provides (e.g. an invariants SPEC that mentions `resolveColumn`), that is NOT the SPEC depending on the COMPONENT, it is the COMPONENT that must satisfy the SPEC, so the arrow is COMPONENT -> SPEC. Do not rationalize an inverted arrow into a doc. A foundational SPEC that everything satisfies therefore has an empty `depends_on` and, by the numbering rule below, takes the lowest id in its wave.
- A SPEC owns no code: its `source_files` is empty. A contract implements nothing, so never populate a SPEC's `source_files` with the files it constrains (that is what wrongly made the invariants SPEC claim all five implementation files and fail the PE3 on-disk gate). Only COMPONENTs carry `source_files`, listing the files that COMPONENT owns and no others.
- Build-order numbering (hard rule): order features so `depends_on` only ever points to a LOWER id, never a higher one. Concretely, a depended-on SPEC is numbered before the COMPONENT(s) that depend on it, and no feature is numbered before anything it depends on (this holds within a wave and across waves). After ordering, walk the full list once and confirm every feature's `depends_on` targets a lower id than the feature itself. If any target is a higher id, the order is wrong, fix it before the preview. This invariant is what makes "docs are numbered in build order" actually true: id order must equal a valid build order.
- Determine output structure by one invariant: an `initiative:` label exists IF AND ONLY IF an initiative doc exists. Any plan with 2+ waves is `initiative + waves + docs`: write `.mdd/initiatives/<slug>.md` and stamp every wave and feature doc with that `initiative`/`initiative_version`. A flat plan (1 to 3 features, no waves) is `docs` only: no initiative doc, and the docs carry `initiative: none`, never a label pointing at a file that does not exist. Scale the initiative's depth to the effort (a 6-feature single-area import gets a real but concise initiative doc; an 8+-feature multi-area effort gets the full treatment), but the iff rule is not a judgment call.

## IS2.5, CLAUDE.md check
Say (only if this step does anything, ie CLAUDE.md is thin): `[import-spec 3/6] CLAUDE.md is thin, offering to draft one from the spec.`
If CLAUDE.md is missing or under 10 lines, offer to draft one from the spec (what the
project is, core philosophy, architecture overview, tech stack, what the MDD docs
represent and that they are numbered in build order, key constraints). Skip if it exists
and is substantial.

## IS3, dry-run preview (mandatory gate)
Say: `[import-spec 4/6] Proposed plan below. Nothing written yet.`
Before writing anything, show the full proposed tree (this IS the waveplan): features
identified and merged, the initiative decision and why (per IS2's structure rule), every
wave in build order with its demo-state and member features (each tagged COMPONENT or
SPEC with its path and depends_on), the id range, the merge summary, and the content
mapping (which spec line ranges feed each doc). Annotate each wave with its expected
build shape from the depends_on graph: `sequential` (foundation waves, features chain)
or `parallel-eligible: N of M` (leaf features with no same-wave dependencies);
/plan-execute computes the authoritative lane plan at build time, this annotation is
what lets the user see where the parallel speedup will come from.
Then present the choice through the AskUserQuestion tool and WAIT for the answer: the
user picks with the arrow keys and enter, never types an option number. Order the
options with the recommended one FIRST, labeled "(Recommended)". Never just stop with
an empty prompt. The options (numbered text only as the headless/unattended fallback):
  1) Accept plan, write the .mdd docs and waves
  2) Save the full waveplan to ./waveplan.md only (human-readable file, no .mdd changes)
  3) Both, save ./waveplan.md and write the .mdd docs and waves
  (or say adjust with what to change and I re-plan, or abort to do nothing)
In the SAME AskUserQuestion call (it takes multiple questions, one interaction, not
two prompts), ask the execution mode for after the write, again recommended first:
  a) Unattended end-to-end: build EVERY wave via /plan-execute back to back, best
     judgment on the small stuff, no "next wave" prompts, stop only on a genuine
     blocker. Walk away, come back to a built project.
  b) Build wave 1, then pause for review before each next wave.
  c) Docs and waves only, no build (the current default).
This is the LAST interaction of an unattended run, so say that plainly when (a) is
chosen: every decision after this point is made by the judgment protocol in
plan-execute or stops the run as BLOCKED.
On 2 or 3, write `./waveplan.md` at the project root containing exactly the plan shown:
project type, structure decision and why, every wave with its demo-state, a features
table of id / feature / doc / COMPONENT-or-SPEC / depends_on, the id range, the merge
summary, and the content mapping with source line ranges. On 1 or 3, continue to IS4; on
2, stop after writing waveplan.md. On adjust, re-run IS2 with the feedback and re-preview.
Write no .mdd files until 1 or 3 is chosen. When continuing to IS4, first create
`.mdd/jobs/import-<date>/MANIFEST.md` listing every file to write, in order.

## IS4, write
Say: `[import-spec 5/6] Approved. Writing initiative, waves, then feature docs.`
Read `.mdd/00-frontmatter-spec.md` first for the schema. `mkdir -p` initiatives, waves,
docs. Write in order: CLAUDE.md (if approved), the initiative doc (whenever the plan has waves, per IS2's label-iff-doc rule), waves, then feature docs.
- Initiative: id, title, status active, version 1, a real 3-to-6-paragraph Overview (what/why/philosophy/components/done), and a Waves table. Compute its content hash.
- Waves: id, title, initiative, initiative_version, status, depends_on the prior wave, demo_state, plus a Features table. Compute the hash.
- Feature docs, per feature in wave order: auto-number from the highest existing id. RE-READ the source line ranges recorded in IS2 now, do not write from the extraction summary. Run the completeness checklist against the freshly-read source (every options table row and default, every CLI flag, every config key and type, every interface and AST node, every error format and trigger, every behavioral table, every always/never rule, every edge-case example, every named distinction). Then write the doc with sections: What to Build (concrete inputs/outputs/must-nots, not a vague description), Architecture (place in the system, interfaces copied verbatim), Implementation Notes (only the non-obvious constraints), Data Model, API/Interface (every export, flag, key), Business Rules (exhaustive, with exact error formats), Acceptance Criteria (concrete, verifiable statements), Dependencies, Known Issues. Frontmatter carries every required schema field (`id`, `title`, `type`, `path`, `source_files`, `status: planned`, `phase: idle`, `last_synced`) plus `initiative`, `wave`, `depends_on` (COMPONENTs list the SPECs and lower COMPONENTs they build on; a SPEC's `depends_on` never contains a COMPONENT), `tags` (4 to 8 concepts, never file paths), and the contract fields below. A SPEC's `source_files` is empty. Seed `test_files: []` explicitly on every COMPONENT: at plan time the test files do not exist yet, so an empty list is the honest value, but write the field so it is visibly a promise, not an omission. The build's completion step fills it from the files Phases 4 to 6 actually write, and the validator hard-rejects any COMPONENT that tries to reach `complete` with it still empty. The frontmatter-validate hook now BLOCKS any doc that violates `.mdd/00-frontmatter-spec.md`, so every field must be correct on the first write, not fixed later.
- Set `primitives` on every doc that documents consumer-callable surfaces: one entry per primitive the doc owns, block or flow style, both are valid YAML and both parse, `kind` free-form lowercase kebab-case from the project's own vocabulary (keep the set small and consistent across the import). For each such doc also write `## Interface Overview` per the spec template's convention, three parts in order: the Part 1 prose overview (1 to 2 paragraphs, no heading of its own, what this primitive set is as a whole and why someone reaches for it), the Part 2 quick table (header exactly `| Name | What it does |`, one row per primitive), then Part 3, `### <exact identifier>` per primitive with a stranger-readable blurb, a Parameter/Values/Description table when it takes named parameters, and one runnable example somewhere in the section, zero internal jargon (the validator enforces structure and warns on jargon). The spec's syntax tables are the raw material, but REWRITE for a stranger, never paste spec prose that leans on the spec's own context. Pull the names from the spec's own syntax tables and command lists, they are exactly what the completeness checklist already extracts. This field is how any tool finds "every directive doc" or "every CLI verb doc" with zero path guessing; a doc with primitives must carry the exact `## API/Interface` and `## Business Rules` headings (the validator blocks otherwise).
- Narrowing is a decision, never a default: whenever the doc scopes a business rule tighter than the rule's own wording in the source spec (the spec says "schema-validated documents", the doc delivers write-path validation only; the spec names a user-level path, the doc builds only project-level), write the narrowing INTO the doc as an explicit line, `Scope decision: <rule> narrowed to <scope> because <why>`, and surface every such line in the IS gate's WAITING ON YOU block for sign-off. A reader of the spec must never assume a delivery the doc quietly cut; the audit's fidelity pass flags exactly this, so record it here where it is a choice instead of there where it is a finding.
- Contracts (declare on providers, wire on consumers), so the build's Phase 7 contract gate has something real to verify instead of passing vacuously: for each SPEC invariant or security rule that names a REQUIRED gate function (identifier resolution, an auth or permission check, input validation, masking, any "check before X"), find the COMPONENT that PROVIDES that function and add an `integration_contracts` entry on that provider (`function`, `when` the condition or `always`, `mandatory: true`). Declare it on the provider COMPONENT, never on the SPEC, so the provider is not asked to satisfy its own function. Then for every COMPONENT whose `depends_on` includes that provider AND that actually calls the function, add a matching `satisfies_contracts` placeholder (`from` the provider id, `function`, `when`, `status: pending`, `verified_at: ""`); a dependent that never calls it carries no entry. The build flips each to `status: done` with a real call site at Phase 7, and a `complete` doc must carry no `pending` contract.
As each file is written, print one indented line `  wrote <id>-<slug>` so the user watches the tree fill in. Mark each file `[~]` before writing and `[x]` after, so a resume never rewrites a done file.

Coverage gate. Print `  coverage: checking written docs against .mdd/specs/<spec>`.
Dispatch one review agent (this skill runs forked, so it may spawn agents) that reads
the backed-up spec and every doc just written and returns a gap list keyed to spec line
ranges: any feature, options-table row, CLI flag, config key, interface or type, error
format, always/never rule, or named distinction present in the spec but absent from
every doc. If the list is non-empty, print it under a `Coverage gaps` heading and ask
the user to (1) patch the affected docs now, (2) record them in the initiative's Open
Questions, or (3) accept and continue. Do NOT report the import complete with
unaddressed gaps silently.

## IS5, finish
Say: `[import-spec 6/6] Rebuilding startup, regenerating the connections map, cleaning up the job folder.`
Rebuild `.mdd/.startup.md` (add the initiative and wave summary, preserve Notes), then
regenerate the connections map explicitly by running `node .claude/hooks/lib/connections-gen.cjs`
(this skill runs forked, so trigger the generator directly rather than relying on the
connections-sync hook), and delete the job folder. The spec snapshot lives in
`.mdd/specs/` for future re-imports and audits.

Then the execution handoff. This skill runs FORKED, and the wave execution must
NOT run inside the fork: building waves is long-running, dispatches its own
builder and review agents, and its BLOCKED stops must reach the user in the main
thread. So the fork ENDS here, and the DONE block's LAST lines are the handoff,
which the main thread MUST act on immediately as its next action, no re-asking
(the user already chose at IS3). Note on mechanics: chaining works by READING the
target skill's SKILL.md and executing it, which is always allowed;
disable-model-invocation only governs starting a flow uninvited from
conversation, it never blocks an in-flow handoff.
- (a) unattended: end with `HANDOFF: read .claude/skills/plan-execute/SKILL.md
  and execute wave 1 in UNATTENDED mode, then every subsequent wave in order, no
  prompt between waves; after the final wave completes (or the run stops
  BLOCKED), run node .claude/hooks/lib/statusbar.cjs run-done.` Each wave gets its own branch and its own merge to main
  (plan-execute owns that hard rule). If any wave stops BLOCKED, the run stops
  there with the blocker report; never skip a blocked wave to start the next.
- (b) the same HANDOFF line for wave 1 only (run-done when wave 1 completes,
  the paused run is this run's end), then stop and report, naming the next wave.
- (c) no handoff: report the tree and the next steps
  (`/plan-execute <slug>-wave-1`, or `/audit` to review).
