import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// F-FOREACH-RCE (fix, feature 49): substituteNode in macros.ts spliced a
// @foreach/@call bound value into template text as plain text, then two
// independent downstream mechanisms (scanInterpolations for markdown text,
// interpolatePathSoft for directive path= attrs) re-scanned that
// substituted text for {{ }} and evaluated whatever they found in the vm
// sandbox, which exposes host-realm objects. A bound value that itself
// contains literal {{ }} (realistic: file content read via @read/@list/
// @query/@read-body) became arbitrary code execution. These tests prove
// both vectors are inert after the fix, that legitimate {{ loopVar }}
// substitution still works, and that markdown text preserves literal
// {{ }} content byte-for-byte (LiveStage's own docs contain such examples).
describe('foreach/call interpolation substitution does not re-evaluate bound data as code', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-foreach-rce-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  const PAYLOAD = '{{ this.constructor.constructor("return process.platform")() }}'

  it('vector 1 (markdown text): a @foreach item containing a sandbox-escape payload is rendered as literal text, not evaluated', () => {
    writeFileSync(join(dir, 'evil.md'), `${PAYLOAD}\n`)
    const result = render('@foreach x in @read "evil.md"\nITEM {{ x }}\n@foreach-end\n')
    expect(result.output).not.toContain(process.platform)
    expect(result.output).toContain(`ITEM ${PAYLOAD}`)
  })

  it('vector 1, @call variant: a macro argument containing the payload is also rendered as literal text, not evaluated', () => {
    writeFileSync(join(dir, 'evil.md'), `${PAYLOAD}\n`)
    const result = render('@define show(p)\nGOT {{ p }}\n@define-end\n@foreach x in @read "evil.md"\n@call show "{{ x }}" /\n@foreach-end\n')
    expect(result.output).not.toContain(process.platform)
    expect(result.output).toContain(`GOT ${PAYLOAD}`)
  })

  it('vector 2 (directive path= attribute): an item containing the payload does not get evaluated into a real, readable file path', () => {
    writeFileSync(join(dir, 'evil.md'), `${PAYLOAD}\n`)
    writeFileSync(join(dir, process.platform), 'PWNED_IF_YOU_CAN_READ_THIS\n')
    const result = render('@foreach x in @read "evil.md"\n@hash path="{{ x }}" /\n@foreach-end\n')
    expect(result.output).not.toContain('PWNED')
    expect(result.warnings.join('\n')).toMatch(/does not exist|blocked/i)
  })

  it('vector 2, @read-frontmatter path= variant: the planted decoy file is never read', () => {
    writeFileSync(join(dir, 'evil.md'), `${PAYLOAD}\n`)
    writeFileSync(join(dir, process.platform), '---\nid: x\nsecret: PWNED_VALUE\n---\n')
    const result = render('@foreach x in @read "evil.md"\n@read-frontmatter path="{{ x }}" field="secret" /\n@foreach-end\n')
    expect(result.output).not.toContain('PWNED_VALUE')
  })

  it('legitimate @foreach substitution of a benign value into markdown text still works', () => {
    const result = render('@foreach x in a, b, c\nITEM {{ x }}\n@foreach-end\n')
    expect(result.output).toContain('ITEM a')
    expect(result.output).toContain('ITEM b')
    expect(result.output).toContain('ITEM c')
  })

  it('legitimate @foreach substitution of a benign value into a directive path= attribute still works', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\nstatus: ok\n---\nBody.\n')
    const result = render('@foreach x in doc.md\n@read-frontmatter path="{{ x }}" field="status" /\n@foreach-end\n')
    expect(result.output).toContain('ok')
  })

  it('markdown text preserves literal {{ }} content from a substituted value byte-for-byte (fidelity, not just safety)', () => {
    writeFileSync(join(dir, 'docs-example.md'), 'Use {{ read_body("x.md") }} to read a body.\n')
    const result = render('@foreach x in @read "docs-example.md"\nEXAMPLE: {{ x }}\n@foreach-end\n')
    expect(result.output).toContain('EXAMPLE: Use {{ read_body("x.md") }} to read a body.')
  })

  function renderWithCode(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: dir,
        security: {
          allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir,
          codeConfig: { languages: ['javascript'], timeout: 30_000, runners: {} },
        },
      },
    })
  }

  it('a @code block inside @foreach no longer crashes with "unhandled AST node type" (adjacent gap fix)', () => {
    const result = renderWithCode('@foreach x in "a,b"\n@code language="javascript"\nconsole.log("ok")\n@code-end\n@foreach-end\n')
    expect(result.errors.join('\n')).not.toMatch(/unhandled AST node type/)
  })

  it('a @code block with interpolate=true inside @foreach does not evaluate a bare {{ }} loop item as code either', () => {
    // Paired with a marker line so this can't pass vacuously: if the
    // "unhandled AST node type" crash from the adjacent gap were still
    // present, the whole block would never run and BOTH assertions would
    // pass for the wrong reason (nothing executed at all). The marker
    // proves the script genuinely ran. Uses a quote-free {{ }} payload
    // (not the double-quote-bearing PAYLOAD constant): the escape fix
    // only guards against {{ }} re-evaluation, not against a substituted
    // value breaking the generated script's own string-literal syntax,
    // an orthogonal, pre-existing limitation of interpolate=true.
    const CODE_PAYLOAD = '{{ process.platform }}'
    writeFileSync(join(dir, 'evil.md'), `${CODE_PAYLOAD}\n`)
    const result = renderWithCode('@foreach x in @read "evil.md"\n@code language="javascript" interpolate="true"\nconsole.log("MARKER_RAN")\nconsole.log("{{ x }}")\n@code-end\n@foreach-end\n')
    expect(result.output).toContain('MARKER_RAN')
    expect(result.output).not.toContain(process.platform)
  })
})

// Phase 7 review found the brace-escaping fix above does not, and
// structurally cannot, protect fields that get evaluated as CODE rather
// than re-scanned for {{ }}: @code's body/src (script text, spawned
// directly) and @data/@template's rhs/dataExpr (evaluateRhsTyped evaluates
// them unconditionally, no {{ }} wrapping required at all). Splicing a
// bound value into any of these is code injection regardless of what
// characters it contains. The fix for these fields is different from the
// markdown/path= fix: never substitute them at all (matching the
// pre-existing 'transition'/'passthrough' no-op cases), relying on the
// SAME ctx.envFiles binding @foreach already sets up for the loop
// variable to resolve safely if the ORIGINAL, un-substituted expression
// references it.
describe('fields that are evaluated as code (not just re-scanned) are never substituted at all', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-foreach-rce-eval-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  it('a @foreach item with no braces at all is not evaluated as code via @data rhs (a vector brace-escaping cannot close)', () => {
    // Confirmed live pre-fix: this exact construction printed the real
    // process.platform, with zero braces in the payload for the escape
    // fix to even act on -- evaluateRhsTyped's fallback branch evaluates
    // the raw substituted text unconditionally.
    writeFileSync(join(dir, 'evil.md'), 'this.constructor.constructor("return process.platform")()\n')
    const result = render('@foreach x in @read "evil.md"\n@data r\n  a = {{ x }}\n@data-end\nGOT {{ r.a }}\n@foreach-end\n')
    expect(result.output).not.toContain(process.platform)
  })

  it('legitimate @data rhs referencing the loop variable still resolves correctly via ctx.envFiles, not substitution', () => {
    const result = render('@foreach x in a, b\n@data r\n  v = {{ x }}\n@data-end\nGOT {{ r.v }}\n@foreach-end\n')
    expect(result.output).toContain('GOT a')
    expect(result.output).toContain('GOT b')
  })

  it('a @code block substituted item does not become shell/command injection through its own body text (no {{ }} needed)', () => {
    // A value with NO braces at all, so the brace-escaping fix is
    // irrelevant here by construction -- the vector is splicing
    // untrusted text into a script that gets EXECUTED, not {{ }}
    // re-evaluation. Confirmed live pre-fix: an item like
    // `x"; touch MARKER; echo $(uname); #` spliced into a bash body
    // ran the injected commands.
    writeFileSync(join(dir, 'evil.md'), 'INJECTED_MARKER_SHOULD_NOT_RUN\n')
    const filePath = join(dir, 'main.stage')
    const ast = parse('@foreach x in @read "evil.md"\n@code language="javascript"\nconsole.log("{{ x }}")\n@code-end\n@foreach-end\n', { filePath })
    const result = execute(ast, {
      filePath,
      ctx: {
        cwd: dir,
        security: {
          allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir,
          codeConfig: { languages: ['javascript'], timeout: 30_000, runners: {} },
        },
      },
    })
    // body/src are never substituted at all now, so the literal template
    // text `{{ x }}` reaches the script UNCHANGED (interpolate defaults
    // to false, matching @code's own documented "opt-in" semantics) --
    // proof the loop item's content never touched the executed script.
    expect(result.output).not.toContain('INJECTED_MARKER_SHOULD_NOT_RUN')
    expect(result.output).toContain('{{ x }}')
  })
})

describe('@update-frontmatter writes the real, unescaped substituted value to disk', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-foreach-rce-write-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: dir,
        security: {
          allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir,
          filesystemConfig: {
            source_root: 'auto', data_root: 'cwd',
            allowed_source_paths: [], allowed_data_paths: [],
            write_enabled: true, write_root: 'cwd', allowed_write_paths: [],
            additional_block_paths: [], additional_block_patterns: [],
            allow_unmasked_paths: [], allow_unmasked_patterns: [], user_masking_patterns: [],
          },
        },
      },
    })
  }

  it('a @foreach item value containing braces is written literally, not with escape backslashes left in', () => {
    writeFileSync(join(dir, 'target.md'), '---\nid: x\nstatus: draft\n---\nBody.\n')
    writeFileSync(join(dir, 'item.md'), '{"a":1}\n')
    render('@foreach x in @read "item.md"\n@update-frontmatter path="target.md" field="status" value="{{ x }}" /\n@foreach-end\n')
    const after = readFileSync(join(dir, 'target.md'), 'utf8')
    expect(after).toContain('status: {"a":1}')
    expect(after).not.toContain('\\{')
    expect(after).not.toContain('\\}')
  })
})

// Second follow-up review round found two more fields evaluated
// unconditionally (no {{ }} wrapping needed, so brace-escaping cannot
// protect them): @list/@read's where= (passed straight to whereMatches's
// runInNewContext eval) and @foreach/@set's source expression (a value
// starting with `@` is parsed and EXECUTED as a brand new directive by
// evaluateSource). Both are now excluded from substitution the same way
// as code/data/template.
describe('where= and @foreach/@set source expressions are never substituted, only evaluated against the original template', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-foreach-rce-where-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  it('a @foreach item with no braces is not evaluated as code via @list where= (confirmed live pre-fix: matched every row)', () => {
    const wdocs = join(dir, 'wdocs')
    mkdirSync(wdocs, { recursive: true })
    writeFileSync(join(wdocs, 'a.md'), '---\nid: a\n---\nBody A.\n')
    writeFileSync(join(wdocs, 'b.md'), '---\nid: b\n---\nBody B.\n')
    writeFileSync(join(dir, 'evil-where.md'), "this.constructor.constructor(\"return process.platform\")() == 'linux'\n")
    const result = render('@foreach x in @read "evil-where.md"\n@list "wdocs/*.md" where="{{ x }}" fields="id" /\n@foreach-end\n')
    // Pre-fix this matched EVERY row (the payload evaluates truthy on a
    // linux host); post-fix the literal, unevaluated text never matches
    // an id field, so nothing but the header row appears.
    expect(result.output).not.toContain('\na\n')
    expect(result.output).not.toContain('\nb\n')
  })

  it('a @foreach item that looks like a directive is not parsed/executed as one via a nested @foreach source', () => {
    writeFileSync(join(dir, 'private-notes.md'), 'TOPSECRETVALUE\n')
    writeFileSync(join(dir, 'evil-directive.md'), '@read "private-notes.md"\n')
    const result = render('@foreach x in @read "evil-directive.md"\n@foreach y in {{ x }}\nGOT {{ y }}\n@foreach-end\n@foreach-end\n')
    expect(result.output).not.toContain('TOPSECRETVALUE')
  })

  it('legitimate bare {{ x }} as the WHOLE @foreach source still works (evaluateSource resolves it directly, no substitution needed)', () => {
    const result = render('@foreach x in a, b\n@foreach y in {{ x }}\nGOT {{ y }}\n@foreach-end\n@foreach-end\n')
    expect(result.output).toContain('GOT a')
    expect(result.output).toContain('GOT b')
  })
})
