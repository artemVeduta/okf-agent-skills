const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// #165: `/okf-setup` writes `.okf-active` and `.okf-workspace.json` at the Git root,
// beside the bundle. A `discover` call in the same session must not report the files
// setup itself just wrote as candidate migration sources.
function discoverRequest(root) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'discover',
    payload: { cwd: root },
  };
}

test('a fresh bootstrap discovers zero sources in an otherwise empty repository', (t) => {
  const root = temporaryRoot(t, 'okf-165-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), '{}\n');
  fs.writeFileSync(path.join(root, '.okf-occurrences.json'), '{}\n');

  const response = runWrapper(wrapper, discoverRequest(root));
  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.sources, []);
});

test('a document deeper in the tree sharing an excluded name is still discovered', (t) => {
  const root = temporaryRoot(t, 'okf-165-nested-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', '.okf-workspace.json'), '{}\n');

  const response = runWrapper(wrapper, discoverRequest(root));
  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.sources.map((entry) => entry.path), ['docs/.okf-workspace.json']);
});
