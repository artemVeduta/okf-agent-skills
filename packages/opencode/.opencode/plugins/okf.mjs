import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');
const skillsDir = path.resolve(pkgRoot, 'skills');

function disabled() {
  return fs.existsSync(path.join(pkgRoot, '.okf-adapter-disabled'));
}

function suiteVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(pkgRoot, 'manifest.json'), 'utf8')).suite_version; } catch { return undefined; }
}

export default async ({ directory }) => {
  let generation = 0;

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }
    },
    event: async ({ event }) => {
      if (event.type === 'session.created' || event.type === 'session.compacted') generation += 1;
    },
    'experimental.chat.system.transform': async (_input, output) => {
      if (disabled()) return;
      let outcome;
      try {
        const lib = path.join(pkgRoot, 'scripts', 'lib');
        const adapters = require(path.join(lib, 'adapters.js'));
        const services = require(path.join(lib, 'services.js'));

        const version = suiteVersion();
        const payload = {
          cwd: directory, harness: 'opencode', context_id: String(generation), logical_cause: 'system-transform',
          ...(version ? { suite_version: version } : {}),
        };
        outcome = adapters.claimAndDispatch(payload, pkgRoot, services);
      } catch { return; }
      if (outcome && outcome.kind === 'clean') output.system.push(outcome.text);
      else if (outcome && outcome.kind === 'diagnostic') process.stderr.write(`${outcome.text}\n`);
    },
  };
};
