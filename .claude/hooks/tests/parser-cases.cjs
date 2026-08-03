'use strict';
// Frontmatter parser battery. Every accepted writing style gets a case, plus
// the loud-failure cases. Run directly (node parser-cases.cjs) or via
// run-all.sh. Prints "  PASS parser :: name" / "  FAIL parser :: name",
// exits 1 on any failure.
const { parseFrontmatter } = require('../lib/fm-parse.cjs');

let pass = 0, fail = 0;
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function t(name, yaml, check) {
  const doc = `---\n${yaml}\n---\nbody\n`;
  let r;
  try { r = parseFrontmatter(doc); } catch (e) {
    console.log(`  FAIL  parser :: ${name} (threw: ${e.message})`); fail++; return;
  }
  const err = check(r);
  if (err) { console.log(`  FAIL  parser :: ${name} (${err})`); fail++; }
  else { console.log(`  PASS  parser :: ${name}`); pass++; }
}
const noProblems = (r) => r.problems.length ? `problems: ${JSON.stringify(r.problems)}` : null;

// 1. plain scalars, quotes, colons and # inside quotes, comments
t('scalars: bare, quoted, colon and hash inside quotes, comments', `
id: 07-parser
title: "Parser: the core"  # trailing comment
note: 'it''s fine'
# full-line comment
flag: true
`.trim(), (r) => noProblems(r)
  || (r.fields.title !== 'Parser: the core' && 'title mangled')
  || (r.fields.note !== "it's fine" && 'single-quote escape broken')
  || (r.fields.flag !== true && 'boolean not coerced') || null);

// 2. inline array, single line
t('inline array single line', `tags: [auth, "session cache", tokens]`,
  (r) => noProblems(r) || (!eq(r.fields.tags, ['auth', 'session cache', 'tokens']) && `got ${JSON.stringify(r.fields.tags)}`) || null);

// 3. inline array spanning multiple lines (the line-94 class bug)
t('inline array across multiple lines', `
source_files: [src/a.ts,
  src/b.ts,
  src/c.ts]
`.trim(), (r) => noProblems(r) || (!eq(r.fields.source_files, ['src/a.ts', 'src/b.ts', 'src/c.ts']) && `got ${JSON.stringify(r.fields.source_files)}`) || null);

// 4. block list of scalars
t('block list of scalars', `
source_files:
  - src/a.ts
  - src/b.ts
`.trim(), (r) => noProblems(r) || (!eq(r.fields.source_files, ['src/a.ts', 'src/b.ts']) && 'wrong items') || null);

// 5. wrapped prose in a block list item (the truncation bug)
t('wrapped known_issues entry keeps its whole text', `
known_issues:
  - "[gap] Purpose and business rules inferred from code by
    /reverse-engineer, not confirmed by a human"
`.trim(), (r) => noProblems(r)
  || (r.fields.known_issues[0] !== '[gap] Purpose and business rules inferred from code by /reverse-engineer, not confirmed by a human'
      && `got: ${JSON.stringify(r.fields.known_issues[0])}`) || null);

// 6. object list keeps EVERY key (the strips-every-key-but-first bug)
t('object list keeps all keys', `
primitives:
  - name: "@list"
    kind: directive
  - name: render
    kind: cli-verb
`.trim(), (r) => noProblems(r)
  || (!eq(r.fields.primitives, [{ name: '@list', kind: 'directive' }, { name: 'render', kind: 'cli-verb' }])
      && `got ${JSON.stringify(r.fields.primitives)}`) || null);

// 7. five-key contract objects with empty and wrapped values
t('satisfies_contracts full objects', `
satisfies_contracts:
  - from: 04-db
    function: resolveColumn
    when: always
    status: done
    verified_at: tests/core/x.test.ts:12
`.trim(), (r) => noProblems(r)
  || (Object.keys(r.fields.satisfies_contracts[0]).length !== 5 && 'lost keys')
  || (r.fields.satisfies_contracts[0].verified_at !== 'tests/core/x.test.ts:12' && 'value mangled') || null);

// 8. flow style objects in a list (now VALID, previously "do not parse")
t('flow-style object items', `
primitives:
  - { name: "@list", kind: directive }
  - {name: render, kind: cli-verb}
`.trim(), (r) => noProblems(r)
  || (!eq(r.fields.primitives, [{ name: '@list', kind: 'directive' }, { name: 'render', kind: 'cli-verb' }])
      && `got ${JSON.stringify(r.fields.primitives)}`) || null);

// 9. flow mapping as a top-level value, nested flow
t('nested flow value', `meta: {owner: tim, files: [a.ts, b.ts]}`,
  (r) => noProblems(r)
  || (!eq(r.fields.meta, { owner: 'tim', files: ['a.ts', 'b.ts'] }) && `got ${JSON.stringify(r.fields.meta)}`) || null);

// 10. literal and folded block scalars
t('literal | and folded > scalars', `
data_flow: >
  request hits the route,
  service resolves, repo reads
script: |-
  line one
  line two
`.trim(), (r) => noProblems(r)
  || (r.fields.data_flow !== 'request hits the route, service resolves, repo reads' && `folded got ${JSON.stringify(r.fields.data_flow)}`)
  || (r.fields.script !== 'line one\nline two' && `literal got ${JSON.stringify(r.fields.script)}`) || null);

// 11. plain scalar line folding on a top-level key
t('plain scalar folds across lines', `
title: a very long title that
  wraps onto the next line
`.trim(), (r) => noProblems(r) || (r.fields.title !== 'a very long title that wraps onto the next line' && `got ${JSON.stringify(r.fields.title)}`) || null);

// 12. blank lines and CRLF
t('blank lines inside blocks and CRLF endings', `tags:\r\n  - one\r\n\r\n  - two\r\nid: x\r`,
  (r) => noProblems(r) || (!eq(r.fields.tags, ['one', 'two']) && 'blank line broke the list') || (r.fields.id !== 'x' && 'CRLF broke scalar') || null);

// 13. nested block mapping under an object item
t('nested mapping inside a list item', `
items:
  - name: a
    meta:
      depth: 2
      kind: nested
`.trim(), (r) => noProblems(r)
  || (!eq(r.fields.items[0].meta, { depth: '2', kind: 'nested' }) && `got ${JSON.stringify(r.fields.items[0])}`) || null);

// 14. empty inline array and empty block key
t('empty values', `
tags: []
known_issues:
id: y
`.trim(), (r) => noProblems(r) || (!eq(r.fields.tags, []) && 'empty inline') || (r.fields.id !== 'y' && 'key after empty block lost') || null);

// 15. LOUD: anchors are a problem, not a silent skip
t('anchors are rejected loudly', `base: &anchor value`,
  (r) => (r.problems.length === 0 ? 'anchor accepted silently' : null));

// 16. LOUD: junk line is a problem, not a drop
t('junk line is recorded, not dropped', `
id: z
:::: what is this
`.trim(), (r) => (r.problems.length === 0 ? 'junk silently dropped' : null));

// 17. LOUD: unclosed flow
t('unclosed flow mapping is a problem', `meta: {a: 1`,
  (r) => (r.problems.length === 0 ? 'unclosed flow accepted' : null));

// 18. no frontmatter at all
t('missing frontmatter returns null', '', () => null); // special-cased below
{
  const r = parseFrontmatter('no frontmatter here');
  if (r === null) { console.log('  PASS  parser :: null on missing block'); pass++; }
  else { console.log('  FAIL  parser :: null on missing block'); fail++; }
}

// 19. wrapped quoted list entry whose continuation lines start with
// word+colon (the five-real-docs bug: "predicted:", "dead:", "this:"
// mid-sentence stopped the fold and produced a false parse problem)
t('quoted wrap survives key-shaped continuation lines', `
known_issues:
  - "[gap] B3: whereMatches broke.
    predicted: whereMatches only ever ran against cached rows,
    dead: every current v2.0 call path"
  - second entry
`.trim(), (r) => noProblems(r)
  || (r.fields.known_issues.length !== 2 && `got ${r.fields.known_issues.length} entries`)
  || (r.fields.known_issues[0] !== '[gap] B3: whereMatches broke. predicted: whereMatches only ever ran against cached rows, dead: every current v2.0 call path'
      && `got: ${JSON.stringify(r.fields.known_issues[0])}`) || null);

// 20. same shape on a top-level quoted scalar value
t('top-level quoted scalar folds past a key-shaped line', `
note: "long explanation
  this: swap the JSON read for the v2 shape"
id: q
`.trim(), (r) => noProblems(r)
  || (r.fields.note !== 'long explanation this: swap the JSON read for the v2 shape' && `note got ${JSON.stringify(r.fields.note)}`)
  || (r.fields.id !== 'q' && 'key after the quoted value was swallowed') || null);

// 21. REGRESSION GUARD: a plain scalar with an apostrophe must NOT be
// treated as an open quote (a parity counter would eat the next key here)
t('apostrophe in a plain scalar does not open a quote context', `
title: it's a long story
id: apo
tags: [a]
`.trim(), (r) => noProblems(r)
  || (r.fields.title !== "it's a long story" && `title got ${JSON.stringify(r.fields.title)}`)
  || (r.fields.id !== 'apo' && 'apostrophe swallowed the id key') || null);

// 22. single-quoted wrap with a doubled '' escape inside, closing later
t('single-quoted wrap with escaped quote closes correctly', `
known_issues:
  - '[deferred] it''s wrapped and
    resolves: only after the cache lands'
id: sq
`.trim(), (r) => noProblems(r)
  || (r.fields.known_issues[0] !== "[deferred] it's wrapped and resolves: only after the cache lands"
      && `got ${JSON.stringify(r.fields.known_issues[0])}`)
  || (r.fields.id !== 'sq' && 'key after the entry was swallowed') || null);

console.log(`parser battery: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
