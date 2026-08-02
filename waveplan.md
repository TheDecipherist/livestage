# LiveStage import plan (preview - nothing written yet)

## Project type
Library/SDK-shaped, with a CLI + hook integration surface. The spec's own build order
(Wave 0 seed, then Waves 1-6 with COMPONENT/SPEC tags and demo-states) is already explicit
and well-formed, so this plan follows it directly rather than re-deriving an order.

## Structure decision
47 features, 7 waves -> **initiative + waves + docs**. Initiative slug: `livestage`.
Wave ids mirror the spec's own wave numbers exactly (`livestage-wave-0` .. `livestage-wave-6`)
for direct traceability back to spec sections ("Wave 3, Verification" -> `livestage-wave-3`).

## CLAUDE.md
Missing from the project root. Will draft one from the spec (What You Are Building,
Principles, Tech Stack, donor/reuse rule, MDD docs are numbered in build order) if you
accept option 1 or 3 below.

## Vocabulary (path breadcrumbs, siblings spelled identically)
Build, Contracts, Parser, Security, Hook, Engine, CLI, Directives, Renderer, Examples, Docs

---

## livestage-wave-0 - Seed
Demo-state: repo compiles; merged suite runs (failures only in excluded areas);
CR-1 grep clean or remaining hits enumerated as Wave 1 tasks. (spec lines 218-219)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 01 | Seed Script | Build / Seed Script | task | (none) |

Content mapping: 01 <- lines 151-243 (Provenance/copy-map/Wave-0 steps/doc dispositions), secondary 245-310 (resulting Project Structure)

---

## livestage-wave-1 - Foundation
Demo-state: `livestage render examples/hello.stage` returns pure markdown via CLI; the
PreToolUse hook renders the same file on a simulated read and does NOT fire on `hello.md`
containing directive-like text; `livestage security show` prints the strict policy; a
non-allowlisted `@query` fails with a policy error; boundary lint and CR-1 scan green.
(spec lines 566-570)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 02 | CR-1 Standalone Identity | Contracts / Standalone Identity | SPEC | (none) |
| 03 | CR-2 One Package | Contracts / One Package | SPEC | (none) |
| 04 | CR-3 Stage Only | Contracts / Stage Only | SPEC | (none) |
| 05 | CR-4 No Daemon No Memory | Contracts / No Daemon No Memory | SPEC | (none) |
| 06 | CR-5 Deny By Default | Contracts / Deny By Default | SPEC | (none) |
| 07 | Package Skeleton | Build / Package Skeleton | COMPONENT | 01, 03 |
| 08 | Boundary Lint | Build / Boundary Lint | COMPONENT | 07 |
| 09 | Grammar Parser | Parser / Grammar | COMPONENT | 07 |
| 10 | Security Policy Core | Security / Policy Core | COMPONENT | 07, 06 |
| 11 | Extension Routing (Hook) | Hook / Extension Routing | COMPONENT | 09, 04 |
| 12 | Render Trace | Engine / Render Trace | COMPONENT | 07, 05 |
| 13 | CLI Router | CLI / Router | COMPONENT | 07 |

Content mapping: 02<-566-581,711-716; 03<-566-581,717-719; 04<-566-581,720-724;
05<-566-581,725-728; 06<-566-581,730-733; 07<-128-149,211,245-310,566-581;
08<-144-147,566-581; 09<-314-361,566-581; 10<-395-448,566-581; 11<-465-474,566-581;
12<-493-508,566-581; 13<-511-538,566-581

---

## livestage-wave-2 - Data plane
Demo-state: a live-brief example document (`@list` + `@read-frontmatter` + `@query git` +
`@foreach` + `@render table`) renders current project state in one CLI call; the same doc
through the hook is identical; `strip` emits the degraded twin; `--args "sync"` flips an
`@if allowed(...)` branch and a passive render takes the fallback branch; goldens green.
(spec lines 583-587)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 14 | CR-6 Fallback Totality | Contracts / Fallback Totality | SPEC | (none) |
| 15 | CR-10 Render Purity | Contracts / Render Purity | SPEC | (none) |
| 16 | CR-11 Markdown Out | Contracts / Markdown Out | SPEC | (none) |
| 17 | Source Directives | Directives / Sources | COMPONENT | 09, 11, 10 |
| 18 | Compute Directives | Directives / Compute | COMPONENT | 10, 17 |
| 19 | Composition Directives | Directives / Composition | COMPONENT | 09, 17 |
| 20 | Render Formats | Renderer / Formats | COMPONENT | 19, 16 |
| 21 | Cache | Engine / Cache | COMPONENT | 10 |
| 22 | Pipe | Directives / Pipe | COMPONENT | 19, 21 |
| 23 | Arguments (F-ARGS) | Engine / Args | COMPONENT | 19 |
| 24 | Fallback Contract | Engine / Fallback Contract | COMPONENT | 14, 11, 12 |

Content mapping: 14<-583-601,735-737; 15<-583-601,750-752; 16<-325-328,583-601,754-755;
17<-333-338,583-601; 18<-338-340,395-429,583-601; 19<-322-324,343-347,583-601;
20<-283-284,349,592-594,583-601; 21<-138-140,583-601; 22<-348,583-601;
23<-451-462,596-597; 24<-598-599,470-474

---

## livestage-wave-3 - Verification
Demo-state: an assertion doc against a fixture tree goes green; deleting the target files
flips contains-class assertions to FAIL (not vacuous green); `validate` refuses an
all-inert doc, warns on a double-escaped regex, and fails a document containing `@phase`
as an unknown directive; `livestage assert` exits 1 in a CI fixture repo with only the
bundle present. (spec lines 602-607)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 25 | CR-7 Suite Baseline | Contracts / Suite Baseline | SPEC | (none) |
| 26 | Assert Operators | Directives / Assert Operators | COMPONENT | 17, 18, 19 |
| 27 | Assert Liveness | Directives / Assert Liveness | COMPONENT | 26 |
| 28 | CI Mode | CLI / CI Mode | COMPONENT | 26, 13 |

Content mapping: 25<-203-207,602-613,739-741; 26<-342,363-377,602-613;
27<-373-376,520,602-613; 28<-521,602-613,781-783

---

## livestage-wave-4 - Code + Doctor
Demo-state: a `.stage` doc runs a Python block that emits JSON; `{{ analysis.total }}`
renders and `@render table` shows its rows; with `python` removed from the policy,
`validate` fails the doc at authoring time and `render` fails at runtime; `doctor` prints
one healthy line, `--json` validates against its schema, `--rules-for` answers for a
fixture file. (spec lines 615-619)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 29 | Code Runners | Engine / Code Runners | COMPONENT | 10, 18 |
| 30 | Doctor | CLI / Doctor | COMPONENT | 10, 12, 29, 27 |
| 31 | Init | CLI / Init | COMPONENT | 10, 11, 30 |

Content mapping: 29<-341,378-392,435-443,615-628; 30<-523,532-537,615-628;
31<-480-489,615-628

---

## livestage-wave-5 - Frontmatter engine + determinism
Demo-state: a schema declares the project's doc class; an `@update-frontmatter` violating
it is blocked pre-write with a named error; a conforming update lands atomically; `@graph`
renders the dependency tree and reports a planted cycle; a one-line `@list ... where=...
fields=... | @render table` renders the filtered multi-column status table over a 25-doc
fixture corpus; two `--deterministic` renders of the suite are byte-identical.
(spec lines 630-636)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 32 | Schema Engine | Engine / Schema Engine | COMPONENT | 17, 10 |
| 33 | Update Frontmatter | Directives / Update Frontmatter | COMPONENT | 32 |
| 34 | Graph | Directives / Graph | COMPONENT | 32, 20 |
| 35 | Determinism | Engine / Determinism | COMPONENT | 21, 18 |
| 36 | Frontmatter Query | Directives / Frontmatter Query | COMPONENT | 17, 32, 20 |

Content mapping: 32<-335,630-665,656-657; 33<-95-97,350,630-665; 34<-351,630-665,640-645;
35<-541-548,630-665,646-647; 36<-333,335,630-665,648-665

---

## livestage-wave-6 - Pattern, bundle, enforcement floor
Demo-state: the multi-step example renders green in sequence and red out of sequence,
state round-trips through schema-validated frontmatter; `dist/livestage.js` alone passes
the bare-checkout e2e; hook cold render of a trivial doc under 200 ms; every CR scan and
suite green; all migrated docs verified (CR-9 clean). (spec lines 667-671)

| id | feature | path | kind | depends_on |
|---|---|---|---|---|
| 37 | CR-8 Bare Checkout | Contracts / Bare Checkout | SPEC | (none) |
| 38 | CR-9 Doc Corpus Integrity | Contracts / Doc Corpus Integrity | SPEC | (none) |
| 39 | CR-D7 Reuse Fidelity | Contracts / Reuse Fidelity | SPEC | (none) |
| 40 | Pattern Example | Examples / Pattern Example | COMPONENT | 19, 24, 33 |
| 41 | Bundle | Build / Bundle | COMPONENT | 07, 13 |
| 42 | Contract Scans | Contracts / Contract Scans | COMPONENT | 02,03,04,05,06,14,15,16,25,37,38,39 |
| 43 | Doc Verification Closeout | Docs / Verification Closeout | COMPONENT | 38 |
| 44 | Examples Showcase | Examples / Showcase | COMPONENT | 20, 24, 02 |
| 45 | User Guide | Docs / User Guide | COMPONENT | 02, 40 |
| 46 | Connections Example | Examples / Connections | COMPONENT | 36, 34, 20 |
| 47 | Reach Via Code | Examples / Reach Via Code | COMPONENT | 29 |

Content mapping: 37<-667-702,742-743; 38<-220-241,667-702,745-748;
39<-23-36,103-112,667-702,757-763; 40<-300-301,360,667-702; 41<-135-137,866-878,667-702;
42<-667-702,706-763 (full CR section, secondary); 43<-667-702; 44<-173,667-702;
45<-174,667-702; 46<-298-299,667-702,682-690; 47<-691-695,43-59,667-702

---

## Merge summary
No sections were split into duplicate docs. The Cross-Cutting Contracts section
(lines 706-763) is fanned out into 12 individual SPEC docs (CR-1..CR-11, CR-D7), each
placed in the wave where the spec's own Build Order section (566-702) assigns it, rather
than becoming one giant "contracts" doc, since that keeps each SPEC's depends_on chain
valid (SPEC before its dependent COMPONENTs) and matches how the spec itself schedules
them. The "Known gaps and things to verify at build" note (859-894) is folded into the
relevant features' Known Issues (ext-routing/11 for the hook-substitution-mechanism gap,
ci-mode/28 and args/23 for `.stage` fixture re-extension, bundle/41 for the cold-start
ladder, composition/19 for template/foreach scoping, pattern-example/40 for the F-PATTERN
example) rather than becoming a standalone feature.

## Id range
01 - 47 (47 features: 1 task, 12 SPEC, 34 COMPONENT)

## Dependency-order check
Walked all 47 features: every `depends_on` target has a strictly lower id than the
feature itself. No SPEC's `depends_on` contains a COMPONENT.
