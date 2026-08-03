import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import { strip } from '../../../src/engine/stripper.js'

// F-READ-BODY: neither @read (whole file including frontmatter, blank
// lines stripped) nor read_section() (requires a heading, refuses "the
// whole thing") gives "a markdown file's whole body, blank lines
// preserved, optionally one section." read_body()/@read-body close that
// gap, sharing one underlying function, mirroring the existing
// @read-frontmatter/read_frontmatter() precedent.
describe('read_body() sandbox builtin ({{ }} interpolation)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-readbody-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  it('returns the whole body with blank lines preserved, not the frontmatter', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\nstatus: complete\n---\n\n# Heading\n\nParagraph one.\n\nParagraph two.\n')
    const result = render('{{ read_body("doc.md") }}')
    expect(result.output).not.toContain('status: complete')
    expect(result.output).toContain('# Heading\n\nParagraph one.\n\nParagraph two.')
  })

  it('with a heading given, returns exactly what read_section() returns for the same input', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\n## A\n\nBody A.\n\n## B\n\nBody B.\n')
    const viaBody = render('{{ read_body("doc.md", "A") }}')
    const viaSection = render('{{ read_section("doc.md", "A") }}')
    expect(viaBody.output).toBe(viaSection.output)
    expect(viaBody.output).toContain('Body A.')
    expect(viaBody.output).not.toContain('Body B.')
  })

  it('returns empty string for a missing file, without disturbing a real read_body call in the same render', () => {
    // Paired with a real call so this can't pass vacuously: if read_body
    // doesn't exist yet, calling it throws ReferenceError inside the
    // sandbox eval, which is silently caught and returns '' for BOTH
    // expressions below (see engine-interpolate.ts's ReferenceError
    // handling) -- so EXISTS[] would appear instead of EXISTS[Real
    // content.], failing the first assertion.
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\nReal content.\n')
    const result = render('EXISTS[{{ read_body("doc.md") }}] MISSING[{{ read_body("missing.md") }}]')
    expect(result.output).toContain('EXISTS[Real content.]')
    expect(result.output).toContain('MISSING[]')
  })

  it('returns everything (no frontmatter to strip) when the file has no frontmatter block', () => {
    writeFileSync(join(dir, 'doc.md'), 'Just plain markdown.\n\nNo frontmatter here.\n')
    const result = render('{{ read_body("doc.md") }}')
    expect(result.output).toContain('Just plain markdown.\n\nNo frontmatter here.')
  })

  it('also works inside an @if condition, the second binding site (conditions.ts), not only {{ }} interpolation', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\nstatus text here\n')
    const result = render('@if read_body("doc.md").includes("status text")\nmatched\n@if-end\n')
    expect(result.output).toContain('matched')
  })

  it('an explicitly empty section argument returns "", exact parity with read_section(path, "") rather than silently widening to the whole body', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\n## A\n\nBody A.\n')
    const viaBody = render('<<{{ read_body("doc.md", "") }}>>')
    const viaSection = render('<<{{ read_section("doc.md", "") }}>>')
    expect(viaBody.output).toBe(viaSection.output)
    expect(viaBody.output).toBe('<<>>')
  })

  it('accessing an alert-classified sensitive file (config.yaml) through read_body emits a SECURITY_ALERT warning, same as the @read-body directive path', () => {
    writeFileSync(join(dir, 'config.yaml'), 'secret: value\n')
    const result = render('{{ read_body("config.yaml") }}')
    expect(result.warnings.join('\n')).toMatch(/SECURITY_ALERT.*sensitive/i)
  })

  it('a blocked path traversal attempt through read_body (not just @read-body) is also recorded as a warning, not silently swallowed', () => {
    const result = render('<<{{ read_body("../../../etc/passwd") }}>>')
    expect(result.output).toBe('<<>>')
    expect(result.warnings.join('\n')).toMatch(/SECURITY_ALERT.*blocked/i)
  })

  it('strips a CRLF-terminated frontmatter block instead of leaking it as body content', () => {
    writeFileSync(join(dir, 'doc.md'), '---\r\nid: x\r\napi_key: SUPERSECRET\r\n---\r\n\r\nReal body.\r\n')
    const result = render('{{ read_body("doc.md") }}')
    expect(result.output).not.toContain('SUPERSECRET')
    expect(result.output).toContain('Real body.')
  })
})

describe('@read-body inside a @foreach body (macros.ts substituteNode, the third binding site)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-readbody-foreach-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  it('does not throw "unhandled AST node type" when @read-body is substituted inside a @foreach body', () => {
    writeFileSync(join(dir, 'a.md'), '---\nid: a\n---\n\nBody A.\n')
    const result = render('@foreach x in @list "." match="a.md"\n@read-body "{{ x }}" /\n@foreach-end\n')
    expect(result.errors.join('\n')).not.toMatch(/unhandled AST node type/)
    expect(result.output).toContain('Body A.')
  })
})

describe('@read-body directive', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-readbody-dir-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  it('standalone, renders the whole body inline', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\nBody text here.\n')
    const result = render('@read-body "doc.md" /')
    expect(result.output).toContain('Body text here.')
  })

  it('section= returns just that one section', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\n## A\n\nBody A.\n\n## B\n\nBody B.\n')
    const result = render('@read-body "doc.md" section="A" /')
    expect(result.output).toContain('Body A.')
    expect(result.output).not.toContain('Body B.')
  })

  it('an explicitly empty section= returns nothing rather than silently widening to the whole document', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\n## A\n\nBody A.\n')
    const result = render('@read-body "doc.md" section="" /')
    expect(result.output).not.toContain('Body A.')
  })

  it('a section= that matches no heading warns instead of silently returning empty', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\n## A\n\nBody A.\n')
    const result = render('@read-body "doc.md" section="Nonexistent Heading" /')
    expect(result.output).not.toContain('Body A.')
    expect(result.warnings.join('\n')).toMatch(/no heading matching/i)
  })

  it('label= captures the value; visible="false" suppresses inline output while label= still captures it', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\nCaptured text.\n')
    const result = render('BEFORE\n@read-body "doc.md" label="b" visible="false" /\nAFTER {{ b }}\n')
    expect(result.output).toContain('BEFORE')
    expect(result.output).toContain('AFTER Captured text.')
    expect(result.output).not.toMatch(/BEFORE\s+Captured text\.\s+AFTER/)
  })

  it('silent="true" has the same suppression effect as visible="false"', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\nHidden text.\n')
    const result = render('BEFORE\n@read-body "doc.md" label="b" silent="true" /\nAFTER {{ b }}\n')
    expect(result.output.trim()).toBe('BEFORE\nAFTER Hidden text.')
  })

  it('warns when the file does not exist', () => {
    const result = render('@read-body "missing.md" /')
    expect(result.warnings.join('\n')).toMatch(/does not exist/i)
  })

  it('a path outside the data jail is blocked (checkDataPath), matching every other source directive', () => {
    const result = render('@read-body "../../../etc/passwd" /')
    expect(result.warnings.join('\n')).toMatch(/blocked|SECURITY_ALERT/i)
    expect(result.output).not.toContain('root:')
  })

  it('works as a pipe source into @render', () => {
    writeFileSync(join(dir, 'doc.md'), '---\nid: x\n---\n\nPiped body content.\n')
    const result = render('@read-body "doc.md" | @render type="code" lang="markdown" /')
    expect(result.output).toContain('```markdown')
    expect(result.output).toContain('Piped body content.')
  })

  it('a stripped/degraded render of a document containing @read-body degrades to empty string instead of throwing (CR-6)', () => {
    const ast = parse('@read-body "doc.md" /\nAfter text.')
    const result = strip(ast)
    expect(result.output).not.toContain('@read-body')
    expect(result.output).toContain('After text.')
  })
})
