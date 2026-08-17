# Env Var Drift

The old way: a new teammate greps the code for `process.env` usage by
hand, or worse, trusts `.env.example` is complete and finds out it isn't
three hours into local setup, or ships a var to production nobody
documented.

The new way: one render puts both sides in front of you, live, every time
someone runs it, not just the day `.env.example` was last hand-edited.

## Policy grant this example needs

`.livestage/policy.json` in this directory: `shell.enabled` plus two
exact command strings, nothing else, both fixed text that never
interpolates `{{ }}`/`${}` values (see `codebase-health.stage` in
`examples/agent-briefs/` for why exact strings are the honest default).
The second one exists because `@read` refuses `.env*` files outright, an
immutable, un-overridable rule (real `.env` files hold secrets, and that
rule protects every project regardless of policy). `.env.example` holds
no secrets by convention, so reading it through the shell allowlist
instead, as an explicit, narrow, exact-string grant, is the honest way
to reach it.

## Referenced in code

sample-project/src/config.ts:2:  databaseUrl: process.env.DATABASE_URL,
sample-project/src/config.ts:3:  apiKey: process.env.API_KEY,
sample-project/src/config.ts:4:  logLevel: process.env.LOG_LEVEL ?? 'info',
sample-project/src/config.ts:5:  stripeSecretKey: process.env.STRIPE_SECRET_KEY,

## Documented in .env.example

DATABASE_URL=postgres://localhost:5432/app
API_KEY=
PORT=3000

---

Two things a human would have to notice by hand, and now doesn't:
`LOG_LEVEL` and `STRIPE_SECRET_KEY` are read by the code and missing from
`.env.example`; `PORT` is in `.env.example` but nothing reads it. A
static `.env.example` never catches this on its own; a live render does,
on every single run.
