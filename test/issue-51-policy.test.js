const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const wrapper = path.join(repo, 'scripts', 'okf-read.js');

function bundle(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-51-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function write(root, file, content) {
  fs.writeFileSync(path.join(root, file), content);
}

function run(root, operation, payload) {
  const processResult = childProcess.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify({
      protocol: 'okf-wrapper/1',
      skill: 'okf-read',
      operation,
      payload: {
        cwd: root,
        bundle: root,
        candidates: [{ path: '.', bundle: '.', declared: true, named_by_user: true }],
        ...payload,
      },
    }),
    encoding: 'utf8',
  });
  assert.equal(processResult.status, 0);
  assert.equal(processResult.stderr, '');
  return JSON.parse(processResult.stdout);
}

function treeHash(root) {
  const hash = crypto.createHash('sha256');
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      const name = path.join(relative, entry.name);
      hash.update(`${name}\0`);
      if (entry.isDirectory()) {
        hash.update('directory\0');
        visit(file, name);
      } else if (entry.isFile()) {
        hash.update('file\0');
        hash.update(fs.readFileSync(file));
      }
    }
  }
  visit(root);
  return hash.digest('hex');
}

function readRecord(response, relative) {
  return response.data.read.find((record) => record.path === relative);
}

function sourceFiles(directory = path.join(repo, 'scripts')) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.isFile() && entry.name.endsWith('.js') ? [file] : [];
  });
}

function hasForbiddenMechanic(source, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[A-Z_]|[^A-Za-z0-9_])`).test(source);
}

test('validate retains a deprecated concept and never repairs its index', (t) => {
  const root = bundle(t);
  const index = '---\nokf_version: "0.2"\n---\n# Bundle\n\n- [Old note](old.md)\n- [Current note](current.md)\n';
  write(root, 'index.md', index);
  write(root, 'old.md', '---\ntype: Note\nstatus: deprecated\n---\n# Old note\n');
  write(root, 'current.md', '---\ntype: Note\nstatus: current\n---\n# Current note\n');
  const before = treeHash(root);

  const response = run(root, 'validate');

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.concepts.map((concept) => ({ path: concept.path, status: concept.status })), [
    { path: 'current.md', status: 'current' },
    { path: 'old.md', status: 'deprecated' },
  ]);
  assert.equal(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), index);
  assert.equal(treeHash(root), before);
});

test('read returns a successor notice as ordinary Markdown without a relationship', (t) => {
  const root = bundle(t);
  const index = Buffer.from('---\nokf_version: "0.2"\n---\n# Bundle\n\n- [Old note](old.md)\n');
  write(root, 'index.md', index);
  const content = '---\ntype: Note\nstatus: deprecated\n---\n# Old note\n\nThis note is deprecated. See [the replacement](current.md).\n';
  write(root, 'old.md', content);
  write(root, 'current.md', '---\ntype: Note\n---\n# Current note\n');
  const before = treeHash(root);

  const response = run(root, 'read', { target: 'old' });
  const record = readRecord(response, 'old.md');

  assert.equal(response.result, 'ok');
  assert.ok(record);
  assert.equal(record.content, content);
  assert.equal(record.body, '# Old note\n\nThis note is deprecated. See [the replacement](current.md).\n');
  assert.equal(Object.hasOwn(record, 'relationship'), false);
  assert.equal(Object.hasOwn(record, 'successor'), false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'index.md')), index);
  assert.equal(treeHash(root), before);
});

test('shipped navigation and archive code has no concept supersession machinery', () => {
  const forbidden = ['superseded_by', 'deprecation_reason', 'retain_until', 'concept_alias', 'conceptAlias', 'redirect', 'follow'];
  assert.equal(hasForbiddenMechanic('const redirectTo = "current.md";', 'redirect'), true);
  assert.equal(hasForbiddenMechanic('const followSuccessor = true;', 'follow'), true);

  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const term of forbidden) assert.equal(hasForbiddenMechanic(source, term), false, `${file}: ${term}`);
  }
});
