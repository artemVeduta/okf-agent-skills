const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runSilent, runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const router = path.join(__dirname, '..', 'scripts', 'okf.js');

// #173 (decision #166, kept by #196/#197): an explicit `init` is the one
// bootstrap exception to the manifest gate. It may run while the manifest
// is absent, so a caller can still create the bundle root before ever writing
// a manifest at all -- the explicit pre-manifest setup path #196 keeps
// alongside its own documented order `inspect -> consent -> repair manifest ->
// init -> discover`, which `test/issue-170.test.js` covers instead.
function request(operation, root, payload = {}, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation,
    payload: { cwd: root, ...payload },
    ...extra,
  };
}

function cleanRepository(t, prefix) {
  const root = temporaryRoot(t, prefix);
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

test('an explicit init runs on a repository that holds nothing but a Git root, before any manifest exists', (t) => {
  const root = cleanRepository(t, 'okf-173-clean-');

  const before = runWrapper(wrapper, request('inspect', root));
  assert.equal(before.result, 'ok');
  assert.equal(before.data.index_md.state, 'missing');
  assert.equal(before.data.activation.state, 'missing');
  assert.equal(before.data.manifest.state, 'missing');

  const init = runWrapper(wrapper, request('init', root));
  assert.equal(init.result, 'applied');
  assert.deepEqual(init.findings, []);
  // #196/#197: the root is navigation only -- the exception never widens beyond
  // the bundle root and its agent connector (#170).
  assert.equal(
    fs.readFileSync(path.join(root, 'okf', 'index.md'), 'utf8'),
    '# Bundle\n\n- [Agents](agents/index.md)\n',
  );

  const manifest = runWrapper(wrapper, request('repair', root, { targets: ['manifest'], project_mode: 'code-backed' }));
  assert.equal(manifest.result, 'applied');

  const after = runWrapper(wrapper, request('inspect', root));
  assert.equal(after.data.index_md.state, 'ok');
  assert.equal(after.data.activation.state, 'ok');
  assert.equal(after.data.manifest.state, 'ok');

  const discover = runWrapper(wrapper, request('discover', root));
  assert.equal(discover.result, 'ok');
});

test('an automatic init on a repository with no manifest stays silent and writes nothing', (t) => {
  const root = cleanRepository(t, 'okf-173-automatic-');

  runSilent(wrapper, request('init', root, {}, { invocation: 'automatic' }));
  assert.deepEqual(fs.readdirSync(root), ['.git']);
});

test('a malformed manifest still blocks init', (t) => {
  const root = cleanRepository(t, 'okf-173-invalid-');
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');

  const response = runWrapper(wrapper, request('init', root));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'MANIFEST_INVALID');
  assert.equal(fs.existsSync(path.join(root, 'okf', 'index.md')), false);
});

test('the router grants the same bootstrap exception to an explicit init', (t) => {
  const root = cleanRepository(t, 'okf-173-router-');

  const response = runWrapper(router, {
    protocol: 'okf-wrapper/1',
    skill: 'okf',
    operation: 'init',
    payload: { cwd: root },
  });
  assert.equal(response.result, 'applied');
  assert.equal(fs.existsSync(path.join(root, 'okf', 'index.md')), true);
});

test('the exception is init alone: another setup mutation still needs the manifest', (t) => {
  const root = cleanRepository(t, 'okf-173-narrow-');

  const response = runWrapper(wrapper, request('discover', root));
  assert.equal(response.result, 'not-configured');
});
