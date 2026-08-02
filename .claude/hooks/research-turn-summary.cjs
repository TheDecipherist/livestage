#!/usr/bin/env node
'use strict';
// OPTIONAL Stop hook for research-assistant mode. Node, no jq dependency.
//
// The enforcement half of the per-turn summary: independently captures a
// one-liner for the turn that just ended, as a backstop for when the
// in-context skill instruction has decayed (after compaction) and the model
// stops logging on its own.
//
// OPT-IN, not registered by default. Best-effort and defensive: it exits 0
// on every failure path, so the worst case is that it adds nothing and the
// skill's own inline logging remains the guaranteed capture. It costs one
// model call per turn while in research mode. Run it async (see SETUP.md) so
// it never adds latency to the next prompt. It dedupes against recent log
// lines, so running it alongside the skill's inline logging will not produce
// double entries. It reads the transcript via a model call, which depends on
// transcript access; verify it behaves on your setup before relying on it.
//
// Data lives in the Claude config dir (CLAUDE_CONFIG_DIR || ~/.claude),
// matching the identical resolution used in the other two hooks.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

try {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }

  let input;
  try { input = JSON.parse(raw); } catch (_) { process.exit(0); }

  const sid = input && input.session_id;
  const tpath = input && input.transcript_path;
  if (!sid || typeof sid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sid)) {
    process.exit(0);
  }

  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const file = path.join(base, 'research-mode', sid + '.md');

  if (!fs.existsSync(file)) process.exit(0);                 // not in research mode
  if (!tpath || !fs.existsSync(tpath)) process.exit(0);

  const today = new Date().toISOString().slice(0, 10);

  let recent = '';
  try {
    recent = fs.readFileSync(file, 'utf8').split('\n').slice(-40).join('\n');
  } catch (_) { process.exit(0); }

  const prompt =
    'Read the JSONL transcript at ' + tpath + ' and look ONLY at the most ' +
    'recent user/assistant exchange. If it contains a concrete decision, a ' +
    'choice between options, a notable finding, or a ruled-out dead end that ' +
    'is NOT already captured in the existing log lines below, output exactly ' +
    'one line in the form:\n- ' + today + ': <one short sentence>\n' +
    'Otherwise output the single word NONE and nothing else.\n\n' +
    'Existing log lines:\n' + recent;

  let out = '';
  try {
    out = execFileSync('claude', ['-p', prompt], {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (_) { process.exit(0); }

  const trimmed = (out || '').trim();
  if (!trimmed || /NONE/.test(trimmed)) process.exit(0);

  const line = trimmed.split('\n').find(function (l) {
    return l.indexOf('- ' + today + ':') === 0;
  });
  if (!line) process.exit(0);

  try { fs.appendFileSync(file, line + '\n'); } catch (_) {}
} catch (_) {}

process.exit(0);
