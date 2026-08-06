const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { REQUIRED_BRIEF_FIELDS } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const agentsDir = path.join(repo, 'agents');
const adaptersDir = path.join(repo, 'adapters');
const cliWrapper = path.join(repo, 'scripts', 'okf-adapter.js');
const delegation = require('../scripts/lib/delegation');
const harnesses = ['claude-code', 'codex', 'opencode'];
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

function manifest(harness) {
  return JSON.parse(fs.readFileSync(path.join(adaptersDir, harness, 'manifest.json'), 'utf8'));
}

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-68-agents-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
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
  for (const harness of harnesses) {
    const declared = manifest(harness);
    assert.equal(Object.hasOwn(declared, 'agents'), false, harness);
    // additive and inert: naming a file in `agents` grants no install action
    assert.equal(declared.installs.some((entry) => entry.source.startsWith('agents/')), false, harness);
  }
});

test('installing an adapter copies no agent definition into the harness-local target directory', (t) => {
  for (const harness of harnesses) {
    const root = temporaryRoot(t);
    const targetDir = path.join(root, 'target');
    const result = childProcess.spawnSync(process.execPath, [cliWrapper, 'install', harness, targetDir], { encoding: 'utf8' });
    assert.equal(result.status, 0, harness);
    const response = JSON.parse(result.stdout);
    assert.equal(response.ok, true, harness);
    assert.equal(response.installed_files.some((f) => /okf-reader|okf-writer/.test(f)), false, harness);
    assert.equal(fs.existsSync(path.join(targetDir, 'agents')), false, harness);
  }
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
