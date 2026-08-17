// Gate 2: hand-edited generated files. An agent edits README.md/CLAUDE.md
// (or any future generated .md) directly because running the generator
// is one more tool call. The file looks right and is no longer a render.
//
// Finds every .md file anywhere in the repo carrying the
// livestage:generated metadata block (Part 5.1, engine/generated-metadata.ts)
// and asserts each one's committed content still matches a fresh render
// of its declared source. A NEW generated file joins this contract
// automatically the moment it adopts the metadata block, no gate update
// needed, exactly the point: the three existing readme:check/
// claude-md:check/examples:check gates only know about the specific
// files someone remembered to name.
//
// Reuses the SAME parsing/hashing/render machinery the hook itself uses
// (dist/engine/generated-metadata.js, dist/cli/cli.js), required by
// absolute path rather than a bare specifier: @code copies this script
// into an isolated tmpdir with no node_modules and no sibling files, but
// the spawned process's own cwd stays at this .stage document's
// directory (see unused-exports.js's own header comment for the same
// gotcha), so an absolute path built from process.cwd() finds the real
// compiled files without needing node's module-resolution algorithm at
// all.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const REPO_ROOT = path.resolve(process.cwd(), '..', '..')
const GATE_DIR = process.cwd()
const CLI_ENTRY = path.join(REPO_ROOT, 'dist', 'cli', 'cli.js')

const {
  parseGeneratedMetadata, stripGeneratedMetadataBlock, recomputeContentHash,
} = require(path.join(REPO_ROOT, 'dist', 'engine', 'generated-metadata.js'))

function walkMdFiles(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.ai_temp') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMdFiles(full, out)
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

function checkOneFile(mdPath) {
  const rel = path.relative(REPO_ROOT, mdPath)
  const committed = fs.readFileSync(mdPath, 'utf8')
  const metadata = parseGeneratedMetadata(committed)
  if (!metadata || !metadata.livestage_source) return null // not a generated file, gate 2 has nothing to say about it

  const mdDir = path.dirname(mdPath)
  const sourcePath = path.resolve(mdDir, metadata.livestage_source)
  if (!fs.existsSync(sourcePath)) {
    return { file: rel, source: metadata.livestage_source, ok: false, reason: `declared source not found: ${metadata.livestage_source}` }
  }

  let freshBody
  try {
    freshBody = execFileSync('node', [CLI_ENTRY, 'render', path.relative(mdDir, sourcePath) || path.basename(sourcePath)], { cwd: mdDir, encoding: 'utf8' })
  } catch (err) {
    return { file: rel, source: metadata.livestage_source, ok: false, reason: `source failed to render: ${String(err.message || err)}` }
  }

  const freshNormalized = `${(freshBody.endsWith('\n') ? freshBody : `${freshBody}\n`).trim()}\n`
  const committedBody = `${stripGeneratedMetadataBlock(committed).trim()}\n`
  if (freshNormalized !== committedBody) {
    return { file: rel, source: metadata.livestage_source, ok: false, reason: 'committed content does not match a fresh render, hand-edited or stale' }
  }

  // Content matches; also sanity-check the RECORDED hash is still
  // reproducible (catches a metadata block that was hand-typed to look
  // plausible without ever running the real generator).
  const recomputed = recomputeContentHash(metadata, mdDir)
  if (recomputed !== null && metadata.livestage_content_hash && recomputed !== metadata.livestage_content_hash) {
    return { file: rel, source: metadata.livestage_source, ok: false, reason: 'content matches but the recorded livestage_content_hash does not reproduce, the metadata block itself looks hand-written' }
  }

  return { file: rel, source: metadata.livestage_source, ok: true, reason: null }
}

function main() {
  const mdFiles = walkMdFiles(REPO_ROOT, [])
  const results = mdFiles.map(checkOneFile).filter(Boolean)

  const problems = results.filter(r => !r.ok).map(r => `${r.file} (source: ${r.source}): ${r.reason}`)

  const report = {
    pass: problems.length === 0,
    generatedFileCount: results.length,
    results,
    problems,
  }
  fs.writeFileSync(path.join(GATE_DIR, 'report.json'), JSON.stringify(report, null, 2))

  const header = '| file | source | status |\n|---|---|---|'
  const rows = results.map(r => `| ${r.file} | ${r.source} | ${r.ok ? 'OK' : `FAIL: ${r.reason}`} |`).join('\n')
  const table = results.length > 0 ? `${header}\n${rows}` : '_(no generated .md files found, nothing carries the livestage:generated contract yet)_'

  process.stdout.write(JSON.stringify({ ...report, table }))
}

main()
