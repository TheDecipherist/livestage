import type { FormatModule, RendererInput } from '../types.js'
import { toLines } from '../object-rows.js'

const numbered: FormatModule = {
  name: 'numbered',
  render(input: RendererInput): string {
    return toLines(input.data, input.columns).map((item, i) => `${i + 1}. ${item}`).join('\n')
  },
}

export default numbered
