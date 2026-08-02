const fs = require('node:fs')
const path = require('node:path')

// Source-file overlap across the doc corpus is a nested-array query:
// "which files does more than one doc claim to own". F-FM-QUERY's where=
// deliberately does not support nested-array frontmatter (feature 36,
// business rule 6); this is exactly the case that routes to @code instead.
// process.cwd(), not __dirname: code-runners.ts copies this script into a
// temp directory before running it (cwd: ctx.docDir), so __dirname would
// resolve to that temp dir, not this example's own directory.
const corpusDir = path.join(process.cwd(), 'corpus')
const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.md'))

const ownersByFile = new Map()
for (const file of files) {
  const raw = fs.readFileSync(path.join(corpusDir, file), 'utf8')
  const idMatch = raw.match(/^id:\s*(.*)$/m)
  const sourceFilesMatch = raw.match(/^source_files:\s*\[(.*)\]$/m)
  if (!idMatch || !sourceFilesMatch) continue
  const id = idMatch[1].trim()
  const sourceFiles = sourceFilesMatch[1].split(',').map(s => s.trim()).filter(Boolean)
  for (const sf of sourceFiles) {
    if (!ownersByFile.has(sf)) ownersByFile.set(sf, [])
    ownersByFile.get(sf).push(id)
  }
}

const overlaps = [...ownersByFile.entries()].filter(([, owners]) => owners.length > 1)

if (overlaps.length === 0) {
  console.log('No source-file overlap across the corpus.')
} else {
  console.log(['file', 'owners'].join('\t'))
  for (const [file, owners] of overlaps) {
    console.log([file, owners.join(', ')].join('\t'))
  }
}
