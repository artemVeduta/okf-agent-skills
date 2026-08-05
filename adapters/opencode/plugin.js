/*
 * OpenCode plugin: injects orientation only through the awaited
 * `chat.system.transform` hook; `session.created`/`session.compacted` only
 * advance a generation counter, and the next eligible transform claims it.
 * The claim cycle and presentation policy live in lib/adapters.js, shared
 * with every other harness. A disabled install (`.okf-adapter-disabled`)
 * is a no-op.
 */
const path = require('node:path');
const fs = require('node:fs');

const SUITE_ROOT = '__OKF_SUITE_ROOT__';

function disabled() {
  return fs.existsSync(path.join(__dirname, '.okf-adapter-disabled'));
}

function suiteVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')).suite_version; } catch { return undefined; }
}

module.exports = async ({ directory }) => {
  let generation = 0;

  return {
    event: async ({ event }) => {
      if (event.type === 'session.created' || event.type === 'session.compacted') generation += 1;
    },
    'chat.system.transform': async (_input, output) => {
      if (disabled()) return;
      const adapters = require(path.join(SUITE_ROOT, 'scripts', 'lib', 'adapters'));
      const services = require(path.join(SUITE_ROOT, 'scripts', 'lib', 'services'));

      const version = suiteVersion();
      const payload = {
        cwd: directory, harness: 'opencode', context_id: String(generation), logical_cause: 'system-transform',
        ...(version ? { suite_version: version } : {}),
      };
      const outcome = adapters.claimAndDispatch(payload, __dirname, services);
      if (outcome && outcome.kind === 'clean') output.system.push(outcome.text);
      else if (outcome && outcome.kind === 'diagnostic') process.stderr.write(`${outcome.text}\n`);
    },
  };
};
