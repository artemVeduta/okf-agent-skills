const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { binding, runWrapper, snapshot, treeHash, writeManifest } = require('../../test-support/snapshot');

const repo = path.resolve(__dirname, '..', '..');

test.describe('sync outcomes', () => {
  const lifecycleWrapper = path.join(repo, 'scripts', 'okf-lifecycle.js');
  const routerWrapper = path.join(repo, 'scripts', 'okf.js');
  const writeLimits = {
    writes: 'not serialized',
    crash_recovery: 'not provided',
    semantic_support: 'not runtime-verified',
    non_file_evidence: 'accepted proposal only',
  };

  function bundle(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-sync-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
    fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
    return root;
  }

  function changedPaths(before, after) {
    const entries = (items) => new Map(items.map(([name, type, content]) => [name, JSON.stringify([type, content])]));
    const previous = entries(before);
    const current = entries(after);
    return [...new Set([...previous.keys(), ...current.keys()])].filter((name) => previous.get(name) !== current.get(name));
  }

  function run(wrapper, request) {
    return runWrapper(wrapper, request);
  }

  function syncRequest(root, concept = 'note.md', payload = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-lifecycle',
      operation: 'sync',
      task_kind: 'fix',
      invocation: 'explicit',
      scope: { concepts: [concept] },
      payload: {
        cwd: root,
        bundle: root,
        concept,
        set: { title: 'After' },
        evidence: [binding(root, 'evidence.md')],
        ...payload,
      },
    };
  }

  function sync(root, concept = 'note.md', payload = {}) {
    return run(lifecycleWrapper, syncRequest(root, concept, payload));
  }

  test('sync revises one scoped concept and its requested direct derivatives', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    fs.writeFileSync(path.join(root, 'log.md'), '# Log\n');
    fs.writeFileSync(path.join(root, 'other.md'), '---\ntype: Note\ntitle: Other\n---\n# Other\n');
    fs.writeFileSync(path.join(root, 'other-log.md'), '# Other log\n');
    const before = snapshot(root);

    const response = sync(root, 'note.md', {
      effects: ['concept-revise', 'index-maintenance', 'log-append'],
    });

    assert.equal(response.result, 'applied');
    assert.deepEqual(response.scope, { concepts: ['note.md'] });
    assert.deepEqual(response.evidence_limits, writeLimits);
    assert.deepEqual(response.data.effects.map((effect) => effect.effect), ['concept-revise', 'index-maintenance', 'log-append']);
    assert.deepEqual(response.data.actual_effects.map((effect) => effect.effect), ['concept-revise', 'index-maintenance', 'log-append']);
    assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /title: After/);
    assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /- \[note.md\]\(note.md\)/);
    assert.match(fs.readFileSync(path.join(root, 'log.md'), 'utf8'), /- revise: \[note.md\]\(note.md\)/);
    assert.equal(fs.readFileSync(path.join(root, 'other.md'), 'utf8'), '---\ntype: Note\ntitle: Other\n---\n# Other\n');
    assert.equal(fs.readFileSync(path.join(root, 'other-log.md'), 'utf8'), '# Other log\n');
    assert.deepEqual(changedPaths(before, snapshot(root)), ['index.md', 'log.md', 'note.md']);
  });

  test('sync creates one evidence-backed draft concept', (t) => {
    const root = bundle(t);

    const response = sync(root, 'new.md', { set: { type: 'Note' } });

    assert.equal(response.result, 'applied');
    assert.deepEqual(response.scope, { concepts: ['new.md'] });
    assert.deepEqual(response.evidence_limits, writeLimits);
    assert.deepEqual(response.data.actual_effects.map((effect) => effect.effect), ['concept-create']);
    const draft = fs.readFileSync(path.join(root, 'new.md'), 'utf8');
    assert.match(draft, /status: draft/);
    assert.doesNotMatch(draft, /verified:/);
    assert.deepEqual(fs.readdirSync(root).sort(), ['.git', '.okf-workspace.json', 'evidence.md', 'index.md', 'new.md']);
  });

  test('sync reports a no-op without changing content or creating lifecycle state', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    sync(root);
    const before = snapshot(root);

    const response = sync(root);

    assert.equal(response.result, 'no-op');
    assert.deepEqual(response.scope, { concepts: ['note.md'] });
    assert.deepEqual(response.evidence_limits, writeLimits);
    assert.deepEqual(response.data.actual_effects, []);
    assert.deepEqual(snapshot(root), before);
  });

  test('sync abstains when no change set is supplied', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    const request = syncRequest(root);
    delete request.payload.set;
    const before = snapshot(root);

    const response = run(lifecycleWrapper, request);

    assert.equal(response.result, 'abstained');
    assert.deepEqual(response.scope, { concepts: ['note.md'] });
    assert.deepEqual(response.evidence_limits, writeLimits);
    assert.deepEqual(response.data.actual_effects, []);
    assert.deepEqual(snapshot(root), before);
  });

  test('pre-PR synchronization abstains without writing', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    const before = snapshot(root);
    const request = syncRequest(root);
    request.task_kind = 'pre-PR synchronization';

    const response = run(lifecycleWrapper, request);

    assert.equal(response.result, 'abstained');
    assert.deepEqual(response.data.actual_effects, []);
    assert.deepEqual(snapshot(root), before);
  });

  test('sync blocks unavailable evidence and unknown write ownership without changes', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    const before = snapshot(root);

    const unavailable = sync(root, 'note.md', { evidence: [{ path: 'missing.md', sha256: 'a'.repeat(64) }] });

    assert.equal(unavailable.result, 'blocked');
    assert.equal(unavailable.data.code, 'EVIDENCE_UNAVAILABLE');
    const unavailableFinding = unavailable.findings.find((finding) => finding.code === 'EVIDENCE_UNAVAILABLE');
    assert.equal(unavailableFinding.origin, 'suite');
    assert.equal(unavailableFinding.blocks, true);
    assert.deepEqual(unavailable.evidence_limits, writeLimits);
    assert.deepEqual(snapshot(root), before);

    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-sync-outside-')));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const foreign = syncRequest(root);
    foreign.payload.bundle = outside;
    const outsideBefore = snapshot(outside);

    const ownership = run(lifecycleWrapper, foreign);

    assert.equal(ownership.result, 'blocked');
    assert.equal(ownership.data.code, 'WRITE_OWNERSHIP_UNKNOWN');
    const ownershipFinding = ownership.findings.find((finding) => finding.code === 'WRITE_OWNERSHIP_UNKNOWN');
    assert.equal(ownershipFinding.origin, 'suite');
    assert.equal(ownershipFinding.blocks, true);
    assert.deepEqual(ownership.evidence_limits, writeLimits);
    assert.deepEqual(snapshot(root), before);
    assert.deepEqual(snapshot(outside), outsideBefore);
  });

  test('sync without invocation is invalid wrapper input, and automatic invocation blocks the mutation', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    const before = snapshot(root);

    const missing = syncRequest(root);
    delete missing.invocation;
    const missingResult = childProcess.spawnSync(process.execPath, [lifecycleWrapper], {
      input: JSON.stringify(missing), encoding: 'utf8',
    });
    assert.equal(missingResult.status, 64);
    assert.equal(missingResult.stdout, '');
    assert.ok(missingResult.stderr.trim().length > 0);
    assert.equal(missingResult.stderr.trim().includes('\n'), false);
    assert.equal(missingResult.stderr.includes('\n    at '), false);
    assert.deepEqual(snapshot(root), before);

    const automatic = run(lifecycleWrapper, { ...syncRequest(root), invocation: 'automatic' });
    assert.equal(automatic.result, 'blocked');
    assert.equal(automatic.data.code, 'AUTOMATIC_MUTATION_BLOCKED');
    assert.deepEqual(snapshot(root), before);

    const routerMissing = { ...syncRequest(root), skill: 'okf' };
    delete routerMissing.invocation;
    const routerMissingResult = childProcess.spawnSync(process.execPath, [routerWrapper], {
      input: JSON.stringify(routerMissing), encoding: 'utf8',
    });
    assert.equal(routerMissingResult.status, 64);
    assert.equal(routerMissingResult.stdout, '');
    assert.deepEqual(snapshot(root), before);
  });

  test('router rejects unsupported broad lifecycle operations without changes', (t) => {
    const root = bundle(t);
    const before = snapshot(root);

    // `init` is no longer unsupported (#137): it is a sealed router operation owned by
    // `okf-setup`. `migrate` and `compact` remain unimplemented.
    for (const operation of ['migrate', 'compact']) {
      const response = run(routerWrapper, {
        protocol: 'okf-wrapper/1',
        skill: 'okf',
        operation,
        payload: { cwd: root },
      });

      assert.equal(response.result, 'blocked', operation);
      assert.equal(response.data.code, 'UNKNOWN_OPERATION', operation);
      assert.equal(response.scope, null, operation);
      assert.deepEqual(response.evidence_limits, writeLimits, operation);
      assert.deepEqual(snapshot(root), before, operation);
    }
  });
});

test.describe('deprecation retention policy', () => {
  const wrapper = path.join(repo, 'scripts', 'okf-read.js');

  function bundle(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-retention-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
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
    const index = '---\nokf_version: "0.2"\n---\n# Bundle\n\n- [Old note](old.md)\n';
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
    assert.equal(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), index);
    assert.equal(treeHash(root), before);
  });

  test('shipped navigation and archive code has no concept supersession machinery', () => {
    const forbidden = ['superseded_by', 'deprecation_reason', 'retain_until', 'concept_alias', 'conceptAlias', 'followSuccessor', 'follow_successor'];

    for (const file of sourceFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      for (const term of forbidden) assert.equal(hasForbiddenMechanic(source, term), false, `${file}: ${term}`);
    }
  });
});
