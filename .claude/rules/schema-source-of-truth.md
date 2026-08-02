---
paths:
  - "**/schemas/**"
  - "**/*.schema.ts"
  - "**/*.schema.js"
  - "**/types/**"
  - "**/models/**"
---

# Schema as a Single Source of Truth

Define a data entity once, as a Zod schema, and derive everything else from it.
The failure to kill: the same entity declared separately at each layer (a frontend
interface, a backend interface, a hand-written API validator, a manual DB schema),
kept in sync by hand, guaranteed to drift the first time a field is added.

## One schema per entity, derive the rest
- TypeScript type: `type User = z.infer<typeof UserSchema>`. Never hand-write an interface that parallels a schema.
- API validation: parse `req.body` / `query` / `params` through the schema in middleware. `safeParse`, return 400. No field-by-field `if` checks.
- Frontend forms: the same schema drives validation (zodResolver), so client and server reject the same inputs by the same rules.
- Pre-write guard: parse before writing to the DB (see mongodb-rules).
- OpenAPI and `$jsonSchema`: generate them from the schema, never maintain by hand.

## One base, many variants
A create payload is not the stored document, and a response is not the request.
Model one base schema and derive per-layer variants with `.omit()`, `.partial()`,
`.pick()`, `.extend()`. When the base gains a field, every variant inherits it.
A hand-copied variant is the drift problem at smaller scale.

## Make it physically shared
Single source of truth only holds if there is literally one file. Put entity
schemas in a shared module both sides import (a `packages/schemas` workspace, or a
shared `src/schemas/`). If each side keeps its own copy, they diverge no matter the
discipline. The shared import is the enforcement, not the convention.
