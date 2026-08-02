#!/usr/bin/env node
'use strict';
// SessionEnd hook for research-assistant mode. Node, no jq dependency.
//
// Deletes this session's research-mode log on a genuine exit so it does not
// leak. Register ONLY with matcher
// "logout|prompt_input_exit|bypass_permissions_disabled", never with "clear"
// or "resume": /clear fires both SessionEnd(clear) and SessionStart(clear),
// and deleting here would wipe the log before SessionStart can re-inject it,
// breaking survival across /clear. See SETUP.md.
//
// Data lives in the Claude config dir (CLAUDE_CONFIG_DIR || ~/.claude),
// matching the identical resolution used in research-session-start.js and
// research-turn-summary.js.

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }

  let input;
  try { input = JSON.parse(raw); } catch (_) { process.exit(0); }

  const sid = input && input.session_id;
  if (!sid || typeof sid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sid)) {
    process.exit(0);
  }

  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const file = path.join(base, 'research-mode', sid + '.md');

  try { fs.rmSync(file, { force: true }); } catch (_) {}
} catch (_) {}

process.exit(0);
