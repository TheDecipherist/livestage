---
name: create-service
description: Scaffold a new microservice that follows the project's server/handlers/adapters architecture, then register it as an MDD feature. Use when asked to create, scaffold, or add a new service or package. Writes files and touches git, so it runs only when invoked explicitly.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Write, Edit, Bash"
---

# Create Service

Scaffold a new service that follows the project architecture, then document it as an
MDD feature so it is tracked from birth. Writes files and touches git, so it only
runs when you type `/create-service`.

The architecture and data rules are NOT restated here, they live in the path-scoped
rules and are the single source of the standard: `api-conventions.md` (the
server/handlers/adapters layering and `/api/v1` versioning) and `mongodb-rules.md`
(the data adapter: StrictDB or native driver, never Mongoose, aggregation over find,
bulkWrite). Those rules fire automatically when you write the matching files. Follow
them, do not duplicate them.

## Branch first
The Branch Guard hook blocks edits on `main`/`master`, so create a feature branch
before scaffolding: `git checkout -b feat/<service-name>`.

## Directory structure

```
packages/{name}/
  src/
    server.ts       entry point, routes only, delegates to handlers
    handlers/       business logic, one file per domain
    adapters/
      db.ts         the ONLY place the driver lives (per mongodb-rules)
    types.ts
  tests/
    handlers.test.ts
  package.json
  tsconfig.json
  CLAUDE.md         service-specific notes
```

## package.json: resolve versions at scaffold time
Do NOT hardcode dependency versions. Resolve the current stable version of each
(`npm view <pkg> version`) and pin those, and make `@types/express` major match the
`express` major. A hardcoded pin rots the day it ships. Runtime: express. Dev: tsx,
typescript, vitest, @types/express. Scripts: build (tsc), dev (tsx watch), start,
test (vitest run), type: module.

## Templates
Write `server.ts` as routes-only that delegate to handlers, with both
`unhandledRejection` and `uncaughtException` handlers that exit non-zero (per the
nodejs rule), and a `/health` route. Write `adapters/db.ts` as the single data
boundary wired to StrictDB if installed else the native `mongodb` driver, following
`mongodb-rules.md` (do not import the driver anywhere else). Write `tsconfig.json`
with `strict: true`, ES2022, ESNext modules.

## Register as an MDD feature (the MDD step)
A service scaffolded without a doc is untracked, and the drift sentinel cannot
protect what no doc controls. So after scaffolding, either run `/build <name>` to
document and build it properly through the gates, or at minimum write an
`.mdd/docs/NN-<name>.md` stub per `00-frontmatter-spec.md` with `source_files` set to
the scaffolded files and `status: active`. Then run `/status`.

## Checklist
- [ ] Branch created, not on main
- [ ] Directory matches the template, including `adapters/db.ts`
- [ ] Versions resolved at scaffold time, `@types/express` major matches `express`
- [ ] `strict: true`, both process error handlers present, exit non-zero
- [ ] All routes under `/api/v1/`, logic in `handlers/`, data only through the adapter (per the rules)
- [ ] No file over 300 lines
- [ ] Basic test file created
- [ ] An `.mdd` doc exists for the service (stub or full build)

## RuleCatch
If the RuleCatch MCP server is available, query it for violations in the new service
files and report them. If not connected, suggest checking the RuleCatch dashboard.

## Messaging

Print one plain `[create-service] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set create-service <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done create-service` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
