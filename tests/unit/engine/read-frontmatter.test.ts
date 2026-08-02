import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

describe('@read-frontmatter', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mai-readfm-'))
  })

  afterEach(() => {
    try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function render(content: string) {
    const filePath = join(projectDir, 'main.md')
    writeFileSync(filePath, content, 'utf8')
    const ast = parse(content, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: projectDir,
        security: {
          allowShell: false, allowHttp: false, allowDb: false,
          jailRoot: null,
        },
      },
    })
  }

  it('reads a scalar field value', () => {
    writeFileSync(join(projectDir, 'doc.md'),
      '---\nid: 01-test\nstatus: complete\ntitle: Test\n---\n\nBody.\n', 'utf8')
    const result = render(
      `@read-frontmatter path="doc.md" field="status" label=doc_status /
Status is {{ doc_status }}.
`,
    )
    expect(result.output).toContain('Status is complete.')
  })

  it('interpolates {{ }} in the path attribute at top level (not only inside @foreach)', () => {
    writeFileSync(join(projectDir, '01-widget.md'),
      '---\nid: 01-widget\nstatus: draft\n---\n\nBody.\n', 'utf8')
    const result = render(
      `@set fid = {{ "01" + "-" + "widget" }} /
@read-frontmatter path="{{ fid }}.md" field="status" label=st /
Status is {{ st }}.
`,
    )
    expect(result.output).toContain('Status is draft.')
  })

  it('reads a list field as comma-separated text', () => {
    writeFileSync(join(projectDir, 'doc.md'),
      '---\nid: 01-test\nsource_files:\n  - src/a.ts\n  - src/b.ts\n---\n\nBody.\n', 'utf8')
    const result = render(
      `@read-frontmatter path="doc.md" field="source_files" label=files /
Files: {{ files }}.
`,
    )
    expect(result.output).toContain('Files: src/a.ts, src/b.ts')
  })

  it('returns empty when field is missing (no warning)', () => {
    writeFileSync(join(projectDir, 'doc.md'),
      '---\nid: 01-test\n---\n\nBody.\n', 'utf8')
    const result = render(
      `@read-frontmatter path="doc.md" field="status" label=doc_status /
Status: "{{ doc_status }}".
`,
    )
    expect(result.output).toContain('Status: "".')
    // No warning for missing field — only for missing frontmatter block.
    const fmWarning = result.warnings.find(w => w.includes('no YAML frontmatter'))
    expect(fmWarning).toBeUndefined()
  })

  it('warns when file has no frontmatter block', () => {
    writeFileSync(join(projectDir, 'doc.md'), 'Plain text, no frontmatter.\n', 'utf8')
    const result = render(
      `@read-frontmatter path="doc.md" field="status" /
`,
    )
    expect(result.warnings.join('\n')).toMatch(/no YAML frontmatter/i)
  })

  it('emits value as a line when no label is given', () => {
    writeFileSync(join(projectDir, 'doc.md'),
      '---\nstatus: ready\n---\n\nBody.\n', 'utf8')
    const result = render(
      `@read-frontmatter path="doc.md" field="status" /
`,
    )
    expect(result.output).toContain('ready')
  })

  it('feeds @if checks via the label', () => {
    writeFileSync(join(projectDir, 'doc.md'),
      '---\nstatus: complete\n---\n\nBody.\n', 'utf8')
    const result = render(
      `@read-frontmatter path="doc.md" field="status" label=s /
@if {{ s }} == "complete"
  Doc is complete.
@if-end
@if {{ s }} == "draft"
  Doc is draft.
@if-end
`,
    )
    expect(result.output).toContain('Doc is complete.')
    expect(result.output).not.toContain('Doc is draft.')
  })

  it('warns when file does not exist', () => {
    const result = render(
      `@read-frontmatter path="missing.md" field="status" /
`,
    )
    expect(result.warnings.join('\n')).toMatch(/does not exist/i)
  })
})

// Read-side schema check (feature 32, F-SCHEMA): only @update-frontmatter's
// write path was validated before this; a document can drift out of
// conformance (hand-edited, or predating the schema) and be read with no
// warning at all. Reads stay pure, so this warns rather than blocking.
describe('@read-frontmatter schema check', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'ls-readfm-schema-'))
    mkdirSync(join(projectDir, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(projectDir, '.livestage', 'schemas', 'feature-doc.json'),
      JSON.stringify({ class: 'feature-doc', fields: { status: { type: 'string', enum: ['complete', 'planned'] } } }))
  })

  afterEach(() => {
    try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function render(content: string) {
    const filePath = join(projectDir, 'main.md')
    writeFileSync(filePath, content, 'utf8')
    const ast = parse(content, { filePath })
    return execute(ast, {
      filePath,
      ctx: { cwd: projectDir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: null } },
    })
  }

  it('single-field mode: warns when the read value violates the declared schema, still returns it', () => {
    writeFileSync(join(projectDir, 'doc.md'), '---\nclass: feature-doc\nstatus: bogus\n---\nbody')
    const result = render('@read-frontmatter path="doc.md" field="status" /')
    expect(result.warnings.join('\n')).toMatch(/does not conform to its declared schema/)
    expect(result.output.trim()).toBe('bogus')
  })

  it('single-field mode: no warning when the value conforms', () => {
    writeFileSync(join(projectDir, 'doc.md'), '---\nclass: feature-doc\nstatus: complete\n---\nbody')
    const result = render('@read-frontmatter path="doc.md" field="status" /')
    expect(result.warnings).toHaveLength(0)
  })

  it('struct mode (label=, no field=): warns on the nonconforming field, still captures the struct', () => {
    writeFileSync(join(projectDir, 'doc.md'), '---\nclass: feature-doc\nstatus: bogus\n---\nbody')
    const result = render('@read-frontmatter path="doc.md" label="doc" /\n{{ doc.status }}')
    expect(result.warnings.join('\n')).toMatch(/does not conform to its declared schema/)
    expect(result.output).toContain('bogus')
  })

  it('no class= field: unvalidated, no warning', () => {
    writeFileSync(join(projectDir, 'doc.md'), '---\nstatus: bogus\n---\nbody')
    const result = render('@read-frontmatter path="doc.md" field="status" /')
    expect(result.warnings).toHaveLength(0)
  })

  it('class= with no matching schema file: unvalidated, no warning', () => {
    writeFileSync(join(projectDir, 'doc.md'), '---\nclass: no-such-schema\nstatus: bogus\n---\nbody')
    const result = render('@read-frontmatter path="doc.md" field="status" /')
    expect(result.warnings).toHaveLength(0)
  })
})
