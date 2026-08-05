const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const readWrapper = path.join(repo, 'scripts', 'okf-read.js');
const writeWrapper = path.join(repo, 'scripts', 'okf-write.js');

function temporaryRoot(prefix = 'okf-47-') { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); }
function activate(root) { fs.writeFileSync(path.join(root, '.okf-active'), ''); }
function repository(prefix = 'okf-47-repo-') {
  const root = temporaryRoot(prefix);
  fs.mkdirSync(path.join(root, '.git'));
  activate(root);
  return root;
}
function bundle(root, relative = '.') {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
  activate(root);
  return dir;
}
function concept(dir, name, body = '# Concept\n') { fs.writeFileSync(path.join(dir, `${name}.md`), body); }
function runWrapper(wrapper, value, cwd) {
  const run = cp.spawnSync(process.execPath, [wrapper], { input: JSON.stringify(value), encoding: 'utf8', cwd });
  return { ...run, response: run.stdout ? JSON.parse(run.stdout) : null };
}
function request(skill, operation, payload) { return { protocol: 'okf-wrapper/1', skill, operation, payload }; }
function manifest(repositories, bundles, extra = {}) {
  return { schema_version: 1, workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b', repositories, bundles, ...extra };
}
function localRepo(root, name = 'app') { return { name, path: '.', local: true }; }
function writeManifest(root, value) { fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify(value)); }
function readRequest(root, target = 'note') {
  return request('okf-read', 'resolve', { cwd: root, candidates: [], target });
}

test('invalid manifests reject federation but retain the current repository candidate', () => {
  const cases = [
    ['unknown_key', { extra: true }],
    ['duplicate_repository_name', { repositories: [localRepo('.'), localRepo('.')] }],
    ['duplicate_bundle_alias', { bundles: [{ alias: 'a', owner: 'app', root: '.', required: true, mode: 'source' }, { alias: 'a', owner: 'app', root: 'x', required: false, mode: 'source' }] }],
    ['malformed_identity', { repositories: [{ name: 'app', path: '.', local: true, remote: 'x' }] }],
    ['unsupported_schema_version', { schema_version: 2 }],
    ['absolute_path', { repositories: [{ name: 'app', path: '/tmp', local: true }] }],
    ['parent_segment', { repositories: [{ name: 'app', path: '..', local: true }] }],
    ['invalid_field_combination', { bundles: [{ alias: 'a', owner: 'missing', root: '.', required: true, mode: 'source' }] }],
  ];
  for (const [reason, change] of cases) {
    const root = repository(); bundle(root); fs.writeFileSync(path.join(root, '.git', 'okf-instance'), '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b');
    const value = manifest([localRepo(root)], [{ alias: 'local', owner: 'app', root: '.', required: true, mode: 'source' }], change);
    writeManifest(root, value);
    const result = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: root, candidates: [{ path: '.', declared: true, requires_repository: true }] }), root);
    assert.equal(result.response.data.federation, 'rejected', reason);
    assert.equal(result.response.data.federation_finding.detail.reason, reason, reason);
    if (reason === 'unknown_key' || reason === 'duplicate_repository_name') {
      concept(root, 'local');
      const resolved = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [{ path: '.', declared: true, requires_repository: true }], target: 'local' }), root);
      assert.equal(resolved.response.result, 'ok', reason);
      assert.equal(resolved.response.data.selected.bundle_alias, '.', reason);
      assert.equal(resolved.response.findings[0].origin, 'suite', reason);
      assert.equal(resolved.response.findings[0].detail.gate, 'data validity', reason);
    }
    assert.equal(result.response.data.candidates[0].failed_gate, null, reason);
  }
});

test('manifest discovery selects the nearest manifest and does not merge', () => {
  const root = repository(); const child = path.join(root, 'child'); fs.mkdirSync(child); fs.mkdirSync(path.join(child, '.git'));
  bundle(root); bundle(child); concept(root, 'root-only'); concept(child, 'child-only');
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'root', owner: 'app', root: '.', required: true, mode: 'source' }]));
  writeManifest(child, manifest([localRepo(child)], [{ alias: 'child', owner: 'app', root: '.', required: true, mode: 'source' }]));
  const result = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: child, candidates: [] }), root);
  assert.equal(result.response.data.manifest.bundles[0].alias, 'child');
  assert.equal(result.response.data.candidates.some((x) => x.bundle_alias === 'root'), false);
  assert.equal(result.response.data.candidates.some((x) => x.bundle_alias === 'child'), true);
});

test('manifest discovery stops at the git root', () => {
  const parent = temporaryRoot(); const root = path.join(parent, 'repo'); fs.mkdirSync(root); fs.mkdirSync(path.join(root, '.git'));
  bundle(root); writeManifest(parent, manifest([localRepo(parent)], [{ alias: 'above', owner: 'app', root: '.', required: true, mode: 'source' }]));
  const result = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: root, candidates: [] }), root);
  assert.equal(result.response.data.manifest, undefined);
  assert.notEqual(result.response.data.federation, 'accepted');
});

test('an explicitly supplied manifest wins over discovery and does not merge manifests', () => {
  const root = repository(); const child = path.join(root, 'child'); fs.mkdirSync(path.join(child, '.git'), { recursive: true }); bundle(root); bundle(child);
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'root', owner: 'app', root: '.', required: true, mode: 'source' }]));
  const explicit = path.join(child, '.okf-workspace.json');
  fs.writeFileSync(explicit, JSON.stringify(manifest([localRepo(child)], [{ alias: 'child', owner: 'app', root: '.', required: true, mode: 'source' }])));
  fs.writeFileSync(path.join(child, '.git', 'okf-instance'), '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b');
  const result = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: child, manifest_path: explicit, candidates: [] }), root);
  assert.equal(result.response.data.manifest.bundles[0].alias, 'child');
  assert.equal(result.response.data.manifest.bundles.some((x) => x.alias === 'root'), false);
});

test('untrusted federated repositories fail TRUST and do not become INVALID', () => {
  const root = repository(); const peer = path.join(root, 'peer'); fs.mkdirSync(path.join(peer, '.git'), { recursive: true }); bundle(root); bundle(peer);
  writeManifest(root, manifest([{ name: 'app', path: '.', local: true }, { name: 'peer', path: 'peer', local: true }], [
    { alias: 'peer', owner: 'peer', root: '.', required: false, mode: 'source' },
  ]));
  const result = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: root, candidates: [] }), root);
  const candidate = result.response.data.candidates[0];
  assert.equal(candidate.failed_gate, 'TRUST');
  assert.equal(candidate.findings.find((x) => x.code === 'UNTRUSTED').code, 'UNTRUSTED');
  assert.equal(candidate.findings.some((x) => x.code === 'INVALID'), false);
});

test('workspace links and plain links stay inside their admitted bundle', () => {
  const root = repository(); const a = bundle(root, 'a'); const b = bundle(root, 'b');
  concept(a, 'same'); concept(b, 'same'); concept(b, 'sibling');
  fs.writeFileSync(path.join(root, '.git', 'okf-instance'), '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b');
  writeManifest(root, manifest([{ name: 'app', path: '.', local: true }], [
    { alias: 'a', owner: 'app', root: 'a', required: true, mode: 'source' },
    { alias: 'b', owner: 'app', root: 'b', required: true, mode: 'source' },
  ]));
  const qualified = runWrapper(readWrapper, readRequest(root, 'okf-workspace://missing/same'), root);
  assert.equal(qualified.response.findings.some((x) => x.code === 'missing'), true);
  const refusal = qualified.response.findings.find((x) => x.code === 'missing');
  assert.equal(refusal.detail.reason, 'workspace_alias');
  assert.equal(refusal.origin, 'suite');
  const plain = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'sibling', link_from_bundle: 'a' }), root);
  assert.equal(plain.response.findings.some((x) => x.code === 'missing'), true);
  const positive = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'same', link_from_bundle: 'a' }), root);
  assert.equal(positive.response.result, 'ok');
  assert.equal(positive.response.data.selected.bundle_alias, 'a');
  // The positive control for the workspace form. Without it every assertion above
  // still passes while alias parsing is broken for every alias.
  const resolved = runWrapper(readWrapper, readRequest(root, 'okf-workspace://b/same'), root);
  assert.equal(resolved.response.result, 'ok');
  assert.equal(resolved.response.data.selected.bundle_alias, 'b');
  assert.equal(resolved.response.data.selected.concept_id, 'same');
});

test('declared inactive workspace aliases remain broken without substitution', () => {
  const root = repository(); bundle(root, 'live');
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'missing', owner: 'app', root: 'absent', required: false, mode: 'source' }]));
  const result = runWrapper(readWrapper, readRequest(root, 'okf-workspace://missing/note'), root);
  assert.equal(result.response.data.selected, null);
  assert.equal(result.response.findings.find((x) => x.code === 'missing').detail.reason, 'workspace_alias');
  assert.equal(result.response.findings.find((x) => x.code === 'diagnostic').detail.reason, 'workspace_alias_inactive_or_missing');
});

test('unqualified reads use precedence and disclose every lower match', () => {
  const root = repository(); const near = bundle(root, 'near'); const ancestor = bundle(root); const peer = path.join(root, 'peer'); fs.mkdirSync(path.join(peer, '.git'), { recursive: true }); const peerA = bundle(peer, 'a'); const peerB = bundle(peer, 'b');
  for (const dir of [near, ancestor, peerA, peerB]) concept(dir, 'same');
  fs.writeFileSync(path.join(peer, '.git', 'okf-instance'), '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b');
  const repos = [{ name: 'app', path: '.', local: true }, { name: 'peer', path: path.relative(root, peer), local: true }];
  const records = [{ alias: 'near', owner: 'app', root: 'near', required: true, mode: 'source' }, { alias: 'ancestor', owner: 'app', root: '.', required: true, mode: 'source' }, { alias: 'peer-a', owner: 'peer', root: 'a', required: false, mode: 'source' }, { alias: 'peer-b', owner: 'peer', root: 'b', required: false, mode: 'source' }];
  writeManifest(root, manifest(repos, records));
  const cwd = path.join(near, 'work'); fs.mkdirSync(cwd);
  const nearest = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd, candidates: [], target: 'same' }), root);
  assert.equal(nearest.response.data.selected.bundle_alias, 'near');
  assert.deepEqual(nearest.response.data.lower_precedence.map((x) => x.bundle_alias), ['ancestor', 'peer-a', 'peer-b']);
  assert.equal(nearest.response.data.lower_precedence.length, 3);
  const explicit = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd, candidates: [], target: 'same', explicit_bundle: 'peer-b' }), root);
  assert.equal(explicit.response.data.selected.bundle_alias, 'peer-b');
  assert.deepEqual(explicit.response.data.lower_precedence.map((x) => x.bundle_alias), ['near', 'ancestor', 'peer-a']);
  writeManifest(root, manifest(repos, [records[0], records[1], records[3], records[2]]));
  const reordered = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd, candidates: [], target: 'same' }), root);
  assert.deepEqual(reordered.response.data.lower_precedence.map((x) => x.bundle_alias), ['ancestor', 'peer-b', 'peer-a']);
});

test('colliding concept IDs retain both advisory candidates', () => {
  const root = repository(); const a = bundle(root, 'a'); const b = bundle(root, 'b'); concept(a, 'same'); concept(b, 'same');
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'a', owner: 'app', root: 'a', required: true, mode: 'source' }, { alias: 'b', owner: 'app', root: 'b', required: true, mode: 'source' }]));
  const result = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'same' }), root);
  assert.equal(result.response.data.lower_precedence.length, 1);
  assert.equal(result.response.findings.some((x) => x.detail.reason === 'duplicate_concept_id'), true);
  assert.equal(result.response.data.selected.bundle_alias, 'a');
});

test('resource collisions require matching non-empty normalized values', () => {
  const root = repository(); const a = bundle(root, 'a'); const b = bundle(root, 'b');
  concept(a, 'same', '---\nresource: "urn:x"\n---\n# A\n'); concept(b, 'same', '---\nresource: urn:x\n---\n# B\n');
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'a', owner: 'app', root: 'a', required: true, mode: 'source' }, { alias: 'b', owner: 'app', root: 'b', required: true, mode: 'source' }]));
  let result = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'same' }), root);
  assert.equal(result.response.findings.some((x) => x.detail.reason === 'duplicate_resource'), true);
  concept(a, 'same', '# A\n'); concept(b, 'same', '---\nresource:\n---\n# B\n');
  result = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'same' }), root);
  assert.equal(result.response.findings.some((x) => x.detail.reason === 'duplicate_resource'), false);
});

test('byte-identical documents in independently owned bundles remain separate', () => {
  const root = repository(); const peer = path.join(root, 'peer'); fs.mkdirSync(path.join(peer, '.git'), { recursive: true }); const a = bundle(root, 'a'); const b = bundle(peer, 'b'); const body = '# Same\n'; concept(a, 'same', body); concept(b, 'same', body); fs.writeFileSync(path.join(peer, '.git', 'okf-instance'), '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b');
  writeManifest(root, manifest([{ name: 'app', path: '.', local: true }, { name: 'peer', path: path.relative(root, peer), local: true }], [{ alias: 'a', owner: 'app', root: 'a', required: true, mode: 'source' }, { alias: 'b', owner: 'peer', root: 'b', required: false, mode: 'source' }]));
  const result = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'same' }), root);
  assert.equal(result.response.data.lower_precedence.length, 1);
  assert.equal(result.response.findings.some((x) => x.detail.reason === 'identical_document'), true);
});

test('duplicate manifest routes to one canonical bundle identity', () => {
  const root = repository(); const real = bundle(root, 'real'); concept(real, 'same'); fs.symlinkSync(real, path.join(root, 'alias'));
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'real', owner: 'app', root: 'real', required: true, mode: 'source' }, { alias: 'alias', owner: 'app', root: 'alias', required: true, mode: 'source' }]));
  const result = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'same' }), root);
  assert.equal(result.response.data.lower_precedence.length, 0);
  assert.equal(result.response.findings.some((x) => x.detail.reason === 'duplicate_concept_id'), false);
});

test('required inactive members degrade health without blocking active reads', () => {
  const root = repository(); const live = bundle(root, 'live'); concept(live, 'note');
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'missing', owner: 'app', root: 'absent', required: true, mode: 'source' }, { alias: 'live', owner: 'app', root: 'live', required: false, mode: 'source' }]));
  const read = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'note' }), root);
  assert.equal(read.response.data.workspace_health, 'degraded');
  assert.equal(read.response.data.coverage, 'non-exhaustive');
  assert.equal(read.response.result, 'ok');
  assert.equal(read.response.data.selected.bundle_alias, 'live');
});

test('optional inactive members do not degrade workspace health', () => {
  const root = repository(); bundle(root, 'live');
  writeManifest(root, manifest([localRepo(root)], [{ alias: 'missing', owner: 'app', root: 'absent', required: false, mode: 'source' }, { alias: 'live', owner: 'app', root: 'live', required: false, mode: 'source' }]));
  const result = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: root, candidates: [] }), root);
  assert.equal(result.response.data.workspace_health, 'healthy');
  assert.equal(result.response.data.coverage, 'complete');
});

test('read scope widening retains the selected peer', () => {
  const root = repository(); bundle(root, 'docs'); const peer = path.join(root, 'peer'); fs.mkdirSync(path.join(peer, '.git'), { recursive: true }); const peerDocs = bundle(peer, 'peer-docs'); concept(peerDocs, 'remote');
  fs.writeFileSync(path.join(peer, '.git', 'okf-instance'), '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b');
  const base = manifest([{ name: 'app', path: '.', local: true }], [{ alias: 'docs', owner: 'app', root: 'docs', required: true, mode: 'source' }]); writeManifest(root, base);
  writeManifest(root, manifest([{ name: 'app', path: '.', local: true }, { name: 'peer', path: path.relative(root, peer), local: true }], [{ alias: 'docs', owner: 'app', root: 'docs', required: true, mode: 'source' }, { alias: 'peer-docs', owner: 'peer', root: 'peer-docs', required: false, mode: 'source' }]));
  const read = runWrapper(readWrapper, request('okf-read', 'resolve', { cwd: root, candidates: [], target: 'remote' }), root);
  assert.equal(read.response.result, 'ok');
  assert.equal(read.response.data.selected.bundle_alias, 'peer-docs');
});

test('trust and access findings are reported together, without harness access errors', (t) => {
  const root = repository(); const peer = path.join(root, 'peer'); fs.mkdirSync(path.join(peer, '.git'), { recursive: true }); const peerBundle = bundle(peer, 'knowledge'); fs.writeFileSync(path.join(peer, '.git', 'okf-instance'), 'not-a-trust-id');
  writeManifest(root, manifest([{ name: 'peer', path: path.relative(root, peer), local: true }], [{ alias: 'peer', owner: 'peer', root: 'knowledge', required: false, mode: 'source' }]));
  if (process.getuid && process.getuid() === 0) { t.skip('root bypasses permission bits'); return; }
  try {
    fs.chmodSync(peerBundle, 0o000);
    const blocked = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: root, candidates: [] }), root);
    const findings = blocked.response.data.candidates[0].findings;
    const gates = findings.filter((x) => ['UNTRUSTED', 'ACCESS_DENIED'].includes(x.code));
    assert.deepEqual(gates.map((x) => x.code), ['UNTRUSTED', 'ACCESS_DENIED']);
    assert.equal(gates[0].detail.gate, 'TRUST'); assert.equal(gates[0].origin, 'suite');
    assert.equal(gates[1].detail.gate, 'ACCESS'); assert.equal(gates[1].origin, 'suite');
    assert.equal(blocked.stdout.includes('HARNESS_NO_ACCESS'), false);
  } finally { fs.chmodSync(peerBundle, 0o755); }
  const readable = runWrapper(readWrapper, request('okf-read', 'admit', { cwd: root, candidates: [] }), root);
  const findings = readable.response.data.candidates[0].findings;
  assert.equal(findings.some((x) => x.code === 'UNTRUSTED'), true);
  assert.equal(findings.some((x) => x.code === 'INVALID'), false);
});
