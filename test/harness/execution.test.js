// Domain: harness. Orientation and activation markers, installed-store wrapper
// resolution, per-skill independent execution, adapter-bridge narrowing, and
// oversized-response receipts.
//
// Each former source file keeps its own `describe` block: the suite uses
// top-level helper bindings, and several of those names (`repo`, `run`,
// `readBrief`, `oversizedBundle`) carry different bodies per source. Block
// scoping preserves both without renames -- in particular `oversizedBundle`
// exists twice on purpose, sized differently for the two seams it drives.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  adapterManifest,
  bundle,
  repository,
  runSilent,
  runWrapper,
  snapshot,
  temporaryRoot,
  writeManifest,
} = require('../../test-support/snapshot');

const repo = path.resolve(__dirname, '..', '..');
const ONE_MIB = 1024 * 1024;

// The exact brief `publish` sends as its own pre-publish precheck: a delegated
// `okf-read` `validate` over the whole bundle, which is the call whose answer scales
// with the bundle and so the call that first crossed the buffer boundary.
function readBrief(root) {
  return {
    role: 'okf-reader',
    task_kind: 'fix',
    operation_class: 'validate',
    cwd: root,
    bundle: 'okf',
    paths: ['okf'],
    allowed_effects: [],
    forbidden_effects: ['concept-create', 'concept-revise', 'format', 'relationship', 'machine-verify'],
    evidence: [],
    required_checks: ['runtime-preflight'],
    settings: { read_execution: 'delegated', write_execution: 'delegated' },
    expected_result: 'bundle validated',
  };
}

describe('orientation gates and activation markers', () => { // #66
  const readWrapper = path.join(repo, 'scripts', 'okf-read.js');
  const routerWrapper = path.join(repo, 'scripts', 'okf.js');
  const orientationDataKeys = ['activation', 'bundle', 'root_index_path', 'workspace_health', 'occurrence_key'];

  function assertDataKeys(response) {
    assert.deepEqual(Object.keys(response.data), orientationDataKeys);
  }

  function assertNoBundle(response) {
    assert.deepEqual({
      bundle: response.data.bundle,
      root_index_path: response.data.root_index_path,
      workspace_health: response.data.workspace_health,
    }, { bundle: null, root_index_path: null, workspace_health: null });
  }

  function repository(t, prefix = 'okf-66-') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    return root;
  }

  function activate(root) {
    writeManifest(root, '.');
  }

  function withIndex(root) {
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    return root;
  }

  function orientRequest(root, overrides = {}, skill = 'okf-read') {
    return {
      protocol: 'okf-wrapper/1',
      skill,
      operation: 'orient',
      payload: {
        cwd: root,
        harness: 'claude-code',
        context_id: 'ctx-1',
        logical_cause: 'startup',
        ...overrides,
      },
    };
  }

  function run(wrapper, request) {
    const result = childProcess.spawnSync(process.execPath, [wrapper], {
      input: JSON.stringify(request), encoding: 'utf8',
    });
    return result;
  }

  function runOk(wrapper, request) {
    return runWrapper(wrapper, request);
  }

  test('orient reports not-configured when the activation marker is absent', (t) => {
    const root = repository(t);
    withIndex(root);
    const before = snapshot(root);

    const response = runOk(readWrapper, orientRequest(root));

    assert.equal(response.result, 'not-configured');
    assertDataKeys(response);
    assert.equal(response.data.activation, 'absent');
    assertNoBundle(response);
    assert.equal(typeof response.data.occurrence_key, 'string');
    assert.ok(response.data.occurrence_key.length > 0);
    assert.ok(response.findings.length > 0);
    assert.deepEqual(snapshot(root), before);
  });

  test('orient reports invalid when the activation marker is malformed', (t) => {
    const root = repository(t);
    withIndex(root);
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
    const before = snapshot(root);

    const response = runOk(readWrapper, orientRequest(root));

    assert.equal(response.result, 'invalid');
    assertDataKeys(response);
    assert.equal(response.data.activation, 'invalid');
    assertNoBundle(response);
    assert.equal(typeof response.data.occurrence_key, 'string');
    assert.deepEqual(snapshot(root), before);
  });

  test('orient reports invalid for an unknown harness, a suite_version mismatch, and malformed claimed', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);
    const before = snapshot(root);

    const unknownHarness = runOk(readWrapper, orientRequest(root, { harness: 'unknown-harness' }));
    assert.equal(unknownHarness.result, 'invalid');
    assert.equal(unknownHarness.data.activation, 'active');
    assert.equal(unknownHarness.data.occurrence_key, null);

    const mismatch = runOk(readWrapper, orientRequest(root, { suite_version: '9.9.9' }));
    assert.equal(mismatch.result, 'invalid');
    assert.equal(typeof mismatch.data.occurrence_key, 'string');

    const malformedClaimed = runOk(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: 'x' }] }));
    assert.equal(malformedClaimed.result, 'invalid');

    assert.deepEqual(snapshot(root), before);
  });

  test('orient reaches clean when activation, admission, and the root index all pass', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);
    const before = snapshot(root);

    const response = runOk(readWrapper, orientRequest(root));

    assert.equal(response.result, 'clean');
    assertDataKeys(response);
    assert.equal(response.data.activation, 'active');
    assert.deepEqual(response.data.bundle, { bundle_alias: 'repo', bundle_root: root });
    assert.equal(response.data.root_index_path, 'index.md');
    assert.equal(response.data.workspace_health, 'healthy');
    assert.equal(typeof response.data.occurrence_key, 'string');
    assert.deepEqual(response.findings, []);
    assert.equal(response.next_action, 'Read the root index to begin navigation.');
    assert.deepEqual(snapshot(root), before);
  });

  test('orient reports unavailable when the root index cannot be read', (t) => {
    const root = repository(t);
    activate(root);
    const before = snapshot(root);

    const response = runOk(readWrapper, orientRequest(root));

    assert.equal(response.result, 'unavailable');
    assertDataKeys(response);
    assert.equal(response.data.activation, 'active');
    assertNoBundle(response);
    assert.ok(response.findings.some((finding) => finding.detail.gate === 'orientation'));
    assert.deepEqual(snapshot(root), before);
  });

  test('orient reports degraded for a seam unsupported by the harness', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);

    const response = runOk(readWrapper, orientRequest(root, { harness: 'codex', logical_cause: 'fork' }));

    assert.equal(response.result, 'degraded');
    assertDataKeys(response);
    assertNoBundle(response);
  });

  test('orient emits nothing for a silent lifecycle cause', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);

    runSilent(readWrapper, orientRequest(root, { logical_cause: 'session-end' }));
    runSilent(readWrapper, orientRequest(root, { harness: 'opencode', logical_cause: 'session-created' }));
  });

  test('a duplicate native signal emits no second orientation, and a failed claim is reported but never replayed', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);

    const first = runOk(readWrapper, orientRequest(root));
    const key = first.data.occurrence_key;

    runSilent(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: key, outcome: 'delivered' }] }));

    const failedClaim = runOk(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: key, outcome: 'failed' }] }));
    assert.equal(failedClaim.result, 'failed');
    assertDataKeys(failedClaim);
    assert.equal(failedClaim.data.occurrence_key, key);
    assertNoBundle(failedClaim);

    const unavailableClaim = runOk(readWrapper, orientRequest(root, { claimed: [{ occurrence_key: key, outcome: 'unavailable' }] }));
    assert.equal(unavailableClaim.result, 'failed');
  });

  test('a forked child context is not suppressed and rechecks admission independently', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);

    const parent = runOk(readWrapper, orientRequest(root, { context_id: 'parent-ctx' }));
    const child = runOk(readWrapper, orientRequest(root, { context_id: 'child-ctx', logical_cause: 'fork' }));

    assert.equal(parent.result, 'clean');
    assert.equal(child.result, 'clean');
    assert.notEqual(parent.data.occurrence_key, child.data.occurrence_key);
  });

  test('the router dispatches orient to okf-read', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);

    const response = runOk(routerWrapper, orientRequest(root, {}, 'okf'));

    assert.equal(response.skill, 'okf');
    assert.equal(response.result, 'clean');
  });

  test('an absent marker under automatic invocation stays a silent no-op', (t) => {
    const root = repository(t);
    withIndex(root);

    runSilent(readWrapper, { ...orientRequest(root), invocation: 'automatic' });
  });

  test('the occurrence key does not collide when a context_id/logical_cause boundary shifts', (t) => {
    const root = repository(t);
    activate(root);
    withIndex(root);

    const a = runOk(readWrapper, orientRequest(root, { context_id: 'a', logical_cause: 'bstartup' }));
    const b = runOk(readWrapper, orientRequest(root, { context_id: 'ab', logical_cause: 'startup' }));

    assert.equal(typeof a.data.occurrence_key, 'string');
    assert.equal(typeof b.data.occurrence_key, 'string');
    assert.notEqual(a.data.occurrence_key, b.data.occurrence_key);
  });

  test('a degraded workspace is reported degraded, not masked by an unreadable root index, and workspace_health reuses admission vocabulary', (t) => {
    const root = repository(t);
    activate(root);
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'app', path: '.', local: true }],
      bundles: [
        { alias: 'root', owner: 'app', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' },
        { alias: 'b', owner: 'app', root: 'b', okf_version: '0.2', project_mode: 'knowledge-only' },
      ],
    }));
    const before = snapshot(root);

    const response = runOk(readWrapper, orientRequest(root));

    assert.equal(response.result, 'degraded');
    assertDataKeys(response);
    assert.equal(response.data.bundle, null);
    assert.equal(response.data.workspace_health, 'degraded');
    assert.deepEqual(snapshot(root), before);
  });

  test('orient rejects malformed wrapper input at the process boundary', (t) => {
    const root = repository(t);

    const missingHarness = run(readWrapper, { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'orient', payload: { cwd: root, context_id: 'c', logical_cause: 'startup' } });
    assert.equal(missingHarness.status, 64);
    assert.notEqual(missingHarness.stderr.trim(), '');
  });
});

// Symlink following is relied on only for this covered layout. Exclusions: broken links, cyclic links, links escaping a trusted root, sibling repositories, and future harness versions.
describe('installed skill store resolves the wrapper', () => { // #72
  const orientation = require('../../scripts/lib/orientation');

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
    writeManifest(worktree, '.');
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
});

describe('an installed skill executes independently of the checkout', () => { // #96
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
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }],
    }));
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    return root;
  }

  function runInstalledWrapper(skillRoot, name, request, cwd) {
    const result = childProcess.spawnSync(process.execPath, [path.join(skillRoot, 'scripts', `${name}.js`)], {
      input: JSON.stringify(request), encoding: 'utf8', cwd,
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  function admitRequest(bundleRoot) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'admit', payload: { cwd: bundleRoot, candidates: [] } };
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
    const data = JSON.parse(result.stdout).data;
    assert.equal(data.federation, 'accepted');
    assert.equal(data.candidates.length, 1);
    assert.equal(data.candidates[0].bundle_alias, 'repo');
  });

  test('a global-layout skill install resolves its wrapper from the skill root, not from cwd or PATH', (t) => {
    const home = temporaryRoot(t, 'okf-96-home-');
    const bundleRoot = orientedBundle(temporaryRoot(t, 'okf-96-bundle-'));
    const unrelated = temporaryRoot(t, 'okf-96-cwd-');
    const installed = installSkill('okf-read', path.join(home, '.claude', 'skills'));

    const result = runInstalledWrapper(installed, 'okf-read', admitRequest(bundleRoot), unrelated);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).result, 'ok');
    assert.deepEqual(fs.readdirSync(unrelated), [], 'nothing resolved or written relative to cwd');
  });

  test('a single skill installed with no siblings is independently executable', (t) => {
    const bundleRoot = orientedBundle(temporaryRoot(t, 'okf-96-solo-bundle-'));
    const skillsDir = path.join(temporaryRoot(t, 'okf-96-solo-'), '.claude', 'skills');
    const installed = installSkill('okf-review', skillsDir);

    assert.deepEqual(fs.readdirSync(skillsDir), ['okf-review']);
    const result = runInstalledWrapper(installed, 'okf-review', {
      protocol: 'okf-wrapper/1', skill: 'okf-review', operation: 'review',
      payload: { cwd: bundleRoot, bundle: bundleRoot, concept: 'index.md' },
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
});

// Issue #97 records the narrowed delegated-execution and settings claims
// from issue #91: no v0.1.0 adapter installs a delegated agent definition,
// and the shared bridge that a native adapter drives accepts only the two
// installed skills. This block adds the one deterministic assertion that
// decision was missing -- see docs/spec/okf-agent-skills-v0.1.0-completion.md,
// "Narrowed claims (issue #91, issue #97)".
describe('the adapter bridge narrows delegated execution', () => { // #97
  const bridgeWrapper = path.join(repo, 'scripts', 'adapter-bridge.js');
  const harnesses = ['claude-code', 'codex', 'opencode'];

  function runBridge(harness, skill) {
    return childProcess.spawnSync(process.execPath, [bridgeWrapper, harness, skill], {
      input: '', encoding: 'utf8',
    });
  }

  test('no harness manifest carries an installs key: the install-script model is removed', () => {
    for (const harness of harnesses) {
      const declared = adapterManifest(harness);
      assert.equal(Object.hasOwn(declared, 'installs'), false, harness);
    }
  });

  test('scripts/adapter-bridge.js rejects okf-delegate: the delegated path is not reachable through the shared bridge', () => {
    for (const harness of harnesses) {
      const result = runBridge(harness, 'okf-delegate');
      assert.equal(result.status, 64, harness);
      assert.equal(result.stdout, '', harness);
      assert.match(result.stderr, /Unsupported adapter bridge request/, harness);
    }
  });
});

// `scripts/okf-delegate.js` dispatches every delegated call with `spawnSync`. Node's
// default `maxBuffer` is 1 MiB, and a child that writes past it is killed with SIGTERM
// -- which the bridge reported as `indeterminate` / `DELEGATED_DISPATCH_FAILED`, the
// same receipt a genuinely crashed wrapper produces. A delegated response grows with
// the bundle, so a bundle large enough to answer past 1 MiB became impossible to read
// or publish into through the bridge, and the receipt named the wrong cause. The
// observable contract asserted here: a delegated response larger than 1 MiB comes back
// as a real response, not as a dispatch failure.
describe('an oversized delegated response returns a receipt', () => { // #132
  const delegate = path.join(repo, 'scripts', 'okf-delegate.js');

  // A bundle whose `validate` answer exceeds 1 MiB. Each concept contributes its own
  // path and findings to the response, so concept count -- not body size -- is what
  // drives the answer past the boundary.
  function oversizedBundle(t) {
    const root = repository(t, 'okf-delegate-size-');
    const bundleRoot = bundle(root, 'okf', '---\nokf_version: "0.2"\n---\n# Bundle\n\n- [Notes](notes/index.md)\n');
    const notes = path.join(bundleRoot, 'notes');
    fs.mkdirSync(notes, { recursive: true });
    const entries = [];
    for (let i = 0; i < 1000; i += 1) {
      const name = `concept-${String(i).padStart(4, '0')}-${'segment-'.repeat(8)}${i}`;
      fs.writeFileSync(
        path.join(notes, `${name}.md`),
        `---\ntype: Research\n---\n# ${name}\n\n[dangling](missing-${name}.md)\n`,
      );
      entries.push(`- [${name}](${name}.md)`);
    }
    fs.writeFileSync(path.join(notes, 'index.md'), `# Notes\n\n${entries.join('\n')}\n`);
    return root;
  }

  function dispatch(brief) {
    return childProcess.spawnSync(process.execPath, [delegate], {
      input: JSON.stringify(brief), encoding: 'utf8', maxBuffer: 1 << 30,
    });
  }

  test('a delegated response larger than 1 MiB returns a receipt instead of a dispatch failure', (t) => {
    const root = oversizedBundle(t);

    // The premise: this bundle really does answer past the default buffer boundary.
    const direct = childProcess.spawnSync(
      process.execPath,
      [path.join(repo, 'scripts', 'okf-read.js')],
      {
        input: JSON.stringify({
          protocol: 'okf-wrapper/1',
          skill: 'okf-read',
          operation: 'validate',
          payload: { cwd: root, bundle: 'okf' },
        }),
        encoding: 'utf8',
        maxBuffer: 1 << 30,
      },
    );
    assert.equal(direct.signal, null, 'the direct read must not itself be killed');
    assert.ok(
      direct.stdout.length > ONE_MIB,
      `fixture must answer past 1 MiB to exercise the boundary, got ${direct.stdout.length}`,
    );

    const result = dispatch(readBrief(root));

    assert.equal(result.signal, null, 'the delegated wrapper must not be killed by the buffer');
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    // A clean dispatch passes the delegated wrapper's own response straight through; a
    // buffer kill would instead have produced an `okf-delegation/1` indeterminate receipt.
    assert.equal(receipt.protocol, 'okf-wrapper/1');
    assert.notEqual(receipt.status, 'indeterminate');
    for (const finding of receipt.findings || []) {
      assert.notEqual(finding.code, 'DELEGATED_DISPATCH_FAILED', JSON.stringify(finding));
    }
  });
});

// `scripts/okf-delegate.js`'s own spawn of a skill wrapper was sized past Node's 1 MiB
// default `maxBuffer` by #132 (the block above). `scripts/lib/setup.js`'s `dispatchBrief`
// spawns `scripts/okf-delegate.js` itself, one hop further out, and was not: the
// pre-publish precheck (#149) issues a delegated `okf-read` `validate` over the whole
// bundle, and that answer crosses this second, still-unsized seam. A bundle large enough to
// answer past 1 MiB gets its precheck's own child SIGTERM-killed, and `dispatchBrief` collapses
// the truncated stdout into the same `null` a genuinely crashed wrapper would return -- reported
// as `blocked: PUBLISH_PRECHECK_FAILED`, indistinguishable from an actually invalid bundle. The
// observable contract asserted here: a bundle whose precheck answer exceeds 1 MiB still publishes.
describe('an oversized pre-publish precheck answer still publishes', () => { // #189
  const { dispatchWrapper } = require('../../scripts/lib/wrapper-dispatch');

  const delegateWrapper = path.join(repo, 'scripts', 'okf-delegate.js');
  const setupWrapper = path.join(repo, 'scripts', 'okf-setup.js');

  // Same fixture shape as the `#132` block's `oversizedBundle`, sized larger:
  // `delegation.receipt` (scripts/lib/delegation.js) forwards a response's
  // `findings` but drops its `data`, so the precheck's own answer -- findings only, no
  // concept list -- needs more concepts than the direct-read fixture to still cross 1 MiB.
  // Each concept contributes its own path and a dangling-link finding to `validate`'s
  // answer, so concept count -- not body size -- is what drives the precheck past the
  // boundary.
  function oversizedBundle(t) {
    const root = repository(t, 'okf-189-repo-');
    const bundleRoot = bundle(root, 'okf', '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n\n- [Notes](notes/index.md)\n');
    fs.mkdirSync(path.join(bundleRoot, 'decisions'), { recursive: true });
    const notes = path.join(bundleRoot, 'notes');
    fs.mkdirSync(notes, { recursive: true });
    const entries = [];
    for (let i = 0; i < 4000; i += 1) {
      const name = `concept-${String(i).padStart(4, '0')}-${'segment-'.repeat(8)}${i}`;
      fs.writeFileSync(
        path.join(notes, `${name}.md`),
        `---\ntype: Research\n---\n# ${name}\n\n[dangling](missing-${name}.md)\n`,
      );
      entries.push(`- [${name}](${name}.md)`);
    }
    fs.writeFileSync(path.join(notes, 'index.md'), `# Notes\n\n${entries.join('\n')}\n`);
    return root;
  }

  function stage(root, relative, content, bundleName = 'okf') {
    const file = path.join(root, '.okf-staging', bundleName, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return path.join('.okf-staging', bundleName, relative);
  }

  test('publish survives a pre-publish precheck whose delegated validate answer exceeds 1 MiB', (t) => {
    const root = oversizedBundle(t);

    // The premise: this bundle's own precheck answer really does cross the boundary,
    // through the exact delegated brief `publish` itself issues.
    const direct = childProcess.spawnSync(process.execPath, [delegateWrapper], {
      input: JSON.stringify(readBrief(root)), encoding: 'utf8', maxBuffer: 1 << 30,
    });
    assert.equal(direct.signal, null, 'the direct delegated precheck must not itself be killed');
    assert.ok(
      direct.stdout.length > ONE_MIB,
      `fixture must answer past 1 MiB to exercise the boundary, got ${direct.stdout.length}`,
    );

    const file = stage(root, 'decisions/a.md', '---\ntype: Decision\nstatus: draft\n---\n# A\n\nBody text.\n');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/a.md'), '# Source A\n');
    const sourceDigest = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/a.md'))).digest('hex');
    const candidateDigest = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    const response = runWrapper(setupWrapper, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'publish',
      payload: {
        cwd: root,
        task_kind: 'feature work',
        staged: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', shard: 'x', file, sources: [{ path: 'docs/a.md', sha256: sourceDigest }] }],
        plan: {
          entries: [{ path: 'docs/a.md', disposition: 'migrate', reason: 'type_preserved', concept: 'decisions/a', type: 'Decision' }],
          executable: true,
          duplicates: [],
        },
        mapping: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', sources: null, source_identity: `sha256:${sourceDigest}`, body: '# A\n\nBody text.\n' }],
        split_review: [{ path: 'docs/a.md', accounting_status: 'not_required', sections: [], outputs: [], proposal: null }],
        // #203: `publish` now requires the accepted concept-group artifact
        // `migration-plan` produced. This fixture stages only the one concept
        // file, no index -- so an empty accepted package set with no derived
        // index rows is exactly what a coherent proposal for it looks like.
        group_packages: {
          packages: [],
          root: { purpose: 'Bundle root', index: { disposition: 'unchanged', title: 'Bundle' }, log: { disposition: 'none' }, children: [] },
          indexes: [],
        },
        semantic_review: {
          human_assessed: false,
          candidates: [{ path: 'decisions/a.md', identity: `sha256:${candidateDigest}` }],
          sources: [],
        },
      },
    });

    // A buffer-killed precheck reports `blocked: PUBLISH_PRECHECK_FAILED` -- the same
    // shape a genuinely inadmissible bundle produces. The oversized bundle above is
    // otherwise a valid, active bundle, so that code must never appear here.
    assert.notEqual(
      response.data && response.data.code,
      'PUBLISH_PRECHECK_FAILED',
      JSON.stringify(response.findings),
    );
    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
    assert.deepEqual(response.data.published, ['decisions/a']);
  });

  // The `truncated: true` branch above is unreachable at production's 1 GiB `MAX_BUFFER`
  // without a fixture sized past a gigabyte -- disproportionate for a unit test. This
  // drives the shared classification itself (permitted: "Unit tests on scripts/lib/ are
  // permitted, carry no contract", docs/spec/okf-agent-skills-v0.1.0-completion.md) with
  // a small, fast overflow: a real child process, a real `spawnSync`, a real `maxBuffer`
  // too small for what it writes, through `dispatchWrapper`'s own optional override
  // (never used by any production call site, which all stay hard-wired to the one
  // shared constant).
  test('dispatchWrapper classifies a real maxBuffer overflow as truncated, not a crash', (t) => {
    const dir = temporaryRoot(t, 'okf-189-overflow-');
    const overflowingChild = path.join(dir, 'overflow.js');
    fs.writeFileSync(overflowingChild, "process.stdout.write('x'.repeat(20000));\n");

    const dispatched = dispatchWrapper(overflowingChild, {}, 1024);

    assert.equal(dispatched.ok, false, 'an overflowing child has no usable response');
    assert.equal(dispatched.truncated, true, 'a maxBuffer overflow must be classified as truncated, not a generic crash');
  });
});
