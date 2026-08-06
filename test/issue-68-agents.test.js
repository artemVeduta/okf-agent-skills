const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REQUIRED_BRIEF_FIELDS } = require('../test-support/snapshot');

const repo = path.resolve(__dirname, '..');
const agentsDir = path.join(repo, 'agents');
const delegation = require('../scripts/lib/delegation');
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
