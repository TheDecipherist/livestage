// Shared content-hashing primitive: a SHA-256 over a set of files' paths
// and contents, sorted so filesystem iteration order never changes the
// result. First built for @code's cache-key= (Part 5 of the class 3
// composition session), reused here (Part 5 of feat/drift-gates,
// livestage_content_hash) rather than writing a second hasher, per that
// feature's own instruction.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export function hashFileSet(files: string[]): string {
  const hash = createHash('sha256')
  for (const f of [...files].sort()) {
    hash.update(f)
    try {
      hash.update(readFileSync(f))
    } catch {
      // File vanished between being listed and being read; its absence
      // is already reflected in the path list itself, nothing more to
      // hash for it.
    }
  }
  return hash.digest('hex')
}
