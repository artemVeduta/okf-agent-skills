/*
 * Thin SessionStart/SubagentStart translator shared by Claude Code and
 * Codex. Reads suite_version from the installed (frozen) manifest, not the
 * live suite, so an upgrade without a matching reinstall fails closed. The
 * claim cycle and presentation policy live in lib/adapters.js, shared with
 * every other harness, and dispatch happens in-process there. The host
 * session continues either way: this hook always exits 0.
 */
const path = require('node:path');
const services = require('./lib/services');
const adapters = require('./lib/adapters');

function readStdin() {
  try { return JSON.parse(services.readFile(0)); } catch { return {}; }
}

function logicalCause(payload) {
  if (payload.hook_event_name === 'SubagentStart') return 'subagent-start';
  return typeof payload.source === 'string' ? payload.source : 'unknown';
}

function main() {
  process.exitCode = 0;
  const harness = process.argv[2];
  const manifestPath = process.argv[3];
  const targetDir = manifestPath ? path.dirname(manifestPath) : null;
  if (!targetDir || services.exists(path.join(targetDir, '.okf-adapter-disabled'))) return;

  let suiteVersion;
  try { suiteVersion = JSON.parse(services.readFile(manifestPath)).suite_version; } catch { suiteVersion = undefined; }

  const stdin = readStdin();
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

main();
