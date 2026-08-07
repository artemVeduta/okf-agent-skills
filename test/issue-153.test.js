const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scripts = path.join(__dirname, '..', 'scripts');

function bundle(t, mode = 'knowledge-only') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-153-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), `---\nokf_version: "0.2"\nproject_mode: "${mode}"\n---\n# Bundle\n`);
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  return root;
}

function request(root, concept, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'create',
    task_kind: 'feature work',
    scope: { concepts: [concept] },
    invocation: 'explicit',
    payload: {
      cwd: root,
      bundle: root,
      concept,
      set: { type: 'Note', title: 'Created' },
      evidence: ['evidence.md'],
      body: '# Created\n',
      ...extra,
    },
  };
}

function run(value) {
  const result = cp.spawnSync(process.execPath, [path.join(scripts, `${value.skill}.js`)], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('create makes a missing parent directory and writes the concept', (t) => {
  const root = bundle(t);
  const response = run(request(root, 'decisions/first.md'));

  assert.equal(response.result, 'applied');
  const file = path.join(root, 'decisions', 'first.md');
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.readFileSync(file, 'utf8').includes('# Created'), true);
});

test('create makes a deeply nested missing parent chain in one call', (t) => {
  const root = bundle(t);
  const response = run(request(root, 'references/a/b/c.md'));

  assert.equal(response.result, 'applied');
  const file = path.join(root, 'references', 'a', 'b', 'c.md');
  assert.equal(fs.existsSync(file), true);
});

test('a read-only bundle directory refuses create with PARENT_DIRECTORY_NOT_WRITABLE and writes nothing', (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip('root can write through a read-only directory');
    return;
  }
  const root = bundle(t);
  fs.chmodSync(root, 0o555);
  let response;
  try {
    response = run(request(root, 'decisions/first.md'));
  } finally {
    fs.chmodSync(root, 0o755);
  }

  assert.equal(response.result, 'blocked');
  assert.ok(response.findings.some((item) => item.code === 'PARENT_DIRECTORY_NOT_WRITABLE'));
  assert.equal(fs.existsSync(path.join(root, 'decisions')), false);
  for (const finding of response.findings) {
    const text = JSON.stringify(finding);
    assert.equal(text.includes(root), false);
    assert.equal(/\.tmp/.test(text), false);
  }
});

test('an existing file where the concept expects a directory refuses create with CONCEPT_PARENT_NOT_A_DIRECTORY', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'decisions'), 'not a directory\n');

  const response = run(request(root, 'decisions/x.md'));

  assert.equal(response.result, 'blocked');
  assert.ok(response.findings.some((item) => item.code === 'CONCEPT_PARENT_NOT_A_DIRECTORY'));
  assert.equal(fs.readFileSync(path.join(root, 'decisions'), 'utf8'), 'not a directory\n');
  for (const finding of response.findings) {
    const text = JSON.stringify(finding);
    assert.equal(text.includes(root), false);
    assert.equal(/\.tmp/.test(text), false);
  }
});

function trySymlink(target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, 'dir');
    return true;
  } catch {
    return false;
  }
}

test('a concept reached through a symlink that escapes the bundle root refuses create with SYMLINK_ESCAPE', (t) => {
  const root = bundle(t);
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-153-outside-')));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  if (!trySymlink(outside, path.join(root, 'escaped'))) {
    t.skip('platform cannot create a symbolic link');
    return;
  }

  const response = run(request(root, 'escaped/note.md'));

  assert.equal(response.result, 'blocked');
  assert.ok(response.findings.some((item) => item.code === 'SYMLINK_ESCAPE'));
  assert.equal(fs.existsSync(path.join(root, 'escaped', 'note.md')), false);
  assert.equal(fs.existsSync(path.join(outside, 'note.md')), false);
});

test('a concept reached through a symlink that escapes the bundle root refuses revise with SYMLINK_ESCAPE', (t) => {
  const root = bundle(t);
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-153-outside-')));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  if (!trySymlink(outside, path.join(root, 'escaped'))) {
    t.skip('platform cannot create a symbolic link');
    return;
  }
  const targetFile = path.join(outside, 'note.md');
  const original = '---\ntype: "Note"\ntitle: "Created"\nstatus: "draft"\n---\n# Created\n';
  fs.writeFileSync(targetFile, original);

  const revise = request(root, 'escaped/note.md', { set: { title: 'Revised' } });
  revise.operation = 'revise';
  const response = run(revise);

  assert.equal(response.result, 'blocked');
  assert.ok(response.findings.some((item) => item.code === 'SYMLINK_ESCAPE'));
  assert.equal(fs.readFileSync(targetFile, 'utf8'), original);
});

test('a symlink that stays inside the bundle root is accepted', (t) => {
  const root = bundle(t);
  fs.mkdirSync(path.join(root, 'real-decisions'));
  if (!trySymlink(path.join(root, 'real-decisions'), path.join(root, 'decisions'))) {
    t.skip('platform cannot create a symbolic link');
    return;
  }

  const response = run(request(root, 'decisions/first.md'));

  assert.equal(response.result, 'applied');
  assert.equal(fs.existsSync(path.join(root, 'real-decisions', 'first.md')), true);
});

test('the SYMLINK_ESCAPE refusal text contains no absolute path', (t) => {
  const root = bundle(t);
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-153-outside-')));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  if (!trySymlink(outside, path.join(root, 'escaped'))) {
    t.skip('platform cannot create a symbolic link');
    return;
  }

  const response = run(request(root, 'escaped/note.md'));

  assert.equal(response.result, 'blocked');
  for (const finding of response.findings) {
    const text = JSON.stringify(finding);
    assert.equal(text.includes(root), false);
    assert.equal(text.includes(outside), false);
  }
});
