const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readWrapper = path.join(__dirname, '..', 'scripts', 'okf-read.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');
const writeWrapper = path.join(__dirname, '..', 'scripts', 'okf-write.js');

function bundle(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-62-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
  return root;
}

function snapshot(root) {
  const hash = crypto.createHash('sha256');
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      const name = path.join(relative, entry.name);
      hash.update(`${name}\0${entry.isDirectory() ? 'directory' : 'file'}\0`);
      if (entry.isDirectory()) visit(file, name);
      else hash.update(fs.readFileSync(file));
    }
  }
  visit(root);
  return hash.digest('hex');
}

function run(wrapper, root, skill, operation, payload = {}) {
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify({
      protocol: 'okf-wrapper/1', skill, operation,
      payload: { cwd: root, bundle: root, ...payload },
    }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function enumerate(root, payload) {
  return run(readWrapper, root, 'okf-read', 'enumerate', payload);
}

test('enumerate reports inline Markdown inbound links without writes', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'target.md'), '---\ntype: Note\n---\n# Target\n');
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntype: Note\n---\nSee [target](target.md).\n');
  const before = snapshot(root);

  const response = enumerate(root);

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.inbound_links, {
    complete: true,
    incomplete_reasons: [],
    links: [{
      carrier: 'markdown.inline',
      source: { bundle_alias: '.', path: 'source.md', byte_offset: 32 },
      reference: 'target.md',
      verdict: 'resolves',
    }],
  });
  assert.deepEqual(response.data.archive_recommendations, []);
  assert.equal(snapshot(root), before);
});

test('enumerate discovers each required link carrier', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n[index inline](target.md)\n[index reference]: target.md\n');
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
    repositories: [{ name: 'app', path: '.', local: true }],
    bundles: [{ alias: 'main', owner: 'app', root: '.', required: true, mode: 'source' }],
  }));
  fs.writeFileSync(path.join(root, 'target.md'), '---\ntype: Note\n---\n# Target\n');
  fs.writeFileSync(path.join(root, 'source.md'), `---
type: Note
resource: target.md
sources:
  - resource: target.md
computation: target.md
executor:
  resource: target.md
attester:
  resource: target.md
---
[inline](target.md)
[reference]: target.md
[workspace](okf-workspace://main/target)
`);

  const response = enumerate(root);

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.inbound_links.incomplete_reasons, []);
  assert.deepEqual(response.data.inbound_links.links.map((link) => link.carrier), [
    'markdown.inline',
    'markdown.reference-definition',
    'frontmatter.resource',
    'frontmatter.sources[].resource',
    'frontmatter.computation',
    'frontmatter.executor.resource',
    'frontmatter.attester.resource',
    'markdown.inline',
    'markdown.inline',
    'markdown.reference-definition',
  ]);
  assert.deepEqual(response.data.inbound_links.links.map((link) => link.reference), [
    'target.md', 'target.md', 'target.md', 'target.md', 'target.md', 'target.md', 'target.md', 'target.md',
    'okf-workspace://main/target', 'target.md',
  ]);
  assert.ok(response.data.inbound_links.links.every((link) => link.verdict === 'resolves'));
});

test('enumerate excludes prose and code carriers', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'target.md'), '---\ntype: Note\n---\n# Target\n');
  fs.writeFileSync(path.join(root, 'source.md'), `---
type: Note
---
Prose target.md is not a link.

\`[inline code](target.md)\`

\`\`[multi-backtick code](target.md)\`\`

\`\`\`[triple-backtick code](target.md)\`\`\`

\`\`\`
[fenced code](target.md)
\`\`\`

[included](target.md)
`);

  const response = enumerate(root);

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.inbound_links.links.map((link) => ({ carrier: link.carrier, reference: link.reference })), [
    { carrier: 'markdown.inline', reference: 'target.md' },
  ]);
});

test('enumerate follows parsed frontmatter paths and source locations', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'target.md'), '---\ntype: Note\n---\n# Target\n');
  fs.writeFileSync(path.join(root, 'source.md'), `---
type: Note
resource: target.md
metadata:
  resource: target.md
sources:
  - resource: target.md
executor:
  nested:
    resource: target.md
  resource: target.md
attester:
  resource: target.md
---
# Source
`);

  const response = enumerate(root);

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.inbound_links.links.map((link) => ({ carrier: link.carrier, reference: link.reference, byte_offset: link.source.byte_offset })), [
    { carrier: 'frontmatter.resource', reference: 'target.md', byte_offset: 25 },
    { carrier: 'frontmatter.sources[].resource', reference: 'target.md', byte_offset: 90 },
    { carrier: 'frontmatter.executor.resource', reference: 'target.md', byte_offset: 134 },
    { carrier: 'frontmatter.attester.resource', reference: 'target.md', byte_offset: 188 },
  ]);
});

test('enumerate reports incomplete discovery with no admitted bundle', (t) => {
  const root = bundle(t);

  const response = enumerate(root, {
    candidates: [{ path: path.join(root, 'missing'), bundle: '.', declared: true, named_by_user: true }],
  });

  assert.equal(response.result, 'unavailable');
  assert.equal(response.data.coverage, 'non-exhaustive');
  assert.deepEqual(response.data.inbound_links, {
    complete: false,
    incomplete_reasons: ['no_admitted_bundle'],
    links: [],
  });
  assert.ok(response.findings.some((finding) => finding.detail && finding.detail.reason === 'no_admitted_bundle'));
});

test('enumerate accepts balanced destinations and excludes images and escaped links', (t) => {
  const root = bundle(t);
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', '(old).md'), '---\ntype: Note\n---\n# Target\n');
  fs.writeFileSync(path.join(root, 'source.md'), `---
type: Note
---
[balanced](docs/(old).md)
![image](docs/(old).md)
\\[escaped](docs/(old).md)
`);

  const response = enumerate(root);

  assert.equal(response.result, 'ok');
  assert.deepEqual(response.data.inbound_links.links.map((link) => ({ carrier: link.carrier, reference: link.reference, verdict: link.verdict })), [
    { carrier: 'markdown.inline', reference: 'docs/(old).md', verdict: 'resolves' },
  ]);
});

test('enumerate warns for a broken target without changing files', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntype: Note\n---\n[missing](missing.md)\n');
  const before = snapshot(root);

  const response = enumerate(root);

  assert.equal(response.result, 'ok');
  assert.equal(response.data.inbound_links.links[0].verdict, 'unexpectedly-broken');
  assert.deepEqual(response.findings, [{
    code: 'UNRESOLVED_INTERNAL_LINK',
    origin: 'okf',
    severity: 'warning',
    blocks: false,
    detail: { path: 'source.md', resource: 'missing.md' },
  }]);
  assert.equal(snapshot(root), before);
});

test('enumerate diagnoses missing and inactive workspace aliases without suppressing broken links', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
    repositories: [{ name: 'app', path: '.', local: true }],
    bundles: [
      { alias: 'main', owner: 'app', root: '.', required: true, mode: 'source' },
      { alias: 'inactive', owner: 'app', root: 'absent', required: false, mode: 'source' },
    ],
  }));
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntype: Note\n---\n[missing](okf-workspace://missing/note)\n[inactive](okf-workspace://inactive/note)\n');

  const response = enumerate(root);

  assert.deepEqual(response.findings.filter((finding) => finding.code === 'diagnostic'), [{
    code: 'diagnostic', origin: 'suite', severity: 'warning', blocks: false,
    detail: { gate: 'read routing', reason: 'workspace_alias_inactive_or_missing' },
  }]);
  assert.deepEqual(response.findings.filter((finding) => finding.code === 'UNRESOLVED_INTERNAL_LINK').map((finding) => finding.detail.resource), [
    'okf-workspace://missing/note', 'okf-workspace://inactive/note',
  ]);
});

test('enumerate reports degraded when discovery is incomplete', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'source.md'), '---\ntype: Note\n---\n# Source\n');
  fs.symlinkSync('source.md', path.join(root, 'unreadable.md'));

  const response = enumerate(root);

  assert.equal(response.result, 'degraded');
  assert.equal(response.data.inbound_links.complete, false);
  assert.deepEqual(response.data.inbound_links.incomplete_reasons, ['enumeration_incomplete']);
  assert.equal(response.data.coverage, 'non-exhaustive');
});

test('enumerate only reports archive recommendations', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'old.md'), '---\ntype: Note\nstatus: deprecated\n---\n# Old\n');
  const before = snapshot(root);

  const response = enumerate(root);

  assert.deepEqual(response.data.archive_recommendations, []);
  assert.equal(snapshot(root), before);
});

test('unlisted identity changes and unsupported writer payloads do not write', (t) => {
  const root = bundle(t);
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\n---\n# Note\n');
  fs.writeFileSync(path.join(root, 'evidence.md'), '# Evidence\n');
  const before = snapshot(root);

  for (const operation of ['relocation', 'archive']) {
    const response = run(routerWrapper, root, 'okf', operation);
    assert.equal(response.result, 'blocked', operation);
    assert.equal(response.data.code, 'UNKNOWN_OPERATION', operation);
    assert.equal(snapshot(root), before, operation);
  }
  for (const payload of [
    { deprecate: true }, { move: 'archive/note.md' }, { rename: 'renamed.md' }, { rewrite: true },
    { effects: ['concept-revise', 'link-rewrite'] }, { effects: 'link-rewrite' },
    ...['deprecate', 'move', 'rename', 'rewrite'].map((key) => ({ set: { title: 'Changed', [key]: true } })),
    { set: { title: 'Changed', effects: ['link-rewrite'] } }, { set: { title: 'Changed', effects: 'link-rewrite' } },
  ]) {
    const response = run(writeWrapper, root, 'okf-write', 'revise', {
      task_kind: 'fix', concept: 'note.md', set: { title: 'Changed' }, evidence: ['evidence.md'], ...payload,
    });
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    assert.equal(snapshot(root), before);
  }
});
