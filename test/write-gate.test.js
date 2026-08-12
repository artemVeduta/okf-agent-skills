const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { binding } = require('../test-support/snapshot');
const wrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

// #197: `okf_version`/`project_mode` are the selected manifest bundle record's
// fields now, not the bundle root's own `index.md` frontmatter -- the root is
// navigation only. `bundle()` varies the manifest, never the root file.
function bundle(t, { okfVersion = '0.2', projectMode = 'knowledge-only' } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-write-gate-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
    repositories: [{ name: 'repo', path: '.', local: true }],
    bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: okfVersion, project_mode: projectMode }],
  }));
  fs.writeFileSync(path.join(root, 'index.md'), '# Bundle\n');
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  return root;
}

function request(root, concept = 'note.md', set = { title: 'After' }) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'revise',
    task_kind: 'fix',
    scope: { concepts: [concept] },
    payload: { cwd: root, bundle: root, concept, set, evidence: [binding(root, 'evidence.md')] },
  };
}

function run(value) {
  const result = cp.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  const response = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
  return response;
}

function refusingVersion(t, okfVersion, observed, observedType) {
  const root = bundle(t, { okfVersion });
  const response = run(request(root));
  const finding = response.findings.find((item) => item.code === 'ROOT_DECLARATION_NOT_EXACT');
  assert.equal(response.result, 'blocked');
  assert.ok(finding, 'ROOT_DECLARATION_NOT_EXACT');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { observed, observed_type: observedType });
}

// "An undeclared bundle root" (no `okf_version` at all) has no equivalent here
// (#197): `okf_version` is a required, non-empty-string field of every manifest
// bundle record (`manifest.js`'s `validate()`), so a manifest that omits it is
// itself invalid and never reaches an admitted candidate at all -- the request
// is refused as invalid configuration before `checkRoot` ever runs. Only a
// present-but-wrong value stays expressible, covered below.

test('write gate refuses a future-version bundle root', (t) => {
  refusingVersion(t, '0.3', '0.3', 'string');
});

test('write gate refuses a legacy bundle root', (t) => {
  refusingVersion(t, '0.1', '0.1', 'string');
});

test('write gate accepts a conforming bundle root and saves the revision', (t) => {
  const root = bundle(t);
  const response = run(request(root));
  assert.equal(response.result, 'applied');
  assert.deepEqual(fs.readFileSync(path.join(root, 'note.md')), Buffer.from('---\ntitle: After\ntype: Note\n---\n# Note\n'));
});

test('semantic-preservation mismatch blocks only the affected write before it reaches disk', (t) => {
  const root = bundle(t);
  const file = path.join(root, 'note.md');
  const before = fs.readFileSync(file);
  const response = run(request(root, 'note.md', { revision: 1e21 }));
  const finding = response.findings.find((item) => item.code === 'PARSE_TREE_MISMATCH');
  assert.equal(response.result, 'blocked');
  assert.ok(finding, 'PARSE_TREE_MISMATCH');
  assert.equal(finding.detail.construct, 'revision');
  assert.deepEqual(fs.readFileSync(file), before);

  const derivative = path.join(root, 'derivative.md');
  fs.writeFileSync(derivative, '---\ntype: Note\nsources:\n  - resource: note.md\n---\n# Derivative\n');
  const derivativeResponse = run(request(root, 'derivative.md'));
  assert.equal(derivativeResponse.result, 'applied');
  assert.deepEqual(fs.readFileSync(derivative), Buffer.from('---\nsources:\n  - resource: note.md\ntitle: After\ntype: Note\n---\n# Derivative\n'));
});

test('a derivative of a blocked concept is blocked before it reaches disk', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntitle: Blocked source\n---\n# Source\n');
  const derivative = path.join(root, 'derivative.md');
  fs.writeFileSync(derivative, '---\ntype: Note\nsources:\n  - resource: source.md\n---\n# Derivative\n');
  const before = fs.readFileSync(derivative);
  const response = run(request(root, 'derivative.md'));
  const finding = response.findings.find((item) => item.code === 'DEPENDS_ON_BLOCKED_CONCEPT');
  assert.equal(response.result, 'blocked');
  assert.ok(finding, 'DEPENDS_ON_BLOCKED_CONCEPT');
  assert.deepEqual(finding.detail, { path: 'derivative.md', blocked_concept: 'source.md' });
  assert.deepEqual(fs.readFileSync(derivative), before);
});
