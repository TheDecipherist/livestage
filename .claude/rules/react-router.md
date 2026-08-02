---
paths:
  - "app/**/*.tsx"
  - "app/**/*.ts"
  - "app/routes.ts"
  - "react-router.config.ts"
conformance:
  - "rr-no-server-import-in-components :: absent :: app/components/**/*.{ts,tsx} :: from ['\"].*server/"
  - "rr-typed-loaders :: contains-if-present :: app/routes/*.{ts,tsx} :: Route\."
---

# React Router (framework mode) rules

The load-bearing parts that are silent when wrong: bundle boundaries,
serialization, and caching seams.

## The .server.ts boundary is one door
- Server-only code reaches loaders through ONE `.server.ts` module per app
  that re-exports what the loaders need. The suffix is load-bearing: React
  Router excludes the module from the client bundle and fails the build if a
  browser module imports it. Verify the guarantee once per feature: the
  client build output must not contain connection strings, collection names,
  or server env keys.
- When the boundary forces a constant to be duplicated client-side, the copy
  gets a test asserting both values match. That is the correct answer to
  framework-imposed duplication; an unguarded copy is drift waiting.

## Loader payloads serialize twice
- SSR renders the data into HTML AND embeds the loader return as JSON for
  hydration, so the document carries everything twice. Loaders return a
  projection shaped to what the components render, never the service's full
  result. This is the largest page-weight lever in the framework and it is
  invisible in any diff.

## Errors split by kind in the loader
- Expected failures (validation, bad query) come back as data the route
  renders; exceptional ones are thrown to an ErrorBoundary. Route segments
  that can fail independently get their own boundary; an app with one real
  route can live with root only, but say so.
- The ErrorBoundary never renders `error.message` from unknown errors (see
  http-security, error shape); correlation id, same as the JSON path.

## Route-level decisions are made when the route is written
- `headers` export for cacheable routes (an effectively-static homepage can
  be cached at the ingress; nothing does it unless the export exists).
- `<Link prefetch="intent">` on links that lead into expensive loads.
- `shouldRevalidate` when a loader re-runs on navigations that cannot change
  its data.

## Loaders are plain functions and get tests
- A loader takes a `Request` and returns data or throws; it needs no harness.
  Every route's loader branches (no input, expected error as data, rethrow)
  get a test. This is the cheapest coverage in the app.

## Generated types are a build-order dependency
- Route modules import `Route.*` types from the framework's typegen output,
  which is gitignored and regenerated. `typecheck` runs typegen first, and
  any LSP-backed analysis (impact tracing, reference finding) is wrong on a
  checkout where typegen has not run; regenerate before trusting it.
