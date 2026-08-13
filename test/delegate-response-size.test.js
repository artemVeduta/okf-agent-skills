const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { repository, bundle } = require('../test-support/snapshot');

// `scripts/okf-delegate.js` dispatches every delegated call with `spawnSync`. Node's
// default `maxBuffer` is 1 MiB, and a child that writes past it is killed with SIGTERM
// -- which the bridge reported as `indeterminate` / `DELEGATED_DISPATCH_FAILED`, the
// same receipt a genuinely crashed wrapper produces. A delegated response grows with
// the bundle, so a bundle large enough to answer past 1 MiB became impossible to read
// or publish into through the bridge, and the receipt named the wrong cause. The
// observable contract asserted here: a delegated response larger than 1 MiB comes back
// as a real response, not as a dispatch failure.

const repo = path.resolve(__dirname, '..');
const delegate = path.join(repo, 'scripts', 'okf-delegate.js');
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
