const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// `okf-setup`'s `inspect`/`repair` operations run even without a valid manifest
// (that is one of the things `inspect` reports on), so fixtures here build a bare
// Git repository directly rather than using the shared `repository()` helper,
// which always creates one.
function repo(t) {
  const root = temporaryRoot(t, 'okf-138-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

function inspectRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'inspect', payload: { cwd: root, ...payload } };
}

function repairRequest(root, targets, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'repair', payload: { cwd: root, targets, ...payload } };
}

function initRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'init', payload: { cwd: root, ...payload } };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function validManifest(workspaceId) {
  return {
    schema_version: 1,
    workspace_id: workspaceId,
    repositories: [{ name: 'repo', path: '.', local: true }],
    bundles: [{ alias: 'okf', owner: 'repo', root: 'okf', okf_version: '0.2', project_mode: 'knowledge-only' }],
  };
}

// --------------------------------------------------------------- index.md

test('inspect reports index.md as missing, invalid, and ok', (t) => {
  const root = repo(t);
  assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'missing' });

  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.1"\n---\n# Bundle\n');
  assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'invalid', reason: 'missing_or_wrong_okf_version' });

  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'ok' });
});

test('inspect reports an unparseable index.md as invalid with a parser reason', (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, 'okf'));
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\n  bad indent\n---\n# Bundle\n');
  const state = run(inspectRequest(root)).data.index_md;
  assert.equal(state.state, 'invalid');
  assert.ok(state.reason);
});

test('inspect honors a non-default bundle directory for index.md', (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  assert.deepEqual(run(inspectRequest(root, { bundle: 'docs' })).data.index_md, { state: 'ok' });
  assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'missing' });
});

// --------------------------------------------------------------- activation

// #197: `data.activation` reports the same valid/missing/invalid resolution the
// runtime's own activation gate computes (`runtime.js`'s `activationState()`),
// now sourced from the manifest instead of the retired `.okf-active` marker.
test('inspect reports activation as missing, invalid, and ok, tracking the manifest', (t) => {
  const root = repo(t);
  assert.deepEqual(run(inspectRequest(root)).data.activation, { state: 'missing' });

  fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
  assert.deepEqual(run(inspectRequest(root)).data.activation, { state: 'invalid', reason: 'manifest_invalid' });

  const workspaceId = '77777777-7777-4777-8777-777777777777';
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(validManifest(workspaceId)));
  assert.deepEqual(run(inspectRequest(root)).data.activation, { state: 'ok' });
});

// `repair` has no write left to make for this target (#197: the marker it used to
// create is gone) -- it is always a no-op report now, whatever the manifest's own
// state happens to be. The manifest is the only thing `repair` still writes.
test('repair never writes for the activation target', (t) => {
  const root = repo(t);
  const onMissing = run(repairRequest(root, ['activation']));
  assert.equal(onMissing.result, 'no-op');
  assert.deepEqual(onMissing.data.activation, { written: false });

  fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
  const onInvalid = run(repairRequest(root, ['activation']));
  assert.equal(onInvalid.result, 'no-op');
  assert.deepEqual(onInvalid.data.activation, { written: false });
  assert.equal(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'), 'not json');
});

// --------------------------------------------------------------- .okf-workspace.json

test('inspect reports .okf-workspace.json as missing, invalid, and ok', (t) => {
  const root = repo(t);
  assert.equal(run(inspectRequest(root)).data.manifest.state, 'missing');

  fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
  assert.equal(run(inspectRequest(root)).data.manifest.state, 'invalid');

  const workspaceId = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(validManifest(workspaceId)));
  assert.deepEqual(run(inspectRequest(root)).data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settingsFindings: [],
  });
});

test('inspect salvages a well-formed workspace_id from an otherwise invalid manifest, and reports none when there is nothing to salvage', (t) => {
  const root = repo(t);
  const workspaceId = '22222222-2222-4222-8222-222222222222';
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1, workspace_id: workspaceId, repositories: [], bundles: 'not-an-array',
  }));
  const withId = run(inspectRequest(root)).data.manifest;
  assert.equal(withId.state, 'invalid');
  assert.deepEqual(withId.salvage, { workspace_id: workspaceId });

  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({ schema_version: 1, workspace_id: 'not-a-uuid', repositories: [], bundles: [] }));
  const withoutId = run(inspectRequest(root)).data.manifest;
  assert.equal(withoutId.state, 'invalid');
  assert.equal(withoutId.salvage, null);
});

test('inspect warns of a monorepo from .gitmodules when the manifest is missing, and from a manifest already declaring more than one repository or bundle', (t) => {
  const root = repo(t);
  assert.equal(run(inspectRequest(root)).data.manifest.monorepo, false);

  fs.writeFileSync(path.join(root, '.gitmodules'), '');
  assert.equal(run(inspectRequest(root)).data.manifest.monorepo, true);
  fs.rmSync(path.join(root, '.gitmodules'));

  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: '33333333-3333-4333-8333-333333333333',
    repositories: [{ name: 'a', path: 'a', local: true }, { name: 'b', path: 'b', local: true }],
    bundles: [{ alias: 'a', owner: 'a', root: 'a', okf_version: '0.2', project_mode: 'knowledge-only' }],
  }));
  const report = run(inspectRequest(root)).data.manifest;
  assert.equal(report.state, 'ok', 'the manifest itself is well-formed; only the hint is asserted here');
  assert.equal(report.monorepo, true);
});

test('repair generates a validated single-bundle manifest template when missing', (t) => {
  const root = repo(t);
  const response = run(repairRequest(root, ['manifest'], { project_mode: 'code-backed' }));
  assert.equal(response.result, 'applied');
  assert.equal(response.data.manifest.written, true);
  assert.match(response.data.manifest.workspace_id, uuid);

  const written = JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'));
  assert.equal(written.schema_version, 1);
  assert.match(written.workspace_id, uuid);
  assert.equal(written.repositories.length, 1);
  assert.equal(written.repositories[0].name, path.basename(root));
  assert.equal(written.repositories[0].path, '.');
  assert.equal(written.repositories[0].local, true);
  assert.equal(written.bundles.length, 1);
  assert.equal(written.bundles[0].alias, 'okf');
  assert.equal(written.bundles[0].root, 'okf');
  assert.equal(written.bundles[0].okf_version, '0.2');
  assert.equal(written.bundles[0].project_mode, 'code-backed');
  assert.equal(written.bundles[0].owner, written.repositories[0].name);
});

test('repair refuses to generate a manifest without a recognized project_mode', (t) => {
  const root = repo(t);
  for (const projectMode of [undefined, 'sandbox']) {
    const payload = projectMode === undefined ? {} : { project_mode: projectMode };
    const response = run(repairRequest(root, ['manifest'], payload));
    assert.equal(response.result, 'blocked', JSON.stringify(payload));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(payload));
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false, JSON.stringify(payload));
  }
});

test('repair templates a fresh workspace_id each time the manifest is missing, never a fixed value', (t) => {
  const first = run(repairRequest(repo(t), ['manifest'], { project_mode: 'code-backed' })).data.manifest.workspace_id;
  const second = run(repairRequest(repo(t), ['manifest'], { project_mode: 'code-backed' })).data.manifest.workspace_id;
  assert.match(first, uuid);
  assert.match(second, uuid);
  assert.notEqual(first, second);
});

test('repair regenerates an invalid manifest only once the caller supplies the salvaged workspace_id, matching the report inspect gave', (t) => {
  const root = repo(t);
  const workspaceId = '44444444-4444-4444-8444-444444444444';
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1, workspace_id: workspaceId, repositories: [], bundles: 'not-an-array',
  }));
  const reported = run(inspectRequest(root)).data.manifest;
  assert.equal(reported.state, 'invalid');
  assert.deepEqual(reported.salvage, { workspace_id: workspaceId });

  // The approval and the choice to keep the salvaged value both happen above the
  // runtime, in `okf-setup`'s procedure; `repair` only ever does what it is told.
  const response = run(repairRequest(root, ['manifest'], { workspace_id: reported.salvage.workspace_id, project_mode: 'code-backed' }));
  assert.equal(response.result, 'applied');
  assert.equal(response.data.manifest.workspace_id, workspaceId);
  const written = JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'));
  assert.equal(written.workspace_id, workspaceId);
  assert.deepEqual(run(inspectRequest(root)).data.manifest, {
    state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settingsFindings: [],
  });
});

test('repair leaves an already-ok manifest untouched and ignores a redundant payload', (t) => {
  const root = repo(t);
  run(repairRequest(root, ['manifest'], { project_mode: 'code-backed' }));
  const before = fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8');

  // The manifest already exists and is `ok`, so the template `repair` builds to
  // compare against is never written -- but it is still built and validated, so a
  // repeat call still needs a recognized `project_mode` to reach the no-op check.
  const response = run(repairRequest(root, ['manifest'], { workspace_id: '55555555-5555-4555-8555-555555555555', project_mode: 'code-backed' }));
  assert.equal(response.result, 'no-op');
  assert.deepEqual(response.data.manifest, { written: false });
  assert.equal(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'), before);
});

test('repair accepts a hand-authored manifest for a monorepo, validated the same way the template is', (t) => {
  const root = repo(t);
  const custom = {
    schema_version: 1,
    workspace_id: '66666666-6666-4666-8666-666666666666',
    repositories: [
      { name: 'app', path: 'app', local: true },
      { name: 'lib', path: 'lib', local: true },
    ],
    bundles: [
      { alias: 'app', owner: 'app', root: 'app/okf', okf_version: '0.2', project_mode: 'knowledge-only' },
      { alias: 'lib', owner: 'lib', root: 'lib/okf', okf_version: '0.2', project_mode: 'knowledge-only' },
    ],
  };
  const response = run(repairRequest(root, ['manifest'], { manifest: custom }));
  assert.equal(response.result, 'applied');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8')), custom);
});

test('repair refuses a hand-authored manifest that fails validation, without writing', (t) => {
  const root = repo(t);
  const response = run(repairRequest(root, ['manifest'], { manifest: { schema_version: 1 } }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
});

test('repair refuses a manifest payload named without "manifest" in targets', (t) => {
  const root = repo(t);
  const response = run(repairRequest(root, ['activation'], { manifest: { schema_version: 1 } }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  assert.equal(fs.existsSync(path.join(root, '.okf-active')), false);
});

// --------------------------------------------------------------- repair input shape

test('repair rejects a structurally empty targets list at the protocol layer, before the runtime', (t) => {
  const root = repo(t);
  const result = spawnWrapper(wrapper, repairRequest(root, []));
  assert.equal(result.status, 64);
  assert.equal(result.stdout, '');
});

test('repair refuses unrecognized or duplicate targets without writing anything', (t) => {
  const root = repo(t);
  for (const targets of [['index_md'], ['activation', 'activation']]) {
    const response = run(repairRequest(root, targets));
    assert.equal(response.result, 'blocked', JSON.stringify(targets));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(targets));
  }
  assert.equal(fs.existsSync(path.join(root, '.okf-active')), false);
});

test('repair does both targets in one call and reports each independently', (t) => {
  const root = repo(t);
  const response = run(repairRequest(root, ['activation', 'manifest'], { project_mode: 'code-backed' }));
  assert.equal(response.result, 'applied');
  assert.deepEqual(response.data.activation, { written: false });
  assert.equal(response.data.manifest.written, true);
});

// --------------------------------------------------------------- ownership, activation bypass, automatic invocation

test('inspect and repair report not-configured entirely outside a Git repository, exactly like every other operation', (t) => {
  const root = temporaryRoot(t, 'okf-138-no-repo-');
  assert.equal(run(inspectRequest(root)).result, 'not-configured');
  assert.equal(run(repairRequest(root, ['activation'])).result, 'not-configured');
  assert.equal(fs.existsSync(path.join(root, '.okf-active')), false);
});

test('inspect and repair run without a valid manifest, unlike every other operation', (t) => {
  const root = repo(t);
  assert.equal(run(inspectRequest(root)).result, 'ok');
  assert.equal(run(repairRequest(root, ['activation'])).result, 'no-op');
});

test('automatic invocation of inspect or repair is silent, matching every operation\'s automatic behavior when OKF is not active', (t) => {
  const root = repo(t);
  for (const request of [inspectRequest(root), repairRequest(root, ['activation'])]) {
    const result = spawnWrapper(wrapper, { ...request, invocation: 'automatic' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
  assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
});

test('a non-writable Git root blocks repair with a blocking finding, without touching disk', (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip('root can write through a read-only directory');
    return;
  }
  const root = repo(t);
  fs.chmodSync(root, 0o555);
  let response;
  try {
    response = run(repairRequest(root, ['activation']));
  } finally {
    fs.chmodSync(root, 0o755);
  }
  assert.equal(response.result, 'blocked');
  assert.ok(response.findings.some((item) => item.code === 'PARENT_DIRECTORY_NOT_WRITABLE'));
  assert.equal(fs.existsSync(path.join(root, '.okf-active')), false);
});

test('the generic okf router reaches inspect and repair too, and also bypasses the activation gate', (t) => {
  const root = repo(t);
  const inspected = runWrapper(routerWrapper, { ...inspectRequest(root), skill: 'okf' });
  assert.equal(inspected.skill, 'okf');
  assert.equal(inspected.result, 'ok');
  assert.deepEqual(inspected.data.activation, { state: 'missing' });

  const repaired = runWrapper(routerWrapper, { ...repairRequest(root, ['manifest'], { project_mode: 'knowledge-only' }), skill: 'okf' });
  assert.equal(repaired.skill, 'okf');
  assert.equal(repaired.result, 'applied');
  assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), true);
});

// --------------------------------------------------------------- full chain

test('a full setup chain (inspect, repair, init) leaves all three files ok and a normal create then passes the write gate', (t) => {
  const root = repo(t);
  const before = run(inspectRequest(root)).data;
  assert.deepEqual([before.index_md.state, before.activation.state, before.manifest.state], ['missing', 'missing', 'missing']);

  const repaired = run(repairRequest(root, ['activation', 'manifest'], { project_mode: 'knowledge-only' }));
  assert.equal(repaired.result, 'applied');
  const initResponse = run(initRequest(root, { project_mode: 'knowledge-only' }));
  assert.equal(initResponse.result, 'applied');

  const after = run(inspectRequest(root)).data;
  assert.deepEqual(after.index_md, { state: 'ok' });
  assert.deepEqual(after.activation, { state: 'ok' });
  assert.equal(after.manifest.state, 'ok');

  // A second inspect/repair pass over an already-fixed project is a pure no-op.
  const secondRepair = run(repairRequest(root, ['activation', 'manifest'], { project_mode: 'knowledge-only' }));
  assert.equal(secondRepair.result, 'no-op');
});
