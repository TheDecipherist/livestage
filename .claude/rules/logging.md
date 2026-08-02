---
paths:
  - "**/server.ts"
  - "**/server.js"
  - "**/server/**"
  - "**/handlers/**"
  - "**/adapters/**"
  - "**/routes/**"
  - "**/middleware/**"
  - "**/logger.*"
  - "**/lib/log*"
conformance:
  - "log-no-console-in-handlers :: absent :: **/handlers/**/*.{ts,tsx,js,jsx} :: console\."
  - "log-no-console-in-adapters :: absent :: **/adapters/**/*.{ts,tsx,js,jsx} :: console\."
  - "log-no-console-in-routes :: absent :: **/routes/**/*.{ts,tsx,js,jsx} :: console\."
---

# Logging baseline

"Log it" is not a standard. This is. Without it, `console.error` satisfies
every instruction and the deployment gets stderr soup with no level, no
fields, and no way to tie a 500 line to the response the user got.

## One logger, configured once
- One logger module per service (pino for a request-path service, winston if
  the team already runs it), exporting a configured instance. Nothing else
  constructs a logger, nothing imports the logging library directly.
- Structured JSON to stdout with level, timestamp, service name, and a request
  id. On Kubernetes-style deployments stdout is what gets collected; file
  transports are wrong there.
- The request id is generated at ingress (or taken from the incoming header)
  and travels: every log line in a request's lifetime carries it, and the 500
  body returns it as the correlation id (see http-security, error shape).

## No bare console
- No `console.*` in application code (handlers, adapters, routes, services).
- Two deliberate exemptions, write them into the code as comments so nobody
  deletes the rule the first time they hit them: crash handlers
  (`uncaughtException`/`unhandledRejection`), where an async logger may not
  flush before exit, and pre-init boot lines that run before the logger
  exists.

## What gets logged
- Errors log the stack, not only the message.
- Never log what a user typed at info level (query strings, form fields).
  Attack forensics belong at a dedicated level or in a dedicated field with
  retention thought through, not sprayed through the app log.

## Suppression needs a counter
"Log once and go quiet" is the right instinct for a noisy failure and the
wrong end state. Every suppressed-repeat path keeps a counter exposed
somewhere (a metric, a periodic re-log with the count, a health field). A
subsystem broken for a week must not be indistinguishable from a quiet week.
