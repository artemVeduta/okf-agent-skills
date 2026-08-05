const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshot } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const cliWrapper = path.join(repo, 'scripts', 'okf-adapter.js');
const readWrapper = path.join(repo, 'scripts', 'okf-read.js');
const adapterHookWrapper = path.join(repo, 'scripts', 'adapter-hook.js');
const adaptersDir = path.join(repo, 'adapters');
const orientation = require('../scripts/lib/orientation');

function temporaryRoot(t, prefix = 'okf-66-adapters-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function manifest(harness) {
  return JSON.parse(fs.readFileSync(path.join(adaptersDir, harness, 'manifest.json'), 'utf8'));
}

function allText(dir) {
  let text = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    text += entry.isDirectory() ? allText(file) : fs.readFileSync(file, 'utf8');
  }
  return text;
}

function runCli(args) {
  const result = childProcess.spawnSync(process.execPath, [cliWrapper, ...args], { encoding: 'utf8' });
  assert.equal(result.stdout.endsWith('\n'), true);
  assert.equal(result.stdout.split('\n').length, 2);
  return { status: result.status, stderr: result.stderr, response: JSON.parse(result.stdout) };
}

function orientedRepo(t) {
  const root = temporaryRoot(t, 'okf-66-hook-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function runHook(harness, manifestPath, stdin) {
  const result = childProcess.spawnSync(process.execPath, [adapterHookWrapper, harness, manifestPath], {
    input: JSON.stringify(stdin), encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('each adapter manifest declares this suite version and its own installs', () => {
  for (const harness of ['claude-code', 'codex', 'opencode']) {
    const declared = manifest(harness);
    assert.equal(declared.harness, harness);
    assert.equal(declared.suite_version, orientation.suiteVersion);
    assert.ok(Array.isArray(declared.seams) && declared.seams.length > 0, harness);
    assert.ok(Array.isArray(declared.installs) && declared.installs.length > 0, harness);
    for (const entry of declared.installs) {
      assert.equal(fs.existsSync(path.join(adaptersDir, harness, entry.source)), true, `${harness}:${entry.source}`);
    }
  }
});

test('each adapter manifest declares exactly the orient logical causes in the shared seam table', () => {
  for (const harness of ['claude-code', 'codex', 'opencode']) {
    const declared = manifest(harness);
    const declaredCauses = declared.seams.flatMap((seam) => seam.logical_causes || []);
    assert.deepEqual(declaredCauses.slice().sort(), [...orientation.seamTable[harness].orient].sort(), harness);
  }
});

test('Claude Code declares SessionStart for startup, resume, clear, compact, and fork', () => {
  const declared = manifest('claude-code');
  const sessionStart = declared.seams.find((seam) => seam.native_event === 'SessionStart');
  assert.ok(sessionStart);
  assert.deepEqual(sessionStart.logical_causes.slice().sort(), ['clear', 'compact', 'fork', 'resume', 'startup']);
  const hooks = JSON.parse(fs.readFileSync(path.join(adaptersDir, 'claude-code', 'hooks', 'hooks.json'), 'utf8'));
  assert.ok(Object.hasOwn(hooks.hooks, 'SessionStart'));
  assert.deepEqual(hooks.hooks.SessionStart[0].matcher.split('|').sort(), [...orientation.seamTable['claude-code'].orient].sort());
});

test('Codex declares SessionStart plus SubagentStart with no inferred fork, no allowed-tools claim, and no skill-scoped hook', () => {
  const declared = manifest('codex');
  const sessionStart = declared.seams.find((seam) => seam.native_event === 'SessionStart');
  const subagentStart = declared.seams.find((seam) => seam.native_event === 'SubagentStart');
  assert.ok(sessionStart);
  assert.ok(subagentStart);
  assert.equal(sessionStart.logical_causes.includes('fork'), false);
  assert.equal(subagentStart.logical_causes.includes('fork'), false);

  const hooks = JSON.parse(fs.readFileSync(path.join(adaptersDir, 'codex', 'hooks.json'), 'utf8'));
  const expectedSessionStart = [...orientation.seamTable.codex.orient].filter((cause) => cause !== 'subagent-start').sort();
  assert.deepEqual(hooks.hooks.SessionStart[0].matcher.split('|').sort(), expectedSessionStart);
  assert.equal(hooks.hooks.SubagentStart[0].matcher, undefined);

  const text = allText(path.join(adaptersDir, 'codex'));
  assert.equal(text.includes('allowed-tools'), false);
  assert.equal(/"skill"\s*:/.test(text), false);
});

test('OpenCode declares experimental.chat.system.transform as the only orientation seam and treats session.created/session.compacted as lifecycle-only', () => {
  const declared = manifest('opencode');
  const transform = declared.seams.find((seam) => seam.native_event === 'experimental.chat.system.transform');
  const created = declared.seams.find((seam) => seam.native_event === 'session.created');
  const compacted = declared.seams.find((seam) => seam.native_event === 'session.compacted');
  assert.equal(transform.role, 'orientation');
  assert.equal(created.role, 'lifecycle-only');
  assert.equal(compacted.role, 'lifecycle-only');
});

test('OpenCode ships per-skill permission.skill: deny with required skill metadata keys intact and no disable-model-invocation key', () => {
  const config = JSON.parse(fs.readFileSync(path.join(adaptersDir, 'opencode', 'config.json'), 'utf8'));
  for (const skill of ['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review']) {
    assert.equal(config.permission.skill[skill], 'deny', skill);
  }
  const text = allText(adaptersDir);
  assert.equal(text.includes('disable-model-invocation'), false);
});

test('install writes only inside the given harness-local target directory, leaving the marker, workspace manifest, OKF content, and other adapters untouched', (t) => {
  const root = temporaryRoot(t);
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), '{}');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  fs.mkdirSync(path.join(root, '.other-adapter'));
  fs.writeFileSync(path.join(root, '.other-adapter', 'sentinel.txt'), 'untouched');
  const targetDir = path.join(root, '.claude', 'plugins', 'okf-agent-skills');
  const before = snapshot(root).filter(([name]) => !name.startsWith(path.join('.claude')));

  const installed = runCli(['install', 'claude-code', targetDir]);
  assert.equal(installed.status, 0);
  assert.equal(installed.stderr, '');
  assert.equal(installed.response.ok, true);
  assert.equal(fs.existsSync(path.join(targetDir, 'manifest.json')), true);

  const afterInstall = snapshot(root).filter(([name]) => !name.startsWith(path.join('.claude')));
  assert.deepEqual(afterInstall, before);

  const disabled = runCli(['disable', 'claude-code', targetDir]);
  assert.equal(disabled.status, 0);
  assert.equal(disabled.response.ok, true);
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-adapter-disabled')), true);
  assert.equal(fs.existsSync(path.join(targetDir, 'manifest.json')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(targetDir, '.okf-adapter.json'), 'utf8')).disabled, true);

  const uninstalled = runCli(['uninstall', 'claude-code', targetDir]);
  assert.equal(uninstalled.status, 0);
  assert.equal(uninstalled.response.ok, true);
  assert.equal(fs.existsSync(path.join(targetDir, 'manifest.json')), false);
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-adapter.json')), false);
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-adapter-disabled')), false);

  assert.deepEqual(snapshot(root).filter(([name]) => !name.startsWith(path.join('.claude'))), before);
  assert.equal(fs.readFileSync(path.join(root, '.other-adapter', 'sentinel.txt'), 'utf8'), 'untouched');
});

test('uninstall never deletes a receipt path that resolves outside the target directory', (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, 'target');
  fs.mkdirSync(targetDir, { recursive: true });
  const victim = path.join(root, 'victim.txt');
  fs.writeFileSync(victim, 'do not delete me');
  fs.writeFileSync(path.join(targetDir, '.okf-adapter.json'), JSON.stringify({
    harness: 'claude-code', suite_version: orientation.suiteVersion, installed_files: ['../victim.txt'], disabled: false,
  }));

  const result = childProcess.spawnSync(process.execPath, [cliWrapper, 'uninstall', 'claude-code', targetDir], { encoding: 'utf8' });

  assert.equal(fs.existsSync(victim), true);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'do not delete me');
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-adapter.json')), false);
});

test('installing, disabling, and uninstalling creates no project file and initializes no write or approval state', (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, 'target');

  runCli(['install', 'opencode', targetDir]);
  runCli(['disable', 'opencode', targetDir]);
  runCli(['uninstall', 'opencode', targetDir]);

  assert.deepEqual(fs.readdirSync(root), []);
});

test('a mismatched suite and adapter version fails closed for OKF behavior', (t) => {
  const root = temporaryRoot(t);
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  const installedManifest = JSON.parse(fs.readFileSync(path.join(targetDir, 'manifest.json'), 'utf8'));
  assert.equal(installedManifest.suite_version, orientation.suiteVersion);

  const result = childProcess.spawnSync(process.execPath, [readWrapper], {
    input: JSON.stringify({
      protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'orient', invocation: 'automatic',
      payload: { cwd: root, harness: 'claude-code', context_id: 'ctx', logical_cause: 'startup', suite_version: '9.9.9' },
    }),
    encoding: 'utf8',
  });
  const response = JSON.parse(result.stdout);
  assert.equal(response.result, 'invalid');
});

test('the adapter CLI rejects unknown actions and harnesses without writing', (t) => {
  const root = temporaryRoot(t);
  const targetDir = path.join(root, 'target');

  const badAction = runCli(['enable', 'claude-code', targetDir]);
  assert.equal(badAction.status, 64);
  assert.equal(badAction.response.ok, false);

  const badHarness = runCli(['install', 'not-a-harness', targetDir]);
  assert.equal(badHarness.status, 64);
  assert.equal(badHarness.response.ok, false);

  assert.equal(fs.existsSync(targetDir), false);
});

test('adapter-hook claims an occurrence: a duplicate native signal is silent, a delivered claim is never replayed', (t) => {
  const root = orientedRepo(t);
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  const manifestPath = path.join(targetDir, 'manifest.json');
  const stdin = { cwd: root, session_id: 'sess-1', source: 'startup' };

  const first = runHook('claude-code', manifestPath, stdin);
  assert.equal(first.status, 0);
  assert.equal(first.stderr, '');
  assert.match(first.stdout, /OKF orientation: bundle/);
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-occurrences.json')), true);

  const second = runHook('claude-code', manifestPath, stdin);
  assert.equal(second.status, 0);
  assert.equal(second.stdout, '');
  assert.equal(second.stderr, '');
});

test('adapter-hook reports a failed claimed attempt and never replays it, keeping the original reason instead of the generic claimed-attempt gloss', (t) => {
  const root = orientedRepo(t);
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  const manifestPath = path.join(targetDir, 'manifest.json');
  const stdin = { cwd: root, session_id: 'sess-2', source: 'startup' };

  const first = runHook('claude-code', manifestPath, stdin);
  assert.equal(first.stdout, '');
  assert.match(first.stderr, /OKF orientation unavailable: root_index_unreadable/);

  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const second = runHook('claude-code', manifestPath, stdin);
  assert.equal(second.stdout, '');
  assert.match(second.stderr, /OKF orientation failed: root_index_unreadable/);
  assert.doesNotMatch(second.stderr, /claimed_attempt_failed/);
});

test('a disabled adapter-hook install never dispatches and never claims', (t) => {
  const root = orientedRepo(t);
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  runCli(['disable', 'claude-code', targetDir]);
  const manifestPath = path.join(targetDir, 'manifest.json');

  const result = runHook('claude-code', manifestPath, { cwd: root, session_id: 'sess-3', source: 'startup' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-occurrences.json')), false);
});

test('adapter-hook falls back to an unknown logical cause, which is reported degraded, and a replay keeps the original unsupported_seam reason', (t) => {
  const root = orientedRepo(t);
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'claude-code', targetDir]);
  const manifestPath = path.join(targetDir, 'manifest.json');
  const stdin = { cwd: root, session_id: 'sess-4' };

  const first = runHook('claude-code', manifestPath, stdin);
  assert.equal(first.stdout, '');
  assert.match(first.stderr, /OKF orientation degraded: unsupported_seam/);

  const second = runHook('claude-code', manifestPath, stdin);
  assert.equal(second.stdout, '');
  assert.match(second.stderr, /OKF orientation failed: unsupported_seam/);
  assert.doesNotMatch(second.stderr, /claimed_attempt_failed/);
});

test('adapter-hook maps SubagentStart to the subagent-start logical cause', (t) => {
  const root = orientedRepo(t);
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'codex', targetDir]);
  const manifestPath = path.join(targetDir, 'manifest.json');

  const result = runHook('codex', manifestPath, { cwd: root, session_id: 'sess-5', hook_event_name: 'SubagentStart' });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /OKF orientation: bundle/);
});

test('opencode: the next system transform claims the generation, a duplicate transform in the same generation is silent, and a failed transform is never retried', async (t) => {
  const root = orientedRepo(t);
  const targetDir = path.join(root, 'adapter');
  runCli(['install', 'opencode', targetDir]);
  const plugin = require(path.join(targetDir, 'plugin.js'));

  const output = () => ({ system: [] });
  const hooks = await plugin({ directory: root });

  const first = output();
  await hooks['chat.system.transform']({}, first);
  assert.equal(first.system.length, 0, 'no index.md yet, so no clean injection');
  assert.equal(fs.existsSync(path.join(targetDir, '.okf-occurrences.json')), true);

  const second = output();
  await hooks['chat.system.transform']({}, second);
  assert.equal(second.system.length, 0, 'the generation is already claimed failed; no replay');

  await hooks.event({ event: { type: 'session.created' } });
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const third = output();
  await hooks['chat.system.transform']({}, third);
  assert.equal(third.system.length, 1, 'a new generation claims independently and can now deliver clean');

  const fourth = output();
  await hooks['chat.system.transform']({}, fourth);
  assert.equal(fourth.system.length, 0, 'the delivered generation is not replayed');
});
