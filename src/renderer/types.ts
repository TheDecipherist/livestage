export type RenderType =
  | 'list'
  | 'numbered'
  | 'links'
  | 'table'
  | 'code'
  | 'inline'
  | 'bar'
  | 'tree'
  | 'json'

export interface RendererInput {
  type: RenderType
  // string[] is the original contract (one line per item, table/tree split
  // on tab). Record<string, unknown>[] is new: @render source= binding a
  // structured array directly, no pre-formatting required of the script
  // that produced it. See src/renderer/object-rows.ts for how each format
  // adapts.
  data: string[] | Record<string, unknown>[]
  columns?: string[]
  options?: Record<string, string>
  // json only: when set, this is JSON.stringify'd directly instead of
  // reconstructing a value from `data` (a plain object or a scalar has no
  // sensible array-of-rows shape). Absent for every other format.
  raw?: unknown
}

export interface FormatModule {
  name: RenderType
  render(input: RendererInput): string
}
