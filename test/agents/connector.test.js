/*
Domain: agents.

The agent connector, in both halves AGENTS.md names:

- the shipped agent definitions under `agents/` and their tool allowlists, which
  are what a delegated role is permitted to do; and
- the in-bundle chain `index.md -> agents/index.md -> agents/okf.md`, which is
  how an external skill reaches those rules, plus the invariants the connector
  states and the proposal-first flow that follows from them.

Only existing wrapper processes are used as contract boundaries.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  REQUIRED_BRIEF_FIELDS, binding, runWrapper, temporaryRoot, treeHash,
} = require('../../test-support/snapshot');

const repo = path.resolve(__dirname, '..', '..');

test.describe('shipped agent definitions and tool allowlists', () => {
  const agentsDir = path.join(repo, 'agents');
  const delegation = require('../../scripts/lib/delegation');
  const expectedStatuses = [
    'clean',
    'failed',
    'partially-applied',
    'indeterminate',
    'blocked: incomplete-brief',
    'blocked: conflicting-rules',
    'blocked: repository-instance-mismatch',
    'blocked: target-conflict',
    'blocked: stale-handoff',
    'blocked: missing-skill',
    'blocked: incompatible-skill',
  ];

  // Line-wise frontmatter scan, matching the parsing style already used by
  // scripts/lib/routing.js for other shipped Markdown artifacts (no YAML dep).
  function frontmatter(text) {
    const lines = text.split(/\r?\n/);
    assert.equal(lines[0], '---');
    const data = {};
    let i = 1;
    for (; i < lines.length && lines[i] !== '---'; i++) {
      const match = lines[i].match(/^([A-Za-z_]+):\s*(.*)$/);
      if (match) data[match[1]] = match[2].trim();
    }
    assert.equal(lines[i], '---');
    return data;
  }

  function agentText(name) {
    return fs.readFileSync(path.join(agentsDir, `${name}.md`), 'utf8');
  }

  function readAgent(name) {
    return frontmatter(agentText(name));
  }

  function statusVocabulary() {
    const source = [
      fs.readFileSync(path.join(repo, 'scripts', 'lib', 'delegation.js'), 'utf8'),
      fs.readFileSync(path.join(repo, 'scripts', 'okf-delegate.js'), 'utf8'),
    ].join('\n');
    const set = new Set();
    for (const m of source.matchAll(/'(clean|failed|partially-applied|indeterminate|blocked: [a-z-]+)'/g)) set.add(m[1]);
    return set;
  }

  test('okf-reader declares its skill binding and a read/search-only tool allowlist', () => {
    const fm = readAgent('okf-reader');
    assert.equal(fm.name, 'okf-reader');
    assert.equal(fm.skill, '/okf-read');
    const tools = fm.tools.split(',').map((t) => t.trim());
    assert.deepEqual(tools.slice().sort(), ['Glob', 'Grep', 'Read']);
  });

  test('okf-writer declares its skill binding and the exact leaf tool allowlist, gated on the delegate runner', () => {
    const fm = readAgent('okf-writer');
    assert.equal(fm.name, 'okf-writer');
    assert.equal(fm.skill, '/okf-write');
    const tools = fm.tools.split(',').map((t) => t.trim());
    assert.deepEqual(tools.slice().sort(), ['Bash(node scripts/okf-delegate.js:*)', 'Glob', 'Grep', 'Read']);
  });

  test('the frontmatter skill binding matches scripts/lib/delegation.ROLES for both agents', () => {
    for (const name of ['okf-reader', 'okf-writer']) {
      const fm = readAgent(name);
      assert.equal(fm.skill, `/${delegation.ROLES[name].skill}`, name);
    }
  });

  test('every adapter manifest carries no agents key; the shipped agent definitions live under agents/ directly', () => {
    assert.equal(fs.existsSync(path.join(agentsDir, 'okf-reader.md')), true);
    assert.equal(fs.existsSync(path.join(agentsDir, 'okf-writer.md')), true);
  });

  test('the brief field set declared in scripts/lib/delegation.js, plus the writer-required changes field, appears in both agent definitions', () => {
    const readerText = agentText('okf-reader');
    const writerText = agentText('okf-writer');
    for (const field of REQUIRED_BRIEF_FIELDS) {
      assert.match(readerText, new RegExp('`' + field + '`'), `reader missing ${field}`);
      assert.match(writerText, new RegExp('`' + field + '`'), `writer missing ${field}`);
    }
    assert.match(readerText, /`changes`/);
    assert.match(writerText, /`changes`/);
  });

  test('the receipt field set built by scripts/lib/delegation.js appears in the writer definition', () => {
    const brief = {
      role: 'okf-writer', operation_class: 'create', task_kind: 'x', bundle: 'b', cwd: 'c',
      paths: ['p'], allowed_effects: ['concept-create'],
    };
    const built = delegation.receipt(brief, { status: 'clean' });
    const writerText = agentText('okf-writer');
    for (const field of Object.keys(built)) {
      assert.match(writerText, new RegExp('`' + field + '`'), `writer missing receipt field ${field}`);
    }
  });

  test('the status vocabulary in scripts/lib/delegation.js and scripts/okf-delegate.js appears in the writer definition', () => {
    const statuses = statusVocabulary();
    assert.deepEqual([...statuses].sort(), expectedStatuses.slice().sort());
    const writerText = agentText('okf-writer');
    // Reasoned statuses are documented as the `blocked: <reason>` template
    // plus a parenthetical reason list, not the two halves pre-joined.
    for (const status of statuses) {
      if (status.startsWith('blocked: ')) {
        assert.match(writerText, /`blocked: <reason>`/, 'writer missing the blocked: <reason> template');
        const reason = status.slice('blocked: '.length);
        assert.match(writerText, new RegExp('`' + reason + '`'), `writer missing reason ${reason}`);
      } else {
        assert.match(writerText, new RegExp('`' + status + '`'), `writer missing status ${status}`);
      }
    }
  });
});

/*
The external-skill conformance fixture (decisions #168 and #169).

It bootstraps a genuinely empty repository through the documented setup order,
proves the agent connector `index.md -> agents/index.md -> agents/okf.md` exists
with its exact invariant rules, and then runs the proposal-first flow an external
document-producing skill follows: read the connector, hand `okf-lifecycle` one
session-local handoff, accept one complete proposal, and call `okf-write` once per
accepted concept.

The lifecycle handoff and the accepted proposal record are session-local artifacts,
so they are fixture data here. This proves the documented flow is compatible with
the wrapper contracts. It proves nothing about human acceptance or about a real
agent waiting for it -- the separate live external-skill case observes that.
*/
test.describe('root-to-connector navigation and the proposal-first flow', () => {
  const setupWrapper = path.join(repo, 'scripts', 'okf-setup.js');
  const readWrapper = path.join(repo, 'scripts', 'okf-read.js');
  const writeWrapper = path.join(repo, 'scripts', 'okf-write.js');

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
    // #196/#197: the documented setup order writes the manifest before `init` now
    // (inspect -> consent -> repair manifest -> init -> discover); there is no
    // activation-marker repair target left to call.
    assert.equal(setup(root, 'repair', { targets: ['manifest'], project_mode: 'knowledge-only' }).result, 'applied');
    assert.equal(setup(root, 'init').result, 'applied');
    assert.equal(setup(root, 'discover').result, 'ok');
    return root;
  }

  test('the documented setup order gives a new bundle the root-to-connector navigation chain', (t) => {
    const root = bootstrap(t);
    const bundle = path.join(root, 'okf');

    // #196/#197: the root is navigation only -- no okf_version/project_mode
    // frontmatter, both of which now live only in the manifest bundle record.
    assert.equal(
      fs.readFileSync(path.join(bundle, 'index.md'), 'utf8'),
      '# Bundle\n\n- [Agents](agents/index.md)\n',
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

  // The connector is `init`'s to create, never `init`'s to overwrite: a bundle root
  // missing only `index.md` is repaired in full, and a connector file already on disk
  // keeps its own bytes instead of turning the repair into a partial write.
  test('init repairs a bundle root beside an existing connector file without overwriting it', (t) => {
    const root = temporaryRoot(t, 'okf-170-repair-');
    fs.mkdirSync(path.join(root, '.git'));
    const bundle = path.join(root, 'okf');
    fs.mkdirSync(path.join(bundle, 'agents'), { recursive: true });
    const handWritten = '---\ntitle: OKF agent connector\ntype: Playbook\n---\n\n# Local connector\n';
    fs.writeFileSync(path.join(bundle, 'agents', 'okf.md'), handWritten);

    const response = setup(root, 'init');
    assert.equal(response.result, 'applied', JSON.stringify(response.findings));
    assert.deepEqual(response.data.actual_effects.map((record) => record.effect), ['init']);
    assert.equal(fs.readFileSync(path.join(bundle, 'agents', 'okf.md'), 'utf8'), handWritten);
    assert.equal(fs.readFileSync(path.join(bundle, 'agents', 'index.md'), 'utf8'), '# Agents\n\n- [OKF agent connector](okf.md)\n');
  });

  // An existing bundle root is not a new bundle: it keeps its own body and gets no
  // connector from `init`. Setup's target-tree proposal owns that case instead.
  test('init leaves an existing bundle root without the connector', (t) => {
    const root = temporaryRoot(t, 'okf-170-existing-');
    fs.mkdirSync(path.join(root, '.git'));
    const bundle = path.join(root, 'okf');
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, 'index.md'), '---\nokf_version: [\n---\n# Old bundle\n');

    assert.equal(setup(root, 'init').result, 'applied');
    assert.equal(fs.readFileSync(path.join(bundle, 'index.md'), 'utf8'), '# Bundle\n');
    assert.equal(fs.existsSync(path.join(bundle, 'agents')), false);
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
});
