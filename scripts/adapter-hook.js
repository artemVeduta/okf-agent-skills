/*
 * Thin SessionStart/SubagentStart translator shared by Claude Code and
 * Codex. Reads suite_version from the installed (frozen) manifest, not the
 * live suite, so an upgrade without a matching reinstall fails closed. The
 * claim cycle and presentation policy live in lib/adapters.js, shared with
 * every other harness, which dispatches through the okf-read wrapper. The host
 * session continues either way: this hook always exits 0.
 */
const path = require('node:path');

function readStdin(services) {
  try { return JSON.parse(services.readFile(0)); } catch { return {}; }
}

function logicalCause(payload) {
  if (payload.hook_event_name === 'SubagentStart') return 'subagent-start';
  return typeof payload.source === 'string' ? payload.source : 'unknown';
}

function main() {
  // Loaded here, not at module top: an incomplete installed copy must fail
  // closed through the catch below, not crash the host session.
  const services = require('./lib/services');
  const adapters = require('./lib/adapters');

  const harness = process.argv[2];
  const manifestPath = process.argv[3];
  const targetDir = manifestPath ? path.dirname(manifestPath) : null;
  if (!targetDir || services.exists(path.join(targetDir, '.okf-adapter-disabled'))) return;

  let suiteVersion;
  try { suiteVersion = JSON.parse(services.readFile(manifestPath)).suite_version; } catch { suiteVersion = undefined; }

  const stdin = readStdin(services);
  const payload = {
    cwd: stdin.cwd || process.cwd(),
    harness,
    context_id: stdin.session_id || 'unknown',
    logical_cause: logicalCause(stdin),
    ...(stdin.transcript_path ? { native_event_id: stdin.transcript_path } : {}),
    ...(suiteVersion ? { suite_version: suiteVersion } : {}),
  };

  const outcome = adapters.claimAndDispatch(payload, targetDir, services);
  if (outcome && outcome.kind === 'clean') process.stdout.write(`${outcome.text}\n`);
  else if (outcome && outcome.kind === 'diagnostic') process.stderr.write(`${outcome.text}\n`);
}

process.exitCode = 0;
try { main(); } catch { /* the host session continues; this hook never fails it */ }
