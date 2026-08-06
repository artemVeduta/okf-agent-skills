const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { REQUIRED_BRIEF_FIELDS } = require('../test-support/snapshot');

const scripts = path.join(__dirname, '..', 'scripts');
const delegation = require(path.join(scripts, 'lib', 'delegation'));
const delegateWrapper = path.join(scripts, 'okf-delegate.js');
const readWrapper = path.join(scripts, 'okf-read.js');
const writeWrapper = path.join(scripts, 'okf-write.js');

function bundle(t, mode = 'knowledge-only') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-68-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), `---\nokf_version: "0.2"\nproject_mode: "${mode}"\n---\n# Bundle\n`);
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed\n');
  return root;
}

function concept(root, text = '---\ntype: Note\ntitle: Before\n---\n# Body\n') {
  fs.writeFileSync(path.join(root, 'note.md'), text);
}

function brief(root, overrides = {}) {
  return {
    role: 'okf-writer',
    task_kind: 'fix',
    operation_class: 'revise',
    cwd: root,
    bundle: root,
    paths: ['note.md'],
    changes: { title: 'After' },
    allowed_effects: ['concept-revise'],
    forbidden_effects: ['concept-create', 'format', 'relationship', 'machine-verify'],
    evidence: ['evidence.md'],
    required_checks: ['runtime-preflight'],
    settings: { read_execution: 'inline', write_execution: 'delegated' },
    expected_result: 'note.md revised',
    ...overrides,
  };
}

function readBrief(root, overrides = {}) {
  return brief(root, {
    role: 'okf-reader',
    operation_class: 'read',
    changes: undefined,
    allowed_effects: [],
    forbidden_effects: ['concept-create', 'concept-revise', 'format', 'relationship', 'machine-verify'],
    ...overrides,
  });
}

function run(wrapper, value) {
  const result = cp.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  const response = JSON.parse(result.stdout);
  return { status: result.status, stderr: result.stderr, stdout: result.stdout, response };
}

function bytes(file) {
  return fs.readFileSync(file);
}

test('validateBrief blocks a brief missing any required field as incomplete-brief', () => {
  for (const field of REQUIRED_BRIEF_FIELDS) {
    const value = brief('/repo');
    delete value[field];
    const result = delegation.validateBrief(value);
    assert.equal(result.ok, false, field);
    assert.equal(result.status, 'blocked: incomplete-brief', field);
  }
});

test('validateBrief blocks null, empty-string, empty-array, and empty-object required fields', () => {
  const cases = [
    ['cwd', ''],
    ['paths', []],
    ['evidence', null],
    ['settings', {}],
  ];
  for (const [field, value] of cases) {
    const b = brief('/repo', { [field]: value });
    const result = delegation.validateBrief(b);
    assert.equal(result.ok, false, field);
    assert.equal(result.status, 'blocked: incomplete-brief', field);
  }
});

test('validateBrief blocks an unknown role as incomplete-brief and never guesses a role', () => {
  const result = delegation.validateBrief(brief('/repo', { role: 'okf-admin' }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked: incomplete-brief');
});

test('validateBrief blocks a settings value outside inline|delegated as incomplete-brief', () => {
  const result = delegation.validateBrief(brief('/repo', {
    settings: { read_execution: 'inline', write_execution: 'automatic' },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked: incomplete-brief');
});

test('validateBrief blocks an effect present in both allowed and forbidden as conflicting-rules', () => {
  const result = delegation.validateBrief(brief('/repo', {
    allowed_effects: ['concept-revise'],
    forbidden_effects: ['concept-revise'],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked: conflicting-rules');
});

test('validateBrief blocks a reader brief that requests any write effect as scope widening', () => {
  const result = delegation.validateBrief(readBrief('/repo', { allowed_effects: ['concept-revise'] }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked: conflicting-rules');
});

test('validateBrief blocks a writer brief that requests an effect outside the shipped writer effects', () => {
  const result = delegation.validateBrief(brief('/repo', { allowed_effects: ['concept-revise', 'mechanical-link-maintenance'] }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked: conflicting-rules');
});

test('validateBrief blocks a router-table operation owned by the other role, but forwards an operation absent from the table unchanged', () => {
  const readerOnWrite = delegation.validateBrief(readBrief('/repo', { operation_class: 'revise' }));
  assert.equal(readerOnWrite.status, 'blocked: conflicting-rules');

  const notARouterOperation = delegation.validateBrief(brief('/repo', { operation_class: 'delete' }));
  assert.equal(notARouterOperation.ok, true);
  assert.equal(notARouterOperation.request.operation, 'delete');
});

test('validateBrief blocks orient on a reader brief: orientation belongs to the session seam, not a delegation brief', () => {
  const result = delegation.validateBrief(readBrief('/repo', { operation_class: 'orient' }));
  assert.equal(result.status, 'blocked: conflicting-rules');
});

test('validateBrief accepts a well-formed reader brief and builds the same okf-wrapper/1 request inline execution would send', () => {
  const result = delegation.validateBrief(readBrief('/repo'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.request, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-read',
    operation: 'read',
    task_kind: 'fix',
    invocation: 'explicit',
    payload: { cwd: '/repo', bundle: '/repo', target: 'note.md' },
  });
});

test('validateBrief accepts a well-formed writer brief and builds the same okf-wrapper/1 request inline execution would send', () => {
  const result = delegation.validateBrief(brief('/repo'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.request, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'revise',
    task_kind: 'fix',
    invocation: 'explicit',
    payload: { cwd: '/repo', bundle: '/repo', concept: 'note.md', evidence: ['evidence.md'], effects: ['concept-revise'], set: { title: 'After' } },
  });
});

test('receipt maps runtime applied and no-op to clean, and failed/incomplete to partially-applied', () => {
  const b = brief('/repo');
  assert.equal(delegation.receipt(b, { result: 'applied', data: {}, findings: [] }).status, 'clean');
  assert.equal(delegation.receipt(b, { result: 'no-op', data: {}, findings: [] }).status, 'clean');
  assert.equal(delegation.receipt(b, { result: 'failed/incomplete', data: {}, findings: [] }).status, 'partially-applied');
});

test('receipt maps the three drift/mismatch finding codes to their named blocked statuses, and other blocks to failed', () => {
  const b = brief('/repo');
  const withCode = (code) => delegation.receipt(b, { result: 'blocked', data: { code }, findings: [] }).status;
  assert.equal(withCode('WRITE_TARGET_OUTSIDE_WORKTREE'), 'blocked: repository-instance-mismatch');
  assert.equal(withCode('TARGET_CHANGED'), 'blocked: target-conflict');
  assert.equal(withCode('EVIDENCE_UNAVAILABLE'), 'blocked: stale-handoff');
  assert.equal(withCode('EVIDENCE_REQUIRED'), 'failed');
  assert.equal(withCode(undefined), 'failed');
});

test('receipt passes a validateBrief refusal straight through as the receipt status', () => {
  const b = brief('/repo');
  const refusal = delegation.validateBrief(brief('/repo', { role: 'okf-admin' }));
  const result = delegation.receipt(b, refusal);
  assert.equal(result.status, 'blocked: incomplete-brief');
  assert.deepEqual(result.findings, refusal.findings);
});

test('receipt carries requested and actual effects, evidence, validation, residue, findings, next action, and disclosures', () => {
  const b = brief('/repo', { allowed_effects: ['concept-revise', 'log-append'] });
  const response = {
    result: 'applied',
    data: {
      actual_effects: [{ effect: 'concept-revise', authorization: 'notice', inherited: false }],
      evidence: ['evidence.md'],
      validation: 'valid',
      residue: [],
    },
    findings: [{ code: 'INLINE_VERIFICATION_INVALIDATED', origin: 'suite', severity: 'warning', blocks: false }],
    next_action: null,
  };
  const result = delegation.receipt(b, response);
  assert.equal(result.protocol, 'okf-wrapper/1');
  assert.equal(result.receipt, 'okf-delegation/1');
  assert.equal(result.role, 'okf-writer');
  assert.deepEqual(result.operation_identity, { operation: 'revise', task_kind: 'fix', role: 'okf-writer' });
  assert.deepEqual(result.target, { bundle: '/repo', cwd: '/repo', concepts: ['note.md'] });
  assert.deepEqual(result.requested_effects, ['concept-revise', 'log-append']);
  assert.deepEqual(result.actual_effects, response.data.actual_effects);
  assert.deepEqual(result.evidence, ['evidence.md']);
  assert.equal(result.validation, 'valid');
  assert.deepEqual(result.residue, []);
  assert.deepEqual(result.disclosures, { writes: 'not serialized', crash_recovery: 'not provided', retry: 'not automatic' });
  assert.deepEqual(result.findings, response.findings);
  assert.equal(result.next_action, null);
});

test('okf-delegate rejects malformed JSON input at the process boundary', () => {
  const result = cp.spawnSync(process.execPath, [delegateWrapper], { input: '{not json', encoding: 'utf8' });
  assert.equal(result.status, 64);
  assert.notEqual(result.stderr.trim(), '');
  assert.equal(result.stdout, '');
});

test('okf-delegate reports an incomplete brief as blocked: incomplete-brief without dispatching', (t) => {
  const root = bundle(t);
  concept(root);
  const value = brief(root);
  delete value.evidence;
  const { status, stderr, response } = run(delegateWrapper, value);
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(response.receipt, 'okf-delegation/1');
  assert.equal(response.status, 'blocked: incomplete-brief');
});

test('okf-delegate reports a scope-widening reader brief as blocked: conflicting-rules without dispatching', (t) => {
  const root = bundle(t);
  const value = readBrief(root, { allowed_effects: ['concept-revise'] });
  const { response } = run(delegateWrapper, value);
  assert.equal(response.status, 'blocked: conflicting-rules');
});

test('a delegated read dispatches through the real okf-read wrapper and reports its result', (t) => {
  const root = bundle(t);
  concept(root);
  const inline = run(readWrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'read',
    payload: { cwd: root, target: 'note.md' },
  });
  const delegated = run(delegateWrapper, readBrief(root));
  assert.equal(delegated.status, 0);
  assert.equal(delegated.response.role, 'okf-reader');
  assert.equal(inline.response.result, 'unavailable');
  assert.equal(delegated.response.status, 'unavailable');
  assert.deepEqual(delegated.response.findings, inline.response.findings);
});

test('a delegated write reaches the same #54 runtime preflight as an inline write: a bundle outside the active worktree is repository-instance-mismatch', (t) => {
  const root = bundle(t);
  concept(root);
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-68-outside-')));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(outside, '.git'));
  fs.writeFileSync(path.join(outside, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n');
  fs.writeFileSync(path.join(outside, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Body\n');
  fs.writeFileSync(path.join(outside, 'evidence.md'), 'observed\n');

  const inline = run(writeWrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', task_kind: 'fix',
    payload: { cwd: root, bundle: outside, concept: 'note.md', set: { title: 'After' }, evidence: ['evidence.md'] },
  });
  assert.equal(inline.response.data.code, 'WRITE_TARGET_OUTSIDE_WORKTREE');

  const delegated = run(delegateWrapper, brief(root, { bundle: outside }));
  assert.equal(delegated.response.status, 'blocked: repository-instance-mismatch');
  assert.ok(delegated.response.findings.some((f) => f.code === 'WRITE_TARGET_OUTSIDE_WORKTREE'));
  assert.deepEqual(bytes(path.join(outside, 'note.md')), Buffer.from('---\ntype: Note\ntitle: Before\n---\n# Body\n'));
});

test('a delegated write with unreadable evidence is blocked: stale-handoff, matching the runtime EVIDENCE_UNAVAILABLE gate', (t) => {
  const root = bundle(t);
  concept(root);
  const { response } = run(delegateWrapper, brief(root, { evidence: ['missing-evidence.md'] }));
  assert.equal(response.status, 'blocked: stale-handoff');
  assert.ok(response.findings.some((f) => f.code === 'EVIDENCE_UNAVAILABLE'));
});

test('inline and delegated bounded writes against equivalent fixtures agree at the runtime level', (t) => {
  const inlineRoot = bundle(t);
  concept(inlineRoot);
  const delegatedRoot = bundle(t);
  concept(delegatedRoot);

  const inline = run(writeWrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', task_kind: 'fix',
    payload: { cwd: inlineRoot, bundle: inlineRoot, concept: 'note.md', set: { title: 'After' }, evidence: ['evidence.md'] },
  });
  const delegated = run(delegateWrapper, brief(delegatedRoot));

  assert.equal(inline.response.result, 'applied');
  assert.equal(delegated.response.status, 'clean');
  assert.deepEqual(bytes(path.join(inlineRoot, 'note.md')), bytes(path.join(delegatedRoot, 'note.md')));
});

test('a writer child that fails to produce a parseable response is reported indeterminate and mutates nothing', (t) => {
  const root = bundle(t);
  concept(root);
  const before = bytes(path.join(root, 'note.md'));
  const value = brief(root, { bundle: 42 });

  const first = run(delegateWrapper, value);
  const second = run(delegateWrapper, value);

  for (const { status, response } of [first, second]) {
    assert.equal(status, 0);
    assert.equal(response.status, 'indeterminate');
  }
  assert.deepEqual(bytes(path.join(root, 'note.md')), before);
});

test('delegation never touches .okf-active or .okf-workspace.json', (t) => {
  const root = bundle(t);
  concept(root);
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({ schema_version: 1 }));
  const markerBefore = bytes(path.join(root, '.okf-active'));
  const workspaceBefore = bytes(path.join(root, '.okf-workspace.json'));

  run(delegateWrapper, brief(root));

  assert.deepEqual(bytes(path.join(root, '.okf-active')), markerBefore);
  assert.deepEqual(bytes(path.join(root, '.okf-workspace.json')), workspaceBefore);
});
