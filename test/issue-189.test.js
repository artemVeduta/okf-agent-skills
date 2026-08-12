const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, repository, bundle } = require('../test-support/snapshot');

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

  const file = stage(root, 'decisions/a.md', '---\ntype: Decision\n---\n# A\n\nBody text.\n');
  const response = runWrapper(setupWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'publish',
    payload: {
      cwd: root,
      task_kind: 'feature work',
      staged: [{ path: 'docs/a.md', concept: 'decisions/a', type: 'Decision', shard: 'x', file }],
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
