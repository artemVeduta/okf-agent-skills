/*
 * OpenCode plugin: injects orientation only through the awaited
 * `chat.system.transform` hook; `session.created`/`session.compacted` only
 * advance a generation counter, and the next eligible transform claims it.
 *
 * Installed one level below the adapter's target directory, so every other
 * adapter-owned path resolves relative to the parent directory, not `__dirname`.
 */
const path = require('node:path');
const fs = require('node:fs');

const targetRoot = path.join(__dirname, '..');

function disabled() {
  return fs.existsSync(path.join(targetRoot, '.okf-adapter-disabled'));
}

function suiteVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(targetRoot, 'manifest.json'), 'utf8')).suite_version; } catch { return undefined; }
}

module.exports = async ({ directory }) => {
  let generation = 0;

  return {
    event: async ({ event }) => {
      if (event.type === 'session.created' || event.type === 'session.compacted') generation += 1;
    },
    'chat.system.transform': async (_input, output) => {
      if (disabled()) return;
      // An incomplete installed copy fails closed here, never into the host session.
      let outcome;
      try {
        const lib = path.join(targetRoot, 'okf-agent-skills', 'scripts', 'lib');
        const adapters = require(path.join(lib, 'adapters'));
        const services = require(path.join(lib, 'services'));

        const version = suiteVersion();
        const payload = {
          cwd: directory, harness: 'opencode', context_id: String(generation), logical_cause: 'system-transform',
          ...(version ? { suite_version: version } : {}),
        };
        outcome = adapters.claimAndDispatch(payload, targetRoot, services);
      } catch { return; }
      if (outcome && outcome.kind === 'clean') output.system.push(outcome.text);
      else if (outcome && outcome.kind === 'diagnostic') process.stderr.write(`${outcome.text}\n`);
    },
  };
};
