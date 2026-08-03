import type {
  ASTNode, ConditionalBranch, PipeStage,
  IncludeNode, ImportNode, ListNode, ReadNode, TreeNode, CountNode,
  QueryNode, DateNode, RenderNode, CallNode, SwitchNode, CodeNode,
} from 'livestage/parser'
import { scanInterpolations } from 'livestage/parser'

export function substituteParams(body: ASTNode[], args: Record<string, string>): ASTNode[] {
  return body.map(node => substituteNode(node, args))
}

// Security (feature 49): a bound value (a @foreach item, a @call/@template
// argument) can come from file content, command output, or any other
// non-author-controlled source. Splicing it in as plain text without
// escaping its own literal `{`/`}` characters let two independent
// downstream mechanisms (scanInterpolations for markdown text,
// interpolatePathSoft for directive path= attributes) re-scan the
// substituted result and evaluate any {{ }} the DATA happened to contain
// in the runInNewContext sandbox, arbitrary code execution. Escaping
// every individual brace (not just adjacent {{/}} pairs) also closes a
// boundary-merge case: a template ending in a stray `{` immediately
// before the substitution point could otherwise combine with a value
// that starts with `{` to form a brand new `{{` spanning the trust
// boundary.
//
// Idempotent by construction (skips a brace already preceded by a
// backslash): a @call inside a @foreach substitutes the SAME bound value
// twice in sequence (once for the @call node's own positionalArgs, again
// when the macro body substitutes its parameter), and the final render
// site only unescapes once. Without idempotency the second pass would
// escape the first pass's own backslashes, leaving visible `\{`/`\}`
// artifacts in the final output instead of restoring the original text.
function escapeBraces(v: string): string {
  return v.replace(/(?<!\\)\{/g, '\\{').replace(/(?<!\\)\}/g, '\\}')
}

export function unescapeBraces(s: string): string {
  return s.replace(/\\\{/g, '{').replace(/\\\}/g, '}')
}

function subStr(s: string, args: Record<string, string>): string {
  let r = s
  for (const [k, v] of Object.entries(args)) {
    // Escape regex metacharacters in the key before building the pattern
    const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Escape the value's own braces first (see escapeBraces), THEN escape
    // $ so String.replace doesn't interpret $1, $&, etc. Order matters:
    // brace-escaping only ever inserts backslashes and braces, neither of
    // which is special to String.replace's $-substitution syntax, so
    // doing it first never reintroduces a $ for the second step to miss.
    const safeValue = escapeBraces(v).replace(/\$/g, '$$$$')
    r = r.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), safeValue)
  }
  return r
}

function subArgs(a: Record<string, string>, args: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, subStr(v, args)]))
}

// `where=` (@list/@read structured-row filtering) is excluded from
// substitution entirely, the same reasoning as `code`/`data`/`template`
// above: sources.ts/sources-file-utils.ts pass it straight to
// whereMatches's runInNewContext eval, unconditionally, no {{ }}
// wrapping required. Brace-escaping does not protect it (confirmed
// live: a @foreach item with zero braces, substituted into a bare
// where="{{ x }}", evaluated as a real JS expression). A loop variable
// referenced BARE by name (no {{ }}) still resolves safely, the same
// arg0/vars convention sources.ts's executeList already documents.
function subArgsExceptWhere(a: Record<string, string>, args: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k === 'where' ? v : subStr(v, args)]))
}

function substituteNode(node: ASTNode, args: Record<string, string>): ASTNode {
  switch (node.type) {
    case 'markdown': {
      const text = subStr(node.text, args)
      // scanInterpolations(text) is now safe: any {{ / } the bound value
      // itself contained is escaped (see subStr/escapeBraces), so this
      // only ever finds spans that existed in the original template.
      // `substituted: true` tells the markdown render site (engine.ts)
      // to unescape the FINAL resolved text back to literal characters,
      // preserving exact display fidelity for legitimate content. Only
      // set when subStr actually changed something: a node that
      // references none of the bound params (common in a multi-line
      // @foreach/@call body where only some lines use the loop
      // variable) must not have its unrelated content (e.g. other {{ }}
      // interpolations reading ctx.data, which can legitimately contain
      // a literal backslash-brace) run through unescapeBraces at all.
      const changed = text !== node.text
      return changed
        ? { ...node, text, interpolations: scanInterpolations(text), substituted: true }
        : node
    }
    case 'define':
      return { ...node, body: substituteParams(node.body, args) }
    case 'conditional': {
      const branches: ConditionalBranch[] = node.branches.map(b => ({
        ...b,
        body: substituteParams(b.body, args),
      }))
      return { ...node, branches }
    }
    case 'switch': {
      const cases = (node as SwitchNode).cases.map(c => ({
        ...c,
        body: substituteParams(c.body, args),
      }))
      const defaultBody = (node as SwitchNode).defaultBody !== null
        ? substituteParams((node as SwitchNode).defaultBody!, args)
        : null
      return { ...(node as SwitchNode), cases, defaultBody }
    }
    case 'include':
      return { ...node as IncludeNode, path: subStr(node.path, args) }
    case 'import':
      return { ...node as ImportNode, path: subStr(node.path, args) }
    case 'list':
      return { ...node as ListNode, path: subStr(node.path, args), args: subArgsExceptWhere(node.args, args) }
    case 'read':
      return { ...node as ReadNode, path: subStr(node.path, args), args: subArgsExceptWhere(node.args, args) }
    case 'tree':
      return { ...node as TreeNode, path: subStr(node.path, args), args: subArgs(node.args, args) }
    case 'count':
      return { ...node as CountNode, path: subStr(node.path, args), args: subArgs(node.args, args) }
    case 'query':
      return { ...node as QueryNode, command: subStr(node.command, args), args: subArgs(node.args, args) }
    case 'date':
      return { ...node as DateNode, args: subArgs(node.args, args) }
    case 'update-frontmatter':
      return {
        ...node,
        path: subStr(node.path, args),
        field: subStr(node.field, args),
        value: subStr(node.value, args),
        args: subArgs(node.args, args),
      }
    case 'read-frontmatter':
      return {
        ...node,
        path: subStr(node.path, args),
        field: subStr(node.field, args),
        args: subArgs(node.args, args),
      }
    case 'read-body':
      return {
        ...node,
        path: subStr(node.path, args),
        section: subStr(node.section, args),
        args: subArgs(node.args, args),
      }
    case 'test':
    case 'check':
      return {
        ...node,
        command: node.command === null ? null : subStr(node.command, args),
        args: subArgs(node.args, args),
      }
    case 'hash':
      return {
        ...node,
        path: subStr(node.path, args),
        args: subArgs(node.args, args),
      }
    // `body`/`src` are deliberately NEVER substituted, unlike every other
    // string field in this switch: they become an EXECUTED script, not
    // displayed text or a lookup key, so splicing a bound value into them
    // at the MACRO level is code/command injection regardless of brace-
    // escaping (escaping only defends against {{ }} re-evaluation, not
    // against a value breaking the script's own syntax to run arbitrary
    // commands). Only `args` (directive config, e.g. label=/timeout=,
    // never executed) is substituted, so with the default
    // `interpolate=false` a @foreach/@call bound value never reaches the
    // script at all. `interpolate=true` is a SEPARATE, pre-existing,
    // documented opt-in (code-runners.ts splices whatever ctx.envFiles/
    // ctx.data holds into the script text before running it, by design,
    // the same as `@code` itself requiring an explicit policy grant to
    // run anything): a script that opts in AND references a
    // @foreach-bound loop variable is choosing to trust that variable's
    // content as inputs to its own script, the author's decision, not a
    // gap this fix is scoped to close.
    case 'code':
      return { ...node as CodeNode, args: subArgs((node as CodeNode).args, args) }
    // `literalSource`/`literalExpr` are deliberately NEVER substituted:
    // evaluateSource (iter-ops.ts) treats any value starting with `@` as
    // a full directive and PARSES AND EXECUTES it. Splicing a bound
    // value in as text (pre-fix) meant a @foreach item that happened to
    // read as `@read "secret.md"` got executed as a real @read
    // directive, arbitrary directive injection, confirmed live. Leaving
    // these fields untouched is not a functional loss: evaluateSource
    // already resolves a bare `{{ x }}` in the ORIGINAL text itself
    // (scanInterpolations + resolveInterpolations against ctx.envFiles,
    // the same mechanism markdown text uses), and critically that
    // resolution happens AFTER the `@`-prefix check, so even an item
    // value that itself looks like a directive is returned as inert
    // text, never re-parsed.
    case 'foreach':
      return {
        ...node,
        body: node.body.map(n => substituteNode(n, args)),
        args: subArgs(node.args, args),
      }
    case 'set':
      return { ...node, args: subArgs(node.args, args) }
    case 'render':
      return { ...node as RenderNode, args: subArgs(node.args, args) }
    case 'call': {
      const n = node as CallNode
      return {
        ...n,
        args: subArgs(n.args, args),
        positionalArgs: n.positionalArgs.map(v => subStr(v, args)),
      }
    }
    case 'pipe': {
      const stages: PipeStage[] = node.stages.map(s => {
        if (s.type === 'source') return { ...s, node: substituteNode(s.node, args) }
        if (s.type === 'builtin') return { ...s, command: subStr(s.command, args) }
        if (s.type === 'shell') return { ...s, command: subStr(s.command, args) }
        if (s.type === 'sink') return { ...s, node: { ...s.node, args: subArgs(s.node.args, args) } }
        return s
      })
      return { ...node, stages }
    }
    // transition, env, graph, passthrough: no user-visible string params to substitute
    case 'transition':
    case 'env':
    case 'graph':
    case 'passthrough':
      return node
    // `dataExpr`/`rhs` are deliberately NEVER substituted (same reasoning
    // as `code`'s body/src above): evaluateRhsTyped (engine-template.ts)
    // evaluates these fields as a JS expression UNCONDITIONALLY, with no
    // {{ }} wrapping required at all (its fallback branch is
    // `evalExpressionTyped(trimmed, ctx)` on the raw text), so a bound
    // value spliced in as text becomes directly-evaluated code regardless
    // of any brace escaping, a strictly worse variant of the same class
    // this build fixes. Confirmed live: @foreach over a file containing
    // `this.constructor.constructor("return process.platform")()` (no
    // braces at all, so brace-escaping does not even apply) substituted
    // into a bare `{{ x }}` dataExpr/rhs printed the real
    // process.platform. A loop variable referenced as `{{ x }}` in the
    // ORIGINAL, non-substituted expression still resolves correctly and
    // safely (evalExpressionTyped's sandbox reads ctx.envFiles, which
    // @foreach already binds the current item into).
    case 'template':
      return { ...node, path: subStr(node.path, args) }
    case 'data':
      return node
    default:
      throw new Error(`substituteNode: unhandled AST node type "${(node as { type: string }).type}"`)

  }
}
