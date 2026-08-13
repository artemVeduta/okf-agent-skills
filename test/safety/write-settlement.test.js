// Domain: safety -- how a write verb settles on disk.
// Publish order, verification invalidation, rename abort and temporary-file
// cleanup, plus the filesystem refusals (unwritable parent, non-directory
// parent, symlink escape) that stop a write before it touches the store.

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { binding } = require('../../test-support/snapshot');
const scripts = path.join(__dirname, '..', '..', 'scripts');
const runtime = require(path.join(scripts, 'lib', 'runtime'));
const services = require(path.join(scripts, 'lib', 'services'));

test.describe('publication settlement', () => {
  // #197: `okf_version`/`project_mode` live in the manifest's selected bundle
  // record now, not `index.md`'s frontmatter -- the root is navigation only.
  function setManifest(root, { okfVersion = '0.2', projectMode = 'knowledge-only' } = {}) {
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: okfVersion, project_mode: projectMode }],
    }));
  }

  function bundle(t, mode = 'knowledge-only') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-settlement-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    setManifest(root, { projectMode: mode });
    fs.writeFileSync(path.join(root, 'index.md'), '# Bundle\n');
    fs.writeFileSync(path.join(root, 'evidence.md'), 'observed\n');
    return root;
  }

  function concept(root, text = '---\ntype: Note\ntitle: Before\n---\n# Body\n') {
    fs.writeFileSync(path.join(root, 'note.md'), text);
  }

  function request(root, operation = 'revise', extra = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-write',
      operation,
      task_kind: 'fix',
      scope: { concepts: [extra.concept || 'note.md'] },
      payload: {
        cwd: root,
        bundle: root,
        concept: 'note.md',
        set: { title: 'After' },
        evidence: [binding(root, 'evidence.md')],
        ...extra,
      },
    };
  }

  function run(value) {
    const result = cp.spawnSync(process.execPath, [path.join(scripts, 'okf-write.js')], {
      input: JSON.stringify(value), encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  }

  function bytes(file) {
    return fs.readFileSync(file);
  }

  test('writer applies a valid bounded revision and reports planned and actual effects', (t) => {
    const root = bundle(t);
    concept(root);
    const response = run(request(root));
    assert.equal(response.result, 'applied');
    assert.equal(response.data.task_kind, 'fix');
    assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise']);
    assert.deepEqual(response.data.residue, []);
  });

  test('writer creates a draft without verification from readable evidence', (t) => {
    const root = bundle(t);
    const value = request(root, 'create', { concept: 'new.md', set: { type: 'Note' } });
    value.scope = { concepts: ['new.md'] };
    const response = run(value);
    assert.equal(response.result, 'applied');
    const saved = fs.readFileSync(path.join(root, 'new.md'), 'utf8');
    assert.match(saved, /status: draft/);
    assert.doesNotMatch(saved, /verified:/);
  });

  test('writer accepts each allowed task kind', (t) => {
    for (const taskKind of ['feature work', 'fix', 'research']) {
      const root = bundle(t);
      concept(root);
      const value = request(root);
      value.task_kind = taskKind;
      assert.equal(run(value).result, 'applied', taskKind);
    }
  });

  test('writer invalidates verification on a material claim revision and preserves body and unknown frontmatter', (t) => {
    const root = bundle(t);
    const body = '# Exact body\r\n\r\nUnchanged.\r\n';
    concept(root, `---\ntype: Note\ntitle: Before\nunknown:\n  nested: kept\nverified:\n  - kind: machine\n    by: check\n    coverage: complete-current-concept\n---\n${body}`);
    const response = run(request(root));
    const saved = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
    assert.equal(response.result, 'applied');
    assert.ok(response.findings.some((finding) => finding.code === 'INLINE_VERIFICATION_INVALIDATED'));
    assert.doesNotMatch(saved, /verified:/);
    assert.match(saved, /nested: kept/);
    assert.ok(saved.endsWith(body));
  });

  test('writer reports a semantic no-op without publication', (t) => {
    const root = bundle(t);
    concept(root);
    const first = run(request(root));
    assert.equal(first.result, 'applied');
    const before = bytes(path.join(root, 'note.md'));
    const response = run(request(root));
    assert.equal(response.result, 'no-op');
    assert.deepEqual(response.data.actual_effects, []);
    assert.deepEqual(bytes(path.join(root, 'note.md')), before);
    assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.tmp')), []);
  });

  test('writer blocks every task kind outside the bounded write contract without changes', (t) => {
    const root = bundle(t);
    concept(root);
    const before = bytes(path.join(root, 'note.md'));
    for (const taskKind of [undefined, 'debugging', 'exploration', 'pre-PR synchronization', 'review', 'other']) {
      const value = request(root);
      if (taskKind === undefined) delete value.task_kind;
      else value.task_kind = taskKind;
      const response = run(value);
      const finding = response.findings.find((item) => item.code === 'TASK_KIND_NOT_WRITE_ELIGIBLE');
      assert.equal(response.result, 'blocked', String(taskKind));
      assert.equal(finding.detail.task_kind, taskKind === undefined ? null : taskKind);
      assert.deepEqual(bytes(path.join(root, 'note.md')), before);
    }
  });

  test('writer blocks root, evidence, mode, and scope gates before publication', (t) => {
    const root = bundle(t);
    concept(root);
    const cases = [
      ['root', () => setManifest(root, { okfVersion: '0.1' }), 'ROOT_DECLARATION_NOT_EXACT'],
      ['mode', () => setManifest(root, { projectMode: 'invalid' }), 'PROJECT_MODE_INVALID'],
      ['evidence', () => {}, 'EVIDENCE_CHANGED', { evidence: [{ path: 'evidence.md', sha256: 'a'.repeat(64) }] }],
      ['scope', () => {}, 'INVALID_SCOPE', {}, { concepts: ['other.md'] }],
    ];
    for (const [label, setup, code, extra, scope] of cases) {
      setManifest(root);
      setup();
      const value = request(root, 'revise', extra);
      if (scope) value.scope = scope;
      const response = run(value);
      assert.ok(response.findings.some((finding) => finding.code === code), label);
      assert.equal(response.data.actual_effects.length, 0, label);
    }
  });

  test('writer refuses unimplemented mechanical link maintenance', (t) => {
    const root = bundle(t);
    concept(root);
    const before = bytes(path.join(root, 'note.md'));
    const response = run(request(root, 'revise', {
      effects: ['concept-revise', 'mechanical-link-maintenance'],
    }));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    assert.deepEqual(response.data.actual_effects, []);
    assert.deepEqual(bytes(path.join(root, 'note.md')), before);
  });

  test('writer stops before rename when its primary target changes', (t) => {
    const root = bundle(t);
    concept(root);
    const response = runtime.run('okf-write', request(root), {
      ...services,
      publishFile(file, data, expected) {
        fs.writeFileSync(file, '---\ntype: Note\ntitle: Concurrent\n---\n# Body\n');
        services.publishFile(file, data, expected);
      },
    });
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'TARGET_CHANGED');
    assert.deepEqual(response.data.actual_effects, []);
    assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /Concurrent/);
  });

  test('writer publishes the primary before derivatives and reports a derivative residue', (t) => {
    const root = bundle(t);
    concept(root);
    fs.writeFileSync(path.join(root, 'log.md'), '---\nkind: Log\n---\n# Log\n');
    const response = runtime.run('okf-write', request(root, 'revise', {
      effects: ['concept-revise', 'log-append'],
    }), {
      ...services,
      publishFile(file, data, expected) {
        if (path.basename(file) === 'log.md') throw new Error('log device failed');
        services.publishFile(file, data, expected);
      },
    });
    assert.equal(response.result, 'failed/incomplete');
    assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: After/);
    assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise']);
    assert.deepEqual(response.data.residue, [{ effect: 'log-append', reason: 'log device failed' }]);
    assert.ok(response.findings.some((finding) => finding.code === 'DERIVATIVE_WRITE_FAILED'));
  });

  test('writer reports actual derivatives in requested effect order through the process seam', (t) => {
    const root = bundle(t);
    concept(root);
    fs.writeFileSync(path.join(root, 'log.md'), '---\nkind: Log\n---\n# Log\n');
    const value = request(root, 'revise', {
      effects: ['log-append', 'concept-revise', 'index-maintenance'],
    });
    const response = run(value);
    assert.equal(response.result, 'applied');
    assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /- \[note.md\]\(note.md\)/);
    assert.match(fs.readFileSync(path.join(root, 'log.md'), 'utf8'), /- revise: \[note.md\]\(note.md\)/);
    assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise', 'log-append', 'index-maintenance']);
    assert.deepEqual(response.data.actual_effects.map((item) => item.inherited), [false, true, true]);
    const repeat = run(value);
    assert.equal(repeat.result, 'no-op');
    assert.equal((fs.readFileSync(path.join(root, 'log.md'), 'utf8').match(/- revise: \[note.md\]\(note.md\)/g) || []).length, 1);
  });

  test('publishFile removes its temporary file after every failed stage', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-settlement-publish-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const originalWrite = fs.writeFileSync;
    const originalRename = fs.renameSync;

    function assertNoTemporary() {
      assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.tmp')), []);
    }

    const partial = path.join(root, 'partial.md');
    fs.writeFileSync(partial, 'old');
    fs.writeFileSync = (file, data, options) => {
      originalWrite(file, data, options);
      throw new Error('partial write failed');
    };
    try {
      assert.throws(() => services.publishFile(partial, 'new', 'old'), /partial write failed/);
    } finally {
      fs.writeFileSync = originalWrite;
    }
    assert.equal(fs.readFileSync(partial, 'utf8'), 'old');
    assertNoTemporary();

    const changed = path.join(root, 'changed.md');
    fs.writeFileSync(changed, 'changed');
    assert.throws(() => services.publishFile(changed, 'new', 'old'), { code: 'TARGET_CHANGED' });
    assert.equal(fs.readFileSync(changed, 'utf8'), 'changed');
    assertNoTemporary();

    const rename = path.join(root, 'rename.md');
    fs.writeFileSync(rename, 'old');
    fs.renameSync = () => { throw new Error('rename failed'); };
    try {
      assert.throws(() => services.publishFile(rename, 'new', 'old'), /rename failed/);
    } finally {
      fs.renameSync = originalRename;
    }
    assert.equal(fs.readFileSync(rename, 'utf8'), 'old');
    assertNoTemporary();
  });
});

test.describe('filesystem refusals and symlink escape', () => {
  function bundle(t, mode = 'knowledge-only') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-refusal-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: '0.2', project_mode: mode }],
    }));
    fs.writeFileSync(path.join(root, 'index.md'), '# Bundle\n');
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
        evidence: [binding(root, 'evidence.md')],
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

  function trySymlink(target, linkPath) {
    try {
      fs.symlinkSync(target, linkPath, 'dir');
      return true;
    } catch {
      return false;
    }
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

  test('a concept reached through a symlink that escapes the bundle root refuses create with SYMLINK_ESCAPE', (t) => {
    const root = bundle(t);
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-refusal-outside-')));
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
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-refusal-outside-')));
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
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-refusal-outside-')));
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

  test('a symlinked index.md that escapes the bundle refuses derivative append with SYMLINK_ESCAPE', (t) => {
    const root = bundle(t);
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-refusal-outside-')));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: "Note"\ntitle: "Before"\nstatus: "draft"\n---\n# Before\n');
    fs.writeFileSync(path.join(outside, 'index.md'), fs.readFileSync(path.join(root, 'index.md')));
    fs.unlinkSync(path.join(root, 'index.md'));
    if (!trySymlink(path.join(outside, 'index.md'), path.join(root, 'index.md'))) {
      t.skip('platform cannot create a symbolic link');
      return;
    }

    const revise = request(root, 'note.md', {
      set: { title: 'After' },
      effects: ['concept-revise', 'index-maintenance'],
    });
    revise.operation = 'revise';
    const response = run(revise);

    assert.equal(response.result, 'failed/incomplete');
    assert.ok(response.findings.some((item) => item.code === 'SYMLINK_ESCAPE'));
    assert.deepEqual(response.data.actual_effects.map((item) => item.effect), ['concept-revise']);
    assert.ok(response.data.residue.some((item) => item.effect === 'index-maintenance'));
    assert.equal(fs.readFileSync(path.join(outside, 'index.md'), 'utf8').includes('note.md'), false);
    for (const finding of response.findings) {
      const text = JSON.stringify(finding);
      assert.equal(text.includes(root), false);
      assert.equal(text.includes(outside), false);
    }
  });
});
