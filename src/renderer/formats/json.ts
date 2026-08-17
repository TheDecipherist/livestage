import type { FormatModule, RendererInput } from '../types.js'

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

const json: FormatModule = {
  name: 'json',
  render(input: RendererInput): string {
    // @render source= binds `raw` directly (whatever shape the label
    // resolved to, object, array, or scalar): the value IS the thing to
    // print, no reconstruction from a data[] array makes sense here the
    // way it does for table/list. The legacy path (data: string[], the
    // joined text IS one JSON document, e.g. `@code ... | @render
    // type="json"`) is unchanged.
    if (input.raw !== undefined) return `\`\`\`json\n${JSON.stringify(input.raw, null, 2)}\n\`\`\``
    const raw = (input.data as string[]).join('\n')
    return `\`\`\`json\n${prettyJson(raw)}\n\`\`\``
  },
}

export default json
