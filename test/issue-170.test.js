/*
#170 (decisions #168 and #169) — the external-skill conformance fixture.

It bootstraps a genuinely empty repository through the documented setup order,
proves the agent connector `index.md -> agents/index.md -> agents/okf.md` exists
with its exact invariant rules, and then runs the proposal-first flow an external
document-producing skill follows: read the connector, hand `okf-lifecycle` one
session-local handoff, accept one complete proposal, and call `okf-write` once per
accepted concept.

The lifecycle handoff and the accepted proposal record are session-local artifacts,
so they are fixture data here. This proves the documented flow is compatible with
the wrapper contracts. It proves nothing about human acceptance or about a real
agent waiting for it — the separate live external-skill case observes that.

Only existing wrapper processes are used as contract boundaries.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { binding, runWrapper, temporaryRoot, treeHash } = require('../test-support/snapshot');

const setupWrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const readWrapper = path.join(__dirname, '..', 'scripts', 'okf-read.js');
const writeWrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

function setup(root, operation, payload = {}) {
  return runWrapper(setupWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation,
    payload: { cwd: root, ...payload },
  });
}

function read(root, operation, payload = {}) {
  return runWrapper(readWrapper, {
    protocol: 'okf-wrapper/1',
    skill: 'okf-read',
    operation,
    payload: { cwd: root, ...payload },
  });
}

// One bootstrapped repository: nothing but a Git root, plus the material the
// external skill actually read while doing its own normal work.
function bootstrap(t) {
  const root = temporaryRoot(t, 'okf-170-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'agent-policy.md'), '# Agent policy\n\nIssues live in the tracker. Labels are triaged weekly.\n');

  assert.equal(setup(root, 'inspect').data.index_md.state, 'missing');
  assert.equal(setup(root, 'init', { project_mode: 'knowledge-only' }).result, 'applied');
  assert.equal(setup(root, 'repair', { targets: ['activation'] }).result, 'applied');
  assert.equal(setup(root, 'repair', { targets: ['manifest'] }).result, 'applied');
  assert.equal(setup(root, 'discover').result, 'ok');
  return root;
}

test('the documented setup order gives a new bundle the root-to-connector navigation chain', (t) => {
  const root = bootstrap(t);
  const bundle = path.join(root, 'okf');

  assert.equal(
    fs.readFileSync(path.join(bundle, 'index.md'), 'utf8'),
    '---\nokf_version: "0.2"\nproject_mode: knowledge-only\n---\n# Bundle\n\n- [Agents](agents/index.md)\n',
  );
  const agentsIndex = fs.readFileSync(path.join(bundle, 'agents', 'index.md'), 'utf8');
  assert.equal(agentsIndex, '# Agents\n\n- [OKF agent connector](okf.md)\n');
  // Navigation only: a nested index is never a concept, so it carries no frontmatter.
  assert.equal(agentsIndex.startsWith('---'), false);

  const resolved = read(root, 'resolve', { target: 'agents/okf' });
  assert.equal(resolved.result, 'ok');
});

test('the connector states the exact invariant rules an external skill must follow', (t) => {
  const root = bootstrap(t);
  const bundle = path.join(root, 'okf');

  const response = read(root, 'read', { target: 'agents/okf' });
  assert.equal(response.result, 'ok');

  const connector = fs.readFileSync(path.join(bundle, 'agents', 'okf.md'), 'utf8');
  assert.match(connector, /^---\ntitle: OKF agent connector\ntype: Playbook\n---\n/);
  for (const rule of [
    /Read the bundle through `okf-read`\./,
    /prepare one complete change proposal through `okf-lifecycle`/i,
    /call `okf-write` once for each accepted concept/,
    /Never edit a bundle file directly/,
    /Treat every nested `index\.md` as navigation, never as a concept/,
    /Never default to `Note`/,
    /Never cite the bundle root or this connector only to satisfy the gate/,
    /no external skill owns it/,
    /\[agents index\]\(index\.md\)/,
  ]) assert.match(connector, rule);

  // Stable suite rules, not copied wrapper request schemas, and no executable
  // harness configuration.
  assert.equal(connector.includes('okf-wrapper/1'), false);
  assert.equal(connector.includes('"payload"'), false);
  assert.match(connector, /Executable permissions, hooks, and harness settings stay outside this bundle/);
});

test('the proposal-first flow writes once per accepted concept and leaves a valid bundle', (t) => {
  const root = bootstrap(t);
  const bundle = path.join(root, 'okf');

  // The external skill reads the connector before it proposes anything.
  assert.equal(read(root, 'read', { target: 'agents/okf' }).result, 'ok');

  // Session-local fixture data: the lifecycle handoff the external skill gives
  // `okf-lifecycle`, and the accepted proposal record lifecycle froze from it.
  const handoff = {
    workspace: root,
    bundle,
    task_kind: 'feature work',
    user_goal: 'record the project agent policy in OKF',
    completed_work: 'drafted the agent policy for this repository',
    observed_evidence: ['docs/agent-policy.md'],
    candidates: [
      { intent: 'where issues live', suggested_path: 'agents/issue-tracker.md', suggested_type: 'Playbook' },
      { intent: 'the triage label vocabulary', suggested_path: 'agents/triage-labels.md', suggested_type: 'Reference' },
    ],
  };
  const acceptedProposal = {
    accepted: true,
    items: handoff.candidates.map((candidate, index) => ({
      operation: 'create',
      concept: candidate.suggested_path,
      set: { type: candidate.suggested_type, title: index === 0 ? 'Issue tracker' : 'Triage labels' },
      body: index === 0 ? '# Issue tracker\n\nIssues live in the tracker.\n' : '# Triage labels\n\nLabels are triaged weekly.\n',
      evidence: [binding(root, path.join('docs', 'agent-policy.md'))],
    })),
  };

  // Nothing was written while the proposal was being built: the bundle is byte-for-byte
  // what setup left behind, up to the acceptance boundary this fixture models.
  const beforeAcceptance = treeHash(bundle);
  assert.equal(acceptedProposal.accepted, true);
  assert.equal(treeHash(bundle), beforeAcceptance);

  // One `okf-write` call per accepted concept, never a batch.
  for (const item of acceptedProposal.items) {
    const response = runWrapper(writeWrapper, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-write',
      operation: item.operation,
      task_kind: handoff.task_kind,
      invocation: 'explicit',
      scope: { concepts: [item.concept] },
      payload: {
        cwd: root, bundle, concept: item.concept, set: item.set, body: item.body, evidence: item.evidence,
      },
    });
    assert.equal(response.result, 'applied', JSON.stringify(response.findings));
  }

  for (const item of acceptedProposal.items) {
    const back = read(root, 'read', { target: item.concept.replace(/\.md$/, '') });
    assert.equal(back.result, 'ok');
    assert.match(fs.readFileSync(path.join(bundle, item.concept), 'utf8'), new RegExp(`type: ${item.set.type}`));
  }

  const validated = read(root, 'validate', { bundle, today: '2026-08-09' });
  assert.deepEqual(validated.findings.filter((finding) => finding.blocks), []);
});
