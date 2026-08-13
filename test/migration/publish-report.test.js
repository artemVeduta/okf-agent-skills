// Domain: migration. Covers the tail of the setup migration -- validating the
// staged bundle, publishing it through the write gate, and the final report.
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { runWrapper, spawnWrapper, adapterManifest, temporaryRoot, writeManifest } = require('../../test-support/snapshot');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf.js');
const readWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-read.js');
const bridgeWrapper = path.join(__dirname, '..', '..', 'scripts', 'adapter-bridge.js');

function run(value) {
  return runWrapper(wrapper, value);
}

const reviewed = { performed: true };
const notReviewed = { performed: false };

// #203: `migration-validate` and `publish` both demand the accepted
// concept-group packages exactly as `migration-plan` returned them. None of
// this file's own fixtures stage a group index, so an empty accepted package
// set -- no packages, no index rows -- is exactly the correct shape to carry:
// there is nothing here for it to match against.
const EMPTY_GROUP_PACKAGES = {
  packages: [],
  root: { purpose: 'Bundle root', index: { disposition: 'unchanged', title: 'Bundle' }, log: { disposition: 'none' }, children: [] },
  indexes: [],
};

// ============================================================================
describe('migration-validate of the staged bundle', () => { // #148
  function repo(t) {
    const root = temporaryRoot(t, 'okf-148-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: 'okf', okf_version: '0.2', project_mode: 'knowledge-only' }],
    }));
    return root;
  }

  function stage(root, relative, content, bundle = 'okf') {
    const file = path.join(root, '.okf-staging', bundle, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  // One entry mirroring `migration-plan`'s own `data.plan.entries` shape
  // (#144), the exact input `partition` already demands and this operation
  // reuses via `validPartitionPlan` rather than inventing a second schema.
  function migrate(sourcePath, concept, type = 'Decision', reason = 'type_preserved') {
    return { path: sourcePath, disposition: 'migrate', reason, concept, type };
  }
  function skip(sourcePath, reason) {
    return { path: sourcePath, disposition: 'skip', reason, concept: null, type: null };
  }

  function plan(entries) {
    return { entries, executable: true };
  }

  function request(root, payload = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'migration-validate',
      payload: { cwd: root, group_packages: EMPTY_GROUP_PACKAGES, ...payload },
    };
  }

  function findingCodes(response) {
    return response.findings.map((item) => item.code);
  }

  // ------------------------------------------------------------ clean bundle

  test('a clean staged bundle validates: complete, publishable, no findings', (t) => {
    const root = repo(t);
    stage(root, 'decisions/a.md', '---\ntype: Decision\n---\n# A\n');

    const response = run(request(root, {
      selected: ['docs/a.md'],
      plan: plan([migrate('docs/a.md', 'decisions/a')]),
      semantic_review: reviewed,
    }));

    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
    assert.equal(response.data.publishable, true);
    assert.deepEqual(response.data.missing_disposition, []);
    assert.deepEqual(response.data.semantic_fidelity, { assessed: true });
    assert.deepEqual(response.data.semantic_review, {
      human_assessed: true,
      candidates: [{
        path: 'decisions/a.md',
        identity: `sha256:${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, '.okf-staging/okf/decisions/a.md'))).digest('hex')}`,
      }],
      sources: [],
    });
    assert.deepEqual(response.findings, []);
  });

  // ------------------------------------------------------------- structural

  test('unparseable frontmatter in a staged concept blocks', (t) => {
    const root = repo(t);
    stage(root, 'decisions/a.md', '---\ntype: Decision\n: malformed\n---\n# A\n');

    const response = run(request(root, {
      selected: ['docs/a.md'],
      plan: plan([migrate('docs/a.md', 'decisions/a')]),
      semantic_review: reviewed,
    }));

    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'partial');
    assert.equal(response.data.publishable, false);
    const finding = response.findings.find((item) => item.code === 'FRONTMATTER_UNPARSEABLE');
    assert.ok(finding);
    assert.equal(finding.blocks, true);
    assert.equal(finding.detail.path, 'decisions/a.md');
  });

  test('a staged concept with no type blocks', (t) => {
    const root = repo(t);
    stage(root, 'decisions/a.md', '---\ntitle: A\n---\n# A\n');

    const response = run(request(root, {
      selected: ['docs/a.md'],
      plan: plan([migrate('docs/a.md', 'decisions/a')]),
      semantic_review: reviewed,
    }));

    assert.equal(response.data.status, 'partial');
    assert.equal(response.data.publishable, false);
    assert.deepEqual(
      response.findings.find((item) => item.code === 'TYPE_MISSING'),
      { code: 'TYPE_MISSING', origin: 'okf', severity: 'error', blocks: true, detail: { path: 'decisions/a.md' } },
    );
  });

  // dogfood: `okf/releases/index.md` on this very repo wrongly carries concept
  // frontmatter although a nested `index.md` is reserved navigation (#131).
  test('a nested index.md carrying concept frontmatter is caught, the dogfood case', (t) => {
    const root = repo(t);
    stage(root, 'releases/index.md', '---\ntitle: Releases\ntype: Index\n---\n# Releases\n');

    const response = run(request(root, {
      selected: [],
      plan: plan([]),
      semantic_review: reviewed,
    }));

    assert.equal(response.data.status, 'partial');
    const finding = response.findings.find((item) => item.code === 'BUNDLE_FILES_NONCONFORMING');
    assert.ok(finding);
    assert.equal(finding.blocks, true);
    assert.equal(finding.detail.file, 'releases/index.md');
  });

  test('an Attested Computation staged without runtime blocks', (t) => {
    const root = repo(t);
    stage(root, 'computation.md', '---\ntype: Attested Computation\n---\n# Computation\n');

    const response = run(request(root, {
      selected: ['docs/computation.md'],
      plan: plan([migrate('docs/computation.md', 'computation', 'Attested Computation')]),
      semantic_review: reviewed,
    }));

    assert.equal(response.data.status, 'partial');
    assert.deepEqual(
      response.findings.find((item) => item.code === 'RUNTIME_MISSING'),
      { code: 'RUNTIME_MISSING', origin: 'okf', severity: 'error', blocks: true, detail: { path: 'computation.md' } },
    );
  });

  // ------------------------------------------------------------ completeness

  test('a source with no disposition fails completeness while a deliberately-filtered code-backed source does not', (t) => {
    const root = repo(t);
    // Nothing needs to be staged: `docs/b.md` was intentionally filtered out
    // (code-recoverable, #131), so `assemble` never produced a concept for it.
    fs.mkdirSync(path.join(root, '.okf-staging', 'okf'), { recursive: true });

    const response = run(request(root, {
      selected: ['docs/a.md', 'docs/b.md'],
      // `docs/a.md` has no entry at all -- silently fell off the plan.
      plan: plan([skip('docs/b.md', 'code_recoverable')]),
      semantic_review: reviewed,
    }));

    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'partial');
    assert.equal(response.data.publishable, false);
    assert.deepEqual(response.data.missing_disposition, ['docs/a.md']);
    const finding = response.findings.find((item) => item.code === 'SOURCE_DISPOSITION_MISSING');
    assert.ok(finding);
    assert.equal(finding.blocks, true);
    assert.equal(finding.severity, 'error');
    assert.equal(finding.detail.path, 'docs/a.md');
    assert.equal(findingCodes(response).filter((code) => code === 'SOURCE_DISPOSITION_MISSING').length, 1);
  });

  // ---------------------------------------------------------- link integrity

  test('a broken link in a staged concept warns, and never blocks publication on its own', (t) => {
    const root = repo(t);
    stage(root, 'decisions/a.md', '---\ntype: Decision\nsources:\n  - resource: missing.md\n---\n# A\n');

    const response = run(request(root, {
      selected: ['docs/a.md'],
      plan: plan([migrate('docs/a.md', 'decisions/a')]),
      semantic_review: reviewed,
    }));

    assert.equal(response.data.status, 'complete');
    assert.equal(response.data.publishable, true);
    const finding = response.findings.find((item) => item.code === 'UNRESOLVED_INTERNAL_LINK');
    assert.ok(finding);
    assert.equal(finding.blocks, false);
    assert.equal(finding.severity, 'warning');
  });

  // -------------------------------------------------------- semantic fidelity

  test('a structurally clean bundle still reports semantic fidelity as not assessed when no human review is declared', (t) => {
    const root = repo(t);
    stage(root, 'decisions/a.md', '---\ntype: Decision\n---\n# A\n');

    const response = run(request(root, {
      selected: ['docs/a.md'],
      plan: plan([migrate('docs/a.md', 'decisions/a')]),
      semantic_review: notReviewed,
    }));

    // Structurally spotless -- no missing disposition, no structural finding --
    // and still, publication readiness never implies semantic fidelity.
    assert.equal(response.data.status, 'complete');
    assert.equal(response.data.publishable, true);
    assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
    assert.deepEqual(response.findings, [
      { code: 'semantic_fidelity_not_assessed', origin: 'suite', severity: 'warning', blocks: false, detail: { scope: 'bundle' } },
    ]);
  });

  // ----------------------------------------------------------------- shape

  test('rejects a missing or non-executable plan, and a missing or malformed semantic_review', (t) => {
    const root = repo(t);
    const base = { selected: [] };

    const missingPlan = run(request(root, { ...base, semantic_review: reviewed }));
    assert.equal(missingPlan.result, 'blocked');
    assert.equal(missingPlan.data.code, 'UNSUPPORTED_INPUT');

    const openQuestion = run(request(root, {
      ...base,
      plan: { entries: [{ path: 'x.md', disposition: 'blocked_pending_decision', reason: 'type_not_inferable', concept: null, type: null }], executable: false },
      semantic_review: reviewed,
    }));
    assert.equal(openQuestion.result, 'blocked');
    assert.equal(openQuestion.data.code, 'UNSUPPORTED_INPUT');

    for (const semantic_review of [undefined, {}, { performed: 'yes' }, null]) {
      const payload = { ...base, plan: plan([]) };
      if (semantic_review !== undefined) payload.semantic_review = semantic_review;
      const response = run(request(root, payload));
      assert.equal(response.result, 'blocked', JSON.stringify(semantic_review));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(semantic_review));
    }
  });

  // ------------------------------------------------------------ wrapper wiring

  test('migration-validate reports not-configured outside a Git repository and is silent on automatic invocation', (t) => {
    const outside = temporaryRoot(t, 'okf-148-no-repo-');
    const bare = { plan: plan([]), selected: [], semantic_review: reviewed };
    assert.equal(run(request(outside, bare)).result, 'not-configured');

    const root = repo(t);
    const result = spawnWrapper(wrapper, { ...request(root, bare), invocation: 'automatic' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });

  test('the generic okf router reaches migration-validate too, bypassing the activation gate', (t) => {
    const root = repo(t);
    const response = runWrapper(routerWrapper, {
      ...request(root, { plan: plan([]), selected: [], semantic_review: reviewed }),
      skill: 'okf',
    });
    assert.equal(response.skill, 'okf');
    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
  });

  test('rejects a structurally missing payload.cwd at the protocol layer, before the runtime', () => {
    const result = spawnWrapper(wrapper, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'migration-validate',
      payload: { plan: plan([]), selected: [], semantic_review: reviewed },
    });
    assert.equal(result.status, 64);
    assert.equal(result.stdout, '');
  });
});

// ============================================================================
// #149: setup's orchestration adapter over the shared semantic contract seam.
// `publish` is the operation under test -- the one thing in this skill that
// ever reaches the real bundle, and it does so only by invoking the same
// delegation bridge (`scripts/okf-delegate.js`) any other caller would.
describe('delegated publish through the write gate', () => {
  const harnesses = ['claude-code', 'codex', 'opencode'];

  // Bundle lives at `<root>/okf`, the default `publish`/`assemble` bundle name,
  // so `.okf-staging/okf/...` (staging) and `okf/...` (the real bundle) sit
  // side by side exactly as they would in a real project. `okf-write`'s own
  // `create` (unchanged by #149, see the issue-53 coverage's own
  // `missing/note.md` case) does not create a new subdirectory for a concept
  // -- targeting one whose directory does not exist yet is that operation's
  // own ordinary `failed/incomplete`, not a `publish`-specific gap -- so every
  // fixture here pre-creates `decisions/`, the one canonical directory these
  // tests target, exactly as an already-migrated bundle would already have it.
  function repo(t) {
    const root = temporaryRoot(t, 'okf-149-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, 'okf');
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
    return { path: sourcePath, concept, type, shard: 'x', file, sources: [] };
  }

  function authority(root, staged) {
    for (const item of staged) {
      const source = path.join(root, item.path);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      if (!fs.existsSync(source)) fs.writeFileSync(source, `# ${item.concept}\n`);
      item.sources = [{
        path: item.path,
        sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
      }];
    }
    return {
      plan: {
        entries: staged.map((item) => ({
          path: item.path, disposition: 'migrate', reason: 'type_preserved', concept: item.concept, type: item.type,
        })),
        executable: true,
        duplicates: [],
      },
      mapping: staged.map((item) => ({
        path: item.path, concept: item.concept, type: item.type, sources: null,
        source_identity: `sha256:${item.sources[0].sha256}`,
        body: validationBody(root, item),
      })),
      split_review: staged.map((item) => ({
        path: item.path, accounting_status: 'not_required', sections: [], outputs: [], proposal: null,
      })),
      semantic_review: {
        human_assessed: false,
        candidates: staged.map((item) => ({
          path: `${item.concept}.md`,
          identity: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, item.file))).digest('hex')}`,
        })),
        sources: [],
      },
    };
  }

  function validationBody(root, item) {
    const text = fs.readFileSync(path.resolve(root, item.file), 'utf8');
    const closing = text.split('\n').findIndex((line, index) => index > 0 && line === '---');
    return text.split('\n').slice(closing + 1).join('\n');
  }

  function publishRequest(root, staged, payload = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'publish',
      payload: { cwd: root, task_kind: 'feature work', staged, group_packages: EMPTY_GROUP_PACKAGES, ...authority(root, staged), ...payload },
    };
  }

  function bundleFile(root, concept) {
    return path.join(root, 'okf', `${concept}.md`);
  }

  // ----------------------------------------------------- through the write gate

  test('publish promotes a staged concept into the real bundle by delegating one okf-write create call', (t) => {
    const root = repo(t);
    const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\nstatus: draft\n---\n# A\n\nBody text.\n')];
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

  // ------------------------------------------------ not bypassable (write gate)

  test('publish is refused by the same write gate an inline create would hit, and never overwrites what is already there', (t) => {
    const root = repo(t);
    const original = '---\ntype: Decision\ntitle: Original\n---\n# Original\n';
    fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
    fs.writeFileSync(bundleFile(root, 'decisions/a'), original);

    const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\nstatus: draft\n---\n# Would-be replacement\n')];
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

  test("a failed concept leaves every later concept unattempted", (t) => {
    const root = repo(t);
    fs.mkdirSync(path.join(root, 'okf', 'decisions'), { recursive: true });
    fs.writeFileSync(bundleFile(root, 'decisions/blocked'), '---\ntype: Decision\n---\n# Already there\n');

    const staged = [
      stagedRef(root, 'docs/ok.md', 'decisions/ok', 'Decision', '---\ntype: Decision\nstatus: draft\n---\n# OK\n'),
      stagedRef(root, 'docs/blocked.md', 'decisions/blocked', 'Decision', '---\ntype: Decision\nstatus: draft\n---\n# Replacement attempt\n'),
      stagedRef(root, 'docs/later.md', 'decisions/later', 'Decision', '---\ntype: Decision\nstatus: draft\n---\n# Later\n'),
    ];
    const response = run(publishRequest(root, staged));

    assert.equal(response.data.status, 'partial');
    assert.deepEqual(response.data.published, ['decisions/ok']);
    assert.deepEqual(response.data.failed.map((item) => item.concept), ['decisions/blocked']);
    assert.deepEqual(response.data.skipped, [{ concept: 'decisions/later', status: 'not-attempted' }]);
    assert.equal(fs.existsSync(bundleFile(root, 'decisions/ok')), true);
    assert.equal(fs.existsSync(bundleFile(root, 'decisions/later')), false);
  });

  // ------------------------------------------- read reaches the shared seam

  test('publish is blocked at one clear precheck, through a delegated read, when the bundle is not active -- never per-concept noise', (t) => {
    const root = repo(t);
    const staged = [stagedRef(root, 'docs/a.md', 'decisions/a', 'Decision', '---\ntype: Decision\nstatus: draft\n---\n# A\n')];

    // Publish carries no admission of its own (#149): it never touches the
    // bundle directly, so nothing else here would have caught a bundle that
    // stopped being active. Only the delegated `okf-reader` `validate` call
    // this operation issues before any write is attempted does.
    fs.rmSync(path.join(root, '.okf-workspace.json'));

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
        group_packages: EMPTY_GROUP_PACKAGES,
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

  // ------------------------------------------- justified divergences (#149 audit)

  test('assemble and migration-validate still need no admitted bundle at all: staging is not, and never was, gated by activation', (t) => {
    const root = bareRepo(t);
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'okf', 'index.md')), false);

    const brief = {
      shard: 'x', cwd: root, bundle: 'okf', project_mode: null, okf_version: '0.2',
      sources: ['docs/a.md'],
      mapping: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', sources: null, body: '# A\n' }],
      split_review: [{ path: 'docs/a.md', accounting_status: 'not_required', sections: [], outputs: [], proposal: null }],
      neighbors: [],
    };
    const shard = {
      shard: 'x',
      concepts: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', body: '# A\n' }],
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
        group_packages: EMPTY_GROUP_PACKAGES,
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
        group_packages: EMPTY_GROUP_PACKAGES,
      },
    });
    assert.equal(migrationValidateResponse.result, 'ok');
    assert.equal(migrationValidateResponse.data.publishable, true);

    // The real bundle still does not exist: neither operation ever created it.
    assert.equal(fs.existsSync(path.join(root, 'okf')), false);
  });
});

// ============================================================================
describe('final migration report', () => { // #136
  // `report` runs without a valid manifest, like `inspect`/`plan`/
  // `aggregate` (#133/#135/#138), so this builds a bare Git repository directly.
  function repo(t) {
    return temporaryRoot(t, 'okf-136-repo-');
  }

  function git(root) {
    fs.mkdirSync(path.join(root, '.git'));
  }

  function reportRequest(root, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'report', payload: { cwd: root, ...payload } };
  }

  function migrated(src, concept, sourcesDeclared) {
    const item = { path: src, disposition: 'migrated', concept };
    if (sourcesDeclared !== undefined) item.sources_declared = sourcesDeclared;
    return item;
  }

  function skipped(src, reason) {
    return { path: src, disposition: 'skipped', reason };
  }

  function ambiguous(src, reason) {
    return { path: src, disposition: 'ambiguous', reason };
  }

  function residue(src, reason) {
    return { path: src, disposition: 'residue', reason };
  }

  // ------------------------------------------------------------ clean migration

  test('reports the signal set for a clean migration: every source migrated, complete status, no findings', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [
        migrated('docs/a.md', 'decisions/a.md', true),
        migrated('docs/b.md', 'glossary.md', true),
      ],
      links: [{ from: 'decisions/a.md', target: 'glossary.md', resolved: true }],
      semantic_review: reviewed,
    }));

    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
    assert.deepEqual(response.data.summary, {
      sources_total: 2, concepts_created: 2, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 0,
    });
    assert.deepEqual(response.data.concepts, [
      { source: 'docs/a.md', concept: 'decisions/a.md', sources_declared: true },
      { source: 'docs/b.md', concept: 'glossary.md', sources_declared: true },
    ]);
    assert.deepEqual(response.data.provenance, { total: 2, with_sources: 2, without_sources: 0 });
    assert.deepEqual(response.data.links, { total: 1, resolved: 1, broken: 0, broken_detail: [] });
    assert.deepEqual(response.data.semantic_fidelity, { assessed: true });
    assert.deepEqual(response.findings, []);
  });

  // ------------------------------------------------------------ skipped sources

  test('reports each skipped source with its reason, as a warning finding, never blocking', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [
        migrated('docs/a.md', 'decisions/a.md'),
        skipped('docs/legacy.md', 'code_recoverable'),
        skipped('docs/dupe.md', 'duplicate_of_docs_a'),
      ],
      semantic_review: reviewed,
    }));

    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
    assert.deepEqual(response.data.skipped, [
      { source: 'docs/legacy.md', reason: 'code_recoverable' },
      { source: 'docs/dupe.md', reason: 'duplicate_of_docs_a' },
    ]);
    assert.deepEqual(
      response.findings.map((f) => [f.code, f.severity, f.blocks, f.detail.path, f.detail.reason]),
      [
        ['source_skipped', 'warning', false, 'docs/legacy.md', 'code_recoverable'],
        ['source_skipped', 'warning', false, 'docs/dupe.md', 'duplicate_of_docs_a'],
      ],
    );
  });

  test('a skipped source without a reason is rejected before anything is computed', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [{ path: 'docs/legacy.md', disposition: 'skipped' }],
      semantic_review: reviewed,
    }));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  });

  // ---------------------------------------------------------- unresolved ambiguity

  test('an unresolved ambiguity is reported as uncertain, as an error finding, and flips status to partial', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [
        migrated('docs/a.md', 'decisions/a.md'),
        ambiguous('docs/weird.md', 'type_not_inferable'),
      ],
      semantic_review: reviewed,
    }));

    assert.equal(response.data.status, 'partial');
    assert.deepEqual(response.data.ambiguous, [{ source: 'docs/weird.md', reason: 'type_not_inferable' }]);
    const finding = response.findings.find((f) => f.code === 'source_ambiguous');
    assert.equal(finding.severity, 'error');
    assert.equal(finding.blocks, false);
    assert.equal(finding.detail.path, 'docs/weird.md');
  });

  test('residue is reported inertly, distinct from a skip or an ambiguity, and does not affect status', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [
        migrated('docs/a.md', 'decisions/a.md'),
        residue('docs/legacy.docx', 'unsupported_format'),
      ],
      semantic_review: reviewed,
    }));
    assert.equal(response.data.status, 'complete');
    // #177 (#157): the row names the source's own original path, its reason, and
    // states outright that setup left that source where it was.
    assert.deepEqual(response.data.residue, [
      { source: 'docs/legacy.docx', reason: 'unsupported_format', unchanged: true },
    ]);
    assert.deepEqual(response.data.summary.sources_residue, 1);
  });

  test('residue alone, with nothing migrated, is still a complete run rather than a partial one', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [residue('docs/legacy.docx', 'unsupported_format')],
      semantic_review: reviewed,
    }));
    assert.equal(response.data.status, 'complete');
    assert.equal(response.data.summary.sources_residue, 1);
    assert.equal(response.data.residue[0].unchanged, true);
  });

  // ------------------------------------------------------------ semantic fidelity

  test('discloses semantic fidelity as not assessed whenever human review did not happen', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [migrated('docs/a.md', 'decisions/a.md')],
      semantic_review: notReviewed,
    }));
    assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
    const finding = response.findings.find((f) => f.code === 'semantic_fidelity_not_assessed');
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.detail.scope, 'project');
  });

  test('a green structural report never implies semantic fidelity: no ambiguity, no skips, still not assessed without review', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [migrated('docs/a.md', 'decisions/a.md', true)],
      links: [{ from: 'decisions/a.md', target: 'glossary.md', resolved: true }],
      semantic_review: notReviewed,
    }));
    assert.equal(response.data.status, 'complete');
    assert.deepEqual(response.data.semantic_fidelity, { assessed: false });
  });

  test('semantic_review is required and must be a well-formed object', (t) => {
    const root = repo(t);
    git(root);
    for (const semantic_review of [undefined, {}, { performed: 'yes' }, { performed: true, sources: [], candidates: [] }, null, 'true']) {
      const payload = { sources: [migrated('docs/a.md', 'decisions/a.md')] };
      if (semantic_review !== undefined) payload.semantic_review = semantic_review;
      const response = run(reportRequest(root, payload));
      assert.equal(response.result, 'blocked', JSON.stringify(semantic_review));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(semantic_review));
    }
  });

  // ------------------------------------------------------------ link integrity

  test('reports broken links as non-blocking warnings and counts them separately from resolved links', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      sources: [migrated('docs/a.md', 'decisions/a.md')],
      links: [
        { from: 'decisions/a.md', target: 'glossary.md', resolved: true },
        { from: 'decisions/a.md', target: 'missing.md', resolved: false },
      ],
      semantic_review: reviewed,
    }));
    assert.deepEqual(response.data.links, {
      total: 2, resolved: 1, broken: 1, broken_detail: [{ from: 'decisions/a.md', target: 'missing.md' }],
    });
    const finding = response.findings.find((f) => f.code === 'link_broken');
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.blocks, false);
  });

  // ----------------------------------------------------------- threshold boundary

  test('migration_status/status flips from complete to partial exactly at the first ambiguous source, never before', (t) => {
    const root = repo(t);
    git(root);
    const zero = run(reportRequest(root, {
      sources: [migrated('docs/a.md', 'a.md'), skipped('docs/b.md', 'code_recoverable'), residue('docs/c.md', 'unsupported_format')],
      semantic_review: reviewed,
    }));
    assert.equal(zero.data.status, 'complete');

    const one = run(reportRequest(root, {
      sources: [migrated('docs/a.md', 'a.md'), ambiguous('docs/b.md', 'type_not_inferable')],
      semantic_review: reviewed,
    }));
    assert.equal(one.data.status, 'partial');
  });

  // ----------------------------------------------------------------- validation

  test('rejects a payload naming neither sources nor packages, and one naming both', (t) => {
    const root = repo(t);
    git(root);
    const neither = run(reportRequest(root, { semantic_review: reviewed }));
    assert.equal(neither.result, 'blocked');
    assert.equal(neither.data.code, 'UNSUPPORTED_INPUT');

    const both = run(reportRequest(root, { sources: [], packages: [], semantic_review: reviewed }));
    assert.equal(both.result, 'blocked');
    assert.equal(both.data.code, 'UNSUPPORTED_INPUT');
  });

  test('rejects an unknown disposition and a migrated source missing its concept', (t) => {
    const root = repo(t);
    git(root);
    const cases = [
      [{ path: 'docs/a.md', disposition: 'unknown' }],
      [{ path: 'docs/a.md', disposition: 'migrated' }],
      [{ path: 'docs/a.md', disposition: 'migrated', concept: 'a.md', reason: 'should not be here' }],
      [{ path: '', disposition: 'skipped', reason: 'x' }],
    ];
    for (const sources of cases) {
      const response = run(reportRequest(root, { sources, semantic_review: reviewed }));
      assert.equal(response.result, 'blocked', JSON.stringify(sources));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(sources));
    }
  });

  test('reports not-configured entirely outside a Git repository', (t) => {
    const root = temporaryRoot(t, 'okf-136-no-repo-');
    const response = run(reportRequest(root, { sources: [], semantic_review: reviewed }));
    assert.equal(response.result, 'not-configured');
  });

  // ------------------------------------------------------------ multi-package

  function twoPackageResults() {
    return [
      {
        package: 'foo',
        status: 'ok',
        sources: [migrated('foo/docs/a.md', 'foo/okf/decisions/a.md', true)],
        links: [{ from: 'decisions/a.md', target: 'glossary.md', resolved: true }],
        semantic_review: reviewed,
      },
      {
        package: 'bar',
        status: 'ok',
        sources: [
          migrated('bar/docs/a.md', 'bar/okf/decisions/a.md'),
          ambiguous('bar/docs/weird.md', 'type_not_inferable'),
        ],
        semantic_review: notReviewed,
      },
    ];
  }

  test('composes a multi-package report from aggregate-shaped per-package results, summing statistics honestly', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, { packages: twoPackageResults() }));

    assert.equal(response.result, 'ok');
    // "partial" because bar carries an unresolved ambiguity, even though every
    // package's own worker succeeded (open point 6: never silently "complete").
    assert.equal(response.data.status, 'partial');
    assert.deepEqual(response.data.summary, {
      sources_total: 3, concepts_created: 2, sources_skipped: 0, sources_ambiguous: 1, sources_residue: 0,
    });
    assert.deepEqual(response.data.provenance, { total: 2, with_sources: 1, without_sources: 1 });
    // Overall semantic fidelity withheld because "bar" was not reviewed, even
    // though "foo" was (never overstate from a partial check).
    assert.deepEqual(response.data.semantic_fidelity, { assessed: false });

    const foo = response.data.packages.find((p) => p.package === 'foo');
    assert.equal(foo.status, 'ok');
    assert.equal(foo.migration_status, 'complete');
    const bar = response.data.packages.find((p) => p.package === 'bar');
    assert.equal(bar.status, 'ok');
    assert.equal(bar.migration_status, 'partial');
    assert.deepEqual(bar.ambiguous, [{ source: 'bar/docs/weird.md', reason: 'type_not_inferable' }]);
  });

  test('a failed package worker is reported plainly, contributes no signals, and forces overall status to partial', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, {
      packages: [
        { package: 'foo', status: 'ok', sources: [migrated('foo/docs/a.md', 'a.md', true)], semantic_review: reviewed },
        { package: 'bar', status: 'failed', reason: 'worker crashed before finishing' },
      ],
    }));
    assert.equal(response.data.status, 'partial');
    const bar = response.data.packages.find((p) => p.package === 'bar');
    assert.deepEqual(bar, { package: 'bar', status: 'failed', reason: 'worker crashed before finishing', warnings: [] });
    // The failed package contributes nothing to the summed statistics; they
    // reflect only what "foo" actually reported.
    assert.deepEqual(response.data.summary, {
      sources_total: 1, concepts_created: 1, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 0,
    });
  });

  test('rejects a failed package result that also carries signal data, a duplicate package name, and an ok result with a reason', (t) => {
    const root = repo(t);
    git(root);
    const cases = [
      [{ package: 'foo', status: 'failed', reason: 'x', sources: [] }],
      [{ package: 'foo', status: 'ok', sources: [], semantic_review: reviewed }, { package: 'foo', status: 'ok', sources: [], semantic_review: reviewed }],
      [{ package: 'foo', status: 'ok', reason: 'should not be here', sources: [], semantic_review: reviewed }],
      [{ package: 'foo', status: 'failed' }],
    ];
    for (const packages of cases) {
      const response = run(reportRequest(root, { packages }));
      assert.equal(response.result, 'blocked', JSON.stringify(packages));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(packages));
    }
  });

  test('rejects a structurally empty packages array', (t) => {
    const root = repo(t);
    git(root);
    const response = run(reportRequest(root, { packages: [] }));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  });

  // -------------------------------------------------------- automatic + router

  test('automatic invocation of report is silent, matching every other setup operation\'s automatic behavior', (t) => {
    const root = repo(t);
    git(root);
    const request = { ...reportRequest(root, { sources: [], semantic_review: reviewed }), invocation: 'automatic' };
    const result = spawnWrapper(wrapper, request);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });

  test('the generic okf router reaches report too, bypassing the activation gate', (t) => {
    const root = repo(t);
    git(root);
    const response = runWrapper(routerWrapper, { ...reportRequest(root, { sources: [], semantic_review: reviewed }), skill: 'okf' });
    assert.equal(response.skill, 'okf');
    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
  });

  test('rejects a structurally missing payload.cwd at the protocol layer, before the runtime', () => {
    const result = spawnWrapper(wrapper, { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'report', payload: { sources: [] } });
    assert.equal(result.status, 64);
    assert.equal(result.stdout, '');
  });
});
