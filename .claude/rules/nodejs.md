---
paths:
  - "**/server.ts"
  - "**/server.js"
  - "**/server/**"
  - "**/*.worker.ts"
  - "**/*.worker.js"
  - "**/workers/**"
  - "**/worker/src/**"
  - "**/bin/**"
  - "**/lifecycle.*"
conformance:
  - "nodejs-graceful-sigterm :: some-contains :: **/server*.{ts,js,mjs,cjs} :: SIGTERM"
  - "nodejs-graceful-sigint :: some-contains :: **/server*.{ts,js,mjs,cjs} :: SIGINT"
  - "nodejs-crash-exits-nonzero :: some-contains :: **/server*.{ts,js,mjs,cjs} :: uncaughtException"
  - "nodejs-worker-sigterm :: contains-if-present :: **/worker/src/index.ts :: SIGTERM"
  - "nodejs-worker-sigint :: contains-if-present :: **/worker/src/index.ts :: SIGINT"
  - "nodejs-worker-crash-exits-nonzero :: contains-if-present :: **/worker/src/index.ts :: uncaughtException"
---

# Node.js: Process Lifecycle and Runtime Rules

From production. Node services that work in a demo and fall over in production
almost always fail around the process lifecycle. Get these right.

## Graceful shutdown
Shut down cleanly on SIGTERM (docker stop, Swarm, K8s) and SIGINT (Ctrl-C):
stop accepting new connections, drain in-flight ones, close dependencies, exit 0,
with a hard timeout so a stuck connection cannot block shutdown forever. Do NOT put
async cleanup in a `process.on("exit")` handler, the event loop is already stopped.
Do not trap SIGUSR1 (Node uses it for the debugger). Signals only arrive if Node is
PID 1 (exec-form ENTRYPOINT) with `init: true` forwarding them.

## Let it crash, never swallow a fault
On `uncaughtException` or `unhandledRejection` the process is in an unknown state.
Log it and exit NON-ZERO so the orchestrator restarts a clean process. An `exit(0)`
on a crash reads as success and the dead service is never restarted. Do not
catch-and-continue.

## Don't block the event loop
Node runs your JS on one thread. A CPU-bound stretch freezes every concurrent
request. For real CPU work offload to `worker_threads`, not `child_process` and not
"just make it async" (await does not yield during a synchronous loop).

## Independent awaits run in parallel
Before writing a second sequential `await`, decide: does this call need the
previous call's result? If not, the awaits are independent and go through one
`Promise.all` (or `allSettled` when partial failure is expected and handled).
Sequential awaits on independent work stack the latencies for nothing, three
80ms queries become 240ms instead of 80, and it is invisible in review because
the code reads naturally. Database queries are the most common case (fetch
user + fetch orders + fetch config), but the rule is about promises, not
drivers. The dependency test is the rule; "they happen to be fast today" is
not an exemption.

## Load instrumentation first
APM/tracing (dd-trace, OpenTelemetry) monkey-patches http, express, and the DB
driver, so its init must be the very first line of the entry file, before any
`require("express")`. Required late, it instruments nothing.

## Lock down the session cookie
Set all three: `httpOnly`, `secure` in production, and `sameSite` (the one that
gets missed). `credentials: true` cannot combine with `origin: "*"`, echo a
specific origin.

## Reach for built-ins
`crypto.randomUUID()` over the uuid package, native `fetch` over request, `node:test`
for simple suites, `structuredClone()` over a deep-clone dep, Intl/date-fns over
moment, `@aws-sdk/client-*` v3 over aws-sdk v2. Use the `node:` prefix on built-ins.
