import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TraceRecord } from 'livestage/engine'

export interface EngineTraceOptions {
  cwd?: string
  last?: boolean
  renderId?: string
}

export interface EngineTraceResult {
  records: TraceRecord[]
  errors: string[]
  exitCode: number
}

function readAllRecords(traceDir: string): TraceRecord[] {
  if (!existsSync(traceDir)) return []
  const files = readdirSync(traceDir).filter(f => f.endsWith('.jsonl')).sort()
  const records: TraceRecord[] = []
  for (const file of files) {
    const lines = readFileSync(join(traceDir, file), 'utf8').split('\n').filter(l => l.trim() !== '')
    for (const line of lines) {
      try { records.push(JSON.parse(line) as TraceRecord) } catch { /* skip malformed line */ }
    }
  }
  return records
}

function renderIdOf(record: TraceRecord): string {
  return record.t === 'render' ? record.render_id : record.runId
}

/**
 * `livestage engine trace [--last | <render-id>]`: read back the append-only
 * JSONL trace (CR-4: the engine itself never does this, only cli/commands
 * and doctor are allowed to).
 */
export function runEngineTrace(options: EngineTraceOptions = {}): EngineTraceResult {
  const cwd = options.cwd ?? process.cwd()
  const traceDir = join(cwd, '.livestage', 'trace')
  const all = readAllRecords(traceDir)
  if (all.length === 0) {
    return { records: [], errors: ['No trace records found (has any render run with tracing on?)'], exitCode: 1 }
  }

  if (options.renderId) {
    const records = all.filter(r => renderIdOf(r) === options.renderId)
    if (records.length === 0) {
      return { records: [], errors: [`No trace records for render id "${options.renderId}"`], exitCode: 1 }
    }
    return { records, errors: [], exitCode: 0 }
  }

  // --last (or no filter given): the most recent render, by the render
  // record's own emission order (it is always written last for its render).
  const lastRenderRecord = [...all].reverse().find((r): r is Extract<TraceRecord, { t: 'render' }> => r.t === 'render')
  if (!lastRenderRecord) {
    return { records: [], errors: ['No completed render record found in the trace'], exitCode: 1 }
  }
  const records = all.filter(r => renderIdOf(r) === lastRenderRecord.render_id)
  return { records, errors: [], exitCode: 0 }
}
