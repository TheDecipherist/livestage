import type { FormatModule, RendererInput } from '../types.js'
import { toLines } from '../object-rows.js'

const code: FormatModule = {
  name: 'code',
  render(input: RendererInput): string {
    const lang = input.options?.['lang'] ?? ''
    // @render source= binding a plain string (e.g. parse="text" @code
    // output): show it verbatim, not JSON-stringified or split into an
    // array of one.
    const body = input.raw !== undefined
      ? (typeof input.raw === 'string' ? input.raw : JSON.stringify(input.raw, null, 2))
      : toLines(input.data, input.columns).join('\n')
    return `\`\`\`${lang}\n${body}\n\`\`\``
  },
}

export default code
