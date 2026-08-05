const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

function bundle(t, index) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-write-gate-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), index);
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
    payload: { cwd: root, bundle: root, concept, set, evidence: ['evidence.md'] },
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

function refusingRoot(t, index, observed, observedType) {
  const root = bundle(t, index);
  const response = run(request(root));
  const finding = response.findings.find((item) => item.code === 'ROOT_DECLARATION_NOT_EXACT');
  assert.equal(response.result, 'blocked');
  assert.equal(finding.code, 'ROOT_DECLARATION_NOT_EXACT');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { observed, observed_type: observedType });
}

test('write gate refuses an undeclared bundle root', (t) => {
  refusingRoot(t, '---\nproject_mode: "knowledge-only"\n---\n# Bundle\n', null, 'absent');
});

test('write gate refuses a future-version bundle root', (t) => {
  refusingRoot(t, '---\nokf_version: "0.3"\nproject_mode: "knowledge-only"\n---\n# Bundle\n', '0.3', 'string');
});

test('write gate refuses a legacy bundle root', (t) => {
  refusingRoot(t, '---\nokf_version: "0.1"\nproject_mode: "knowledge-only"\n---\n# Bundle\n', '0.1', 'string');
});

test('write gate accepts a conforming bundle root and saves the revision', (t) => {
  const root = bundle(t, '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  const response = run(request(root));
  assert.equal(response.result, 'applied');
  assert.deepEqual(fs.readFileSync(path.join(root, 'note.md')), Buffer.from('---\ntitle: After\ntype: Note\n---\n# Note\n'));
});

test('semantic-preservation mismatch blocks only the affected write before it reaches disk', (t) => {
  const root = bundle(t, '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  const file = path.join(root, 'note.md');
  const before = fs.readFileSync(file);
  const response = run(request(root, 'note.md', { revision: 1e21 }));
  const finding = response.findings.find((item) => item.code === 'PARSE_TREE_MISMATCH');
  assert.equal(response.result, 'blocked');
  assert.equal(finding.detail.construct, 'revision');
  assert.deepEqual(fs.readFileSync(file), before);

  const derivative = path.join(root, 'derivative.md');
  fs.writeFileSync(derivative, '---\ntype: Note\nsources:\n  - resource: note.md\n---\n# Derivative\n');
  const derivativeResponse = run(request(root, 'derivative.md'));
  assert.equal(derivativeResponse.result, 'applied');
  assert.deepEqual(fs.readFileSync(derivative), Buffer.from('---\nsources:\n  - resource: note.md\ntitle: After\ntype: Note\n---\n# Derivative\n'));
});

test('a derivative of a blocked concept is blocked before it reaches disk', (t) => {
  const root = bundle(t, '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntitle: Blocked source\n---\n# Source\n');
  const derivative = path.join(root, 'derivative.md');
  fs.writeFileSync(derivative, '---\ntype: Note\nsources:\n  - resource: source.md\n---\n# Derivative\n');
  const before = fs.readFileSync(derivative);
  const response = run(request(root, 'derivative.md'));
  const finding = response.findings.find((item) => item.code === 'DEPENDS_ON_BLOCKED_CONCEPT');
  assert.equal(response.result, 'blocked');
  assert.deepEqual(finding.detail, { path: 'derivative.md', blocked_concept: 'source.md' });
  assert.deepEqual(fs.readFileSync(derivative), before);
});
