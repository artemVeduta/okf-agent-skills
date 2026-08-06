const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshot } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repo, 'scripts');
const skillsRoot = path.join(repo, 'skills');
const cliWrapper = path.join(scriptsRoot, 'okf-adapter.js');
const skills = ['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review'];
const harnesses = ['claude-code', 'codex', 'opencode'];

function temporaryRoot(t, prefix = 'okf-96-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

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

function runCli(args) {
  const result = childProcess.spawnSync(process.execPath, [cliWrapper, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr, response: JSON.parse(result.stdout) };
}

function runInstalledHook(targetDir, harness, stdin) {
  const hook = path.join(targetDir, 'okf-agent-skills', 'scripts', 'adapter-hook.js');
  const result = childProcess.spawnSync(process.execPath, [hook, harness, path.join(targetDir, 'manifest.json')], {
    input: JSON.stringify(stdin), encoding: 'utf8', cwd: os.tmpdir(),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('a project-layout skill install answers a real request from its own installed root', (t) => {
  const root = orientedBundle(temporaryRoot(t));
  const skillsDir = path.join(root, '.claude', 'skills');
  for (const name of skills) installSkill(name, skillsDir);

  const installed = path.join(skillsDir, 'okf-read');
  assert.equal(fs.lstatSync(path.join(installed, 'scripts')).isSymbolicLink(), false, 'the installer dereferences the symlink');
  const result = runInstalledWrapper(installed, 'okf-read', admitRequest(root), root);

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

test('installing an adapter copies the complete scripts tree inside the target and writes nothing outside it', (t) => {
  const root = temporaryRoot(t, 'okf-96-target-');
  fs.writeFileSync(path.join(root, 'sentinel.txt'), 'untouched');
  const expected = [];
  (function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(file);
      else expected.push(path.relative(scriptsRoot, file));
    }
  })(scriptsRoot);

  for (const harness of harnesses) {
    const targetDir = path.join(root, `.${harness}`);
    const targetName = path.basename(targetDir);
    const before = snapshot(root).filter(([name]) => !name.startsWith(targetName));

    assert.equal(runCli(['install', harness, targetDir]).response.ok, true, harness);

    const copied = path.join(targetDir, 'okf-agent-skills', 'scripts');
    for (const relative of expected) {
      assert.equal(fs.readFileSync(path.join(copied, relative), 'utf8'), fs.readFileSync(path.join(scriptsRoot, relative), 'utf8'), `${harness}:${relative}`);
    }
    assert.ok(expected.some((relative) => relative.startsWith(`lib${path.sep}`)), 'lib/ is part of the tree');
    assert.deepEqual(snapshot(root).filter(([name]) => !name.startsWith(targetName)), before, harness);
  }
});

test('the installed hook produces orientation by running its target-local okf-read wrapper as a process', (t) => {
  const bundle = orientedBundle(temporaryRoot(t, 'okf-96-hook-'));
  const targetDir = path.join(bundle, 'adapter');
  runCli(['install', 'claude-code', targetDir]);

  const working = runInstalledHook(targetDir, 'claude-code', { cwd: bundle, session_id: 'sess-a', source: 'startup' });
  assert.equal(working.status, 0);
  assert.equal(working.stderr, '');
  assert.match(working.stdout, /OKF orientation: bundle/);

  // Replacing only the TARGET-LOCAL wrapper changes the hook's output: the
  // dispatch is a child process of that file, not an in-process call into
  // the repository checkout.
  const localWrapper = path.join(targetDir, 'okf-agent-skills', 'scripts', 'okf-read.js');
  fs.writeFileSync(localWrapper, 'process.stdout.write(JSON.stringify({ result: "clean", data: { bundle: { bundle_alias: "sentinel-alias" }, root_index_path: "sentinel/index.md" } }) + "\\n");\n');
  const stubbed = runInstalledHook(targetDir, 'claude-code', { cwd: bundle, session_id: 'sess-b', source: 'startup' });
  assert.equal(stubbed.status, 0);
  assert.match(stubbed.stdout, /OKF orientation: bundle sentinel-alias, root index sentinel\/index\.md\./);

  const receipt = JSON.parse(fs.readFileSync(path.join(targetDir, '.okf-adapter.json'), 'utf8'));
  for (const relative of receipt.installed_files) {
    const text = fs.readFileSync(path.join(targetDir, relative), 'utf8');
    assert.equal(text.includes(repo), false, relative);
  }
});

// An incomplete copy of the scripts tree is a real installation failure mode
// now that the tree is copied file by file: it must not take the host session
// down with it.
test('an incomplete installed scripts tree fails closed instead of failing the host session', (t) => {
  const bundle = orientedBundle(temporaryRoot(t, 'okf-96-partial-'));
  const targetDir = path.join(bundle, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  fs.rmSync(path.join(targetDir, 'okf-agent-skills', 'scripts', 'lib', 'orientation.js'));

  const result = runInstalledHook(targetDir, 'claude-code', { cwd: bundle, session_id: 'sess-p', source: 'startup' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('a suite-version mismatch in the installed manifest fails closed through the installed copy', (t) => {
  const bundle = orientedBundle(temporaryRoot(t, 'okf-96-mismatch-'));
  const targetDir = path.join(bundle, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  const manifestPath = path.join(targetDir, 'manifest.json');
  const installedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(manifestPath, JSON.stringify({ ...installedManifest, suite_version: '9.9.9' }));

  const result = runInstalledHook(targetDir, 'claude-code', { cwd: bundle, session_id: 'sess-c', source: 'startup' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /OKF orientation .*suite_version_mismatch/);
});

test('the disabled marker makes the installed hook a silent no-op', (t) => {
  const bundle = orientedBundle(temporaryRoot(t, 'okf-96-disabled-'));
  const targetDir = path.join(bundle, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  runCli(['disable', 'claude-code', targetDir]);

  const result = runInstalledHook(targetDir, 'claude-code', { cwd: bundle, session_id: 'sess-d', source: 'startup' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-occurrences.json')), false);
});

test('the receipt owns every copied script, and uninstall removes the whole scripts tree and its directories', (t) => {
  const root = temporaryRoot(t, 'okf-96-uninstall-');
  fs.writeFileSync(path.join(root, 'sentinel.txt'), 'untouched');
  const before = snapshot(root);

  for (const harness of harnesses) {
    const targetDir = path.join(root, `.${harness}`);
    const receiptPath = path.join(targetDir, '.okf-adapter.json');
    runCli(['install', harness, targetDir]);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const owned = new Set(receipt.installed_files);

    (function assertOwned(dir, base) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) assertOwned(file, base);
        else assert.equal(owned.has(path.relative(base, file)), true, `${harness}:${path.relative(base, file)}`);
      }
    })(path.join(targetDir, 'okf-agent-skills'), targetDir);

    assert.equal(runCli(['uninstall', harness, targetDir]).response.ok, true, harness);
    assert.equal(fs.existsSync(path.join(targetDir, 'okf-agent-skills')), false, harness);
    assert.deepEqual(snapshot(root), before, harness);
  }
});
