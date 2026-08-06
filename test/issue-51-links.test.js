const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { bundle, repository } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-read.js');

function rootFor(t) {
  const root = repository(t, 'okf-51-links-');
  bundle(root);
  return root;
}

function write(root, name, content) {
  fs.writeFileSync(path.join(root, name), content);
}

function validate(root) {
  return run(root, 'validate', { bundle: root, today: '2026-08-04' });
}

function run(root, operation, payload) {
  const processResult = cp.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify({
      protocol: 'okf-wrapper/1',
      skill: 'okf-read',
      operation,
      payload: { cwd: root, ...payload },
    }),
    encoding: 'utf8',
  });
  assert.equal(processResult.status, 0);
  assert.equal(processResult.stderr, '');
  return JSON.parse(processResult.stdout);
}

test('validate reports source-link verdicts from in-bundle target existence', (t) => {
  const root = rootFor(t);
  write(root, 'present.md', '---\ntype: Note\n---\n# Present\n');
  write(root, 'links.md', '---\ntype: Note\nsources:\n  - resource: present.md\n  - resource: missing.md\n---\n# Links\n');

  const result = validate(root);

  assert.deepEqual(result.data.link_verdicts, [
    { path: 'links.md', resource: 'present.md', verdict: 'resolves' },
    { path: 'links.md', resource: 'missing.md', verdict: 'unexpectedly-broken' },
  ]);
  assert.deepEqual(result.findings.find((finding) => finding.code === 'UNRESOLVED_INTERNAL_LINK'), {
    code: 'UNRESOLVED_INTERNAL_LINK',
    origin: 'okf',
    severity: 'warning',
    blocks: false,
    detail: { path: 'links.md', resource: 'missing.md' },
  });
});

test('validate reports a directory target as an unexpectedly broken link', (t) => {
  const root = rootFor(t);
  fs.mkdirSync(path.join(root, 'concepts'));
  write(root, 'links.md', '---\ntype: Note\nsources:\n  - resource: concepts\n---\n# Links\n');

  const result = validate(root);

  assert.deepEqual(result.data.link_verdicts, [
    { path: 'links.md', resource: 'concepts', verdict: 'unexpectedly-broken' },
  ]);
  assert.deepEqual(result.findings.find((finding) => finding.code === 'UNRESOLVED_INTERNAL_LINK'), {
    code: 'UNRESOLVED_INTERNAL_LINK',
    origin: 'okf',
    severity: 'warning',
    blocks: false,
    detail: { path: 'links.md', resource: 'concepts' },
  });
});

test('validate keeps Markdown-link verdicts independent of status and earlier navigation', (t) => {
  const root = rootFor(t);
  write(root, 'deprecated.md', '---\ntype: Note\nstatus: deprecated\n---\n# Deprecated\n');
  write(root, 'links.md', '---\ntype: Note\n---\n[Deprecated](deprecated.md)\n');

  const beforeNavigation = validate(root).data.link_verdicts;
  const read = run(root, 'read', {
    target: 'deprecated',
    bundle: root,
    candidates: [{ path: '.', bundle: '.', declared: true, named_by_user: true }],
  });
  const afterNavigation = validate(root).data.link_verdicts;

  assert.equal(read.operation, 'read');
  assert.equal(read.result, 'ok');
  assert.deepEqual(read.data.read.map((record) => record.path), ['deprecated.md']);
  assert.deepEqual(beforeNavigation, [
    { path: 'links.md', resource: 'deprecated.md', verdict: 'resolves' },
  ]);
  assert.deepEqual(afterNavigation, beforeNavigation);
});
