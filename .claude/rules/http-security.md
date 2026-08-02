---
paths:
  - "**/server.ts"
  - "**/server.js"
  - "**/server/**"
  - "**/app.ts"
  - "**/routes/**"
  - "**/middleware/**"
  - "**/app/api/**"
  - "**/pages/api/**"
conformance:
  - "sec-trust-proxy-not-true :: absent :: **/{server,app}*.{ts,js,mjs} :: trust proxy.,\s*true"
  - "sec-headers-present :: some-contains :: **/{server,app}*.{ts,js,mjs} :: helmet|Content-Security-Policy"
---

# HTTP service security baseline

The baseline every HTTP service carries, whether or not any feature asked for
it. Absences are invisible to diff review, so this rule is checked against the
WHOLE service at the build's verify phase, not against the change.

## Security headers
- Every HTML-serving app sets a real Content-Security-Policy. Every service sets
  `X-Content-Type-Options: nosniff`, frame protection, and HSTS when TLS
  terminates upstream. `helmet` (or the framework equivalent) at app setup,
  not per route. Roll CSP out report-only first (see the nginx rule when the
  headers live at the proxy instead).

## Error shape
- A client-facing 500 body carries a correlation id, never `err.message`.
  Driver and upstream errors leak hostnames, index names, and connection
  detail. Known errors (validation, bad query) get a controlled message and
  the right status; everything else gets the id and a logged stack. This
  applies to HTML error boundaries too, not only JSON handlers.

## Rate limiter correctness
A rate limiter that exists but is bypassable is worse than none, it reads as a
control. When one is added or touched, verify all four:
- `trust proxy` is the ingress HOP COUNT (or a list), never `true`. With
  `true`, `req.ip` is the leftmost `X-Forwarded-For` value, so one header per
  request means one fresh bucket per request.
- The key source survives the deployment: per-process in-memory windows
  multiply the limit by the replica count. Fine for one replica, wrong for N;
  say which one this is.
- Map growth is bounded even under spoofed keys, and there is a global
  ceiling, not only a per-key one. Nothing else caps total concurrent work.
- Rejections are observable: a 429 (and repeated 400s, and auth failures)
  increments a counter or logs a line with the reason. A limiter that forgets
  it fired cannot tell you that you are under attack.

## Timeouts and load shedding
- Every query issued on a request path carries a timeout (`maxTimeMS`, an
  `AbortSignal`, or the driver equivalent), and the request itself has a
  deadline. No timeout plus no concurrency ceiling is a pileup on the first
  slow day.
- Know the fan-out: one inbound request that triggers a dozen downstream
  calls means the amplification factor is the load, not the request rate.

## Network position is not authorization
Behind a reverse proxy or ingress, a source-IP check is not an auth mechanism:
`req.ip` is attacker-controlled when proxies are trusted, every external
request arrives from the ingress pod's address, and kubelet probes are not
loopback. Gate sensitive endpoints with a real credential, or bind them to an
unpublished port reachable only by port-forward. Never ship an IP allowlist as
the only gate.

## Durable unauthenticated input
Any path where unauthenticated input becomes durable state that is later
rendered to another user (a query log shown on the homepage, a comment, a
name) is a decision, not a default. Flag it at the data-flow gate and record
the decision in the feature doc.

## Dynamic regexes
Never build a `RegExp` from input without an escape helper, even when today's
call sites are safe by a character-class strip somewhere else. The moment the
invariant is worth having is while the code is still correct: add a
conformance spec or a test that goes red when the sanitizer is bypassed.
