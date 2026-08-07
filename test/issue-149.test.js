const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const path = require('node:path');
const { runWrapper, adapterManifest, temporaryRoot } = require('../test-support/snapshot');

// #149: setup's orchestration adapter over the shared semantic contract seam.
// `publish` is the operation under test -- the one thing in this skill that
// ever reaches the real bundle, and it does so only by invoking the same
// delegation bridge (`scripts/okf-delegate.js`) any other caller would.

const setupWrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const readWrapper = path.join(__dirname, '..', 'scripts', 'okf-read.js');
const bridgeWrapper = path.join(__dirname, '..', 'scripts', 'adapter-bridge.js');
const harnesses = ['claude-code', 'codex', 'opencode'];

// Bundle lives at `<root>/okf`, the default `publish`/`assemble` bundle name,
// so `.okf-staging/okf/...` (staging) and `okf/...` (the real bundle) sit
// side by side exactly as they would in a real project. `okf-write`'s own
// `create` (unchanged by #149, see test/issue-53.test.js's own
// `missing/note.md` case) does not create a new subdirectory for a concept
// -- targeting one whose directory does not exist yet is that operation's
// own ordinary `failed/incomplete`, not a `publish`-specific gap -- so every
// fixture here pre-creates `decisions/`, the one canonical directory these
// tests target, exactly as an already-migrated bundle would already have it.
function repo(t) {
  const root = temporaryRoot(t, 'okf-149-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  return root;
}

function bareRepo(t) {
  const root = temporaryRoot(t, 'okf-149-bare-');
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

// A plain filesystem action, exactly what `assemble` itself performs --
// staging is never reached through the write gate (#131, #147).
function stage(root, relative, content, bundle = 'okf') {
  const file = path.join(root, '.okf-staging', bundle, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return path.join('.okf-staging', bundle, relative);
}

function stagedRef(root, sourcePath, concept, type, content) {
  const file = stage(root, `${concept}.md`, content);
  return { path: sourcePath, concept, type, shard: 'x', file };
}

function publishRequest(root, staged, payload = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'publish',
    payload: { cwd: root, task_kind: 'feature work', staged, ...payload },
  };
}

function run(value) {
  return runWrapper(setupWrapper, value);
}

function bundleFile(root, concept) {
  return path.join(root, 'okf', `${concept}.md`);
}

// ------------------------------------------------------- through the write gate

test('publish promotes a staged concept into the real bundle by delegating one okf-write create call', (t) => {
  const root = repo(t);
  const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\n---\n# A\n\nBody text.\n')];
  const stagedFile = fs.readFileSync(path.join(root, staged[0].file), 'utf8');

  const response = run(publishRequest(root, staged));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'complete');
  assert.deepEqual(response.data.published, ['decisions/a']);
  assert.deepEqual(response.data.failed, []);
  assert.deepEqual(response.findings, []);

  // The write gate, not `publish`, decided the actual bytes: `status: "draft"`
  // assigned by `evaluateCreate` itself, never copied from the staged file.
  const written = fs.readFileSync(bundleFile(root, 'decisions/a'), 'utf8');
  assert.match(written, /^---\nstatus: draft\ntype: Decision\n---\n/);
  assert.match(written, /Body text\.\n$/);

  // Staging is scratch space `publish` reads, never clears -- it is not a
  // resume ledger (#131, #147).
  assert.equal(fs.readFileSync(path.join(root, staged[0].file), 'utf8'), stagedFile);
});

test('a task kind outside the write-eligible set is blocked before anything is dispatched', (t) => {
  const root = repo(t);
  const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\n---\n# A\n')];

  const response = run(publishRequest(root, staged, { task_kind: 'chore' }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'TASK_KIND_NOT_WRITE_ELIGIBLE');
  assert.equal(fs.existsSync(bundleFile(root, 'decisions/a')), false);
});

// -------------------------------------------------- not bypassable (write gate)

test('publish is refused by the same write gate an inline create would hit, and never overwrites what is already there', (t) => {
  const root = repo(t);
  const original = '---\ntype: Decision\ntitle: Original\n---\n# Original\n';
  fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
  fs.writeFileSync(bundleFile(root, 'decisions/a'), original);

  const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\n---\n# Would-be replacement\n')];
  const response = run(publishRequest(root, staged));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.published, []);
  assert.equal(response.data.failed.length, 1);
  assert.equal(response.data.failed[0].concept, 'decisions/a');
  const finding = response.findings.find((item) => item.code === 'CONCEPT_ALREADY_EXISTS');
  assert.ok(finding, "the write gate's own refusal must be visible, not swallowed by publish");
  assert.equal(finding.detail.concept, 'decisions/a');

  // Non-bypassable, proven on disk: the pre-existing concept is untouched.
  assert.equal(fs.readFileSync(bundleFile(root, 'decisions/a'), 'utf8'), original);
});

test("one failing concept never withdraws another concept's own successful publish", (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
  fs.writeFileSync(bundleFile(root, 'decisions/blocked'), '---\ntype: Decision\n---\n# Already there\n');

  const staged = [
    stagedRef(root, 'docs/blocked.md', 'decisions/blocked', 'Decision', '---\ntype: Decision\n---\n# Replacement attempt\n'),
    stagedRef(root, 'docs/ok.md', 'decisions/ok', 'Decision', '---\ntype: Decision\n---\n# OK\n'),
  ];
  const response = run(publishRequest(root, staged));

  assert.equal(response.data.status, 'partial');
  assert.deepEqual(response.data.published, ['decisions/ok']);
  assert.deepEqual(response.data.failed.map((item) => item.concept), ['decisions/blocked']);
  assert.equal(fs.existsSync(bundleFile(root, 'decisions/ok')), true);
});

// --------------------------------------------- read reaches the shared seam

test('publish is blocked at one clear precheck, through a delegated read, when the bundle is not active -- never per-concept noise', (t) => {
  const root = repo(t);
  const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\n---\n# A\n')];

  // Publish carries no admission of its own (#149): it never touches the
  // bundle directly, so nothing else here would have caught a bundle that
  // stopped being active. Only the delegated `okf-reader` `validate` call
  // this operation issues before any write is attempted does.
  fs.rmSync(path.join(root, '.okf-active'));

  const response = run(publishRequest(root, staged));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'PUBLISH_PRECHECK_FAILED');
  assert.equal(fs.existsSync(bundleFile(root, 'decisions/a')), false, 'no per-concept attempt may run once the precheck itself failed');
});

test('migration-validate and okf-read validate report the identical structural finding for the identical defect: one shared reader, not two', (t) => {
  const staging = repo(t);
  stage(staging, 'decisions/a.md', '---\ntitle: Missing a type\n---\n# Missing a type\n');
  const migrationValidateResponse = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: {
      cwd: staging,
      selected: ['docs/a.md'],
      plan: { entries: [{ path: 'docs/a.md', disposition: 'migrate', reason: 'type_preserved', concept: 'decisions/a', type: 'Decision' }], executable: true },
      semantic_review: { performed: true },
    },
  });
  const stagingFinding = migrationValidateResponse.findings.find((item) => item.code === 'TYPE_MISSING');
  assert.ok(stagingFinding, 'migration-validate must surface the same TYPE_MISSING code the write gate and okf-read validate both use');
  assert.equal(stagingFinding.detail.path, 'decisions/a.md');

  const live = repo(t);
  fs.writeFileSync(path.join(live, 'okf', 'note.md'), '---\ntitle: Missing a type\n---\n# Missing a type\n');
  const readResponse = runWrapper(readWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-read',
    operation: 'validate',
    payload: { cwd: live, bundle: 'okf' },
  });
  const liveFinding = readResponse.findings.find((item) => item.code === 'TYPE_MISSING');
  assert.ok(liveFinding, 'okf-read validate must report the identical code for the identical defect');
  assert.equal(liveFinding.detail.path, 'note.md');
});

// --------------------------------------- bridge narrowing unchanged (#97)

test('okf-setup gains no role in the delegation bridge: still absent from bridge.skills, still rejected by the shared adapter bridge', () => {
  for (const harness of harnesses) {
    const manifest = adapterManifest(harness);
    assert.deepEqual(manifest.bridge.skills, ['okf-read', 'okf-write'], harness);
  }
  for (const harness of harnesses) {
    const result = childProcess.spawnSync(process.execPath, [bridgeWrapper, harness, 'okf-setup'], {
      input: '', encoding: 'utf8',
    });
    assert.equal(result.status, 64, harness);
    assert.equal(result.stdout, '', harness);
    assert.match(result.stderr, /Unsupported adapter bridge request/, harness);
  }
});

// ------------------------------------------------- justified divergences (#149 audit)

test('assemble and migration-validate still need no admitted bundle at all: staging is not, and never was, gated by activation', (t) => {
  const root = bareRepo(t);
  assert.equal(fs.existsSync(path.join(root, '.okf-active')), false);
  assert.equal(fs.existsSync(path.join(root, 'okf', 'index.md')), false);

  const brief = {
    shard: 'x', cwd: root, bundle: 'okf', project_mode: null, okf_version: '0.2',
    sources: ['docs/a.md'],
    mapping: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', sources: null, body: '# A\n' }],
    references: [],
    neighbors: [],
  };
  const shard = {
    shard: 'x',
    concepts: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', body: '# A\n' }],
    references: [],
    warnings: [],
    blockers: [],
  };
  const shardFile = path.join(root, '.okf-staging', 'shards', 'x.json');
  fs.mkdirSync(path.dirname(shardFile), { recursive: true });
  fs.writeFileSync(shardFile, JSON.stringify(shard));

  const assembleResponse = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'assemble',
    payload: {
      cwd: root,
      partition: { shards: [{ shard: 'x', sources: ['docs/a.md'], brief }], cross_shard_links: [] },
      shards: [{ shard: 'x', path: path.relative(root, shardFile) }],
    },
  });
  assert.equal(assembleResponse.result, 'ok', JSON.stringify(assembleResponse));
  assert.equal(assembleResponse.data.status, 'complete');
  assert.equal(fs.existsSync(path.join(root, '.okf-staging', 'okf', 'decisions', 'a.md')), true);

  const migrationValidateResponse = run({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-validate',
    payload: {
      cwd: root,
      selected: ['docs/a.md'],
      plan: { entries: [{ path: 'docs/a.md', disposition: 'migrate', reason: 'type_preserved', concept: 'decisions/a', type: 'Decision' }], executable: true },
      semantic_review: { performed: true },
    },
  });
  assert.equal(migrationValidateResponse.result, 'ok');
  assert.equal(migrationValidateResponse.data.publishable, true);

  // The real bundle still does not exist: neither operation ever created it.
  assert.equal(fs.existsSync(path.join(root, 'okf')), false);
});
