// Symlink following is relied on only for this covered layout. Exclusions: broken links, cyclic links, links escaping a trusted root, sibling repositories, and future harness versions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runWrapper } = require('../test-support/snapshot');
const orientation = require('../scripts/lib/orientation');

const repo = path.resolve(__dirname, '..');

function temporaryRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-72-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function installedWrapper(t, store) {
  const root = temporaryRoot(t);
  const release = path.join(root, 'release');
  const skill = path.join(release, 'skills', 'okf-read');
  const worktree = path.join(root, 'worktree');
  const home = path.join(root, 'home');
  const storeRoot = store === 'project'
    ? path.join(worktree, '.agents', 'skills')
    : path.join(home, '.agents', 'skills');

  // Wrapper resolution needs the scripts tree; SKILL.md is not part of this path.
  fs.cpSync(path.join(repo, 'scripts'), path.join(release, 'scripts'), { recursive: true });
  fs.mkdirSync(skill, { recursive: true });
  fs.symlinkSync(path.relative(skill, path.join(release, 'scripts')), path.join(skill, 'scripts'), 'dir');
  fs.mkdirSync(storeRoot, { recursive: true });
  fs.symlinkSync(path.relative(storeRoot, skill), path.join(storeRoot, 'okf-read'), 'dir');
  fs.mkdirSync(path.join(worktree, '.git'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.okf-active'), '');
  fs.writeFileSync(path.join(worktree, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');

  return { home, worktree, wrapper: path.join(storeRoot, 'okf-read', 'scripts', 'okf-read.js') };
}

function run(wrapper, cwd, home, payload) {
  return runWrapper(wrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'orient', invocation: 'automatic', payload,
  }, {
    cwd,
    env: { ...process.env, HOME: home },
  });
}

for (const store of ['project', 'global']) {
  test(`${store} skill store resolves the installed wrapper`, (t) => {
    const fixture = installedWrapper(t, store);
    const value = run(fixture.wrapper, fixture.worktree, fixture.home, {
      cwd: fixture.worktree, harness: 'opencode', context_id: store, logical_cause: 'system-transform', suite_version: orientation.suiteVersion,
    });

    assert.equal(value.result, 'clean');
  });
}

test('a mismatched installed version fails closed with a suite reason', (t) => {
  const fixture = installedWrapper(t, 'project');
  const installedRuntime = path.join(path.dirname(fixture.wrapper), 'lib', 'orientation.js');
  const source = fs.readFileSync(installedRuntime, 'utf8');
  const patched = source.replace(`const suiteVersion = '${orientation.suiteVersion}';`, "const suiteVersion = '0.0.0';");
  assert.notEqual(patched, source);
  fs.writeFileSync(installedRuntime, patched);
  const value = run(fixture.wrapper, fixture.worktree, fixture.home, {
    cwd: fixture.worktree, harness: 'opencode', context_id: 'mismatch', logical_cause: 'system-transform', suite_version: orientation.suiteVersion,
  });

  assert.equal(value.result, 'invalid');
  assert.deepEqual(value.findings, [{
    code: 'invalid', origin: 'suite', severity: 'error', blocks: true,
    detail: { gate: 'orientation', reason: 'suite_version_mismatch' },
  }]);
});
