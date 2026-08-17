---
id: 49-fix-foreach-interpolation-rce
title: Fix Foreach Interpolation RCE
type: COMPONENT
path: Engine / Security
source_files: [src/engine/macros.ts, src/parser/types.ts, src/engine/engine.ts, src/engine/write-ops.ts]
test_files: [tests/unit/engine/foreach-interpolation-rce.test.ts]
status: complete
phase: all
last_synced: 2026-08-03
initiative: livestage
depends_on: [19-composition-directives]
tags: [security, rce, foreach, macros, interpolation, sandbox-escape]
data_flow: .mdd/audits/flow-foreach-interpolation-rce-2026-08-03.md
known_issues:
  - "[gap] B1: CRITICAL, pre-existing, NOT fixed by this build: @query/@test/
    @check's command= and a pipe's shell stage command are still
    substituted by @foreach/@call (macros.ts's 'query'/'test'/'check'/
    'pipe' cases, unchanged by this fix), and checkShellCommand's
    allowlist (security/rules.ts) matches by PREFIX (e.g. 'git *' compiles
    to /^git .*/), so a substituted value can chain further shell commands
    after an allowed prefix (e.g. `@query \"git log {{ x }}\"` with x =
    `--oneline; touch pwned` runs the injected command). This predates
    this build entirely (subStr already substituted command= before any
    change here) and is a different root cause (the allowlist's
    pattern-matching design, not macros.ts's substitution mechanism), so
    it needs its own dedicated fix, not a bundled patch inside this one.
    Found during this build's Phase 7 follow-up security review
    (2026-08-03). Confirmed 2026-08-17 to be broader than macro
    substitution alone: executeQuery/executeTest/executeCheck/runShell
    all resolve {{ }} via interpolatePathSoft into command= before the
    allowlist check runs too, so ordinary interpolation of untrusted file
    content reaches the same hole. Tracked jointly with
    10-security-policy-core B1, 17-source-directives B1,
    18-compute-directives B1, 19-composition-directives B1, and
    22-pipe B1 (same root cause, six owning docs); see /bug
    bug/shell-command-chaining for the fix."
  - "[gap] substituteNode has no case for 'assert' or 'interpolation' node
    types, so @assert inside @foreach/@call/@template crashes with
    'unhandled AST node type' rather than running. Not a security issue
    (loud, top-level error, not silent, no eval sink in @assert's own
    fields), same class of gap 'code' was found to have before this
    build added its case. Low priority, deferred."
---

# Fix Foreach Interpolation RCE

## Purpose

Closes a critical remote-code-execution vulnerability: `@foreach`/`@call`/
`@template` body substitution (`substituteNode` in `src/engine/macros.ts`)
splices a bound value (a loop item, a macro argument) into template text
as plain text, and two independent downstream mechanisms then re-scan
that substituted text for `{{ }}` syntax and evaluate whatever they find
in the `runInNewContext` sandbox, which exposes host-realm objects. If
the bound value itself contains literal `{{ }}` (realistic: it can come
from `@read`/`@list`/`@query`/`@read-body` reading arbitrary file
content), an attacker who controls that file's content gets arbitrary
JavaScript execution in the host Node process. Found during the
`read-body-directive` build's Phase 7 security review (2026-08-03),
which added one more `@foreach`-reachable source into an already-existing,
already-exploitable sink; the sink itself predates that build and is not
caused by it.

## Architecture

Two rounds of Phase 7 review found six independent, live-verified
vectors sharing one root cause: `subStr()` (macros.ts) treats a bound
value (a `@foreach` item, a `@call`/`@template` argument) and the
surrounding TEMPLATE text as the same trust level, blindly splicing one
into the other. Six different downstream consumers each independently
re-interpret that spliced text as something executable:

1. **Markdown text**: `scanInterpolations(text)` on the POST-substitution
   text picks up any `{{ }}` the value contains as a new expression,
   evaluated by `resolveInterpolations` (`engine.ts`'s markdown case).
2. **Directive `path=` attributes**: `resolveReadPath` (`read-ops.ts`)
   calls `interpolatePathSoft` on `node.path`, independently re-matching
   and evaluating `{{ }}` in whatever string it's given.
3. **`@code` body/src**: spliced directly into an EXECUTED script; no
   `{{ }}` needed at all, a value with shell/JS-breaking characters is
   script/command injection regardless of brace content.
4. **`@data`'s rhs / `@template`'s dataExpr**: `evaluateRhsTyped`
   (`engine-template.ts`) evaluates these fields as a JS expression
   UNCONDITIONALLY, no `{{ }}` wrapping required, so brace-escaping does
   not protect them either.
5. **`@list`/`@read`'s `where=`**: passed straight to `whereMatches`'s
   `runInNewContext` eval (`sources.ts`), same unconditional-eval
   property as (4).
6. **`@foreach`/`@set`'s source expression**: `evaluateSource`
   (`iter-ops.ts`) parses ANY value starting with `@` as a full directive
   and executes it; a substituted value that happens to read like
   `@read "secret.md"` gets run as a real `@read`.

Two fix SHAPES, chosen per field based on what the field is for:

**Escape (vectors 1-2), fields that are DISPLAYED or used as a LOOKUP
key**: `subStr` escapes literal `{{`/`}}` in the bound VALUE (never the
template) before splicing, a reversible backslash-insertion marker
(`{{` -> `\{\{`) that breaks the adjacency both consumers require to
match, idempotent (skips a brace already preceded by a backslash) so
nested substitution (a `@call` inside a `@foreach` substitutes the same
value twice) never compounds. Permanent for directive attributes
(failing to resolve is safe, fail-closed). For markdown text, a new
optional `MarkdownNode.substituted` field (set only when `subStr`
actually changed something, to avoid corrupting unrelated content in the
same node) tells the markdown render site to unescape the final resolved
string back to literal characters, preserving exact display fidelity
(LiveStage's own docs contain literal `{{ }}` examples that must survive
a `@foreach` loop verbatim). `@update-frontmatter`'s `value` (a write
target, not a lookup key, but reached via the same `interpolatePathSoft`
mechanism as vector 2) also needs an explicit `unescapeBraces()` before
the write, added in `write-ops.ts`, or the escape backslashes would be
written to disk as corrupted data.

**Never substitute (vectors 3-6), fields that are EVALUATED AS CODE**:
escaping cannot protect a field that gets executed or eval'd
unconditionally, since the vulnerability isn't `{{ }}` re-matching, it's
"untrusted text became code." `substituteNode`'s `'code'` (body/src),
`'data'` (entries), `'template'` (dataExpr), `'foreach'`
(literalSource), and `'set'` (literalExpr) cases leave those specific
fields COMPLETELY UNTOUCHED, only substituting the safe surrounding
fields (`args`, body nodes). This is not a functional loss: every one of
these consumers already resolves a BARE `{{ x }}` in the ORIGINAL,
non-substituted text via `ctx.envFiles` (the same real-sandbox-variable
binding markdown text already relied on, and the same binding `@foreach`
sets before its body walks), so legitimate `{{ loopVar }}` usage keeps
working, it just never goes through `subStr`'s text-splice at all.

`case 'code':` was ALSO an adjacent, non-security fix: `substituteNode`
previously had no case for `'code'` at all, so a `@code` block inside
`@foreach`/`@call` crashed with `unhandled AST node type "code"`. The
crash fix and the injection fix are the same change (add the case,
substitute nothing but `args`).

## Data Model

No new persistent data. One new optional AST field:
`MarkdownNode.substituted?: boolean`, present only on nodes produced by
macro substitution, absent (falsy) on every node parsed directly from a
`.stage` file.

## API/Interface

No new user-facing primitives. Existing directives/builtins
(`@foreach`, `@call`, `@template`, and every directive whose attributes
can be macro-substituted: `@read`, `@read-frontmatter`, `@hash`,
`@read-body`, etc.) keep their exact existing syntax and behavior for
every legitimate input; only the handling of substituted values that
happen to contain `{{ }}` changes, from "evaluated as code" to "rendered
as literal text" (markdown) or "used as a literal, non-matching value"
(attributes).

## Business Rules

1. A `@foreach` loop item's value, or a `@call`/`@template` macro
   argument's value, is NEVER evaluated as a `{{ }}` expression, a JS
   expression, a `where=` query, or a directive, no matter what
   characters it contains. Only text that existed in the ORIGINAL,
   author-written template is ever evaluated or executed.
2. Markdown text substituted via `@foreach`/`@call`/`@template` renders
   the bound value's exact literal content in final output, including
   any literal `{{`/`}}` characters it contains, byte-for-byte
   equivalent to what a non-substituted read of the same content would
   show.
3. A directive attribute (`path=`, `field=`, `section=`, etc.)
   substituted with a value containing literal `{{`/`}}` is used as that
   literal (escaped) string; it does not get re-evaluated as an
   expression, and if it happens not to resolve to anything real (a file
   that doesn't exist, a heading that doesn't match), fails the same way
   any other non-matching value already does (a warning, not a crash,
   not silent data exposure). `@update-frontmatter`'s `value` is the one
   exception: it is DATA meant to be written, so it is unescaped back to
   the real literal value immediately before the write.
4. `@code` inside `@foreach`/`@call`/`@template` does not crash. Its
   `body`/`src` are never substituted at all (only `args` is); a bound
   value never reaches the executed script with the default
   `interpolate=false`. `interpolate=true` remains a separate, deliberate,
   pre-existing opt-in (the author chooses to splice `ctx.envFiles`/
   `ctx.data` into the script text at execution time), unaffected by and
   out of scope for this fix.
5. `@data`'s entries and `@template`'s `dataExpr` are never substituted;
   a bound value referenced there only resolves if the ORIGINAL
   expression bare-names it (`a = {{ x }}`), evaluated against
   `ctx.envFiles` the same as everywhere else, never against
   attacker-controlled expression text.
6. `@list`/`@read`'s `where=` is never substituted; same reasoning and
   same fallback (a bare loop-variable name in the original `where=` text
   resolves via `ctx.envFiles`/`whereExtra`, an interpolated `{{ x }}`
   inside a larger where= expression does not, an accepted, documented
   trade-off).
7. `@foreach`/`@set`'s own source expression is never substituted; a
   bound value that happens to read like a directive (`@read "x.md"`) is
   never parsed or executed as one, only ever returned as inert text.

## Data Flow

See `.mdd/audits/flow-foreach-interpolation-rce-2026-08-03.md` for the
full trace, both vectors' live-verified PoCs, and the rejected
alternative designs (envFiles-only binding, which does not generalize to
`@call`'s attribute substitution or non-path attributes without breaking
existing behavior).

## Dependencies

19-composition-directives (owns `macros.ts`, the vulnerable code; this
fix's `known_issues` [gap] entry moves to `## Fixed Issues` there on
completion, per this project's known_issues convention).

## Security

**Untrusted input**: any value that flows into a `@foreach` loop item or
a `@call`/`@template` macro argument, when that value's ultimate origin
is file content, command output, or any other non-author-controlled
source (`@read`, `@list`, `@query`, `@read-body`, `read_body()`, `@code`
output piped into a loop, etc.). The `.stage` document's own literal
text (the template itself) is trusted, matching every other directive in
this codebase; only SUBSTITUTED DATA is untrusted here.

**What a malicious caller could achieve pre-fix**: arbitrary JavaScript
execution in the host Node process (confirmed across all six vectors:
reading `process.platform` via a VM-escape technique for vectors 1/2/4/5;
arbitrary directive execution, e.g. reading an unrelated file's content,
for vector 6; script/command injection for vector 3), by controlling the
content of any file a `.stage` document loops over.

**Required mitigation**: implemented as described in Architecture above,
two fix shapes (escape for display/lookup fields, never-substitute for
eval fields) chosen per field. No policy/permission model change; this is
a parser/engine correctness fix, not a new gate. Existing filesystem/
shell policy enforcement (feature 10) is unaffected and unbypassed either
before or after this fix, since the vulnerability lived entirely inside
expression evaluation AFTER a file was already legitimately,
policy-permitted read; the fix prevents that already-read content from
being treated as new code, not whether the file could be read at all.

**Explicitly NOT fixed by this build, tracked as a `[gap]` in this doc's
frontmatter**: `@query`/`@test`/`@check`'s `command=` and a pipe's shell
stage are still substituted, and `checkShellCommand`'s prefix-based
allowlist does not prevent chaining further commands after an allowed
prefix. This is a different, pre-existing root cause (the allowlist's
own matching design, not `macros.ts`'s substitution mechanism) that
predates this build; closing it needs its own dedicated fix.

## Known Issues

See the frontmatter `known_issues` above: the `@query`/`@test`/`@check`/
pipe shell-command-chaining gap (critical, pre-existing, needs a
dedicated follow-up build) and the `@assert` missing-case gap (low
priority, loud not silent). Also see `19-composition-directives.md`'s
known_issues for the original `[gap]` entry this fix resolves (moved to
that doc's `## Fixed Issues` on this build's completion).
