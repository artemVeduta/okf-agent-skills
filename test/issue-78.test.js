/*
Issue #78 — one wrapper-seam fixture per check the shipped post-write validation
(`validation.postWrite`, called from `runtime.js` after every published concept
write) actually performs, enumerated by reading `scripts/lib/validation.js`.

Every fixture builds its bundle under the OS temp dir and drives
`scripts/okf-write.js` as a child process, asserting on the single JSON
response line — the same seam `test/write-gate.test.js` uses. No fixture calls
a private runtime function or injects a fake `services` object.

Enumeration of the checks `postWrite()` performs, in source order, each with
the code it emits and how this file demonstrates it:

  1. checkRoot            ROOT_DECLARATION_NOT_EXACT   dedicated fail fixture
  2. projectMode           PROJECT_MODE_INVALID         dedicated fail fixture
  3. readConcept            FRONTMATTER_UNPARSEABLE     pass only (see NOTE A)
  4. expectedTree compare   POST_WRITE_VALIDATION_FAILED pass only (see NOTE A)
  5. checkBundleFiles       BUNDLE_FILES_NONCONFORMING  fail fixture (see NOTE B)
  6. checkConcept: type     TYPE_MISSING                fail fixture (see NOTE B)
  7. checkConcept: sources  SOURCE_RESOURCE_MISSING     fail fixture (see NOTE B)
  8. checkConcept: generated GENERATED_BY_MISSING       fail fixture (see NOTE B)
  9. checkConcept: runtime  RUNTIME_MISSING              fail fixture (see NOTE B)
 10. checkConcept: prefix   HUMAN_PREFIX_MISSING        fail fixture (see NOTE B)
 11. checkLinks             UNRESOLVED_INTERNAL_LINK    fail fixture (see NOTE C)
 12. checkUpstreams        DEPENDS_ON_BLOCKED_CONCEPT   dedicated fail fixture
 13. catch-all              POST_WRITE_VALIDATION_FAILED dedicated fail fixture
                            (unanticipated by D8 — see NOTE D)

Every check's pass branch is exercised by the single "fully conformant"
fixture below (it runs every one of the checks above and finds nothing).

NOTE A: checks 3 and 4 re-verify exactly what `evaluate()`/`evaluateCreate()`
already proved before ever calling `publishFile` — that the serialized tree
round-trips through the same parser to an identical tree
(`roundTripMismatch`, guarded pre-write). Given that guarantee, and that
nothing else touches the just-written file inside one synchronous request,
these two branches cannot be driven to fail through the wrapper without
either calling a private function or racing the write with a second process —
both forbidden by this ticket. Their pass branch is proven by every fixture
below that reaches `applied`; no fail fixture is included for them, reported
here rather than faked.

NOTE B: checks 5-10 run identically inside `evaluate()`/`evaluateCreate()`
before the write and again inside `postWrite()` after it, over the same tree
(guaranteed identical by the same round-trip contract as NOTE A). Whenever
one of these checks would fail, the pre-write copy always fires first and
returns `blocked` before `publishFile` ever runs, so `postWrite()`'s copy
never gets to be the one that reports the failure through the wrapper. The
"shared checks" fixture below still proves each check fires with its own
code, origin and an untouched concept on disk — the observable result is
`blocked`, not `incomplete`, because of this unavoidable race, which is
called out explicitly rather than asserting a result the runtime cannot
produce.

NOTE C: `checkLinks` is non-blocking (`warn`, not `blocker`). Its "fail" can
therefore never flip the result away from `applied` — a non-blocking check
cannot make a write "incomplete" by definition. The fixture below asserts the
finding fires with its code, origin and the unresolved reference surviving
on disk, while the result stays `applied`.

NOTE D: `evaluateCreate()` (pre-write gate for `create`) never calls
`checkLinks`/`checkUpstreams`, unlike `evaluate()` (pre-write gate for
`revise`), which calls both. That asymmetry is what makes checks 11-13
genuinely post-write-exclusive when driven through a `create` request: the
directory-as-source fixture below is the only path in this file that reaches
`postWrite()`'s outer `catch`, which D8 did not name as a check but which
`postWrite()` demonstrably performs (recovering instead of crashing).
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
  const response = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
  return response;
}

test('post-write validation accepts a fully conformant new concept and reports every check clean', (t) => {
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

test('post-write re-check catches a bundle root that only became non-conforming through its own write, leaving the write on disk', (t) => {
  const root = bundle(t);
  const response = run(request(root, {
    concept: 'index.md',
    set: { type: 'Bundle', okf_version: '0.3' },
  }));
  assert.equal(response.result, 'failed/incomplete');
  const finding = response.findings.find((f) => f.code === 'ROOT_DECLARATION_NOT_EXACT');
  assert.ok(finding, 'expected ROOT_DECLARATION_NOT_EXACT');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { observed: '0.3', observed_type: 'string' });
  assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /okf_version: "0.3"/);
});

test('post-write re-check catches a project mode that only became invalid through its own write, leaving the write on disk', (t) => {
  const root = bundle(t);
  const response = run(request(root, {
    concept: 'index.md',
    set: { type: 'Bundle', project_mode: 'both' },
  }));
  assert.equal(response.result, 'failed/incomplete');
  const finding = response.findings.find((f) => f.code === 'PROJECT_MODE_INVALID');
  assert.ok(finding, 'expected PROJECT_MODE_INVALID');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { gate: 'project mode' });
  assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /project_mode: both/);
});

test('post-write upstream re-check blocks a newly created concept whose source is invalid, though creation never checks upstreams itself', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'blocked.md'), '---\ntitle: No type here\n---\n# Blocked\n');
  const response = run(request(root, {
    operation: 'create',
    concept: 'child.md',
    set: { type: 'Note', sources: [{ resource: 'blocked.md' }] },
  }));
  assert.equal(response.result, 'failed/incomplete');
  const finding = response.findings.find((f) => f.code === 'DEPENDS_ON_BLOCKED_CONCEPT');
  assert.ok(finding, 'expected DEPENDS_ON_BLOCKED_CONCEPT');
  assert.equal(finding.origin, 'suite');
  assert.deepEqual(finding.detail, { path: 'child.md', blocked_concept: 'blocked.md' });
  assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Note/);
});

test('post-write link re-check flags an unresolved reference without blocking, since creation never checks links itself (non-blocking check, NOTE C)', (t) => {
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

test('post-write validation recovers from an unexpected read error instead of crashing (unanticipated by D8, NOTE D)', (t) => {
  const root = bundle(t);
  fs.mkdirSync(path.join(root, 'a-directory'));
  const response = run(request(root, {
    operation: 'create',
    concept: 'child.md',
    set: { type: 'Note', sources: [{ resource: 'a-directory' }] },
  }));
  assert.equal(response.result, 'failed/incomplete');
  const finding = response.findings.find((f) => f.code === 'POST_WRITE_VALIDATION_FAILED');
  assert.ok(finding, 'expected POST_WRITE_VALIDATION_FAILED');
  assert.equal(finding.origin, 'suite');
  assert.equal(finding.detail.path, 'child.md');
  assert.match(finding.detail.reason, /EISDIR|illegal operation/i);
  assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Note/);
});

test('checks postWrite shares with the pre-write gate (NOTE B): each fires with its own code, but the pre-write copy always wins the race, so the wrapper reports blocked rather than incomplete', (t) => {
  const cases = [
    ['reserved bundle file fails to parse', 'BUNDLE_FILES_NONCONFORMING', 'okf', (root) => fs.writeFileSync(path.join(root, 'log.md'), '---\ntype: Log\n'), { title: 'After' }],
    ['concept type blanked', 'TYPE_MISSING', 'okf', () => {}, { type: '' }],
    ['source resource blanked', 'SOURCE_RESOURCE_MISSING', 'okf', () => {}, { sources: [{ resource: '' }] }],
    ['generated-by blanked', 'GENERATED_BY_MISSING', 'okf', () => {}, { generated: [{ by: '' }] }],
    ['attested computation runtime blanked', 'RUNTIME_MISSING', 'okf', () => {}, { type: 'Attested Computation', runtime: '' }],
    ['author missing a human/agent/tool prefix', 'HUMAN_PREFIX_MISSING', 'okf', () => {}, { author: 'bob' }],
  ];
  for (const [label, code, origin, corrupt, set] of cases) {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    corrupt(root);
    const before = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
    const response = run(request(root, { set }));
    const finding = response.findings.find((f) => f.code === code);
    assert.equal(response.result, 'blocked', label);
    assert.ok(finding, `${label}: expected ${code}`);
    assert.equal(finding.origin, origin, label);
    assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), before, label);
  }
});
