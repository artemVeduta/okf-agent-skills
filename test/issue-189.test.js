const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, repository, bundle, temporaryRoot } = require('../test-support/snapshot');
const { dispatchWrapper } = require('../scripts/lib/wrapper-dispatch');

// `scripts/okf-delegate.js`'s own spawn of a skill wrapper was sized past Node's 1 MiB
// default `maxBuffer` by #132 (test/delegate-response-size.test.js). `scripts/lib/setup.js`'s
// `dispatchBrief` spawns `scripts/okf-delegate.js` itself, one hop further out, and was not:
// the pre-publish precheck (#149) issues a delegated `okf-read` `validate` over the whole
// bundle, and that answer crosses this second, still-unsized seam. A bundle large enough to
// answer past 1 MiB gets its precheck's own child SIGTERM-killed, and `dispatchBrief` collapses
// the truncated stdout into the same `null` a genuinely crashed wrapper would return -- reported
// as `blocked: PUBLISH_PRECHECK_FAILED`, indistinguishable from an actually invalid bundle. The
// observable contract asserted here: a bundle whose precheck answer exceeds 1 MiB still publishes.

const delegateWrapper = path.join(__dirname, '..', 'scripts', 'okf-delegate.js');
const setupWrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const ONE_MIB = 1024 * 1024;

// The same brief shape `publish`'s own precheck (`publishPrecheckBrief`,
// scripts/lib/setup.js) sends: a delegated `okf-read` `validate` over the whole bundle.
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

// Same fixture shape as `test/delegate-response-size.test.js`'s `oversizedBundle`, sized
// larger: `delegation.receipt` (scripts/lib/delegation.js) forwards a response's
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
