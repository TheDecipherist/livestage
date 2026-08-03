---
name: connect
description: Force a full rebuild of the MDD connections map (.mdd/connections.md). Normally the connections-sync hook keeps it current automatically on every doc change, so use this only for an explicit on-demand rebuild or to check the warnings. Invoke with /connect.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Bash"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Force-regenerate `.mdd/connections.md` by running the deterministic generator:

```
node .claude/hooks/lib/connections-gen.cjs
```

That is the single source of the map. It reads every `.mdd/docs/*.md` frontmatter
(never bodies, never archive) and writes the path tree, the Mermaid dependency graph,
the source-file overlap, and the structural warnings (broken and circular depends_on,
docs missing a `path`). It prints the warning count.

You usually will not need this. The `connections-sync` hook runs the same generator
automatically whenever a doc is written, moved, or at session start, so the map stays
current without anyone remembering to rebuild it. Reach for `/connect` only to force
a rebuild on demand, or when you want to read the warnings directly. After running,
report the doc count, edge count, and any warnings from the regenerated file.

## Messaging

Print one plain `[connect] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set connect <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done connect` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
