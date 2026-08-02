#!/usr/bin/env node
// MDD workspace scaffolder. Deterministic, dependency-free, idempotent.
// Guarantees .mdd and its essential files exist so any MDD command can run in a
// bare project without landing in a half-formed workspace. Creates only what is
// missing and NEVER overwrites an existing file, so user edits and prior state
// are always safe. This is the single definition of the minimal MDD scaffold:
// /mdd-init and every command's first-run guard both call it.
//
// Env overrides (for tests):
//   MDD_DIR   the workspace dir (default ".mdd", resolved from cwd = project root)
//
// Prints "mdd: initialized workspace" plus one line per item created, and is
// silent when the workspace was already complete. Always exits 0.
'use strict';
const fs = require('fs');
const path = require('path');

const MDD_DIR = process.env.MDD_DIR || '.mdd';
const TPL = path.join(__dirname, 'templates');

const created = [];

function ensureDir(p) {
  if (fs.existsSync(p)) return;
  try { fs.mkdirSync(p, { recursive: true }); created.push(p + '/'); } catch (_) {}
}

function ensureFromTemplate(dest, tplName) {
  if (fs.existsSync(dest)) return;
  let content;
  try { content = fs.readFileSync(path.join(TPL, tplName), 'utf8'); }
  catch (_) { return; } // template missing: skip rather than crash
  try { fs.writeFileSync(dest, content); created.push(dest); } catch (_) {}
}

function ensureFile(dest, content) {
  if (fs.existsSync(dest)) return;
  try { fs.writeFileSync(dest, content); created.push(dest); } catch (_) {}
}

ensureDir(MDD_DIR);
ensureDir(path.join(MDD_DIR, 'docs'));
ensureDir(path.join(MDD_DIR, 'waves'));
ensureDir(path.join(MDD_DIR, 'specs'));

ensureFromTemplate(path.join(MDD_DIR, '00-frontmatter-spec.md'), '00-frontmatter-spec.md');
ensureFromTemplate(path.join(MDD_DIR, '.startup.md'), 'startup.md');

ensureFile(
  path.join(MDD_DIR, '.state.json'),
  JSON.stringify(
    { phase: 'idle', feature: null, branch: null, test_files: [], gate: 'none',
      updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') },
    null, 2
  ) + '\n'
);

// Two directories that must never reach a commit: .ai_temp/ (agent scratch
// space, exempt from the branch guard only) and .worktrees/ (parallel feature
// builds during /plan-execute). Ensure the gitignore entries exist;
// append-only, never rewrites the file.
try {
  const gi = '.gitignore';
  let cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const added = [];
  if (!/^[.!]?\.?ai_temp\/?\s*$/m.test(cur) && !/^\.ai_temp\//m.test(cur)) {
    cur = cur + (cur === '' || cur.endsWith('\n') ? '' : '\n') + '.ai_temp/\n';
    added.push('.ai_temp/');
  }
  if (!/^\.worktrees\/?\s*$/m.test(cur)) {
    cur = cur + (cur.endsWith('\n') ? '' : '\n') + '.worktrees/\n';
    added.push('.worktrees/');
  }
  if (added.length) {
    fs.writeFileSync(gi, cur);
    created.push('.gitignore (+' + added.join(' +') + ')');
  }
} catch (_) {}

if (created.length) {
  process.stdout.write(
    'mdd: initialized workspace\n' + created.map((c) => '  created ' + c).join('\n') + '\n'
  );
}
process.exit(0);
