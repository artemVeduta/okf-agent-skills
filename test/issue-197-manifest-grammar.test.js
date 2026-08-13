const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bundle, repository, runWrapper, temporaryRoot } = require('../test-support/snapshot');

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

// #196 defines `project_mode` as required, always present, and two-valued
// (`code-backed`/`knowledge-only`). `null` is not one of those two values and is
// not itself a documented third state, so it is rejected the same way an absent
// `project_mode` is (`invalid_field_combination`), not admitted as a legal
// "undecided" value. See `manifest.template()`, which now requires every caller
// to supply a real `projectMode` for exactly this reason.
test('a bundle record with project_mode: null is rejected, the same as a missing project_mode', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle({ project_mode: null })]));
  assert.equal(federationFindingReason(root), 'invalid_field_combination');
});

// -------------------------------------------------------------- settings resolution

test('an absent settings object resolves to the built-in default with no findings', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle()]));
  const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
  assert.deepEqual(response.data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settings_findings: [],
  });
});

test('a valid settings override resolves to the override value with no findings', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_file: 250 } }));
  const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
  assert.deepEqual(response.data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 250 }, settings_findings: [],
  });
});

test('an unknown setting key reports a finding, keeps the default effective, and does not invalidate the manifest', (t) => {
  const root = repository(t); bundle(root);
  writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_words: 5 } }));
  const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
  assert.equal(response.data.manifest.state, 'ok');
  assert.deepEqual(response.data.manifest.settings, { max_words_per_file: 1000 });
  assert.deepEqual(response.data.manifest.settings_findings, [{
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
    assert.deepEqual(response.data.manifest.settings_findings, [{
      code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false,
      detail: { gate: 'settings', reason: 'invalid_setting_value', key: 'max_words_per_file' },
    }], JSON.stringify(value));
  }
});

// The activation gate resolves the manifest by walking `cwd` upward to the Git
// root (`manifest.select()`'s own `discover()`), so a manifest living in an
// intermediate directory below the Git root still activates the bundle. Both
// `inspect` and `migration-plan` read settings back out of that exact same
// file -- never a hardcoded `<gitRoot>/.okf-workspace.json`, which does not
// exist in this fixture at all, so a caller that still hardcoded it would see
// `settings`/`settings_findings` silently missing from the response while
// `data.activation.state` (and `data.plan`, for `migration-plan`) still
// reported the bundle as active (fix round 2, Important 3).
test('inspect and migration-plan read settings from a manifest below the Git root, agreeing with the walked-upward activation gate', (t) => {
  const root = temporaryRoot(t, 'okf-197-nested-manifest-');
  fs.mkdirSync(path.join(root, '.git'));
  const pkgDir = path.join(root, 'pkg');
  const cwd = path.join(pkgDir, 'nested');
  fs.mkdirSync(cwd, { recursive: true });
  // Deliberately no `.okf-workspace.json` at `root` -- only below it, one
  // level above `cwd`, so the settings-resolving code path must actually walk
  // upward rather than read `<gitRoot>/.okf-workspace.json` directly.
  writeManifest(pkgDir, manifestOf([validBundle()], { settings: { max_words_per_file: 250 } }));
  assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);

  const inspectResponse = runWrapper(setupWrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'inspect', payload: { cwd },
  }, { cwd });
  assert.equal(inspectResponse.data.activation.state, 'ok');
  assert.deepEqual(inspectResponse.data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 250 }, settings_findings: [],
  });

  const planResponse = runWrapper(setupWrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd, sources: [] },
  }, { cwd });
  assert.equal(planResponse.result, 'ok');
  assert.deepEqual(planResponse.data.settings, { max_words_per_file: 250 });
  assert.deepEqual(planResponse.data.settings_findings, []);
});
