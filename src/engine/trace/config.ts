import { join } from 'node:path'

export type TraceConfig =
  | { sink: 'stderr' }
  | { sink: 'file'; path: string }

function defaultTracePath(cwd: string): string {
  const date = new Date().toISOString().slice(0, 10)  // yyyy-mm-dd
  return join(cwd, '.livestage', 'trace', `${date}.jsonl`)
}

/**
 * Resolve the trace sink for this render. Tracing is on by default (a daily
 * JSONL file under `.livestage/trace/`, the one cross-invocation artifact
 * CR-4 permits), not opt-in: `LIVESTAGE_TRACE` overrides it (`off` / `0` /
 * `false` disables entirely, `stderr` switches sinks, `file:<path>` pins an
 * exact path). There is no `http` sink: that is the event-transport
 * subsystem, excluded wholesale at seed: a trace writer that could POST
 * spans to a URL is the same shape of dependency this build does not carry.
 */
export function parseTraceConfig(value: string | undefined, cwd: string): TraceConfig | null {
  const v = value?.trim()
  if (v === undefined || v === '') return { sink: 'file', path: defaultTracePath(cwd) }
  if (v === 'off' || v === '0' || v === 'false') return null
  if (v === 'true' || v === '1' || v === 'stderr') return { sink: 'stderr' }
  if (v.startsWith('file:')) {
    const path = v.slice(5)
    if (!path) {
      process.stderr.write('LIVESTAGE_TRACE warning: file sink requires a path (e.g. file:/tmp/trace.jsonl), tracing disabled\n')
      return null
    }
    return { sink: 'file', path }
  }
  process.stderr.write(`LIVESTAGE_TRACE warning: unrecognized sink value "${v}", tracing disabled\n`)
  return null
}
