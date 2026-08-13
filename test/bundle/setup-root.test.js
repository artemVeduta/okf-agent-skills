// Domain: bundle -- init/inspect/repair of the bundle root, the manifest
// grammar the root is looked up through, and `init` as the one pre-manifest
// bootstrap exception.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const support = require('../../test-support/snapshot');

const { binding, bundle, repository, runSilent, runWrapper, spawnWrapper, temporaryRoot, treeHash } = support;
const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');

// Each former source file keeps its own helpers inside its own block: `repo`,
// `run`, `initRequest`, `inspectRequest` and `writeManifest` are defined more
// than once below with deliberately different bodies.

describe('init creates the bundle root', () => {
  const { writeManifest } = support;
  const writeWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-write.js');

  function initRequest(root, payload = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'init',
      payload: { cwd: root, ...payload },
    };
  }

  function run(value) {
    return runWrapper(wrapper, value);
  }

  function indexFile(root, bundleName = 'okf') {
    return path.join(root, bundleName, 'index.md');
  }

  // #196/#197: the bundle root `init` creates is navigation only now -- no
  // `okf_version`/`project_mode` frontmatter, both of which moved entirely to the
  // manifest bundle record `repair` writes. `init` never accepts `project_mode`
  // anymore either: there is no field left on the root to put it in.
  test('happy path: init on a clean repository creates a navigation-only bundle root, defaulting the bundle to "okf"', (t) => {
    const root = repository(t, 'okf-137-happy-');
    const response = run(initRequest(root));

    assert.equal(response.result, 'applied');
    assert.equal(response.data.authorization, 'notice');
    assert.equal(response.data.validation, 'valid');
    assert.deepEqual(response.data.effects, [{ effect: 'init', authorization: 'notice', inherited: false }]);
    assert.deepEqual(response.data.actual_effects, [{ effect: 'init', authorization: 'notice', inherited: false }]);
    assert.deepEqual(response.data.evidence, []);
    assert.deepEqual(response.findings, []);

    const written = fs.readFileSync(indexFile(root), 'utf8');
    // #170: a bundle root created here is a new bundle, so it carries the agent connector.
    assert.equal(written, '# Bundle\n\n- [Agents](agents/index.md)\n');
    assert.equal(fs.readFileSync(path.join(root, 'okf', 'agents', 'okf.md'), 'utf8').includes('type: Playbook'), true);
  });

  test('no-op: init against an already-parseable root changes nothing', (t) => {
    const root = repository(t, 'okf-137-noop-');
    fs.mkdirSync(path.join(root, 'okf'));
    // Legacy frontmatter, an existing hand-authored body, or nothing at all --
    // navigation only means `init` no longer inspects the content, only whether
    // it parses.
    fs.writeFileSync(indexFile(root), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    const before = treeHash(root);

    const response = run(initRequest(root));

    assert.equal(response.result, 'no-op');
    assert.equal(response.data.authorization, 'notice');
    assert.equal(response.data.validation, 'not-needed');
    assert.deepEqual(response.data.actual_effects, []);
    assert.equal(treeHash(root), before);
  });

  test('repair: a bundle directory that exists without index.md is completed, not refused', (t) => {
    const root = repository(t, 'okf-137-repair-');
    fs.mkdirSync(path.join(root, 'okf'));

    const response = run(initRequest(root));

    assert.equal(response.result, 'applied');
    assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '# Bundle\n\n- [Agents](agents/index.md)\n');
  });

  test('idempotent both ways: a second call is a no-op, and a corrupted root is repaired by overwrite', (t) => {
    const root = repository(t, 'okf-137-idempotent-');

    const first = run(initRequest(root));
    assert.equal(first.result, 'applied');
    const afterFirst = fs.readFileSync(indexFile(root), 'utf8');

    const second = run(initRequest(root));
    assert.equal(second.result, 'no-op');
    assert.equal(fs.readFileSync(indexFile(root), 'utf8'), afterFirst);

    // Corrupt the root out from under init: unterminated frontmatter is genuinely
    // unparseable, whatever it once declared.
    fs.writeFileSync(indexFile(root), '---\nokf_version: [\n---\n# Legacy\n');
    const repaired = run(initRequest(root));
    assert.equal(repaired.result, 'applied');
    // Repairing an existing (non-fresh) root resets it to the plain navigational
    // body alone.
    assert.equal(fs.readFileSync(indexFile(root), 'utf8'), '# Bundle\n');
  });

  // #196/#197: `project_mode` moved entirely to the manifest bundle record, so
  // `init` refuses it outright now -- a recognized value is refused exactly like
  // an unrecognized one, because the field itself no longer belongs here.
  test('refuses any project_mode payload as UNSUPPORTED_INPUT without writing, recognized value or not', (t) => {
    for (const projectMode of ['code-backed', 'sandbox']) {
      const root = repository(t, 'okf-137-bad-mode-');
      const response = run(initRequest(root, { project_mode: projectMode }));

      assert.equal(response.result, 'blocked', projectMode);
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', projectMode);
      assert.equal(fs.existsSync(indexFile(root)), false, projectMode);
    }
  });

  test('init is refused when combined with a derived effect', (t) => {
    const root = repository(t, 'okf-137-forbidden-combination-');
    const response = run(initRequest(root, { effects: ['init', 'index-maintenance'] }));

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    assert.deepEqual(response.data.effects, [
      { effect: 'init', authorization: 'blocked', inherited: false },
      { effect: 'index-maintenance', authorization: 'blocked', inherited: true },
    ]);
    assert.equal(fs.existsSync(indexFile(root)), false);
  });

  test('ownership refusal: a bundle target with no Git ancestry of its own is blocked before any write', (t) => {
    const root = repository(t, 'okf-137-ownership-');
    const foreign = temporaryRoot(t, 'okf-137-no-git-');

    const response = run(initRequest(root, { bundle: foreign }));

    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'WRITE_OWNERSHIP_UNKNOWN');
    assert.equal(fs.existsSync(path.join(foreign, 'index.md')), false);
  });

  test('calling init entirely outside a Git repository reports not-configured, exactly like every other operation', (t) => {
    const root = temporaryRoot(t, 'okf-137-no-repo-');
    const response = run(initRequest(root));

    assert.equal(response.result, 'not-configured');
    assert.equal(fs.existsSync(path.join(root, 'okf')), false);
  });

  test('REACH/writability refusal: a non-writable bundle parent blocks init with a blocking finding', (t) => {
    if (process.getuid && process.getuid() === 0) {
      t.skip('root can write through a read-only directory');
      return;
    }
    const root = repository(t, 'okf-137-readonly-');
    fs.chmodSync(root, 0o555);
    let response;
    try {
      response = run(initRequest(root));
    } finally {
      fs.chmodSync(root, 0o755);
    }

    assert.equal(response.result, 'blocked');
    assert.ok(response.findings.some((item) => item.code === 'PARENT_DIRECTORY_NOT_WRITABLE'), 'PARENT_DIRECTORY_NOT_WRITABLE');
    assert.equal(fs.existsSync(path.join(root, 'okf')), false);
  });

  test('round-trip: the written root re-reads to the exact bytes init wrote', (t) => {
    const root = repository(t, 'okf-137-round-trip-');
    const response = run(initRequest(root));

    assert.equal(response.result, 'applied');
    assert.equal(response.data.validation, 'valid');
    assert.equal(
      response.findings.some((item) => item.code === 'PARSE_TREE_MISMATCH' || item.code === 'POST_WRITE_VALIDATION_FAILED'),
      false,
    );
    // A second call is a clean no-op only if the first call's bytes actually
    // re-parse the way `init` believes they do.
    const again = run(initRequest(root));
    assert.equal(again.result, 'no-op');
  });

  test('precondition chain: after init succeeds, a normal create passes the full okf-write gate', (t) => {
    const root = repository(t, 'okf-137-chain-');
    // `init` here defaults to the `okf` bundle name; the write gate needs the
    // manifest's declared bundle root to match where `init` actually creates it.
    writeManifest(root, 'okf');
    const initResponse = run(initRequest(root));
    assert.equal(initResponse.result, 'applied');

    fs.writeFileSync(path.join(root, 'okf', 'evidence.md'), 'observed evidence\n');
    const createResponse = spawnWrapper(writeWrapper, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-write',
      operation: 'create',
      task_kind: 'feature work',
      payload: {
        cwd: root,
        bundle: path.join(root, 'okf'),
        concept: 'concept.md',
        evidence: [binding(root, path.join('okf', 'evidence.md'))],
        set: { type: 'Note', title: 'From the chain' },
      },
    }).response;

    assert.equal(createResponse.result, 'applied');
    assert.equal(fs.existsSync(path.join(root, 'okf', 'concept.md')), true);
  });
});

describe('inspect and repair of the bundle root', () => {
  const routerWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf.js');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  // `okf-setup`'s `inspect`/`repair` operations run even without a valid manifest
  // (that is one of the things `inspect` reports on), so fixtures here build a bare
  // Git repository directly rather than using the shared `repository()` helper,
  // which always creates one.
  function repo(t) {
    const root = temporaryRoot(t, 'okf-138-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    return root;
  }

  function inspectRequest(root, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'inspect', payload: { cwd: root, ...payload } };
  }

  function repairRequest(root, targets, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'repair', payload: { cwd: root, targets, ...payload } };
  }

  function initRequest(root, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'init', payload: { cwd: root, ...payload } };
  }

  function run(value) {
    return runWrapper(wrapper, value);
  }

  function validManifest(workspaceId) {
    return {
      schema_version: 1,
      workspace_id: workspaceId,
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'okf', owner: 'repo', root: 'okf', okf_version: '0.2', project_mode: 'knowledge-only' }],
    };
  }

  // --------------------------------------------------------------- index.md

  // #196/#197: the root is navigation only now, so there is no `okf_version` left
  // to check -- an old-format declaration is just parseable content, not a wrong
  // version, and inspect reports it `ok` like any other parseable root.
  test('inspect reports index.md as missing, invalid, and ok', (t) => {
    const root = repo(t);
    assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'missing' });

    fs.mkdirSync(path.join(root, 'okf'));
    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: [\n---\n# Bundle\n');
    const state = run(inspectRequest(root)).data.index_md;
    assert.equal(state.state, 'invalid');
    assert.ok(state.reason);

    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.1"\n---\n# Bundle\n');
    assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'ok' });
  });

  test('inspect reports an unparseable index.md as invalid with a parser reason', (t) => {
    const root = repo(t);
    fs.mkdirSync(path.join(root, 'okf'));
    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\n  bad indent\n---\n# Bundle\n');
    const state = run(inspectRequest(root)).data.index_md;
    assert.equal(state.state, 'invalid');
    assert.ok(state.reason);
  });

  test('inspect honors a non-default bundle directory for index.md', (t) => {
    const root = repo(t);
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    assert.deepEqual(run(inspectRequest(root, { bundle: 'docs' })).data.index_md, { state: 'ok' });
    assert.deepEqual(run(inspectRequest(root)).data.index_md, { state: 'missing' });
  });

  // --------------------------------------------------------------- activation gate

  test('discover and migration-plan require a valid manifest: missing or invalid manifest blocks', (t) => {
    const root = repo(t);
    const discoverRequest = { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, bundle: 'okf' } };
    const migrationPlanRequest = { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources: [] } };

    assert.equal(run(discoverRequest).result, 'not-configured');
    assert.equal(run(migrationPlanRequest).result, 'not-configured');

    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
    assert.equal(run(discoverRequest).result, 'blocked');
    assert.equal(run(migrationPlanRequest).result, 'blocked');

    const workspaceId = '99999999-9999-4999-8999-999999999999';
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(validManifest(workspaceId)));
    fs.mkdirSync(path.join(root, 'okf'));
    fs.writeFileSync(path.join(root, 'okf', 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    assert.equal(run(discoverRequest).result, 'ok');
    assert.equal(run(migrationPlanRequest).result, 'ok');
  });

  // --------------------------------------------------------------- .okf-workspace.json

  test('inspect reports .okf-workspace.json as missing, invalid, and ok', (t) => {
    const root = repo(t);
    assert.equal(run(inspectRequest(root)).data.manifest.state, 'missing');

    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
    assert.equal(run(inspectRequest(root)).data.manifest.state, 'invalid');

    const workspaceId = '11111111-1111-4111-8111-111111111111';
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(validManifest(workspaceId)));
    assert.deepEqual(run(inspectRequest(root)).data.manifest, {
      state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settings_findings: [],
    });
  });

  test('inspect salvages a well-formed workspace_id from an otherwise invalid manifest, and reports none when there is nothing to salvage', (t) => {
    const root = repo(t);
    const workspaceId = '22222222-2222-4222-8222-222222222222';
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1, workspace_id: workspaceId, repositories: [], bundles: 'not-an-array',
    }));
    const withId = run(inspectRequest(root)).data.manifest;
    assert.equal(withId.state, 'invalid');
    assert.deepEqual(withId.salvage, { workspace_id: workspaceId });

    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({ schema_version: 1, workspace_id: 'not-a-uuid', repositories: [], bundles: [] }));
    const withoutId = run(inspectRequest(root)).data.manifest;
    assert.equal(withoutId.state, 'invalid');
    assert.equal(withoutId.salvage, null);
  });

  test('inspect warns of a monorepo from .gitmodules when the manifest is missing, and from a manifest already declaring more than one repository or bundle', (t) => {
    const root = repo(t);
    assert.equal(run(inspectRequest(root)).data.manifest.monorepo, false);

    fs.writeFileSync(path.join(root, '.gitmodules'), '');
    assert.equal(run(inspectRequest(root)).data.manifest.monorepo, true);
    fs.rmSync(path.join(root, '.gitmodules'));

    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '33333333-3333-4333-8333-333333333333',
      repositories: [{ name: 'a', path: 'a', local: true }, { name: 'b', path: 'b', local: true }],
      bundles: [{ alias: 'a', owner: 'a', root: 'a', okf_version: '0.2', project_mode: 'knowledge-only' }],
    }));
    const report = run(inspectRequest(root)).data.manifest;
    assert.equal(report.state, 'ok', 'the manifest itself is well-formed; only the hint is asserted here');
    assert.equal(report.monorepo, true);
  });

  test('repair generates a validated single-bundle manifest template when missing', (t) => {
    const root = repo(t);
    const response = run(repairRequest(root, ['manifest'], { project_mode: 'code-backed' }));
    assert.equal(response.result, 'applied');
    assert.equal(response.data.manifest.written, true);
    assert.match(response.data.manifest.workspace_id, uuid);

    const written = JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'));
    assert.equal(written.schema_version, 1);
    assert.match(written.workspace_id, uuid);
    assert.equal(written.repositories.length, 1);
    assert.equal(written.repositories[0].name, path.basename(root));
    assert.equal(written.repositories[0].path, '.');
    assert.equal(written.repositories[0].local, true);
    assert.equal(written.bundles.length, 1);
    assert.equal(written.bundles[0].alias, 'okf');
    assert.equal(written.bundles[0].root, 'okf');
    assert.equal(written.bundles[0].okf_version, '0.2');
    assert.equal(written.bundles[0].project_mode, 'code-backed');
    assert.equal(written.bundles[0].owner, written.repositories[0].name);
  });

  test('repair refuses to generate a manifest without a recognized project_mode', (t) => {
    const root = repo(t);
    for (const projectMode of [undefined, 'sandbox']) {
      const payload = projectMode === undefined ? {} : { project_mode: projectMode };
      const response = run(repairRequest(root, ['manifest'], payload));
      assert.equal(response.result, 'blocked', JSON.stringify(payload));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(payload));
      assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false, JSON.stringify(payload));
    }
  });

  test('repair templates a fresh workspace_id each time the manifest is missing, never a fixed value', (t) => {
    const first = run(repairRequest(repo(t), ['manifest'], { project_mode: 'code-backed' })).data.manifest.workspace_id;
    const second = run(repairRequest(repo(t), ['manifest'], { project_mode: 'code-backed' })).data.manifest.workspace_id;
    assert.match(first, uuid);
    assert.match(second, uuid);
    assert.notEqual(first, second);
  });

  test('repair regenerates an invalid manifest only once the caller supplies the salvaged workspace_id, matching the report inspect gave', (t) => {
    const root = repo(t);
    const workspaceId = '44444444-4444-4444-8444-444444444444';
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1, workspace_id: workspaceId, repositories: [], bundles: 'not-an-array',
    }));
    const reported = run(inspectRequest(root)).data.manifest;
    assert.equal(reported.state, 'invalid');
    assert.deepEqual(reported.salvage, { workspace_id: workspaceId });

    // The approval and the choice to keep the salvaged value both happen above the
    // runtime, in `okf-setup`'s procedure; `repair` only ever does what it is told.
    const response = run(repairRequest(root, ['manifest'], { workspace_id: reported.salvage.workspace_id, project_mode: 'code-backed' }));
    assert.equal(response.result, 'applied');
    assert.equal(response.data.manifest.workspace_id, workspaceId);
    const written = JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'));
    assert.equal(written.workspace_id, workspaceId);
    assert.deepEqual(run(inspectRequest(root)).data.manifest, {
      state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settings_findings: [],
    });
  });

  test('repair leaves an already-ok manifest untouched and ignores a redundant payload', (t) => {
    const root = repo(t);
    run(repairRequest(root, ['manifest'], { project_mode: 'code-backed' }));
    const before = fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8');

    // The manifest already exists and is `ok`, so the template `repair` builds to
    // compare against is never written -- but it is still built and validated, so a
    // repeat call still needs a recognized `project_mode` to reach the no-op check.
    const response = run(repairRequest(root, ['manifest'], { workspace_id: '55555555-5555-4555-8555-555555555555', project_mode: 'code-backed' }));
    assert.equal(response.result, 'no-op');
    assert.deepEqual(response.data.manifest, { written: false });
    assert.equal(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8'), before);
  });

  test('repair accepts a hand-authored manifest for a monorepo, validated the same way the template is', (t) => {
    const root = repo(t);
    const custom = {
      schema_version: 1,
      workspace_id: '66666666-6666-4666-8666-666666666666',
      repositories: [
        { name: 'app', path: 'app', local: true },
        { name: 'lib', path: 'lib', local: true },
      ],
      bundles: [
        { alias: 'app', owner: 'app', root: 'app/okf', okf_version: '0.2', project_mode: 'knowledge-only' },
        { alias: 'lib', owner: 'lib', root: 'lib/okf', okf_version: '0.2', project_mode: 'knowledge-only' },
      ],
    };
    const response = run(repairRequest(root, ['manifest'], { manifest: custom }));
    assert.equal(response.result, 'applied');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8')), custom);
  });

  test('repair refuses a hand-authored manifest that fails validation, without writing', (t) => {
    const root = repo(t);
    const response = run(repairRequest(root, ['manifest'], { manifest: { schema_version: 1 } }));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
  });

  // --------------------------------------------------------------- repair input shape

  test('repair rejects a structurally empty targets list at the protocol layer, before the runtime', (t) => {
    const root = repo(t);
    const result = spawnWrapper(wrapper, repairRequest(root, []));
    assert.equal(result.status, 64);
    assert.equal(result.stdout, '');
  });

  // #197: `manifest` is the only recognized target left -- `activation` (the target
  // that used to write the now-retired marker) is unrecognized input exactly like
  // any other unknown target name, not a special case.
  test('repair refuses unrecognized or duplicate targets without writing anything', (t) => {
    const root = repo(t);
    for (const targets of [['index_md'], ['activation'], ['manifest', 'manifest']]) {
      const response = run(repairRequest(root, targets));
      assert.equal(response.result, 'blocked', JSON.stringify(targets));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(targets));
    }
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
  });

  // --------------------------------------------------------------- ownership, activation bypass, automatic invocation

  test('inspect and repair report not-configured entirely outside a Git repository, exactly like every other operation', (t) => {
    const root = temporaryRoot(t, 'okf-138-no-repo-');
    assert.equal(run(inspectRequest(root)).result, 'not-configured');
    assert.equal(run(repairRequest(root, ['manifest'])).result, 'not-configured');
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
  });

  test('inspect and repair run without a valid manifest, unlike every other operation', (t) => {
    const root = repo(t);
    assert.equal(run(inspectRequest(root)).result, 'ok');
    assert.equal(run(repairRequest(root, ['manifest'], { project_mode: 'code-backed' })).result, 'applied');
  });

  test('automatic invocation of inspect or repair is silent, matching every operation\'s automatic behavior when OKF is not active', (t) => {
    const root = repo(t);
    for (const request of [inspectRequest(root), repairRequest(root, ['manifest'])]) {
      const result = spawnWrapper(wrapper, { ...request, invocation: 'automatic' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    }
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
  });

  test('a non-writable Git root blocks repair with a blocking finding, without touching disk', (t) => {
    if (process.getuid && process.getuid() === 0) {
      t.skip('root can write through a read-only directory');
      return;
    }
    const root = repo(t);
    fs.chmodSync(root, 0o555);
    let response;
    try {
      response = run(repairRequest(root, ['manifest'], { project_mode: 'code-backed' }));
    } finally {
      fs.chmodSync(root, 0o755);
    }
    assert.equal(response.result, 'blocked');
    assert.ok(response.findings.some((item) => item.code === 'PARENT_DIRECTORY_NOT_WRITABLE'));
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
  });

  test('the generic okf router reaches inspect and repair too, and also bypasses the activation gate', (t) => {
    const root = repo(t);
    const inspected = runWrapper(routerWrapper, { ...inspectRequest(root), skill: 'okf' });
    assert.equal(inspected.skill, 'okf');
    assert.equal(inspected.result, 'ok');
    assert.deepEqual(inspected.data.activation, { state: 'missing' });

    const repaired = runWrapper(routerWrapper, { ...repairRequest(root, ['manifest'], { project_mode: 'knowledge-only' }), skill: 'okf' });
    assert.equal(repaired.skill, 'okf');
    assert.equal(repaired.result, 'applied');
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), true);
  });

  // --------------------------------------------------------------- full chain

  // #196's documented order (inspect -> consent -> repair manifest -> init ->
  // discover) writes the manifest before `init` ever runs; this test's own name
  // already matches that order for free.
  test('a full setup chain (inspect, repair, init) leaves all three files ok and a normal create then passes the write gate', (t) => {
    const root = repo(t);
    const before = run(inspectRequest(root)).data;
    assert.deepEqual([before.index_md.state, before.activation.state, before.manifest.state], ['missing', 'missing', 'missing']);

    const repaired = run(repairRequest(root, ['manifest'], { project_mode: 'knowledge-only' }));
    assert.equal(repaired.result, 'applied');
    const initResponse = run(initRequest(root));
    assert.equal(initResponse.result, 'applied');

    const after = run(inspectRequest(root)).data;
    assert.deepEqual(after.index_md, { state: 'ok' });
    assert.deepEqual(after.activation, { state: 'ok' });
    assert.equal(after.manifest.state, 'ok');

    // A second inspect/repair pass over an already-fixed project is a pure no-op.
    const secondRepair = run(repairRequest(root, ['manifest'], { project_mode: 'knowledge-only' }));
    assert.equal(secondRepair.result, 'no-op');
  });
});

describe('init as the one pre-manifest bootstrap exception', () => {
  const router = path.join(__dirname, '..', '..', 'scripts', 'okf.js');

  // #173 (decision #166, kept by #196/#197): an explicit `init` is the one
  // bootstrap exception to the manifest gate. It may run while the manifest
  // is absent, so a caller can still create the bundle root before ever writing
  // a manifest at all -- the explicit pre-manifest setup path #196 keeps
  // alongside its own documented order `inspect -> consent -> repair manifest ->
  // init -> discover`, which the harness domain's setup-order tests cover instead.
  function request(operation, root, payload = {}, extra = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation,
      payload: { cwd: root, ...payload },
      ...extra,
    };
  }

  function cleanRepository(t, prefix) {
    const root = temporaryRoot(t, prefix);
    fs.mkdirSync(path.join(root, '.git'));
    return root;
  }

  test('an explicit init runs on a repository that holds nothing but a Git root, before any manifest exists', (t) => {
    const root = cleanRepository(t, 'okf-173-clean-');

    const before = runWrapper(wrapper, request('inspect', root));
    assert.equal(before.result, 'ok');
    assert.equal(before.data.index_md.state, 'missing');
    assert.equal(before.data.activation.state, 'missing');
    assert.equal(before.data.manifest.state, 'missing');

    const init = runWrapper(wrapper, request('init', root));
    assert.equal(init.result, 'applied');
    assert.deepEqual(init.findings, []);
    // #196/#197: the root is navigation only -- the exception never widens beyond
    // the bundle root and its agent connector (#170).
    assert.equal(
      fs.readFileSync(path.join(root, 'okf', 'index.md'), 'utf8'),
      '# Bundle\n\n- [Agents](agents/index.md)\n',
    );

    const manifest = runWrapper(wrapper, request('repair', root, { targets: ['manifest'], project_mode: 'code-backed' }));
    assert.equal(manifest.result, 'applied');

    const after = runWrapper(wrapper, request('inspect', root));
    assert.equal(after.data.index_md.state, 'ok');
    assert.equal(after.data.activation.state, 'ok');
    assert.equal(after.data.manifest.state, 'ok');

    const discover = runWrapper(wrapper, request('discover', root));
    assert.equal(discover.result, 'ok');
  });

  test('an automatic init on a repository with no manifest stays silent and writes nothing', (t) => {
    const root = cleanRepository(t, 'okf-173-automatic-');

    runSilent(wrapper, request('init', root, {}, { invocation: 'automatic' }));
    assert.deepEqual(fs.readdirSync(root), ['.git']);
  });

  test('a malformed manifest still blocks init', (t) => {
    const root = cleanRepository(t, 'okf-173-invalid-');
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');

    const response = runWrapper(wrapper, request('init', root));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'MANIFEST_INVALID');
    assert.equal(fs.existsSync(path.join(root, 'okf', 'index.md')), false);
  });

  test('the router grants the same bootstrap exception to an explicit init', (t) => {
    const root = cleanRepository(t, 'okf-173-router-');

    const response = runWrapper(router, {
      protocol: 'okf-wrapper/1',
      skill: 'okf',
      operation: 'init',
      payload: { cwd: root },
    });
    assert.equal(response.result, 'applied');
    assert.equal(fs.existsSync(path.join(root, 'okf', 'index.md')), true);
  });

  test('the exception is init alone: another setup mutation still needs the manifest', (t) => {
    const root = cleanRepository(t, 'okf-173-narrow-');

    const response = runWrapper(wrapper, request('discover', root));
    assert.equal(response.result, 'not-configured');
  });
});

describe('manifest grammar and settings lookup', () => {
  const repo = path.resolve(__dirname, '..', '..');
  const readWrapper = path.join(repo, 'scripts', 'okf-read.js');
  const setupWrapper = path.join(repo, 'scripts', 'okf-setup.js');
  const workspaceId = '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';

  function validBundle(overrides = {}) {
    return { alias: 'docs', owner: 'app', root: 'docs', okf_version: '0.2', project_mode: 'knowledge-only', ...overrides };
  }

  function manifestOf(bundles, extra = {}) {
    return {
      schema_version: 1,
      workspace_id: workspaceId,
      repositories: [{ name: 'app', path: '.', local: true }],
      bundles,
      ...extra,
    };
  }

  // Local to this block: writes a whole manifest object, unlike the shared
  // `writeManifest(root, bundleName)` helper the init tests above use.
  function writeManifest(root, value) {
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(value));
  }

  function admitRequest(root) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'admit', payload: { cwd: root, candidates: [] } };
  }

  function inspectRequest(root) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'inspect', payload: { cwd: root } };
  }

  function federationFindingReason(root) {
    const response = runWrapper(readWrapper, admitRequest(root), { cwd: root });
    assert.equal(response.data.federation, 'rejected');
    return response.data.federation_finding.detail.reason;
  }

  // -------------------------------------------------------------- bundle grammar

  test('a bundle record missing any of the five required fields is rejected with the field-specific reason', (t) => {
    const root = repository(t); bundle(root);
    const cases = [
      ['alias', 'duplicate_bundle_alias'],
      ['owner', 'invalid_field_combination'],
      ['root', 'missing_path'],
      ['okf_version', 'invalid_field_combination'],
      ['project_mode', 'invalid_field_combination'],
    ];
    for (const [field, reason] of cases) {
      const record = validBundle();
      delete record[field];
      writeManifest(root, manifestOf([record]));
      assert.equal(federationFindingReason(root), reason, `missing ${field}`);
    }
  });

  test('a bundle record carrying the removed "required" or "mode" field is rejected as an unknown key', (t) => {
    const root = repository(t); bundle(root);
    for (const extra of [{ required: true }, { mode: 'source' }]) {
      writeManifest(root, manifestOf([validBundle(extra)]));
      assert.equal(federationFindingReason(root), 'unknown_key', JSON.stringify(extra));
    }
  });

  // #196 defines `project_mode` as required, always present, and two-valued
  // (`code-backed`/`knowledge-only`). `null` is not one of those two values and is
  // not itself a documented third state, so it is rejected the same way an absent
  // `project_mode` is (`invalid_field_combination`), not admitted as a legal
  // "undecided" value. See `manifest.template()`, which now requires every caller
  // to supply a real `projectMode` for exactly this reason.
  test('a bundle record with project_mode: null is rejected, the same as a missing project_mode', (t) => {
    const root = repository(t); bundle(root);
    writeManifest(root, manifestOf([validBundle({ project_mode: null })]));
    assert.equal(federationFindingReason(root), 'invalid_field_combination');
  });

  // -------------------------------------------------------------- settings resolution

  test('an absent settings object resolves to the built-in default with no findings', (t) => {
    const root = repository(t); bundle(root);
    writeManifest(root, manifestOf([validBundle()]));
    const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
    assert.deepEqual(response.data.manifest, {
      state: 'ok', monorepo: false, settings: { max_words_per_file: 1000 }, settings_findings: [],
    });
  });

  test('a valid settings override resolves to the override value with no findings', (t) => {
    const root = repository(t); bundle(root);
    writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_file: 250 } }));
    const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
    assert.deepEqual(response.data.manifest, {
      state: 'ok', monorepo: false, settings: { max_words_per_file: 250 }, settings_findings: [],
    });
  });

  test('an unknown setting key reports a finding, keeps the default effective, and does not invalidate the manifest', (t) => {
    const root = repository(t); bundle(root);
    writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_words: 5 } }));
    const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
    assert.equal(response.data.manifest.state, 'ok');
    assert.deepEqual(response.data.manifest.settings, { max_words_per_file: 1000 });
    assert.deepEqual(response.data.manifest.settings_findings, [{
      code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false,
      detail: { gate: 'settings', reason: 'unknown_setting_key', key: 'max_words_per_words' },
    }]);
  });

  test('an invalid max_words_per_file value reports a finding, keeps the default effective, and does not invalidate the manifest', (t) => {
    const root = repository(t); bundle(root);
    for (const value of [0, -5, 1.5, '1000']) {
      writeManifest(root, manifestOf([validBundle()], { settings: { max_words_per_file: value } }));
      const response = runWrapper(setupWrapper, inspectRequest(root), { cwd: root });
      assert.equal(response.data.manifest.state, 'ok', JSON.stringify(value));
      assert.deepEqual(response.data.manifest.settings, { max_words_per_file: 1000 }, JSON.stringify(value));
      assert.deepEqual(response.data.manifest.settings_findings, [{
        code: 'SETTING_INVALID', origin: 'suite', severity: 'warning', blocks: false,
        detail: { gate: 'settings', reason: 'invalid_setting_value', key: 'max_words_per_file' },
      }], JSON.stringify(value));
    }
  });

  // The activation gate resolves the manifest by walking `cwd` upward to the Git
  // root (`manifest.select()`'s own `discover()`), so a manifest living in an
  // intermediate directory below the Git root still activates the bundle. Both
  // `inspect` and `migration-plan` read settings back out of that exact same
  // file -- never a hardcoded `<gitRoot>/.okf-workspace.json`, which does not
  // exist in this fixture at all, so a caller that still hardcoded it would see
  // `settings`/`settings_findings` silently missing from the response while
  // `data.activation.state` (and `data.plan`, for `migration-plan`) still
  // reported the bundle as active (fix round 2, Important 3).
  test('inspect and migration-plan read settings from a manifest below the Git root, agreeing with the walked-upward activation gate', (t) => {
    const root = temporaryRoot(t, 'okf-197-nested-manifest-');
    fs.mkdirSync(path.join(root, '.git'));
    const pkgDir = path.join(root, 'pkg');
    const cwd = path.join(pkgDir, 'nested');
    fs.mkdirSync(cwd, { recursive: true });
    // Deliberately no `.okf-workspace.json` at `root` -- only below it, one
    // level above `cwd`, so the settings-resolving code path must actually walk
    // upward rather than read `<gitRoot>/.okf-workspace.json` directly.
    writeManifest(pkgDir, manifestOf([validBundle()], { settings: { max_words_per_file: 250 } }));
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);

    const inspectResponse = runWrapper(setupWrapper, {
      protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'inspect', payload: { cwd },
    }, { cwd });
    assert.equal(inspectResponse.data.activation.state, 'ok');
    assert.deepEqual(inspectResponse.data.manifest, {
      state: 'ok', monorepo: false, settings: { max_words_per_file: 250 }, settings_findings: [],
    });

    const planResponse = runWrapper(setupWrapper, {
      protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd, sources: [] },
    }, { cwd });
    assert.equal(planResponse.result, 'ok');
    assert.deepEqual(planResponse.data.settings, { max_words_per_file: 250 });
    assert.deepEqual(planResponse.data.settings_findings, []);
  });
});
