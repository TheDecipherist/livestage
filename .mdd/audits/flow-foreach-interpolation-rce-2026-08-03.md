# Data flow: fix/foreach-interpolation-rce

## Scope note

This trace found the vulnerability is BROADER than the known_issues [gap]
entry that triggered this build described. That entry named one vector
(markdown text inside `@foreach`). Direct verification during this phase
found a second, independent, live-exploitable vector (directive `path=`
attributes) sharing the same root cause. Both are in scope for this fix.
A third, unrelated, non-security bug in the same switch statement was
also found (see "Adjacent finding" below) and is a scope decision for the
gate, not assumed in scope.

## Vulnerability, precisely

`substituteParams`/`substituteNode` in `src/engine/macros.ts` runs on
every `@foreach` iteration's body and every `@call`/`@template` macro
invocation's body, replacing `{{ paramName }}` placeholders with the
actual bound value (`subStr()`, a plain regex `.replace()`). The result
is then handed to whichever mechanism resolves `{{ }}` syntax for that
node type. Two of those mechanisms independently re-scan the SUBSTITUTED
TEXT for `{{ }}` patterns rather than only evaluating spans that existed
in the original, author-written template:

**Vector 1, markdown text** (the one named in the known_issues gap):
`case 'markdown'` in `substituteNode` (macros.ts:31-33) does
`scanInterpolations(text)` on the text AFTER substitution. If the bound
value itself contains literal `{{ }}` (e.g. because the loop iterates
over lines read from a file via `@read`/`@list`/`@query`/`@read-body`),
that text becomes a NEW interpolation span, evaluated at
`src/engine/engine.ts:276`'s `resolveInterpolations` call via
`runInNewContext` (`engine-interpolate.ts:217`), whose sandbox exposes
host-realm objects. Confirmed live (reconfirmed this session):
```
@foreach x in @read "evil.md"
ITEM {{ x }}
@foreach-end
```
with `evil.md` containing `{{ this.constructor.constructor("return
process.platform")() }}` prints `linux` (the real host's
`process.platform`), not the literal text.

**Vector 2, directive `path=` attributes (NEW, found this phase)**:
`resolveReadPath` in `src/engine/read-ops.ts` (used by `@read`,
`@read-frontmatter`, `@hash`, `@read-body`, and any future read-shaped
directive) calls `interpolatePathSoft(expandPattern(rawPath, ...), ctx)`
on `node.path` (`src/engine/engine-include.ts:54`), which independently
regex-matches `\{\{...\}\}` and evaluates via `evalExpression`, the SAME
`runInNewContext` sandbox. Since `subStr` in macros.ts's `case 'hash'`
(and every other case with a `path` field) substitutes the raw item
value into `node.path` via plain text replacement BEFORE
`resolveReadPath` runs, an item value containing `{{ }}` reaches this
SECOND, independent evaluator. Confirmed live this phase:
```
@foreach x in @read "evil.md"
@hash path="{{ x }}" /
@foreach-end
```
with the same `evil.md` payload (evaluating to `"linux"`) silently
hashes a file literally named `linux` planted in the working directory,
no warning at all, proving the substituted path was evaluated as an
expression, not treated as literal text. A companion `@read-frontmatter
path="{{ x }}" field="w" /` probe read the same planted file's content,
confirming this is a real content-disclosure/code-execution path, not
just a benign path mismatch.

Both vectors share one root cause: `subStr()` splices untrusted DATA
into a string as plain text with no regard for what happens to that
string afterward. Two different downstream consumers (`scanInterpolations`
for markdown, `interpolatePathSoft` for paths) each independently
re-interpret `{{ }}` sequences in that string as new expressions to
evaluate. A per-sink patch (fix vector 1, then vector 2, repeat for any
future sink) is not closure; a source-level fix in `subStr` closes the
class regardless of how many sinks exist now or get added later.

## Design, mirroring the `where=` fix's principle (feature 36)

Feature 36 closed an analogous RCE by never letting untrusted data reach
`runInNewContext` as TEXT spliced into an expression string; it bound the
data as a real sandbox variable instead. Applying literally "bind as
data, never splice as text" here would mean removing `subStr`
substitution entirely and relying on `ctx.envFiles`, which IS how
`@foreach`'s loop variable already resolves for markdown text
independent of any macro substitution (`ctx.envFiles[node.varName] =
item` is set in `iter-ops.ts:96` BEFORE the body walks, and
`resolveInterpolations` already reads `ctx.envFiles` as real sandbox
data). Verified this by reading `engine.ts:276`
(`case 'markdown': return resolveInterpolations(node.text,
node.interpolations, ctx, ...)`, using the node's ORIGINAL, unmodified
interpolation spans) and `engine-interpolate.ts`'s sandbox construction
(`{ ...ctx.env, ...ctx.envFiles }`).

This clean approach does NOT generalize to every case, though: `@call`
does not bind its macro parameters into `ctx.envFiles` at all
(`engine.ts:414-424`, `handleCall`), relying ENTIRELY on `subStr`'s text
splice, and several directive attributes (`field=`, `section=`,
`match=`, `command=`, etc. across the other `substituteNode` cases) are
consumed as plain strings with NO independent `{{ }}` re-evaluation
mechanism at all today; removing substitution for them would silently
break existing, legitimate `{{ paramName }}` usage in directive
attributes inside `@foreach`/`@call` bodies (a real regression, not a
theoretical one, given `subStr`'s existing behavior is explicitly relied
on per the comment at `iter-ops.ts:94-96`).

**Chosen fix: escape at the source, not the sink.** `subStr()` escapes
literal `{{`/`}}` sequences WITHIN THE SUBSTITUTED VALUE (never the
surrounding template text) before splicing, using a reversible,
non-invisible marker (`{{` -> `\{\{`, `}}` -> `\}\}`, inserting a literal
backslash so the two braces are no longer adjacent and cannot match
`scanInterpolations`'s or `interpolatePathSoft`'s `\{\{...\}\}` pattern).
This closes vector 1, vector 2, and any future sink uniformly, without
touching `iter-ops.ts`'s envFiles binding (still correct, still needed)
and without breaking any attribute that currently depends on
`subStr`'s text-splice behavior.

For directive attributes (`path=`, `field=`, `section=`, etc.), the
escape is PERMANENT (no unescape step): these values are consumed
programmatically (a file path, a heading name, a field key), never
redisplayed as prose, so a substituted value that happens to contain
literal `{{`/`}}` resolving to a path/field that doesn't match anything
real is acceptable, safe, fail-closed behavior, not a functional
regression for any realistic case.

For markdown TEXT specifically, fidelity DOES matter: LiveStage's own
domain is `{{ }}` template syntax, so its own docs/README/examples
routinely contain literal `{{ }}` snippets, and looping over such
content via `@foreach` (a realistic usage, not a hypothetical) must
still render the ORIGINAL literal characters in final output, not a
visibly escaped `\{\{ ... \}\}`. Fix: `substituteNode`'s `'markdown'`
case escapes the substituted value (closing the vector, since
`scanInterpolations` now only finds genuine template-authored spans),
then marks the returned node (`substituted: true`, a new optional field
on `MarkdownNode`) so `engine.ts`'s single `case 'markdown':` render
site can unescape the FINAL resolved string back to literal `{{`/`}}`
after evaluation has already safely completed. A node without the flag
(the overwhelming majority, anything not touched by macro substitution)
is completely unaffected, zero behavior change.

## Adjacent finding (scope decision for the gate, not assumed in scope)

`substituteNode`'s switch has no `case 'code':`. A `@code` block inside a
`@foreach`/`@call` body currently throws `unhandled AST node type
"code"` (confirmed live: `@foreach x in "a,b" / @code language="javascript"
/ console.log("{{ x }}") / @code-end / @foreach-end` crashes). This is
NOT a live security vector today: `@code`'s body is only re-scanned for
`{{ }}` when `interpolate=true` is explicitly set
(`code-runners.ts:161-163`), and since there is no `case 'code':` at
all, execution never reaches that point regardless, it just crashes
first. It IS the same missing-case defect class already known in this
codebase (macros.ts's switch has had gaps found and fixed before, most
recently for `read-body` in the prior build). Fixing it correctly means
adding a case that also applies the SAME escape treatment to `body`
before any future `interpolate=true` evaluation, so it doesn't
reintroduce this exact vulnerability class the moment someone opts in.
Low risk to include alongside this fix (same file, same mechanism, now
available); equally reasonable to defer as its own `[gap]`.

## Entry surfaces (each owes a live invocation at the Green Gate)

- `@foreach x in <source>` with a markdown body containing `{{ loopVar }}`,
  where `<source>` can return attacker-influenced values (`@read`,
  `@list`, `@query`, `@read-body`, `read_body()`).
- `@foreach` with a body directive whose `path=` (or other) attribute
  references `{{ loopVar }}`.
- `@call`/`@template` macro invocation whose body contains `{{ param }}`
  in markdown text or a directive attribute, with an attacker-influenced
  argument value (positional or named).
- (If included) `@code` inside `@foreach`/`@call`.

## Process boundaries

None new. Synchronous, in-process, same execution model as the rest of
the interpolation engine.

## Impact / call sites

`substituteNode`/`substituteParams` (macros.ts) is called from exactly
two places: `iter-ops.ts:96` (`@foreach`, one call per iteration) and
`engine.ts:424` (`@call`/`handleCall`, one call per invocation). `@template`
routes through `@call`-shaped macro invocation per feature 19's doc.
No other call sites; the fix is fully contained to `macros.ts`, `types.ts`
(one new optional field), and `engine.ts` (one conditional unescape at
the existing markdown render site).

`resolveInterpolations`/`scanInterpolations` and `interpolatePathSoft`
themselves are UNCHANGED; the fix never touches the general interpolation
evaluator, only what `subStr` hands it.

## Consistency check

No other code path substitutes untrusted data into a string that a
downstream consumer independently re-scans for `{{ }}` outside these two
already-identified vectors and the `subArgs`-covered directive
attributes (confirmed via `grep -rn "scanInterpolations("`: the only
other call sites are `iter-ops.ts:80` and `engine.ts:414`, both
operating on a directive's OWN literal/name text as authored, never on
`subStr`-substituted data, so not vectors of this class).
