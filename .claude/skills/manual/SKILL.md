---
name: manual
description: Generate a user-facing manual (.mdd/manual/manual.md) from every feature doc and ops runbook, written for a reader who has never seen the code. Incremental via content hashes so only changed docs regenerate, section-marked and written to disk batch by batch so a long run survives compaction. Invoke with /manual (--force to regenerate everything).
disable-model-invocation: true
user-invocable: true
argument-hint: "[--force]"
arguments: [flag]
---

Turn the MDD docs into a readable manual. The docs are build instructions; the manual is
the opposite audience, someone who has never seen the source and wants to know what the
thing does and how to use it. ASCII only, no em dashes, active voice, examples mandatory
for any command or endpoint, planned features marked "(planned)".

## M1, scope by hash
If `.mdd/docs/` is empty, stop. Read stored hashes from `.mdd/manual/.hashes.json` (absent
means everything is new). Compute the current SHA256 of every `.mdd/docs/*.md` and
`.mdd/ops/*.md`, and classify each: unchanged (skip), changed (regenerate), new
(generate), deleted (remove). `--force` treats everything as changed. If all unchanged and
the manual exists, report up-to-date and stop.

## M2, skeleton first
`mkdir -p .mdd/manual`. Load the existing manual or write a skeleton NOW (preface, a TOC
placeholder, and Features / Operations / Command Reference chapters), before generating any
section, so the file is durable if a long run compacts. Remove any deleted doc's
`<!-- mdd-section: id -->...<!-- /mdd-section: id -->` block from disk.

## M3, generate sections (incremental, batch by batch)
For each changed or new doc, write a user-facing section wrapped in section markers: a
plain-English description, What It Does, How To Use It, and where applicable Commands, API
Endpoints, Configuration, and Examples tables. Source priority: when the doc declares
`primitives`, its `## Interface Overview` section IS the user-facing content, pull each
primitive's blurb and Parameter/Values/Description table via its exact `### <name>`
heading and use them nearly verbatim; never quote `## API/Interface` or
`## Business Rules` to end users, those are build-facing and read like a changelog
(internal ids, RESOLVED notes, line citations leak straight through). Discover
primitive-owning docs by the `primitives` field, never by path convention. Docs without
primitives (architecture, contracts, tooling) keep the rewrite-from-scratch treatment.
A "primitives at a glance" table opens the Features chapter when any doc declares
them, assembled by concatenating each doc's Interface Overview Part 2 quick table (the Part 1 prose overview makes a ready-made section introduction)
(| Name | What it does |) plus a kind and owning-section column; group rows by
`tags` where the tags suggest reader-facing groupings, falling back to kind. Ops runbooks get a condensed
Purpose/When-To-Use/Steps form. Verify against the doc's `source_files` (read them briefly,
do not invent capabilities; mark "(planned)" if the files do not exist yet). Parallelism:
1 to 4 docs sequentially, patching each to disk before the next; 5+ in batches of up to 8
agents, WAIT for the whole batch, patch all its sections to disk, THEN start the next
batch. Never hold results across batches, so compaction loses at most one batch (which
re-generates next run, since hashes are only written at the very end).

## M4, assemble
Rebuild the aggregated reference chapters by scanning every section: merge all Commands
tables into one Command Reference (with a Feature column), all API tables into an API
Reference (omit if none), all Configuration tables into Configuration (omit if none).
Regenerate the TOC from the headings. Ensure the final order: preface, TOC, Overview,
Features, Operations (if any ops), Command Reference, API Reference, Configuration.

## M5, seal and report
Only AFTER the manual is complete, write `.mdd/manual/.hashes.json` (one entry per current
doc, deleted ones removed, updated timestamp), it is the completion marker, so an
interrupted run re-generates cleanly. Report the section counts and suggest gitignoring
`.mdd/manual/` since it is regenerable.

## Messaging

Print one plain `[manual] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set manual <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done manual` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
