import type { FormatModule, RendererInput } from '../types.js'
import { toLines } from '../object-rows.js'

const inline: FormatModule = {
  name: 'inline',
  render(input: RendererInput): string {
    if (input.raw !== undefined) {
      return typeof input.raw === 'string' ? input.raw : JSON.stringify(input.raw)
    }
    return toLines(input.data, input.columns).join(' ')
  },
}

export default inline
