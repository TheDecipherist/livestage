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
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set create-service <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done create-service` with the DONE line (pre-approved, best-effort, silent).
