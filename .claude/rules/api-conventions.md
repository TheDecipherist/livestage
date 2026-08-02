---
paths:
  - "**/server.ts"
  - "**/server.js"
  - "**/server/**"
  - "**/app.ts"
  - "**/handlers/**"
  - "**/adapters/**"
  - "**/routes/**"
  - "**/middleware/**"
  - "**/app/api/**"
  - "**/pages/api/**"
conformance:
  - "api-no-mongoose :: absent :: **/adapters/**/*.ts :: mongoose"
  - "api-versioned-routes :: some-contains :: **/{server,app}.{ts,js,mjs} :: /api/v[0-9]+"
---

# Service Architecture Conventions

Every service is three layers, one direction: `server.ts` -> `handlers/` -> `adapters/`. Apply while writing, not after.

## Versioning
- All routes live under `/api/v1/`. New endpoints are versioned from the first line. No unversioned routes "for now".

## server.ts is thin
- Defines routes and delegates. Nothing else. No business logic in `server.ts` or in a route definition. A route wires the request to a handler and returns its result.
- Next.js is the same rule in a different costume: `app/api/**/route.ts` (and legacy `pages/api/*`) is the route layer. Keep `route.ts` thin, parse and validate the request, delegate to a handler module, return its result. No DB calls or business logic inline in a `route.ts`.

## handlers/ hold the logic
- Business logic lives in `handlers/`, one file per domain. A handler owns its domain's rules and orchestration. It calls adapters for anything external. It does not reach outside the process itself.

## adapters/ wrap everything external
- Database, external APIs, queues, anything outside the process goes through an adapter. Handlers never touch them directly.
- The database adapter uses StrictDB when installed, otherwise the native driver. Never Mongoose. The data adapter is the one place driver code lives, which is where the mongodb-rules apply.

## Service separation
- A service owns its domain and is reached through its interface. A package does not reach into another package's internals or data. Call the owning service.
- Shared code is hoisted to a shared layer, never imported sideways from a sibling.

The test: routes in `server.ts` read request-in, handler-call, response-out. Logic sits in `handlers/`. Anything leaving the process goes through `adapters/`.
