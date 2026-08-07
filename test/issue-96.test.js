const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { temporaryRoot } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repo, 'scripts');
const skillsRoot = path.join(repo, 'skills');
const skills = ['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review', 'okf-setup'];

// How an installer must copy a source skill: the `scripts` symlink is
// dereferenced into real files, so the installed skill carries its own
// runtime and never points back at the checkout. (cpSync's `dereference`
// rewrites a directory symlink to an absolute link, so the link's referent
// is copied explicitly.)
function installSkill(name, skillsDir) {
  const destination = path.join(skillsDir, name);
  const link = path.join(skillsRoot, name, 'scripts');
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(path.join(skillsRoot, name), destination, {
    recursive: true, dereference: true, filter: (source) => source !== link,
  });
  fs.cpSync(fs.realpathSync(link), path.join(destination, 'scripts'), { recursive: true, dereference: true });
  return destination;
}

function orientedBundle(root) {
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  return root;
}

function runInstalledWrapper(skillRoot, name, request, cwd) {
  const result = childProcess.spawnSync(process.execPath, [path.join(skillRoot, 'scripts', `${name}.js`)], {
    input: JSON.stringify(request), encoding: 'utf8', cwd,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function admitRequest(bundle) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'admit', payload: { cwd: bundle, candidates: [] } };
}

test('a project-layout skill install answers a real request from its own installed root', (t) => {
  const root = orientedBundle(temporaryRoot(t));
  const skillsDir = path.join(root, '.claude', 'skills');
  for (const name of skills) installSkill(name, skillsDir);

  const installed = path.join(skillsDir, 'okf-read');
  assert.equal(fs.lstatSync(path.join(installed, 'scripts')).isSymbolicLink(), false, 'the installer dereferences the symlink');
  const result = runInstalledWrapper(installed, 'okf-read', admitRequest(root), root);
  const writeInstalled = path.join(skillsDir, 'okf-write');
  assert.equal(fs.existsSync(path.join(writeInstalled, 'references', 'wrapper-request-fields.md')), true, 'a symlinked reference file is dereferenced and survives install');

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout).data, { federation: 'none', candidates: [] });
});

test('a global-layout skill install resolves its wrapper from the skill root, not from cwd or PATH', (t) => {
  const home = temporaryRoot(t, 'okf-96-home-');
  const bundle = orientedBundle(temporaryRoot(t, 'okf-96-bundle-'));
  const unrelated = temporaryRoot(t, 'okf-96-cwd-');
  const installed = installSkill('okf-read', path.join(home, '.claude', 'skills'));

  const result = runInstalledWrapper(installed, 'okf-read', admitRequest(bundle), unrelated);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).result, 'ok');
  assert.deepEqual(fs.readdirSync(unrelated), [], 'nothing resolved or written relative to cwd');
});

test('a single skill installed with no siblings is independently executable', (t) => {
  const bundle = orientedBundle(temporaryRoot(t, 'okf-96-solo-bundle-'));
  const skillsDir = path.join(temporaryRoot(t, 'okf-96-solo-'), '.claude', 'skills');
  const installed = installSkill('okf-review', skillsDir);

  assert.deepEqual(fs.readdirSync(skillsDir), ['okf-review']);
  const result = runInstalledWrapper(installed, 'okf-review', {
    protocol: 'okf-wrapper/1', skill: 'okf-review', operation: 'review',
    payload: { cwd: bundle, bundle, concept: 'index.md' },
  }, os.tmpdir());

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).skill, 'okf-review');
});

test('every shipped skill states the skill-root invocation and links its scripts directory to the repository tree', () => {
  for (const name of skills) {
    const skillDir = path.join(skillsRoot, name);
    const link = path.join(skillDir, 'scripts');
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, name);
    assert.equal(fs.realpathSync(link), fs.realpathSync(scriptsRoot), name);
    assert.equal(fs.existsSync(path.join(link, `${name}.js`)), true, name);

    const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    assert.ok(text.includes(`node <skill-root>/scripts/${name}.js`), name);
    assert.match(text, /never a path resolved from the current working directory or PATH/, name);
  }
});


