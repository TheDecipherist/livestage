import type { FormatModule, RendererInput } from '../types.js'
import { toLines } from '../object-rows.js'

const list: FormatModule = {
  name: 'list',
  render(input: RendererInput): string {
    return toLines(input.data, input.columns).map(item => `- ${item}`).join('\n')
  },
}

export default list
