import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSchema, listSchemaFiles } from '../../../src/engine/schema/loader.js'
import { validateFieldValue } from '../../../src/engine/schema/validate.js'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// Wave 5, feature 32 (Schema Engine): [new], no donor F-SCHEMA. A schema
// declares a document class's expected frontmatter shape under
// .livestage/schemas/<class>.json; a document opts in via a top-level
// class: frontmatter field.
describe('loadSchema', () => {
  let cwd: string
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'ls-schema-')) })
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }) })

  it('returns null, no error, when no schema file exists for the class (not an error state)', () => {
    const result = loadSchema('nonexistent', cwd)
    expect(result.schema).toBeNull()
    expect(result.error).toBeNull()
  })

  it('loads a well-formed schema', () => {
    mkdirSync(join(cwd, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(cwd, '.livestage', 'schemas', 'doc.json'), JSON.stringify({
      class: 'doc', fields: { status: { type: 'string', enum: ['a', 'b'] } },
    }))
    const result = loadSchema('doc', cwd)
    expect(result.error).toBeNull()
    expect(result.schema?.class).toBe('doc')
  })

  it('a malformed schema file (invalid JSON) fails with a specific error, not silently null', () => {
    mkdirSync(join(cwd, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(cwd, '.livestage', 'schemas', 'broken.json'), '{ not valid json')
    const result = loadSchema('broken', cwd)
    expect(result.schema).toBeNull()
    expect(result.error).toContain('not valid JSON')
  })

  it('a malformed schema file (wrong shape) fails with a specific error', () => {
    mkdirSync(join(cwd, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(cwd, '.livestage', 'schemas', 'wrong.json'), JSON.stringify({ foo: 'bar' }))
    const result = loadSchema('wrong', cwd)
    expect(result.schema).toBeNull()
    expect(result.error).toContain('does not match the schema shape')
  })

  it('rejects a class name containing path traversal, never escapes .livestage/schemas/', () => {
    // A class: frontmatter field is untrusted document content; without
    // this guard, path.join() would resolve ../ segments and read an
    // arbitrary file outside the schemas directory as if it were a schema.
    const result = loadSchema('../../../etc/passwd', cwd)
    expect(result.schema).toBeNull()
    expect(result.error).toContain('invalid class name')
  })

  it('rejects a class name containing a path separator', () => {
    const result = loadSchema('sub/dir', cwd)
    expect(result.schema).toBeNull()
    expect(result.error).toContain('invalid class name')
  })
})

describe('listSchemaFiles (doctor integration)', () => {
  let cwd: string
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'ls-schema-list-')) })
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }) })

  it('reports an intentionally malformed schema file as invalid', () => {
    mkdirSync(join(cwd, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(cwd, '.livestage', 'schemas', 'good.json'), JSON.stringify({ class: 'good', fields: {} }))
    writeFileSync(join(cwd, '.livestage', 'schemas', 'bad.json'), 'not json at all')
    const files = listSchemaFiles(cwd)
    expect(files.find(f => f.path.endsWith('good.json'))?.valid).toBe(true)
    expect(files.find(f => f.path.endsWith('bad.json'))?.valid).toBe(false)
  })

  it('returns an empty list when no schemas directory exists', () => {
    expect(listSchemaFiles(cwd)).toEqual([])
  })
})

describe('validateFieldValue', () => {
  const schema = { class: 'doc', fields: { status: { type: 'string' as const, enum: ['a', 'b'] }, count: { type: 'number' as const } } }

  it('passes a value not constrained by the schema (unmentioned field)', () => {
    expect(validateFieldValue(schema, 'unrelated', 'anything').valid).toBe(true)
  })

  it('rejects a value outside the declared enum with a named error', () => {
    const result = validateFieldValue(schema, 'status', 'z')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('must be one of')
  })

  it('accepts a value inside the declared enum', () => {
    expect(validateFieldValue(schema, 'status', 'a').valid).toBe(true)
  })

  it('rejects a non-numeric value for a number-typed field', () => {
    const result = validateFieldValue(schema, 'count', 'not-a-number')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('must be of type number')
  })

  it('accepts a numeric string for a number-typed field', () => {
    expect(validateFieldValue(schema, 'count', '42').valid).toBe(true)
  })
})

describe('@update-frontmatter schema pre-write gate (integration)', () => {
  let cwd: string
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ls-schema-write-'))
    mkdirSync(join(cwd, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(cwd, '.livestage', 'schemas', 'feature-doc.json'), JSON.stringify({
      class: 'feature-doc', fields: { status: { type: 'string', enum: ['planned', 'active', 'complete'] } },
    }))
    writeFileSync(join(cwd, 'doc.md'), '---\nclass: feature-doc\nstatus: planned\n---\nBody.\n')
  })
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }) })

  function render(src: string) {
    const ast = parse(src, { filePath: join(cwd, 'x.stage') })
    return execute(ast, {
      ctx: {
        cwd,
        security: {
          allowShell: false, allowHttp: false, allowDb: false, jailRoot: cwd,
          writeEnabled: true, writeJail: cwd, allowedWritePaths: [],
        },
      },
    })
  }

  it('blocks a write that violates the schema, pre-write, with a named error; the file is untouched', () => {
    const before = readFileSync(join(cwd, 'doc.md'), 'utf8')
    const result = render('@update-frontmatter path="doc.md" field="status" value="bogus" /')
    expect(result.warnings.some(w => w.includes('blocked') && w.includes('must be one of'))).toBe(true)
    expect(readFileSync(join(cwd, 'doc.md'), 'utf8')).toBe(before)
  })

  it('allows a conforming write, which lands', () => {
    render('@update-frontmatter path="doc.md" field="status" value="active" /')
    expect(readFileSync(join(cwd, 'doc.md'), 'utf8')).toContain('status: active')
  })

  it('a document with no class field is unvalidated (writes freely)', () => {
    writeFileSync(join(cwd, 'noclass.md'), '---\nstatus: whatever\n---\nBody.\n')
    render('@update-frontmatter path="noclass.md" field="status" value="totally-unconstrained" /')
    expect(readFileSync(join(cwd, 'noclass.md'), 'utf8')).toContain('status: totally-unconstrained')
  })

  it('a class with no matching schema file is unvalidated (writes freely)', () => {
    writeFileSync(join(cwd, 'other.md'), '---\nclass: no-such-schema\nstatus: x\n---\nBody.\n')
    render('@update-frontmatter path="other.md" field="status" value="anything-goes" /')
    expect(readFileSync(join(cwd, 'other.md'), 'utf8')).toContain('status: anything-goes')
  })

  it('no temp file is left behind after a successful atomic write', () => {
    render('@update-frontmatter path="doc.md" field="status" value="active" /')
    const entries = readdirSync(cwd)
    expect(entries.some(e => e.includes('.tmp'))).toBe(false)
  })
})
