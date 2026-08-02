#!/usr/bin/env node
// Conformance test generator. Deterministic, dependency-free.
// Reads every .claude/rules/*.md frontmatter and emits ONE vitest file asserting
// each rule's machine-checkable invariants against the project.
//
// A rule declares its checks in a `conformance:` block list, one check per line,
// fields separated by ' :: ':
//   conformance:
//     - "ts-strict :: json-key :: tsconfig.json :: compilerOptions.strict :: true"
//     - "sigterm   :: contains :: **/server.{ts,js} :: SIGTERM"
//     - "no-mongoose :: absent :: **/adapters/**/*.ts :: mongoose"
//     - "has-entry :: file-exists :: **/server.ts"
//
// Check kinds:
//   json-key    <file> <dot.key> <expected>  JSON file's key equals expected. FAILS if the file is missing. Never vacuous.
//   contains    <glob> <regex>               EVERY file matching glob must contain regex.
//                                            FAILS when the glob matches no file: a gate whose
//                                            target does not exist must not read as green.
//   some-contains <glob> <regex>             AT LEAST ONE file matching glob contains regex.
//                                            FAILS when the glob matches no file. Use for
//                                            "the app registers X somewhere in this layer"
//                                            (lifecycle handlers, versioned routes), where
//                                            requiring EVERY entry file to contain it is wrong.
//   contains-if-present <glob> <regex>       EVERY matching file must contain regex, but a
//                                            zero-match glob passes. ONLY for genuinely
//                                            optional targets (a worker package a project may
//                                            not have). Prefer contains/some-contains.
//   absent      <glob> <regex>               NO file matching glob may contain regex.
//                                            Vacuous pass allowed ("no file, no violation" is true).
//   file-exists <glob>                       at least one file matches glob. Never vacuous.
//
// Modes:
//   (default)          generate the suite, print summary, warn on vacuous specs
//   --doctor           report every rule and spec with its current match count and
//                      status (ok | VACUOUS | no-spec), write nothing
//   --rules-for <file> the inverse query a human actually asks (mdd-notes 1.0/4.4):
//                      which rules govern this file, and does each of their specs
//                      currently pass. A file matching ZERO rules is reported as
//                      exactly that, never passed over in silence.
//
// The output path auto-detects the project's test root: tests/ then test/,
// falling back to tests/. Confirm your runner's include patterns collect it;
// the /conformance skill offers to extend them if not.
//
// Env overrides for the fixture suite:
//   MDD_RULES_DIR        rules dir     (default .claude/rules)
//   MDD_CONFORMANCE_OUT  output file   (default <testroot>/conformance/rules.conformance.test.ts)
// Prints the generated check count to stdout. Exit 0 on success, 1 on write failure.
'use strict';
const fs = require('fs');
const path = require('path');

const RULES_DIR = process.env.MDD_RULES_DIR || path.join('.claude', 'rules');
const DOCTOR = process.argv.includes('--doctor');
const RULES_FOR_IDX = process.argv.indexOf('--rules-for');
const RULES_FOR = RULES_FOR_IDX !== -1 ? process.argv[RULES_FOR_IDX + 1] : null;

function detectTestRoot() {
  if (fs.existsSync('tests')) return 'tests';
  if (fs.existsSync('test')) return 'test';
  return 'tests';
}
const OUT = process.env.MDD_CONFORMANCE_OUT || path.join(detectTestRoot(), 'conformance', 'rules.conformance.test.ts');

// ---- shared glob machinery (mirrors the generated helpers, used at generation
// time for validation and the doctor report) ----
const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage']);
function walk(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full.split(path.sep).join('/'));
  }
  return out;
}
function globToRe(glob) {
  // {a,b} alternation first, then the star forms.
  let re = glob.replace(/\{([^}]+)\}/g, (_, inner) => '(' + inner.split(',').join('|') + ')');
  re = re.replace(/\./g, '\\.');
  re = re.replace(/\*\*\//g, '\u0000/').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*');
  re = re.replace(/\u0000\//g, '(?:.*/)?').replace(/\u0000/g, '.*');
  return new RegExp('^' + re + '$');
}
let ALL_FILES = null;
function filesMatchingNow(glob) {
  if (ALL_FILES === null) ALL_FILES = walk('.', []).map((p) => (p.startsWith('./') ? p.slice(2) : p));
  const re = globToRe(glob);
  return ALL_FILES.filter((p) => re.test(p));
}

// Minimal frontmatter parser: scalars + block '- x' scalar lists.
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const lines = text.slice(3, end).replace(/^\r?\n/, '').split(/\r?\n/);
  const fm = {};
  const unquote = (s) => s.replace(/^["']|["']$/g, '');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1], val = m[2];
    if (val === '') {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(unquote(lines[j].replace(/^\s*-\s+/, '').trim()));
        j++;
      }
      fm[key] = items;
      i = items.length ? j : i + 1;
    } else {
      fm[key] = unquote(val.trim());
      i++;
    }
  }
  return fm;
}

function coerce(v) {
  if (v === 'true') return 'true';
  if (v === 'false') return 'false';
  if (v !== '' && v != null && !isNaN(Number(v))) return String(Number(v));
  return JSON.stringify(v == null ? '' : String(v));
}
const jsStr = (s) => JSON.stringify(String(s));

// Collect every rule; track those without specs so the doctor can report them.
let ruleFiles = [];
try {
  ruleFiles = fs.readdirSync(RULES_DIR).filter((n) => n.endsWith('.md')).sort();
} catch (_) { ruleFiles = []; }

const rules = [];
const rulesWithoutSpecs = [];
const allRules = [];
for (const name of ruleFiles) {
  let fm = {};
  try { fm = parseFrontmatter(fs.readFileSync(path.join(RULES_DIR, name), 'utf8')); } catch (_) { continue; }
  const specs = Array.isArray(fm.conformance) ? fm.conformance : [];
  const paths = Array.isArray(fm.paths) ? fm.paths : [];
  if (specs.length) rules.push({ rule: name.replace(/\.md$/, ''), specs, paths });
  else rulesWithoutSpecs.push(name.replace(/\.md$/, ''));
  allRules.push({ rule: name.replace(/\.md$/, ''), specs, paths });
}

// Evaluate one spec live against the working tree. Returns [status, detail].
function evalSpec(kind, args) {
  if (kind === 'json-key') {
    try {
      const obj = JSON.parse(fs.readFileSync(args[0], 'utf8'));
      const v = args[1].split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
      const expected = args[2] === 'true' ? true : args[2] === 'false' ? false
        : (!isNaN(Number(args[2])) && args[2] !== '' ? Number(args[2]) : args[2]);
      return [String(v) === String(expected) ? 'PASS' : 'FAIL', `${args[1]}=${JSON.stringify(v)}`];
    } catch { return ['FAIL', `${args[0]} missing or unparseable`]; }
  }
  const files = filesMatchingNow(args[0]);
  if (files.length === 0) {
    if (kind === 'absent' || kind === 'contains-if-present') return ['VACUOUS-PASS', 'glob matches nothing'];
    return ['FAIL', 'glob matches nothing (never vacuous for this kind)'];
  }
  const re = new RegExp(args[1]);
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  if (kind === 'absent') {
    const hit = files.find((f) => re.test(read(f)));
    return hit ? ['FAIL', `violation in ${hit}`] : ['PASS', `${files.length} file(s) clean`];
  }
  if (kind === 'some-contains') {
    return files.some((f) => re.test(read(f)))
      ? ['PASS', 'found'] : ['FAIL', `no file of ${files.length} contains /${args[1]}/`];
  }
  // contains / contains-if-present: every file must contain it
  const miss = files.find((f) => !re.test(read(f)));
  return miss ? ['FAIL', `missing in ${miss}`] : ['PASS', `${files.length} file(s) ok`];
}

// ---- rules-for mode: which rules govern <file>, and do their specs pass ----
if (RULES_FOR) {
  const target = RULES_FOR.replace(/^\.\//, '');
  let matched = 0;
  for (const { rule, specs, paths } of allRules) {
    const hits = paths.filter((g) => globToRe(g).test(target));
    if (hits.length === 0) continue;
    matched++;
    process.stdout.write(`${rule}  (matched by ${hits.join(', ')})\n`);
    if (specs.length === 0) {
      process.stdout.write('  no conformance specs: this rule is advisory only for this file\n');
      continue;
    }
    for (const raw of specs) {
      const parts = String(raw).split(' :: ').map((p) => p.trim());
      const [status, detail] = evalSpec(parts[1], parts.slice(2));
      process.stdout.write(`  ${status.padEnd(12)} ${parts[0]}  (${detail})\n`);
    }
  }
  if (matched === 0) {
    process.stdout.write(`NO RULES match ${target}. If this is a load-bearing file (an entry point, a data adapter), that is a rule-delivery gap: widen a rule's paths or add a rule.\n`);
  }
  process.exit(0);
}

// ---- doctor mode: report and exit ----
if (DOCTOR) {
  let vacuous = 0, ok = 0;
  for (const { rule, specs } of rules) {
    for (const raw of specs) {
      const parts = String(raw).split(' :: ').map((p) => p.trim());
      const id = parts[0], kind = parts[1], target = parts[2];
      if (!id || !kind) continue;
      let n, status;
      if (kind === 'json-key') {
        n = fs.existsSync(target) ? 1 : 0;
        status = n ? 'ok' : 'MISSING FILE (will fail, correctly)';
      } else {
        n = filesMatchingNow(target).length;
        if (n > 0) status = 'ok';
        else if (kind === 'absent' || kind === 'contains-if-present') status = 'vacuous (allowed for this kind)';
        else status = 'VACUOUS: matches nothing, will now FAIL until fixed';
      }
      if (n === 0 && kind !== 'absent' && kind !== 'contains-if-present') vacuous++; else ok++;
      process.stdout.write(`${rule} :: ${id} :: ${kind} :: ${target} -> ${n} file(s) [${status}]\n`);
    }
  }
  for (const r of rulesWithoutSpecs) {
    process.stdout.write(`${r} :: (no conformance block: nothing about this rule is machine-checked)\n`);
  }
  process.stdout.write(`\nsummary: ${ok} live spec(s), ${vacuous} vacuous, ${rulesWithoutSpecs.length} rule(s) with no specs\n`);
  process.exit(0);
}

// ---- generate ----
let checkCount = 0;
let vacuousNow = [];
const blocks = [];
for (const { rule, specs } of rules) {
  const cases = [];
  for (const raw of specs) {
    const parts = String(raw).split(' :: ').map((p) => p.trim());
    const id = parts[0], kind = parts[1], args = parts.slice(2);
    if (!id || !kind) continue;
    let assertion = null;
    if (kind === 'json-key') {
      assertion = `expect(jsonKey(${jsStr(args[0])}, ${jsStr(args[1])})).toEqual(${coerce(args[2])});`;
    } else if (kind === 'contains') {
      // A contains spec whose glob matches nothing FAILS: zero assertions must
      // never read as green (mdd-notes 1.2 / 4.2 / 9.5).
      assertion =
        `const files = filesMatching(${jsStr(args[0])});\n` +
        `    expect(files.length, ${jsStr('glob "' + args[0] + '" matches no files; this spec asserts nothing. Fix the glob or the layout, or use file-exists first.')}).toBeGreaterThan(0);\n` +
        `    expect(everyContains(${jsStr(args[0])}, ${jsStr(args[1])})).toBe(true);`;
      if (filesMatchingNow(args[0]).length === 0) vacuousNow.push(`${rule}:${id} (${args[0]})`);
    } else if (kind === 'some-contains') {
      assertion =
        `const files = filesMatching(${jsStr(args[0])});\n` +
        `    expect(files.length, ${jsStr('glob "' + args[0] + '" matches no files; this spec asserts nothing. Fix the glob or the layout.')}).toBeGreaterThan(0);\n` +
        `    expect(someContains(${jsStr(args[0])}, ${jsStr(args[1])}), ${jsStr('no file matching "' + args[0] + '" contains /' + args[1] + '/')}).toBe(true);`;
      if (filesMatchingNow(args[0]).length === 0) vacuousNow.push(`${rule}:${id} (${args[0]})`);
    } else if (kind === 'contains-if-present') {
      assertion = `expect(everyContains(${jsStr(args[0])}, ${jsStr(args[1])})).toBe(true);`;
    } else if (kind === 'absent') {
      assertion = `expect(noneContains(${jsStr(args[0])}, ${jsStr(args[1])})).toBe(true);`;
    } else if (kind === 'file-exists') {
      assertion = `expect(filesMatching(${jsStr(args[0])}).length).toBeGreaterThan(0);`;
      if (filesMatchingNow(args[0]).length === 0) vacuousNow.push(`${rule}:${id} (${args[0]})`);
    } else {
      continue;
    }
    checkCount++;
    cases.push('  it(' + jsStr(id) + ', () => {\n    ' + assertion + '\n  });');
  }
  if (cases.length) {
    blocks.push('describe(' + jsStr('rule: ' + rule) + ', () => {\n' + cases.join('\n') + '\n});');
  }
}

// Refuse to write a suite in which EVERY spec is vacuous: it would present as
// green while asserting nothing anywhere (mdd-notes 9.5).
if (checkCount > 0 && vacuousNow.length === checkCount) {
  process.stderr.write(
    'conformance-gen: refusing to write a fully vacuous suite. Every spec glob matches zero files:\n  ' +
    vacuousNow.join('\n  ') + '\nFix the globs (see --doctor) and rerun.\n'
  );
  process.exit(1);
}

// Inlined runtime helpers, so the generated file needs only vitest + node built-ins.
const helper = [
  '// AUTO-GENERATED by .claude/hooks/lib/conformance-gen.cjs from .claude/rules. Do not edit.',
  '// Regenerate with /conformance (or: node .claude/hooks/lib/conformance-gen.cjs).',
  "import { describe, it, expect } from 'vitest';",
  "import { readFileSync, readdirSync } from 'node:fs';",
  "import { join, sep } from 'node:path';",
  '',
  "const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage']);",
  '',
  'function walk(dir, out) {',
  '  let entries = [];',
  '  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }',
  '  for (const e of entries) {',
  '    if (IGNORE.has(e.name)) continue;',
  '    const full = join(dir, e.name);',
  '    if (e.isDirectory()) walk(full, out);',
  '    else out.push(full.split(sep).join(\'/\'));',
  '  }',
  '  return out;',
  '}',
  '',
  'function globToRe(glob) {',
  "  let re = glob.replace(/\\{([^}]+)\\}/g, (_, inner) => '(' + inner.split(',').join('|') + ')');",
  "  re = re.replace(/\\./g, '\\\\.');",
  "  re = re.replace(/\\*\\*\\//g, '\\u0000/').replace(/\\*\\*/g, '\\u0000').replace(/\\*/g, '[^/]*');",
  "  re = re.replace(/\\u0000\\//g, '(?:.*/)?').replace(/\\u0000/g, '.*');",
  "  return new RegExp('^' + re + '$');",
  '}',
  '',
  'function filesMatching(glob) {',
  "  const all = walk('.', []).map((p) => (p.startsWith('./') ? p.slice(2) : p));",
  '  const re = globToRe(glob);',
  '  return all.filter((p) => re.test(p));',
  '}',
  '',
  'function jsonKey(file, dotKey) {',
  "  const obj = JSON.parse(readFileSync(file, 'utf8'));",
  "  return dotKey.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);",
  '}',
  '',
  'function everyContains(glob, pattern) {',
  '  const files = filesMatching(glob);',
  '  if (files.length === 0) return true; // guarded by the length assertion generated before each call',
  '  const re = new RegExp(pattern);',
  "  return files.every((f) => re.test(readFileSync(f, 'utf8')));",
  '}',
  '',
  'function someContains(glob, pattern) {',
  '  const files = filesMatching(glob);',
  '  const re = new RegExp(pattern);',
  "  return files.some((f) => re.test(readFileSync(f, 'utf8')));",
  '}',
  '',
  'function noneContains(glob, pattern) {',
  '  const files = filesMatching(glob);',
  '  const re = new RegExp(pattern);',
  "  return files.every((f) => !re.test(readFileSync(f, 'utf8')));",
  '}',
  '',
];

const out = helper.join('\n') + '\n' + (blocks.length ? blocks.join('\n\n') : "describe('rule conformance', () => { it('no conformance specs defined', () => { expect(true).toBe(true); }); });") + '\n';

try {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
} catch (e) {
  process.stderr.write('conformance-gen: write failed: ' + e.message + '\n');
  process.exit(1);
}
if (vacuousNow.length) {
  process.stderr.write(
    'conformance-gen: WARNING, ' + vacuousNow.length + ' spec(s) currently match zero files and will FAIL:\n  ' +
    vacuousNow.join('\n  ') + '\nRun with --doctor for the full report.\n'
  );
}

// A suite the runner never collects is a green light that asserts nothing
// (mdd-notes3 2.3): check OUT against the runner config's explicit include
// patterns and say plainly when they will not pick it up. Best-effort text
// scan; only warns when an explicit include exists and none match (a config
// with no include falls back to the runner's default **/*.test.* collection).
(function checkRunnerCollects() {
  const cfgNames = [
    'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vitest.config.mjs',
    'vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs',
    'jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.json',
  ];
  const cfg = cfgNames.find((n) => fs.existsSync(n));
  if (!cfg) return;
  let text = '';
  try { text = fs.readFileSync(cfg, 'utf8'); } catch { return; }
  // Pull the string entries of an include/testMatch array.
  const m = text.match(/(?:include|testMatch)\s*:\s*\[([^\]]*)\]/);
  if (!m) return;
  const patterns = Array.from(m[1].matchAll(/['"`]([^'"`]+)['"`]/g)).map((x) => x[1]);
  if (!patterns.length) return;
  const rel = path.relative(process.cwd(), OUT).replace(/\\/g, '/');
  const collected = patterns.some((p) => { try { return globToRe(p).test(rel); } catch { return false; } });
  if (!collected) {
    process.stderr.write(
      'conformance-gen: NOT COLLECTED. Wrote ' + rel + ', but ' + cfg + ' includes only [' +
      patterns.join(', ') + '], so the test runner will NEVER run this suite. ' +
      'Extend the include to cover it (or set MDD_CONFORMANCE_OUT to a collected path) before treating conformance as green.\n'
    );
  }
})();
process.stderr.write('conformance-gen: wrote ' + OUT + ' (' + checkCount + ' checks, ' + rulesWithoutSpecs.length + ' rules with no specs). Confirm the test runner collects this path.\n');
process.stdout.write(String(checkCount));
