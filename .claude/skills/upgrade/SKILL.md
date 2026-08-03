---
name: upgrade
description: Bring every feature doc up to the CURRENT frontmatter schema in one pass, validator-proven. Finds every doc that fails validation or misses fields, infers enum-valid defaults, confirms the plan, patches non-destructively, and re-validates each doc to zero errors. Safe to re-run. The 1.0-to-2.0 migration path and how untracked docs become in-sync. Invoke with /upgrade.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Write, Bash"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Bring older docs up to the current frontmatter schema without rewriting their content.
The migration path for docs that predate a field, use retired enum values, or came from
another project. Never overwrites a valid existing field. The measure of done is not
"fields added", it is THE VALIDATOR REPORTS ZERO ERRORS on every doc, because the
frontmatter-validate hook fires on every write, and a doc this skill leaves invalid is
a doc the next edit bricks on.

## UP1, validator-first inventory

For EVERY doc in `.mdd/docs/*.md` (and archive/), run
`node .claude/hooks/lib/frontmatter-validate.cjs <doc>` and collect the errors and
warnings verbatim. That output IS the inventory; never re-derive schema rules by hand,
the validator is the single source of what current means. Build one table: doc,
missing required fields (of ALL eight: id, title, type, path, source_files, status,
phase, last_synced), invalid enum values, structural errors (SPEC with source_files,
id/filename mismatch, depends_on pointing at a higher id, initiative label with no
backing file, unparseable lines), plus optional-field gaps (tags, untagged
known_issues entries). If every doc validates clean and nothing optional is missing,
report and stop.

## UP2, infer enum-valid defaults (do not ask per doc)

Every inferred value MUST be a member of the current enums; check the table in
`.mdd/00-frontmatter-spec.md`, never invent members (`draft`, `implementation`,
`documentation` are 1.0-era values, they do not exist anymore and the validator
blocks them).

- last_synced: most recent commit touching the doc (`git log --format="%as" --follow -- <doc>`), else today.
- status (enum: planned, active, in_progress, complete, deprecated): map any legacy
  value: draft -> in_progress; anything in archive/ -> deprecated; else from phase
  (all -> complete, implement/red/verify -> in_progress, document/understand ->
  active); default complete, most pre-existing docs are finished work.
- phase (enum: idle, understand, document, red, implement, verify,
  integration-pending, all): map legacy values: implementation -> implement,
  documentation -> document, reverse-engineered -> all; else from status
  (complete -> all, in_progress -> implement, active -> document, planned -> idle,
  deprecated -> all).
- type: COMPONENT when source_files is non-empty or the doc describes code it owns;
  SPEC when it reads as a pure contract AND source_files is empty; task for tooling
  chores. Goes in the plan for review, never silent.
- title: the doc's H1, minus any id prefix.
- source_files: when absent on a COMPONENT, propose from the doc's own file
  references (paths named in the body); when nothing is inferable, `[]` plus a
  known_issues entry `[gap] source_files unknown, needs discovery` so the gap is
  tracked instead of invisible.
- path: propose from the title and Purpose plus the other docs' path vocabulary;
  plan-reviewed, never silent.
- test_files: the completion gate makes this mandatory on any complete/in_progress
  COMPONENT with real source_files, and legacy corpora fail it wholesale (the
  livestage finding: 28 of 48 complete docs, tests real and cited by name in their
  own Acceptance Criteria prose, field empty). Backfill from the doc's own body:
  extract every test file path the prose cites (Acceptance Criteria first, then
  anywhere in the body), VERIFY each path exists on disk before trusting it into
  the field (prose can be stale; a cited path that does not exist gets reported,
  never copied), and write the verified list. When the body cites nothing and no
  test file on disk matches the feature, `[]` plus a known_issues entry
  `[gap] test_files unknown, tests undiscovered` so the doc stays writable and
  the gap stays visible.
- tags: do NOT generate here, `/rebuild-tags` populates them after.

Structural errors get an explicit plan line each, split auto-fixable vs decision:
- SPEC carrying source_files: auto-fix is clearing the list (a contract owns no
  code), shown in the plan.
- initiative label with no backing file: propose `initiative: none`.
- id/filename mismatch: propose renaming the FIELD to match the filename (never the
  file, links point at filenames).
- depends_on pointing at an equal or higher id: DECISION, never auto-fixed;
  renumbering a corpus is its own operation. The plan shows the cycle and the run
  can proceed with everything else while these docs stay listed as still-invalid.
- unparseable frontmatter lines: shown verbatim with line numbers; fix is manual or
  a proposed rewrite of that line, per doc, in the plan.

## UP3, show the plan and confirm

Present the additions and fixes per doc (existing valid fields untouched), inferred
type and path values called out for review, structural decisions listed separately.
Ask proceed / review each / cancel. On review-each, walk doc by doc (accept, edit,
skip).

## UP4, patch, validate, repeat

Per doc: read, patch ONLY the planned changes into the frontmatter block (missing
fields inserted before `known_issues` to keep canonical order), body byte-identical,
then IMMEDIATELY re-run
`node .claude/hooks/lib/frontmatter-validate.cjs <doc>` and record the result. Zero
errors marks the doc done. Remaining errors mean the plan missed something: fix
within the plan's scope, or mark the doc `still invalid` with the exact errors,
never silently move on. The write itself passes through the frontmatter-validate
hook, which is the point: a patch the hook blocks is a patch that was wrong.

## UP5, verify and report

The completion claim is a number: `N docs, N validate clean` (or `M still invalid`
with each doc's remaining errors and whose decision unblocks it). Re-run the full
inventory pass to prove it, rebuild `.mdd/.startup.md`, regenerate
`.mdd/connections.md` (the /connect logic), and point the user to `/rebuild-tags`
for tags and `/scan` for the new drift picture.

## Messaging

Print one plain `[upgrade] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set upgrade <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done upgrade` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
