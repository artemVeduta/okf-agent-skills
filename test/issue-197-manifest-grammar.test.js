const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bundle, repository, runWrapper } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const readWrapper = path.join(repo, 'scripts', 'okf-read.js');
const setupWrapper = path.join(repo, 'scripts', 'okf-setup.js');
const workspaceId = '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';

function validBundle(overrides = {}) {
  return { alias: 'docs', owner: 'app', root: 'docs', okf_version: '0.2', project_mode: 'knowledge-only', ...overrides };
}

function manifestOf(bundles, extra = {}) {
  return {
    schema_version: 1,
    workspace_id: workspaceId,
    repositories: [{ name: 'app', path: '.', local: true }],
    bundles,
    ...extra,
  };
}

function writeManifest(root, value) {
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(value));
}

function admitRequest(root) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'admit', payload: { cwd: root, candidates: [] } };
}

function inspectRequest(root) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'inspect', payload: { cwd: root } };
}

function federationFindingReason(root) {
  const response = runWrapper(readWrapper, admitRequest(root), { cwd: root });
  assert.equal(response.data.federation, 'rejected');
  return response.data.federation_finding.detail.reason;
}

// -------------------------------------------------------------- bundle grammar

test('a bundle record missing any of the five required fields is rejected with the field-specific reason', (t) => {
  const root = repository(t); bundle(root);
  const cases = [
    ['alias', 'duplicate_bundle_alias'],
    ['owner', 'invalid_field_combination'],
    ['root', 'missing_path'],
    ['okf_version', 'invalid_field_combination'],
    ['project_mode', 'invalid_field_combination'],
  ];
  for (const [field, reason] of cases) {
    const record = validBundle();
    delete record[field];
    writeManifest(root, manifestOf([record]));
    assert.equal(federationFindingReason(root), reason, `missing ${field}`);
  }
});

test('a bundle record carrying the removed "required" or "mode" field is rejected as an unknown key', (t) => {
  const root = repository(t); bundle(root);
  for (const extra of [{ required: true }, { mode: 'source' }]) {
    writeManifest(root, manifestOf([validBundle(extra)]));
    assert.equal(federationFindingReason(root), 'unknown_key', JSON.stringify(extra));
  }
});

// -------------------------------------------------------------- settings resolution

test('an absent settings object resolves to the built-in default with no findings', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle()]));
  const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
  assert.deepEqual(response.data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settingsFindings: [],
  });
});

test('a valid settings override resolves to the override value with no findings', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_file: 250 } }));
  const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
  assert.deepEqual(response.data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 250 }, settingsFindings: [],
  });
});

test('an unknown setting key reports a finding, keeps the default effective, and does not invalidate the manifest', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_words: 5 } }));
  const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
  assert.equal(response.data.manifest.state, 'ok');
  assert.deepEqual(response.data.manifest.settings, { max_words_per_file: 1000 });
  assert.deepEqual(response.data.manifest.settingsFindings, [{
    code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false,
    detail: { gate: 'settings', reason: 'unknown_setting_key', key: 'max_words_per_words' },
  }]);
});

test('an invalid max_words_per_file value reports a finding, keeps the default effective, and does not invalidate the manifest', (t) => {
  const root = repository(t); bundle(root);
  for (const value of [0, -5, 1.5, '1000']) {
    writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_file: value } }));
    const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
    assert.equal(response.data.manifest.state, 'ok', JSON.stringify(value));
    assert.deepEqual(response.data.manifest.settings, { max_words_per_file: 1000 }, JSON.stringify(value));
    assert.deepEqual(response.data.manifest.settingsFindings, [{
      code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false,
      detail: { gate: 'settings', reason: 'invalid_setting_value', key: 'max_words_per_file' },
    }], JSON.stringify(value));
  }
});
