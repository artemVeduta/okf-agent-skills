/*
Issue #94 (applying the issue #86 resolution to issue #78's fixtures) —
wrapper-seam fixtures for the twelve post-write validation checks
`validation.postWrite` runs against the primary saved concept after a
publish. Each fixture builds a bundle under the OS temp dir and drives
`scripts/okf-write.js` as a child process, asserting on the one JSON
response line — the same seam `test/write-gate.test.js` uses.

Check                       Finding code                  Pass observable                                     Fail observable
 1 bundle-root declaration   ROOT_DECLARATION_NOT_EXACT    root `okf_version` is exactly the string "0.2"      `failed/incomplete`
 2 project mode              PROJECT_MODE_INVALID          root `project_mode` is a declared mode              `failed/incomplete`
 3 concept re-read           FRONTMATTER_UNPARSEABLE       written concept re-parses                           none (unreachable, 1)
 4 written-tree compare      POST_WRITE_VALIDATION_FAILED  re-read tree equals the expected tree               none (unreachable, 1)
 5 reserved bundle files     BUNDLE_FILES_NONCONFORMING    every reserved file parses                          `blocked` (2)
 6 concept type              TYPE_MISSING                  concept carries a non-empty `type`                  `blocked` (2)
 7 sources                   SOURCE_RESOURCE_MISSING       every source names a resource                       `blocked` (2)
 8 generated                 GENERATED_BY_MISSING          every generated entry names a `by`                  `blocked` (2)
 9 runtime                   RUNTIME_MISSING               `Attested Computation` carries a `runtime`          `blocked` (2)
10 identity prefix           HUMAN_PREFIX_MISSING          `author` carries a human/agent/tool prefix          `blocked` (2)
11 links                     UNRESOLVED_INTERNAL_LINK      every reference resolves to an existing file        `applied` with a warning (3)
12 upstreams                 DEPENDS_ON_BLOCKED_CONCEPT    no source is a blocked concept                      `failed/incomplete`

The outer exception handler around `postWrite` is error containment, not a
thirteenth check: it has no pass observation, and no wrapper fixture forces
its fail observation through a normal request (that would be fault
injection, which issue #86 rules out).

The pass column is covered by one shared conformant fixture rather than one
fixture per check: that request drives every check's pass branch in a single
`applied` response, so per-check pass fixtures would only duplicate it.

Three facts limit the fail column, and each is a property of the runtime, not
of these fixtures:

 1. Checks 3 and 4 re-verify what the pre-write gate already proved with the
    same parser over the same bytes (`roundTripMismatch`), so no wrapper-level
    input reaches them failing. No fail fixture exists for them.
 2. Checks 5-10 also run in the pre-write gate, which returns `blocked` before
    the write happens. `postWrite` is therefore never entered for those inputs,
    and its copies of these checks are unreachable through the wrapper. The
    shared fixture below asserts what does happen — the pre-write block, with
    the check's own code and the concept untouched on disk.
 3. Check 11 reports a warning, not a blocker, so it cannot move the result off
    `applied`. A source that resolves to a directory takes this same branch:
    a directory is not an existing file for this check.

Consequence: nine of the twelve checks have no `failed/incomplete` observable
reachable from a normal wrapper request, so this file covers their reachable
observable instead — the pre-write `blocked` case for checks 5-10, and no
forced fixture at all for checks 3 and 4, whose fail conditions stay
documented rather than fixture-forced. This reflects the issue #86
resolution, not a renegotiated criterion.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

function bundle(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-78-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  fs.writeFileSync(path.join(root, 'good.md'), '---\ntype: Note\ntitle: Good\n---\n# Good\n');
  return root;
}

function request(root, { operation = 'revise', concept = 'note.md', set = { title: 'After' }, evidence = ['evidence.md'] } = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation,
    task_kind: 'fix',
    scope: { concepts: [concept] },
    payload: { cwd: root, bundle: root, concept, set, evidence },
  };
}

function run(value) {
  const result = cp.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const response = JSON.parse(result.stdout);
  assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
  return response;
}

test('a fully conformant new concept passes every post-write check', (t) => {
  const root = bundle(t);
  const response = run(request(root, {
    operation: 'create',
    concept: 'child.md',
    set: {
      type: 'Attested Computation',
      runtime: 'node',
      sources: [{ resource: 'good.md' }],
      generated: [{ by: 'agent:tool' }],
      author: 'human:tester',
      confirmed: 'human:tester',
    },
  }));
  assert.equal(response.result, 'applied');
  assert.equal(response.data.validation, 'valid');
  assert.deepEqual(response.findings, []);
  assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Attested Computation/);
});

test('a write that makes the bundle root non-conforming reports incomplete and stays on disk', (t) => {
  const root = bundle(t);
  const response = run(request(root, {
    concept: 'index.md',
    set: { type: 'Bundle', okf_version: '0.3' },
  }));
  assert.equal(response.result, 'failed/incomplete');
  assert.equal(response.data.validation, 'failed');
  const finding = response.findings.find((f) => f.code === 'ROOT_DECLARATION_NOT_EXACT');
  assert.ok(finding, 'expected ROOT_DECLARATION_NOT_EXACT');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { observed: '0.3', observed_type: 'string' });
  assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /okf_version: "0.3"/);
});

test('a write that makes the project mode invalid reports incomplete and stays on disk', (t) => {
  const root = bundle(t);
  const response = run(request(root, {
    concept: 'index.md',
    set: { type: 'Bundle', project_mode: 'both' },
  }));
  assert.equal(response.result, 'failed/incomplete');
  assert.equal(response.data.validation, 'failed');
  const finding = response.findings.find((f) => f.code === 'PROJECT_MODE_INVALID');
  assert.ok(finding, 'expected PROJECT_MODE_INVALID');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { gate: 'project mode' });
  assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /project_mode: both/);
});

test('a created concept whose source is blocked reports incomplete after the write', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'blocked.md'), '---\ntitle: No type here\n---\n# Blocked\n');
  const response = run(request(root, {
    operation: 'create',
    concept: 'child.md',
    set: { type: 'Note', sources: [{ resource: 'blocked.md' }] },
  }));
  assert.equal(response.result, 'failed/incomplete');
  assert.equal(response.data.validation, 'failed');
  const finding = response.findings.find((f) => f.code === 'DEPENDS_ON_BLOCKED_CONCEPT');
  assert.ok(finding, 'expected DEPENDS_ON_BLOCKED_CONCEPT');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { path: 'child.md', blocked_concept: 'blocked.md' });
  assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Note/);
});

test('an unresolved reference is reported as a warning and the write stays applied', (t) => {
  const root = bundle(t);
  const response = run(request(root, {
    operation: 'create',
    concept: 'child.md',
    set: { type: 'Note', sources: [{ resource: 'missing.md' }] },
  }));
  assert.equal(response.result, 'applied');
  assert.equal(response.data.validation, 'valid');
  const finding = response.findings.find((f) => f.code === 'UNRESOLVED_INTERNAL_LINK');
  assert.ok(finding, 'expected UNRESOLVED_INTERNAL_LINK');
  assert.equal(finding.origin, 'okf');
  assert.deepEqual(finding.detail, { path: 'child.md', resource: 'missing.md' });
  assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /resource: missing\.md/);
});

test('a source that resolves to a directory is reported as an unresolved link, not read', (t) => {
  const root = bundle(t);
  fs.mkdirSync(path.join(root, 'a-directory'));
  const response = run(request(root, {
    operation: 'create',
    concept: 'child.md',
    set: { type: 'Note', sources: [{ resource: 'a-directory' }] },
  }));
  assert.equal(response.result, 'applied');
  assert.equal(response.data.validation, 'valid');
  const finding = response.findings.find((f) => f.code === 'UNRESOLVED_INTERNAL_LINK');
  assert.ok(finding, 'expected UNRESOLVED_INTERNAL_LINK');
  assert.equal(finding.origin, 'okf');
  assert.deepEqual(finding.detail, { path: 'child.md', resource: 'a-directory' });
  assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Note/);
});

// Each case below is blocked by the pre-write gate, which owns the same check.
// The assertion is the gate's own finding code plus the concept untouched.
function preWriteBlock(t, code, set) {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  const before = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
  const response = run(request(root, { set }));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.validation, 'not-run');
  const finding = response.findings.find((f) => f.code === code);
  assert.ok(finding, `expected ${code}`);
  assert.equal(finding.origin, 'okf');
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), before);
  return root;
}

test('a reserved bundle file that fails to parse is reported by the pre-write gate', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
  fs.writeFileSync(path.join(root, 'log.md'), '---\ntype: Log\n');
  const before = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
  const response = run(request(root));
  assert.equal(response.result, 'blocked');
  const finding = response.findings.find((f) => f.code === 'BUNDLE_FILES_NONCONFORMING');
  assert.ok(finding, 'expected BUNDLE_FILES_NONCONFORMING');
  assert.equal(finding.origin, 'okf');
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), before);
});

test('a blanked concept type is reported by the pre-write gate', (t) => {
  preWriteBlock(t, 'TYPE_MISSING', { type: '' });
});

test('a blanked source resource is reported by the pre-write gate', (t) => {
  preWriteBlock(t, 'SOURCE_RESOURCE_MISSING', { sources: [{ resource: '' }] });
});

test('a blanked generated-by is reported by the pre-write gate', (t) => {
  preWriteBlock(t, 'GENERATED_BY_MISSING', { generated: [{ by: '' }] });
});

test('a blanked attested-computation runtime is reported by the pre-write gate', (t) => {
  preWriteBlock(t, 'RUNTIME_MISSING', { type: 'Attested Computation', runtime: '' });
});

test('an author without a human/agent/tool prefix is reported by the pre-write gate', (t) => {
  preWriteBlock(t, 'HUMAN_PREFIX_MISSING', { author: 'bob' });
});
