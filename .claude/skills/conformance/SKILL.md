---
name: conformance
description: Generate rule-conformance tests from the project's .claude/rules and run them. Emits one vitest file asserting each rule's machine-checkable invariants (strict mode, signal handlers, no mongoose in adapters) at near-zero tokens, then runs it and reports which rules the code violates. Invoke with /conformance.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Bash, Read"
---

Generate and run the rule-conformance suite. The rules ARE the tests: no tokens are
spent writing them.

1. Generate: `node .claude/hooks/lib/conformance-gen.cjs`. It reads every
   `.claude/rules/*.md` `conformance:` block and writes a single vitest file,
   `tests/conformance/rules.conformance.test.ts`, then prints the number of checks.
   Deterministic, so re-run it any time the rules change rather than hand-editing
   the output (the file is marked AUTO-GENERATED).
2. Run it with the project's runner: `npx vitest run tests/conformance/rules.conformance.test.ts`
   (adapt if the project uses another runner).
3. Report: checks generated, pass and fail counts, and for each failure the rule
   plus the check id. The id names the exact invariant, a failing
   `nodejs-graceful-sigterm` means `server.ts` does not handle SIGTERM, a failing
   `api-no-mongoose` means an adapter imports mongoose.

A check has the form `<id> :: <kind> :: <args>` in a rule's `conformance:` block.
Kinds:
- `json-key :: <file> :: <dot.key> :: <expected>`, the JSON key equals expected. Fails if the file is missing, never vacuous.
- `contains :: <glob> :: <regex>`, EVERY matching file contains the regex. FAILS when the glob matches no file, a gate whose target does not exist must not read as green.
- `some-contains :: <glob> :: <regex>`, at least ONE matching file contains the regex. Also fails on zero matches. Use for "the app registers X somewhere in this layer".
- `contains-if-present :: <glob> :: <regex>`, every match must contain it, but zero matches pass. Only for genuinely optional targets.
- `absent :: <glob> :: <regex>`, no matching file contains the regex (vacuous pass is correct here, no file means no violation).
- `file-exists :: <glob>`, at least one file matches.

Run `node .claude/hooks/lib/conformance-gen.cjs --doctor` to see every spec with
its live match count, every vacuous spec, and every rule with no specs at all.
The generator auto-detects the test root (tests/ then test/), warns about specs
matching zero files, and refuses to write a suite in which every spec is
vacuous. The generator also checks the output path against the runner config's
explicit include/testMatch patterns and prints a `NOT COLLECTED` warning when
they will never pick the suite up (mdd-notes3 2.3). That warning is a BLOCKER,
not a note: relay it to the user verbatim and fix it in the same turn (extend
the include, or regenerate with `MDD_CONFORMANCE_OUT` pointing at a collected
path) before reporting conformance as in place. At the Green Gate assert a
NONZERO conformance test count rather than trusting a green run.

If a rule invariant is mechanically checkable, encode it here so it regenerates
forever. If it is not, leave it to the audit and the review agents. Never hand-write
a conformance test.

## Messaging

Print one plain `[conformance] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set conformance <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done conformance` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
