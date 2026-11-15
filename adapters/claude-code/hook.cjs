#!/usr/bin/env node
// Keep unbound Agent calls independent of the Methodical runtime.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const input = fs.readFileSync(0, 'utf8');
let event;
try { event = JSON.parse(input); } catch { process.stderr.write('Methodical: malformed native hook JSON\n'); process.exit(2); }
const marked = JSON.stringify(event.tool_input ?? {}).includes('[methodical-intent');
if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name) && !marked) process.exit(0);
if (event.hook_event_name === 'Stop' &&
    (typeof event.cwd !== 'string' || !fs.existsSync(path.join(event.cwd, '.methodical/worker-guard.json')))) process.exit(0);
if (event.hook_event_name === 'PermissionRequest') process.exit(0);
if (event.hook_event_name === 'SubagentStop' &&
    (typeof event.cwd !== 'string' || !fs.existsSync(path.join(event.cwd, '.methodical/routing-state.json')))) process.exit(0);
const pluginRoot = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(pluginRoot, 'runtime/src/cli.js'), 'hook', 'claude-code', pluginRoot],
  {input, encoding: 'utf8', maxBuffer: 1024 * 1024, env: process.env});
if (result.status !== 0 || result.error) {
  process.stderr.write('Methodical native hook stopped: ' + (result.stderr || result.error?.message || 'runtime unavailable') + '\n');
  process.exit(event.hook_event_name === 'PreToolUse' && marked ? 2 : 1);
}
process.stdout.write(result.stdout);
