/*
 * Issue #105 — the accepted OpenCode installation and configuration
 * contract (decision on #85): the installed plugin lands one level below
 * OpenCode's native `plugins/` directory under an OKF-specific filename,
 * the installer never creates/replaces/merges/removes `opencode.json`,
 * `opencode.jsonc`, or the legacy global `config.json`, and OpenCode
 * configuration (the per-skill `permission.skill: deny` rules) is a
 * documented manual step, not an installed file.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  adapterManifest,
  runAdapterCli: runCli,
  temporaryRoot,
} = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const adaptersDir = path.join(repo, 'adapters');

function manifest() {
  return adapterManifest('opencode');
}

function config() {
  return JSON.parse(fs.readFileSync(path.join(adaptersDir, 'opencode', 'config.json'), 'utf8'));
}

test('OpenCode manifest installs the plugin below its native plugins/ directory under an OKF-specific filename, and installs no opencode.json/opencode.jsonc/config.json', () => {
  const declared = manifest();
  const pluginEntry = declared.installs.find((entry) => entry.source === 'plugin.js');
  assert.ok(pluginEntry, 'plugin.js entry present');
  assert.match(pluginEntry.target, /^plugins\//);
  assert.notEqual(path.basename(pluginEntry.target), 'plugin.js', 'OKF-specific filename, not the generic source name');
  for (const entry of declared.installs) {
    assert.equal(['opencode.json', 'opencode.jsonc', 'config.json'].includes(entry.target), false, entry.target);
  }
});

test('installing the OpenCode adapter creates no opencode.json, opencode.jsonc, or config.json inside the target, and places the plugin under plugins/', (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, '.opencode');

  const installed = runCli(['install', 'opencode', targetDir]);
  assert.equal(installed.status, 0);
  assert.equal(installed.response.ok, true);

  assert.equal(fs.existsSync(path.join(targetDir, 'opencode.json')), false);
  assert.equal(fs.existsSync(path.join(targetDir, 'opencode.jsonc')), false);
  assert.equal(fs.existsSync(path.join(targetDir, 'config.json')), false);

  const declared = manifest();
  const pluginEntry = declared.installs.find((entry) => entry.source === 'plugin.js');
  assert.equal(fs.existsSync(path.join(targetDir, pluginEntry.target)), true);
});

test('a successful OpenCode install reports the manual permission.skill configuration step as its next action and never claims the adapter is ready', (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, '.opencode');

  const installed = runCli(['install', 'opencode', targetDir]);
  assert.equal(installed.response.ok, true);
  assert.equal(typeof installed.response.next_action, 'string');
  assert.match(installed.response.next_action, /permission\.skill/);
  assert.match(installed.response.next_action, /opencode\.json/);
});

test('the reported next_action names every skill in the deny-rule config, so the two copies cannot drift', (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, '.opencode');

  const installed = runCli(['install', 'opencode', targetDir]);
  const skills = Object.keys(config().permission.skill);
  assert.ok(skills.length > 0);
  for (const skill of skills) {
    assert.match(installed.response.next_action, new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('a disabled OpenCode install is a no-op: chat.system.transform pushes nothing and claims no occurrence', async (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, '.opencode');
  const bundle = temporaryRoot(t);

  runCli(['install', 'opencode', targetDir]);
  runCli(['disable', 'opencode', targetDir]);

  const pluginEntry = manifest().installs.find((entry) => entry.source === 'plugin.js');
  const plugin = require(path.join(targetDir, pluginEntry.target));
  const hooks = await plugin({ directory: bundle });
  const output = { system: [] };
  await hooks['chat.system.transform']({}, output);

  assert.deepEqual(output.system, []);
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-occurrences.json')), false);
});

test('uninstalling the OpenCode adapter removes the plugins/ directory it created and leaves the rest of the target untouched', (t) => {
  const root = temporaryRoot(t);
  fs.writeFileSync(path.join(root, 'opencode.json'), '{"unrelated": true}\n');
  const targetDir = root;

  const installed = runCli(['install', 'opencode', targetDir]);
  assert.equal(installed.response.ok, true);
  const pluginEntry = manifest().installs.find((entry) => entry.source === 'plugin.js');
  assert.equal(fs.existsSync(path.join(root, pluginEntry.target)), true);
  const removed = runCli(['uninstall', 'opencode', targetDir]);
  assert.equal(removed.response.ok, true);

  assert.deepEqual(fs.readdirSync(root), ['opencode.json']);
  assert.equal(fs.readFileSync(path.join(root, 'opencode.json'), 'utf8'), '{"unrelated": true}\n');
});
