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
| `test_files` | no | list of paths | The tests for this feature. Load-bearing: copied into `.state.json` so Test Freeze knows what to protect. Optional at seed time (for a new feature the real paths only exist once Phase 4 writes them), but NOT at completion: a COMPONENT with non-empty `source_files` cannot be `complete` or `in_progress` with this empty (validator-enforced, hard). The only escape is loud: a `known_issues` entry `[deferred] no independently testable behavior: <why>` (or `[gap] test_files unknown, tests undiscovered` on a legacy doc /upgrade could not backfill). Populate it from the files the build actually wrote, never from a prediction. |
| `data_flow` | no | string | One-line trace of the request path. Authored by a human, not discovered. |
| `depends_on` | no | list of ids | Feature docs this one depends on. A SPEC's list must never contain a COMPONENT. |
| `tags` | no | list | Domain concepts, technology names, or feature names. Never file paths or generic words. |
| `known_issues` | no | list | ACTIVE unfixed issues only. Each entry starts with `[deferred]` (a decision not to do it now, with the why) or `[gap]` (found, undecided); untagged reads as `[gap]`. An entry leaves this list only by moving to the doc's `## Fixed Issues` body section (bottom of the doc) with the fix date and evidence, /fix-known-issues owns that move; silent deletion never. The tags let an audit tell "we chose not to" from "we forgot", and the list length IS the doc's open-issue count. |
| `security_read_sites` | no | list | Security-sensitive sites to read before touching this feature. |
| `primitives` | no | list of objects | The consumer-callable surfaces this doc documents, one entry per primitive, any valid YAML style: block (`- name: "@list"` newline `  kind: directive`) or flow (`- {name: "@list", kind: directive}`), the kit parser accepts both. `name` is the exact identifier (`@list`, `GET /users/:id`, `render`). `kind` is FREE-FORM lowercase kebab-case, whatever this project's primitives actually are (`directive`, `cli-verb`, `endpoint`, `driver`, `ui-component`, ...); keep the per-project set small and consistent. Absent on docs covering internal architecture, contracts, or tooling nobody outside the project calls, most docs will not have it. Tools filter `kind == "directive"` instead of guessing path conventions, and the build's Green Gate exercises each entry live. A doc with primitives MUST carry exact `## API/Interface`, `## Business Rules`, and `## Interface Overview` headings, with one `### <name>` per primitive inside Interface Overview (validator-enforced). |
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

One fact-field is time-delayed: `test_files` for a brand-new feature is a
prediction at Phase 3 (the files do not exist yet) and only becomes a fact
after Phase 4 writes the red-gate skeletons. So its authoritative write
happens at COMPLETION, from the real files on disk, in every flow that marks
a doc complete (build Phase 7, plan-execute's completion gate). Discovery at
Phase 3 is a best guess; the completion write is the record. The validator
enforces the record, not the guess.

And the record must be real: on a `complete` or `in_progress` doc, every
`source_files` and `test_files` path must exist on disk (validator-enforced,
hard). Planned and active docs may list files that do not exist yet, the doc
is written before the code on purpose; a doc claiming the work is done may
not. Deliberately NO count rule exists (one test file per source file is not
the model: tests cover behavior, one test file legitimately covers several
source files, and a barrel or types file needs none). Whether each source
file is actually EXERCISED is the test runner's coverage report's job, not a
filename comparison's.

## Bug Fixes (body section, at the bottom of the doc)

Open bugs live in `known_issues` as `[gap] B<N>: <symptom>` entries, so the
open-items machinery (/status, /audit's backlog, /fix-known-issues) counts
them like everything else. When /bug closes one, the entry moves to a
`## Bug Fixes` section at the bottom of every doc the fix touched: a dated
`### B<N> (fixed YYYY-MM-DD)` block with Symptom, Cause, and Fix
(root-cause file:line plus the regression test locator). Sits below
`## Fixed Issues` when both exist. Append-only history, same rule as Fixed
Issues: nothing is ever silently deleted.

## Interface Overview (body section, required when `primitives` is set)

The one section written for a total stranger, never for a future build or an
auditor. Three parts, in this order, all validator-enforced except the prose
length itself:

Part 1, a short prose overview, 1 to 2 paragraphs, NO heading of its own,
the first thing under `## Interface Overview`: what this set of primitives
is as a whole and why someone would reach for it, in plain human terms, no
per-primitive detail (that is Part 3's job). A reader must never land on a
table with zero framing. Presence is validator-enforced; length is judgment.

Part 2, the quick table: header exactly `| Name | What it does |`, one row
per primitive, one line per row. For someone who only wants to know what
exists at a glance.

Part 3, one `###` sub-heading per primitive, headed by the primitive's EXACT
identifier (never a paraphrase), each with: a one-to-two-sentence blurb (what
it is for and why someone reaches for it, never how it is implemented or what
changed when), then a parameter table with exactly three columns, `Parameter`
/ `Values` / `Description`, ONLY when the primitive takes named parameters (a
single positional value is covered in the blurb instead; `Values` is what can
actually go there, an enum, a format, a type, whichever reads clearest).

At least one minimal runnable example somewhere in the section. Style rules
for Parts 1 and 3 (Part 2 is just the table), validator-warned: no feature
numbers, no CR-references, no `(line NNN)` citations, no RESOLVED notes, no
wave or initiative names, that history stays in Business Rules and Known
Issues where it belongs. No implementation trivia: security internals, edge
cases, and historical fixes never headline here. The acceptance test: someone
with zero context on this project reads Part 1 plus Part 3 and knows what to
do with the thing. Generators (a README, /manual) read THIS section per
primitive via its exact `### <name>` heading; API/Interface and Business
Rules stay build-facing and are never quoted to end users. `tags` may
additionally guide reader-facing grouping (soft convention for generators,
not schema).
