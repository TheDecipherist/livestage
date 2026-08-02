import type { SchemaDoc } from './loader.js'

export interface SchemaValidationResult {
  valid: boolean
  error: string | null  // a named, specific error, never a generic failure
}

function coercesToType(value: string, type: 'string' | 'number' | 'boolean'): boolean {
  if (type === 'string') return true
  if (type === 'number') return value.trim() !== '' && !isNaN(Number(value))
  if (type === 'boolean') return value === 'true' || value === 'false'
  return false
}

// Validates a single proposed field write (@update-frontmatter is a
// single-field-at-a-time directive) against the target document's declared
// schema class. A field the schema doesn't mention is unconstrained, not
// rejected, schemas here declare constraints, not an exhaustive allowlist.
export function validateFieldValue(schema: SchemaDoc, field: string, value: string): SchemaValidationResult {
  const rule = schema.fields[field]
  if (!rule) return { valid: true, error: null }

  if (!coercesToType(value, rule.type)) {
    return {
      valid: false,
      error: `field "${field}" must be of type ${rule.type} (schema ${schema.class}), got "${value}"`,
    }
  }
  if (rule.enum && !rule.enum.includes(value)) {
    return {
      valid: false,
      error: `field "${field}" must be one of [${rule.enum.join(', ')}] (schema ${schema.class}), got "${value}"`,
    }
  }
  return { valid: true, error: null }
}
