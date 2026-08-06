const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertEnvelope, treeHash } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-read.js');
const fallbackPhrase = 'v0.1 consumed using v0.2 fallback';

function rootFor(t, prefix = 'okf-49-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  return root;
}

function write(root, name, content) {
  fs.writeFileSync(path.join(root, name), content);
}

function request(root, bundle = root) {
  const payload = { cwd: root, today: '2026-08-04' };
  if (bundle === null) payload.candidates = [];
  else payload.bundle = bundle;
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-read',
    operation: 'validate',
    payload,
  };
}

function run(root, bundle = root) {
  const processResult = cp.spawnSync(process.execPath, [wrapper], {
    input: JSON.stringify(request(root, bundle)),
    encoding: 'utf8',
  });
  const response = processResult.stdout ? JSON.parse(processResult.stdout) : undefined;
  return {
    status: processResult.status,
    stdout: processResult.stdout || '',
    stderr: processResult.stderr || '',
    response,
  };
}

function assertFindingShape(finding) {
  assert.equal(typeof finding.code, 'string');
  assert.ok(finding.code.length > 0);
  assert.ok(['okf', 'suite'].includes(finding.origin));
  assert.ok(['error', 'warning'].includes(finding.severity));
  assert.equal(typeof finding.blocks, 'boolean');
}

function assertFindings(response) {
  for (const finding of response.findings) assertFindingShape(finding);
  for (const concept of response.data.concepts || []) {
    assert.ok(Array.isArray(concept.findings));
    for (const finding of concept.findings) assertFindingShape(finding);
  }
}

function assertReport(result, conformant, fallback = false) {
  const rawReport = result.response.data.report;
  assert.ok(Array.isArray(rawReport));
  const report = rawReport.join('\n');
  const value = conformant ? 'yes' : 'no';
  assert.match(report, new RegExp(`^OKF v0\\.2 bundle-conformant: ${value}$`, 'm'));
  assert.equal(report.includes(fallbackPhrase), fallback);
  const withoutConformanceLine = result.stdout.replace(/OKF v0\.2 bundle-conformant: (?:yes|no)/g, '');
  // No conformance or compliance claim can appear outside the one approved line.
  assert.doesNotMatch(withoutConformanceLine, /\b(?:conformant|compliant|succeeded)\b/i);
}

function validateUnchanged(root, bundle = root) {
  const before = treeHash(root);
  const result = run(root, bundle);
  assert.equal(treeHash(root), before);
  assertEnvelope(result);
  assertFindings(result.response);
  return result;
}

function concept(result, relative) {
  return result.response.data.concepts.find((item) => item.path === relative);
}

function pathFinding(result, relative) {
  return result.response.findings.find((item) => item.detail && item.detail.path === relative);
}

test('validate reports readable bytes, sorted concepts, findings, warnings, and no repairs', (t) => {
  const root = rootFor(t);
  const files = {
    'a-malformed.md': '---\ntype: Note\n: malformed\n---\n# Broken\n',
    'b-safe.md': '---\ntype: Note\nunknown_field: retained\n---\n# Safe\n',
    'c-unknown-type.md': '---\ntype: Vendor Future Type\n---\n# Unknown type\n',
    'd-broken-link.md': '---\ntype: Note\nsources:\n  - resource: absent-source.md\n---\n# Broken link\n',
    'e-stale.md': '---\ntype: Note\nstale_after: "2026-08-04"\n---\n# Stale\n',
    'f-missing-type.md': '---\ntitle: Missing type\n---\n# Missing type\n',
  };
  for (const [name, content] of Object.entries(files)) write(root, name, content);

  const result = validateUnchanged(root);
  assert.equal(result.response.result, 'ok');
  assertReport(result, false);

  const concepts = result.response.data.concepts;
  const paths = concepts.map((item) => item.path);
  assert.deepEqual(paths, paths.slice().sort());
  for (const [relative, bytes] of Object.entries(files)) {
    assert.equal(concept(result, relative).bytes, bytes);
  }

  assert.equal(Object.hasOwn(concept(result, 'a-malformed.md'), 'status'), false);
  assert.deepEqual(pathFinding(result, 'a-malformed.md'), {
    code: 'FRONTMATTER_UNPARSEABLE',
    origin: 'okf',
    severity: 'error',
    blocks: true,
    detail: { path: 'a-malformed.md', line: 3, reason: 'empty key' },
  });
  assert.equal(pathFinding(result, 'b-safe.md'), undefined);
  assert.equal(pathFinding(result, 'c-unknown-type.md'), undefined);

  const brokenLink = pathFinding(result, 'd-broken-link.md');
  assert.deepEqual(brokenLink, {
    code: 'UNRESOLVED_INTERNAL_LINK',
    origin: 'okf',
    severity: 'warning',
    blocks: false,
    detail: { path: 'd-broken-link.md', resource: 'absent-source.md' },
  });

  const stale = pathFinding(result, 'e-stale.md');
  assert.deepEqual(stale, {
    code: 'STALE_AFTER_REACHED',
    origin: 'okf',
    severity: 'warning',
    blocks: false,
    detail: { path: 'e-stale.md', stale_after: '2026-08-04', today: '2026-08-04' },
  });

  const missingType = pathFinding(result, 'f-missing-type.md');
  assert.deepEqual(missingType, {
    code: 'TYPE_MISSING',
    origin: 'okf',
    severity: 'error',
    blocks: true,
    detail: { path: 'f-missing-type.md' },
  });
});

test('validate tolerates absent, legacy, future, and unknown roots and a missing index', (t) => {
  const cases = [
    ['absent', '---\nname: Undeclared\n---\n# Bundle\n'],
    ['legacy', '---\nokf_version: "0.1"\n---\n# Bundle\n'],
    ['future', '---\nokf_version: "9.9"\n---\n# Bundle\n'],
    ['unknown', '---\nokf_version: "unknown"\n---\n# Bundle\n'],
    ['numeric', '---\nokf_version: 0.2\n---\n# Bundle\n'],
  ];

  for (const [name, index] of cases) {
    const root = rootFor(t, `okf-49-root-${name}-`);
    const safe = '---\ntype: Note\n---\n# Safe\n';
    write(root, 'safe.md', safe);
    write(root, 'index.md', index);
    const result = validateUnchanged(root);
    assert.equal(result.response.result, 'ok', name);
    assert.equal(concept(result, 'safe.md').bytes, safe, name);
    assertReport(result, true, false);
  }

  const root = rootFor(t, 'okf-49-root-missing-index-');
  const safe = '---\ntype: Note\n---\n# Safe\n';
  write(root, 'safe.md', safe);
  fs.unlinkSync(path.join(root, 'index.md'));
  const result = validateUnchanged(root);
  assert.equal(result.response.result, 'ok');
  assert.equal(concept(result, 'safe.md').bytes, safe);
  assert.equal(result.response.findings.some((item) => item.detail && item.detail.file === 'index.md'), false);
  assertReport(result, true, false);
});

test('validate reports both v0.1 fallbacks without making a conformance claim', (t) => {
  const root = rootFor(t, 'okf-49-fallback-');
  write(root, 'index.md', '---\nokf_version: "0.1"\n---\n# Legacy bundle\n');
  write(root, 'timestamp.md', '---\ntype: Note\ntimestamp: "2026-08-01"\n---\n# Timestamp\n');
  write(root, 'citations.md', '---\ntype: Note\n---\n# Legacy citations\n\n# Citations\n\n- old source\n');

  const result = validateUnchanged(root);
  assert.equal(result.response.result, 'ok');
  assertReport(result, false, true);
  assert.ok(result.response.data.concepts.find((item) => item.path === 'timestamp.md'));
  assert.ok(result.response.data.concepts.find((item) => item.path === 'citations.md'));
});

test('validate omits the fallback report text when no legacy fallback is used', (t) => {
  const root = rootFor(t, 'okf-49-no-fallback-');
  write(root, 'current.md', '---\ntype: Note\ngenerated: []\nsources: []\n---\n# Current\n');
  write(root, 'heading-only.md', '---\ntype: Note\n---\n# Citations\n\nCitation prose without a list.\n');

  const result = validateUnchanged(root);
  assert.equal(result.response.result, 'ok');
  assertReport(result, true, false);
});

test('validate allows frontmatter-less reserved files during a read', (t) => {
  for (const name of ['index.md', 'log.md']) {
    const root = rootFor(t, `okf-49-no-frontmatter-${name.slice(0, -3)}-`);
    write(root, 'safe.md', '---\ntype: Note\n---\n# Safe\n');
    write(root, name, `# ${name.slice(0, -3)}\n`);

    const result = validateUnchanged(root);
    assert.equal(result.response.result, 'ok', name);
    assert.equal(concept(result, 'safe.md').bytes, '---\ntype: Note\n---\n# Safe\n');
    assert.equal(result.response.findings.some((item) => item.code === 'BUNDLE_FILES_NONCONFORMING'), false);
    assertReport(result, true, false);
  }
});

test('validate reads an admitted symlinked bundle root', (t) => {
  const root = rootFor(t, 'okf-49-symlinked-bundle-');
  const target = path.join(root, 'real-bundle');
  const link = path.join(root, 'linked-bundle');
  fs.mkdirSync(target);
  write(target, 'index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const bytes = '---\ntype: Note\n---\n# Through the link\n';
  write(target, 'visible.md', bytes);
  fs.symlinkSync(target, link, 'dir');

  const result = validateUnchanged(root, link);
  assert.equal(result.response.result, 'ok');
  assert.equal(concept(result, 'visible.md').bytes, bytes);
  assertReport(result, true, false);
});

test('validate normalizes fragments and queries in source resources', (t) => {
  const root = rootFor(t, 'okf-49-source-fragments-');
  write(root, 'source.md', '---\ntype: Note\n---\n# Source\n');
  write(root, 'linked.md', '---\ntype: Note\nsources:\n  - resource: "source.md?revision=7#claim"\n---\n# Linked\n');
  const original = 'missing.md?revision=8#claim';
  write(root, 'missing-link.md', `---\ntype: Note\nsources:\n  - resource: "${original}"\n---\n# Missing\n`);

  const result = validateUnchanged(root);
  assert.equal(result.response.result, 'ok');
  assert.equal(pathFinding(result, 'linked.md'), undefined);
  assert.deepEqual(pathFinding(result, 'missing-link.md').detail, {
    path: 'missing-link.md',
    resource: original,
  });
  assertReport(result, true, false);
});

test('validate does not expose bundle_root for an unnamed manifest candidate', (t) => {
  const root = rootFor(t, 'okf-49-unnamed-manifest-');
  const bundle = path.join(root, 'docs');
  fs.mkdirSync(bundle);
  write(bundle, 'index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  const bytes = '---\ntype: Note\n---\n# Manifest concept\n';
  write(bundle, 'concept.md', bytes);
  write(root, '.okf-workspace.json', JSON.stringify({
    schema_version: 1,
    workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
    repositories: [{ name: 'app', path: '.', local: true }],
    bundles: [{ alias: 'docs', owner: 'app', root: 'docs', required: false, mode: 'source' }],
  }));

  const result = validateUnchanged(root, null);
  assert.equal(result.response.result, 'ok');
  assert.equal(Object.hasOwn(result.response.data, 'bundle_root'), false);
  assert.equal(Object.hasOwn(result.response.data.candidates[0], 'bundle_root'), false);
  assert.equal(concept(result, 'concept.md').bytes, bytes);
});

test('validate reports malformed log and index bytes without refusing safe concepts', (t) => {
  for (const file of ['log.md', 'index.md']) {
    const root = rootFor(t, `okf-49-malformed-${file.slice(0, -3)}-`);
    const safe = '---\ntype: Note\n---\n# Safe\n';
    write(root, 'safe.md', safe);
    write(root, file, '---\nokf_version: "0.2"\n: malformed\n---\n# Broken\n');

    const result = validateUnchanged(root);
    assert.equal(result.response.result, 'ok', file);
    assert.equal(concept(result, 'safe.md').bytes, safe);
    assert.deepEqual(result.response.findings.find((item) => item.code === 'BUNDLE_FILES_NONCONFORMING'), {
      code: 'BUNDLE_FILES_NONCONFORMING',
      origin: 'okf',
      severity: 'error',
      blocks: true,
      detail: { file, line: 3, reason: 'empty key' },
    });
    assertReport(result, false, false);
  }
});
