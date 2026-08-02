import { appendFile, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TraceConfig } from './config.js'
import type { TraceRecord } from './span.js'

// Per-path write queues: chains promises so file writes complete in emission order
const fileQueues = new Map<string, Promise<void>>()
const ensuredDirs = new Set<string>()

function enqueueFileWrite(path: string, data: string): void {
  if (!ensuredDirs.has(path)) {
    try { mkdirSync(dirname(path), { recursive: true }) } catch { /* best-effort */ }
    ensuredDirs.add(path)
  }
  const current = fileQueues.get(path) ?? Promise.resolve()
  const next = current.then(
    () => new Promise<void>(resolve => appendFile(path, data, () => resolve()))
  )
  fileQueues.set(path, next)
}

export function emitRecord(record: TraceRecord, config: TraceConfig): void {
  const line = JSON.stringify(record) + '\n'
  if (config.sink === 'stderr') {
    process.stderr.write(line)
    return
  }
  enqueueFileWrite(config.path, line)
}
