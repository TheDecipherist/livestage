import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from 'livestage/renderer'
import type { RenderType, RendererInput } from 'livestage/renderer'

const VALID_TYPES: RenderType[] = ['list', 'numbered', 'links', 'table', 'code', 'inline', 'bar', 'tree', 'json']

export interface RendererPreviewOptions {
  cwd?: string
  columns?: string
  optionFlags?: string[]
}

export interface RendererPreviewResult {
  output: string
  errors: string[]
  exitCode: number
}

// `renderer preview` runs one of the nine @render formats (feature 20)
// standalone, against raw data from a file or stdin, so an author can see
// the markdown shape a format produces without writing a full .stage
// document and a source directive to feed it.
export function runRendererPreview(file: string | undefined, format: string, options: RendererPreviewOptions = {}): RendererPreviewResult {
  if (!(VALID_TYPES as string[]).includes(format)) {
    return { output: '', errors: [`Unknown render type: "${format}". Valid types: ${VALID_TYPES.join(', ')}`], exitCode: 2 }
  }
  let raw: string
  try {
    raw = file ? readFileSync(resolve(options.cwd ?? process.cwd(), file), 'utf8') : readFileSync(0, 'utf8')
  } catch (err) {
    return { output: '', errors: [`Cannot read input: ${String(err)}`], exitCode: 2 }
  }
  const data = raw.split('\n').filter(l => l !== '')
  const input: RendererInput = { type: format as RenderType, data }
  if (options.columns) input.columns = options.columns.split(',').map(c => c.trim())
  if (options.optionFlags && options.optionFlags.length > 0) {
    const parsed: Record<string, string> = {}
    for (const flag of options.optionFlags) {
      const eq = flag.indexOf('=')
      if (eq === -1) continue
      parsed[flag.slice(0, eq)] = flag.slice(eq + 1)
    }
    if (Object.keys(parsed).length > 0) input.options = parsed
  }
  try {
    return { output: render(input), errors: [], exitCode: 0 }
  } catch (err) {
    return { output: '', errors: [String(err)], exitCode: 1 }
  }
}
