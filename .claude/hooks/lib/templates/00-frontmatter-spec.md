# MDD Feature Doc Frontmatter Spec

Every feature doc in `.mdd/docs/` opens with a YAML frontmatter block. The docs
are the product, so this schema is enforced by the frontmatter-validate hook on
every write. Fields marked required must be present or the hook flags the doc.

## Fields

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | yes | string | Stable id, `NN-slug`, e.g. `03-auth`. Matches the filename. |
| `title` | yes | string | Human title of the feature. |
| `type` | yes | enum | `COMPONENT` (results in code), `SPEC` (a behavior contract, owns no code), or `task` (tooling, not a product feature). |
| `path` | yes | string | Product-vocabulary breadcrumb, e.g. `Core / Base Repository`, 1 to 3 levels, siblings spelled identically. |
| `source_files` | yes | list of paths | The code files this feature owns. Empty for a SPEC. The drift sentinel matches edits against this. |
| `status` | yes | enum | `planned`, `active`, `in_progress`, `complete`, `deprecated`. |
| `phase` | yes | enum | `idle`, `understand`, `document`, `red`, `implement`, `verify`, `integration-pending`, `all`. |
| `last_synced` | yes | date | `YYYY-MM-DD`, the last time the doc was verified against the code. Never stamp it without an actual content update. |
| `initiative` | no | string | The initiative id this feature belongs to, or `none` for a flat plan with no initiative doc. |
| `wave` | no | string | The wave id this feature belongs to, e.g. `havendb-wave-1`. |
| `routes` | no | list | API routes this feature exposes, e.g. `POST /api/v1/login`. |
| `models` | no | list | Data models this feature touches. |
| `test_files` | no | list of paths | The tests for this feature. Load-bearing: copied into `.state.json` so Test Freeze knows what to protect. |
| `data_flow` | no | string | One-line trace of the request path. Authored by a human, not discovered. |
| `depends_on` | no | list of ids | Feature docs this one depends on. A SPEC's list must never contain a COMPONENT. |
| `tags` | no | list | Domain concepts, technology names, or feature names. Never file paths or generic words. |
| `known_issues` | no | list | Append-only. Never remove an entry. |
| `security_read_sites` | no | list | Security-sensitive sites to read before touching this feature. |
| `mdd_version` | no | string | The MDD schema version that wrote this doc. |
| `integration_contracts` | no | list | Declared on the provider COMPONENT that exposes a security-critical gate function. Each entry has `function` / `when` (a condition, or `always`) / `mandatory` (bool). |
| `satisfies_contracts` | no | list | Declared on a dependent COMPONENT that calls a provider's gate function. Each entry has `from` / `function` / `when` / `status` (`pending` or `done`) / `verified_at`. When `status` is `done`, `verified_at` MUST be a test locator (`path.ext:line` or `path.ext::name`), never a bare date; a date proves nothing. |
| `relates` | no | list of ids | Symmetric: if A relates B, B must relate A. |

## Fact-fields versus synthesis-fields

The fact-fields (`source_files`, `routes`, `models`, `depends_on`, `test_files`,
`security_read_sites`) are independent, verifiable discoveries, so the build skill
fans them out to parallel discovery agents and assembles the frontmatter from
their verified lists. The synthesis-fields (`data_flow`, `title`, `known_issues`)
need judgment and are authored in the main thread.
