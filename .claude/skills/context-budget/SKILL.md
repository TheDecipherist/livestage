---
name: context-budget
description: Estimate the per-turn token cost of this project's .claude configuration and CLAUDE.md, so MDD 2's efficiency claims are measured, not assumed. Reports always-loaded files, path-scoped rules, and invoked-only skills and agents, ranks the top contributors, and flags anything over budget. Invoke with /context-budget, add --api for exact counts.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash"
argument-hint: "[--api]"
arguments: [flag]
---

Estimate what this project's configuration costs per turn. MDD 2 claims the modes cost
nothing until used and the rules cost nothing until near a matching file. This measures
whether that is true.

## What counts, and when

Sort every config file into its cost class:

1. **Always loaded (paid every turn):** `CLAUDE.md`, and any rule in `.claude/rules/` with NO `paths:` frontmatter (a rule without a glob loads globally). This is the number that matters most.
2. **Path-scoped (paid only near a matching file):** rules WITH a `paths:` glob. List each with its glob, note that it is zero until Claude touches a matching file.
3. **Invoked-only (paid only when used):** skills and agents. A `disable-model-invocation` skill costs nothing, not even its description, until typed. An auto-invocable skill costs its description always, its body only when invoked. Call out which skills are which.
4. **Hooks (zero context cost):** hooks are subprocesses, they cost no context tokens at all, only wall-clock when they fire. List them as zero.

## Estimate

Default heuristic: characters divided by 4 (Anthropic's documented rough token count).

```bash
# always-loaded total
chars=$(cat CLAUDE.md .claude/rules/*.md 2>/dev/null | grep -L 'paths:' >/dev/null; \
        { cat CLAUDE.md; for f in .claude/rules/*.md; do grep -q '^paths:' "$f" || cat "$f"; done; } | wc -c)
echo "always-loaded ~$((chars / 4)) tokens"
```

Compute each class, then rank the top contributors within each.

## --api mode

If `$flag` is `--api` and `$ANTHROPIC_API_KEY` is set, call Anthropic's `count_tokens`
endpoint for exact counts of the always-loaded set instead of the chars/4 heuristic.
Fall back to the heuristic if the key is missing.

## Report

- **Always-loaded total** in tokens, with a verdict against the budget: under ~1000 to 1500 is healthy, over means propose the single biggest trim (usually a global rule that should be path-scoped, or CLAUDE.md bloat).
- **Path-scoped rules**: count and combined size, noted as conditional.
- **Invoked-only**: skills and agents, noted as zero-until-used, flag any auto-invocable skill whose description is large enough to matter always.
- **Top 5 contributors** overall, so it is obvious what to cut first.

The point is a number you can act on, not a vibe. If the always-loaded total is low and
the modes are all `disable-model-invocation`, MDD 2's efficiency claim holds. If not,
this shows exactly where it leaks.

## Messaging

Print one plain `[context-budget] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set context-budget <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done context-budget` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
