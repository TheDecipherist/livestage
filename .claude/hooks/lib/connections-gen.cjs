#!/usr/bin/env node
// Connections generator. Deterministic, dependency-free.
// Reads every .mdd/docs/*.md frontmatter (never bodies, never archive/) and writes
// .mdd/connections.md: path tree, Mermaid dependency graph, source-file overlap, and
// structural warnings. This is a pure function of the frontmatter, which is exactly why
// it belongs in a script a hook can run rather than in a skill that must remember to.
//
// All external state is env-overridable so the fixture suite can drive it:
//   MDD_DOCS         docs dir            (default .mdd/docs)
//   MDD_CONNECTIONS  output file         (default .mdd/connections.md)
//   MDD_GEN_DATE     the generated: date (default today, set in tests for a stable diff)
//
// Prints the warning count to stdout. Exits 0 on success, 1 only on a write failure.
'use strict';
const fs = require('fs');
const path = require('path');

const DOCS = process.env.MDD_DOCS || path.join('.mdd', 'docs');
const OUT = process.env.MDD_CONNECTIONS || path.join('.mdd', 'connections.md');
const DATE = process.env.MDD_GEN_DATE || new Date().toISOString().slice(0, 10);

// Minimal YAML frontmatter parser: scalars, inline [a, b] lists, and block "- x" lists.
// Enough for the connection fields; it never needs nested objects.
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const lines = text.slice(3, end).replace(/^\r?\n/, '').split(/\r?\n/);
  const fm = {};
  const unquote = (s) => s.replace(/^["']|["']$/g, '').trim();
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const val = m[2];
    if (val === '') {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(unquote(lines[j].replace(/^\s*-\s+/, '').trim()));
        j++;
      }
      fm[key] = items.length ? items : '';
      i = items.length ? j : i + 1;
      continue;
    } else if (val.startsWith('[')) {
      const inner = val.replace(/^\[/, '').replace(/\]$/, '').trim();
      fm[key] = inner ? inner.split(',').map((s) => unquote(s)).filter(Boolean) : [];
    } else {
      fm[key] = unquote(val);
      i++;
      continue;
    }
    i++;
  }
  return fm;
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const nodeId = (id) => id.replace(/[^A-Za-z0-9]/g, '_');
function statusClass(s) {
  s = (s || '').toLowerCase();
  if (s === 'done' || s === 'complete') return 'done';
  if (s === 'active' || s === 'in_progress') return 'active';
  if (s === 'planned' || s === 'draft') return 'planned';
  if (s === 'deprecated' || s === 'archived') return 'deprecated';
  return 'planned';
}

// Load docs (top level only; archive/ is a subdir and is skipped).
let files = [];
try {
  files = fs.readdirSync(DOCS, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
} catch (_) {
  // No docs dir: write an empty map rather than failing, so the artifact always exists.
}

const docs = [];
for (const name of files) {
  let fm = {};
  try { fm = parseFrontmatter(fs.readFileSync(path.join(DOCS, name), 'utf8')); } catch (_) { fm = {}; }
  const id = (fm.id || name.replace(/\.md$/, '')).toString();
  docs.push({
    id,
    title: (fm.title || id).toString(),
    status: (fm.status || 'unknown').toString(),
    path: fm.path ? fm.path.toString() : '',
    depends_on: asList(fm.depends_on),
    source_files: asList(fm.source_files),
  });
}
docs.sort((a, b) => a.id.localeCompare(b.id));
const ids = new Set(docs.map((d) => d.id));

// Path tree, grouped by path, docs sorted by id within a path.
const groups = new Map();
for (const d of docs) {
  const key = d.path || '(no path)';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(d);
}
const treeLines = [];
for (const p of [...groups.keys()].sort()) {
  treeLines.push(`**${p}**`);
  const members = groups.get(p).sort((a, b) => a.id.localeCompare(b.id));
  members.forEach((d, idx) => {
    const branch = idx === members.length - 1 ? '└──' : '├──';
    treeLines.push(`  ${branch} \`${d.id}\` - ${d.title} (${d.status})`);
  });
}

// Dependency graph.
const edges = [];
for (const d of docs) for (const dep of d.depends_on) edges.push([d.id, dep]);
edges.sort((a, b) => (a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])));
// Only edges to existing docs are drawn and counted; broken ones are flagged as warnings.
const validEdges = edges.filter(([, to]) => ids.has(to));
const graphLines = ['```mermaid', 'graph TD'];
graphLines.push('  classDef planned fill:#aaa,stroke:#666,color:#000');
graphLines.push('  classDef active fill:#ffd700,stroke:#b8860b,color:#000');
graphLines.push('  classDef done fill:#00e5cc,stroke:#008080,color:#000');
graphLines.push('  classDef deprecated fill:#f44,stroke:#a00,color:#fff');
for (const d of docs) graphLines.push(`  ${nodeId(d.id)}["${d.id}"]:::${statusClass(d.status)}`);
for (const [from, to] of validEdges) graphLines.push(`  ${nodeId(from)} --> ${nodeId(to)}`);
graphLines.push('```');

// Source-file overlap: files referenced by 2+ docs.
const fileMap = new Map();
for (const d of docs) for (const f of d.source_files) {
  if (!fileMap.has(f)) fileMap.set(f, []);
  fileMap.get(f).push(d.id);
}
const overlaps = [...fileMap.entries()]
  .filter(([, refs]) => refs.length >= 2)
  .sort((a, b) => a[0].localeCompare(b[0]));

// Warnings: broken deps, missing path, circular deps.
const warnings = [];
for (const d of docs) {
  for (const dep of d.depends_on) {
    if (!ids.has(dep)) warnings.push(`broken depends_on: ${d.id} references ${dep} (no such doc)`);
  }
  if (!d.path) warnings.push(`missing path: ${d.id}`);
}
// Cycle detection over the depends_on graph (only edges to existing docs).
const adj = new Map(docs.map((d) => [d.id, d.depends_on.filter((x) => ids.has(x))]));
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map(docs.map((d) => [d.id, WHITE]));
const stack = [];
const seenCycles = new Set();
function dfs(u) {
  color.set(u, GRAY);
  stack.push(u);
  for (const v of adj.get(u) || []) {
    if (color.get(v) === GRAY) {
      const from = stack.indexOf(v);
      const cyc = stack.slice(from).concat(v);
      const key = [...cyc].sort().join('|');
      if (!seenCycles.has(key)) {
        seenCycles.add(key);
        warnings.push(`circular dependency: ${cyc.join(' -> ')}`);
      }
    } else if (color.get(v) === WHITE) {
      dfs(v);
    }
  }
  stack.pop();
  color.set(u, BLACK);
}
for (const d of docs) if (color.get(d.id) === WHITE) dfs(d.id);
warnings.sort();

// Assemble.
const out = [];
out.push('---');
out.push(`generated: ${DATE}`);
out.push(`doc_count: ${docs.length}`);
out.push(`connection_count: ${validEdges.length}`);
out.push(`overlap_count: ${overlaps.length}`);
out.push('---');
out.push('');
out.push('# MDD Connections');
out.push('');
out.push('## Path Tree');
out.push('');
out.push(treeLines.length ? treeLines.join('\n') : '(no docs)');
out.push('');
out.push('## Dependency Graph');
out.push('');
out.push(graphLines.join('\n'));
out.push('');
out.push('## Source File Overlap');
out.push('');
out.push('Files referenced by 2+ docs:');
out.push('');
if (overlaps.length) {
  for (const [f, refs] of overlaps) out.push(`- \`${f}\` - ${[...refs].sort().join(', ')}`);
} else {
  out.push('(none)');
}
out.push('');
out.push('## Warnings');
out.push('');
out.push(warnings.length ? warnings.map((w) => `- ${w}`).join('\n') : '(none)');
out.push('');

try {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out.join('\n'));
} catch (e) {
  process.stderr.write(`connections-gen: write failed: ${e.message}\n`);
  process.exit(1);
}
process.stdout.write(String(warnings.length));
