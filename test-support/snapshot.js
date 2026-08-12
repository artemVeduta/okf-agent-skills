/* Shared fixture, process, and snapshot helpers live outside test/ so the
 * test runner does not discover this module as a test file. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
// #180: a fixture's group index body and staged body digest are derived through the
// runtime's own renderer and parser, never a second copy of either (see
// `acceptedMigration` below). Neither module has a load-time effect.
const { parseFrontmatter } = require('../scripts/lib/validation');
const { renderIndex } = require('../scripts/lib/proposal');

const repo = path.resolve(__dirname, '..');
const RESPONSE_KEYS = ['protocol', 'skill', 'operation', 'result', 'scope', 'evidence_limits', 'data', 'findings', 'next_action'];
const REQUIRED_BRIEF_FIELDS = [
  'role', 'task_kind', 'operation_class', 'cwd', 'bundle', 'paths',
  'allowed_effects', 'forbidden_effects', 'evidence', 'required_checks',
  'settings', 'expected_result',
];

function snapshot(root) {
  const entries = [];
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      const file = path.join(directory, entry.name);
      entries.push([name, entry.isDirectory() ? 'directory' : 'file', entry.isFile() ? fs.readFileSync(file, 'utf8') : '']);
      if (entry.isDirectory()) visit(file, name);
    }
  }
  visit(root);
  return entries;
}

// #174: one write-evidence observation binding, `{ path, sha256 }`, built from the
// file's current bytes. `relative` is relative to the active Git worktree, the same
// way the runtime resolves it.
function binding(worktree, relative) {
  const bytes = fs.readFileSync(path.resolve(worktree, relative));
  return { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function treeHash(root) {
  const hash = crypto.createHash('sha256');
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      const name = path.join(relative, entry.name);
      hash.update(`${name}\0`);
      if (entry.isSymbolicLink()) {
        hash.update('link\0');
        hash.update(fs.readlinkSync(file));
      } else if (entry.isDirectory()) {
        hash.update('directory\0');
        visit(file, name);
      } else if (entry.isFile()) {
        hash.update('file\0');
        hash.update(fs.readFileSync(file));
      } else {
        hash.update('other\0');
      }
    }
  }
  visit(root);
  return hash.digest('hex');
}

function temporaryRoot(t, prefix = 'okf-test-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function repository(t, prefix = 'okf-test-repo-') {
  const root = temporaryRoot(t, prefix);
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function bundle(root, relative = '.', index = '---\nokf_version: "0.2"\n---\n# Bundle\n') {
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'index.md'), index);
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  return target;
}

function spawnWrapper(wrapper, value, options = {}) {
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
    ...options,
  });
  return { ...result, response: result.stdout ? JSON.parse(result.stdout) : undefined };
}

function assertEnvelope(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const response = result.response || JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(response), RESPONSE_KEYS);
  assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
  return response;
}

function runWrapper(wrapper, value, options) {
  return assertEnvelope(spawnWrapper(wrapper, value, options));
}

function runSilent(wrapper, value, options) {
  const result = childProcess.spawnSync(process.execPath, [wrapper], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
    ...options,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '');
}

/*
 * #180: every semantic verdict the conformance gate demands of a caller, each one
 * bound to the artifact it was formed against -- the staged body's digest, the
 * accepted content scope, and the migrating source's current bytes. A fixture never
 * types a digest: a verdict here is `pass` and current by construction, so a test
 * asserting something else fails on the thing it is about rather than on a binding
 * that quietly went stale. `proposal` is the accepted proposal (`propose`'s own
 * `data.proposal`, or `acceptedMigration`'s below), `staged` the staged refs.
 */
function passingReview(root, proposal, staged) {
  const files = new Map(staged.map((item) => [item.concept, item.file]));
  const observed = new Map(proposal.sources
    .filter((item) => item.disposition === 'migrate')
    .map((item) => [item.path, binding(root, item.path)]));
  return {
    outputs: proposal.outputs.filter((output) => output.origin === 'migration').map((output) => ({
      concept: output.concept,
      verdict: 'pass',
      body_sha256: crypto.createHash('sha256')
        .update(Buffer.from(parseFrontmatter(fs.readFileSync(path.join(root, files.get(output.concept)), 'utf8')).body, 'utf8'))
        .digest('hex'),
      content_scope: output.content_scope,
      sources: [observed.get(output.source)],
    })),
    sources: [...observed].map(([item, bound]) => ({ source: item, verdict: 'pass', sha256: bound.sha256 })),
  };
}

/*
 * #180: the accepted-migration payload `migration-validate` and `publish` are now
 * both refused without -- the accepted proposal (`{sources, outputs, groups}`), the
 * navigation it bound, the staged set under test, and the caller's semantic review.
 *
 * A fixture states only what it accepted and what it staged. Every digest here is
 * recomputed from the file the fixture actually wrote, never typed out, so a test
 * that changes a fixture's bytes cannot leave a stale binding behind and silently
 * start asserting a conformance failure instead of the thing it is about. Group
 * index bodies come from `propose`'s own `renderIndex`, never a second renderer,
 * for the same reason the gate itself re-derives them through it.
 *
 * `rows` are `{source, concept, type, content_scope?, provenance?, links?}`, one per
 * accepted migration output. `options.skipped` carries `{path, reason}` rows for
 * sources deliberately not migrated, `options.purposes` the accepted reader purpose
 * per group, and `options.navigation` extra navigation rows the proposal bound
 * beyond the group indexes.
 */
function acceptedMigration(root, rows, options = {}) {
  const bundleName = options.bundle || 'okf';
  const purposes = options.purposes || {};

  const outputs = rows.map((row, index) => {
    const cut = row.concept.lastIndexOf('/');
    return {
      id: `o${index + 1}`,
      origin: 'migration',
      source: row.source,
      concept: row.concept,
      type: row.type,
      group: cut < 0 ? '' : row.concept.slice(0, cut),
      name: row.concept.slice(cut + 1),
      target_path: `${row.concept}.md`,
      content_scope: row.content_scope || 'whole_document',
      source_anchors: [],
      provenance: row.provenance === undefined ? null : row.provenance,
      provenance_assignment: row.provenance === undefined ? 'none' : 'inherited',
      evidence: [],
      links: row.links || [],
    };
  });

  const sources = [
    ...[...new Set(rows.map((row) => row.source))].map((item) => ({
      path: item,
      disposition: 'migrate',
      reason: 'type_preserved',
      outputs: outputs.filter((output) => output.source === item).map((output) => output.id),
    })),
    ...(options.skipped || []).map((item) => ({
      path: item.path, disposition: 'skip', reason: item.reason, outputs: [],
    })),
  ];

  const groups = [...new Set(outputs.map((output) => output.group).filter((group) => group !== ''))]
    .sort()
    .map((group) => ({
      group,
      purpose: purposes[group] === undefined ? `Everything about ${group}.` : purposes[group],
      children: outputs
        .filter((output) => output.group === group)
        .map((output) => ({ label: output.name, href: `${output.name}.md`, kind: 'concept' }))
        .sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0)),
      index_path: `${group}/index.md`,
    }));

  const staged = outputs.map((output) => ({
    path: output.source,
    concept: output.concept,
    type: output.type,
    shard: 'x',
    file: path.join('.okf-staging', bundleName, `${output.concept}.md`),
    sources: [binding(root, output.source)],
  }));

  return {
    proposal: { sources, outputs, groups },
    review: passingReview(root, { sources, outputs }, staged),
    navigation: [
      ...groups.map((group) => ({
        path: group.index_path,
        body: renderIndex(group.group, group.purpose, group.children),
      })),
      ...(options.navigation || []),
    ],
    staged,
  };
}

// The payload shape the conformance gate refuses nothing on and finds nothing in:
// no accepted output, nothing staged, no navigation, no verdict owed.
const NO_MIGRATION = { proposal: { sources: [], outputs: [], groups: [] }, navigation: [], staged: [], review: { outputs: [], sources: [] } };

const manifests = {
  'claude-code': path.join(repo, 'manifest.json'),
  codex: path.join(repo, 'packages', 'codex', 'manifest.json'),
  opencode: path.join(repo, 'packages', 'opencode', 'manifest.json'),
};

function adapterManifest(harness) {
  return JSON.parse(fs.readFileSync(manifests[harness], 'utf8'));
}

module.exports = {
  NO_MIGRATION,
  REQUIRED_BRIEF_FIELDS,
  RESPONSE_KEYS,
  acceptedMigration,
  adapterManifest,
  assertEnvelope,
  binding,
  bundle,
  passingReview,
  repository,
  runSilent,
  runWrapper,
  snapshot,
  spawnWrapper,
  temporaryRoot,
  treeHash,
};
