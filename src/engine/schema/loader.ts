import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// A document declares which schema class it belongs to via a top-level
// `class:` frontmatter field. The schema itself lives at
// .livestage/schemas/<class>.json, one file per class, config home per the
// spec's Tech Stack section.
export interface SchemaField {
  type: 'string' | 'number' | 'boolean'
  enum?: string[]
  required?: boolean
}

export interface SchemaDoc {
  class: string
  fields: Record<string, SchemaField>
}

export interface SchemaLoadResult {
  schema: SchemaDoc | null
  error: string | null  // set when a schema file exists but is malformed
}

function schemasDir(cwd: string): string {
  return join(cwd, '.livestage', 'schemas')
}

// className comes from a document's own frontmatter (untrusted content,
// post-interpolation enforcement, Principle 5), not a fixed identifier the
// engine chose. Without this check, a class: "../../../etc/passwd" value
// would escape .livestage/schemas/ entirely once joined (path.join()
// resolves ..), reading an arbitrary file as if it were a schema. Class
// names are simple identifiers, never a path component.
const VALID_CLASS_NAME = /^[A-Za-z0-9_-]+$/

export function schemaPath(className: string, cwd: string): string {
  if (!VALID_CLASS_NAME.test(className)) return ''
  return join(schemasDir(cwd), `${className}.json`)
}

function isValidSchemaShape(value: unknown): value is SchemaDoc {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (typeof v['class'] !== 'string') return false
  if (typeof v['fields'] !== 'object' || v['fields'] === null || Array.isArray(v['fields'])) return false
  for (const field of Object.values(v['fields'] as Record<string, unknown>)) {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) return false
    const f = field as Record<string, unknown>
    if (!['string', 'number', 'boolean'].includes(f['type'] as string)) return false
    if (f['enum'] !== undefined && !Array.isArray(f['enum'])) return false
  }
  return true
}

// No schema declared for a class is not an error, deny-by-default does not
// apply to schema validation the way it does to filesystem/shell/code:
// a document with no class, or a class with no schema file, is simply
// unvalidated (business rule 2 only gates "once a schema is declared").
export function loadSchema(className: string, cwd: string): SchemaLoadResult {
  const path = schemaPath(className, cwd)
  if (path === '') return { schema: null, error: `invalid class name "${className}": must match ${VALID_CLASS_NAME}` }
  if (!existsSync(path)) return { schema: null, error: null }
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    return { schema: null, error: `cannot read ${path}: ${String(err)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { schema: null, error: `${path} is not valid JSON: ${String(err)}` }
  }
  if (!isValidSchemaShape(parsed)) {
    return { schema: null, error: `${path} does not match the schema shape { class, fields: { name: { type, enum?, required? } } }` }
  }
  return { schema: parsed, error: null }
}

export interface SchemaFileCheck {
  path: string
  valid: boolean
  error: string | null
}

// Used by doctor's schema-validity check (feature 30).
export function listSchemaFiles(cwd: string): SchemaFileCheck[] {
  const dir = schemasDir(cwd)
  if (!existsSync(dir)) return []
  let names: string[]
  try {
    names = readdirSync(dir).filter(n => n.endsWith('.json'))
  } catch {
    return []
  }
  return names.map(name => {
    const className = name.replace(/\.json$/, '')
    const result = loadSchema(className, cwd)
    return { path: join(dir, name), valid: result.error === null, error: result.error }
  })
}
