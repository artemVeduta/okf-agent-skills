const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest, TEST_WORKSPACE_ID } = require('../test-support/snapshot');
const { countWords } = require('../scripts/lib/words');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');

// Same fixture shape as #144/#145's own migration-plan tests: `migration-plan`
// needs an active bundle (it checks a candidate target path for a collision),
// so it is not bypass-gated -- a plain `.git` directory plus a manifest is
// enough, no bundle-root directory has to actually exist for these fixtures
// (the default bundle name resolves to `<root>/okf`, disjoint from wherever
// `write()` below puts a source).
function repo(t) {
  const root = temporaryRoot(t, 'okf-201-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  return root;
}

// #200's settings grammar (`schema_version`, `workspace_id`, `repositories`,
// `bundles`, `settings`), hand-written the same way `test/issue-197-manifest-
// grammar.test.js` does -- the shared `writeManifest` helper writes a fixed
// manifest with no `settings` key, so a settings-override fixture needs its
// own writer.
function writeManifestWithSettings(root, settings) {
  fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
    schema_version: 1,
    workspace_id: TEST_WORKSPACE_ID,
    repositories: [{ name: 'repo', path: '.', local: true }],
    bundles: [{ alias: 'repo', owner: 'repo', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }],
    settings,
  }));
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function discoverRequest(root) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root } };
}

function planRequest(root, sources, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'migration-plan', payload: { cwd: root, sources, ...payload } };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function discoverSources(root) {
  return run(discoverRequest(root)).data.sources;
}

function reviewFor(response, sourcePath) {
  return response.data.split_review.find((item) => item.path === sourcePath);
}

// An explicit `type` keeps every fixture's disposition deterministically
// `migrate` with no open question, whatever its size -- split review is
// entirely orthogonal to #145's type inference.
function markdownSource(bodyWordCount) {
  const body = Array.from({ length: bodyWordCount }, (_, i) => `word${i}`).join(' ');
  return `---\ntype: Note\n---\n# Heading\n\n${body}\n`;
}

// ------------------------------------------------------------ above the target

test('a source above the effective target must receive split review, reason above_target', (t) => {
  const root = repo(t);
  const content = markdownSource(1200);
  write(root, 'docs/big.md', content);
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(response.data.settings, { max_words_per_file: 1000 });
  const review = reviewFor(response, 'docs/big.md');
  assert.equal(review.word_count, countWords(content));
  assert.ok(review.word_count > 1000, review.word_count);
  assert.equal(review.review_required, true);
  assert.equal(review.review_reason, 'above_target');
});

// ------------------------------------------------------------ at/below, no trigger

test('a source at or below the target, with no boundaries found and no user request, gets no review', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  const review = reviewFor(response, 'docs/small.md');
  assert.ok(review.word_count <= 1000, review.word_count);
  assert.equal(review.review_required, false);
  assert.equal(review.review_reason, null);
});

// -------------------------------------------------------- at/below, user request

test('a source at or below the target with an explicit user request gets a permitted (not required) review, reason user_requested', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources, { split_requested: ['docs/small.md'] }));

  const review = reviewFor(response, 'docs/small.md');
  assert.equal(review.review_required, false);
  assert.equal(review.review_reason, 'user_requested');
});

test('split_requested naming a source that stays at or below the target never upgrades review_required to true', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  write(root, 'docs/other.md', markdownSource(10));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources, { split_requested: ['docs/small.md'] }));

  assert.equal(reviewFor(response, 'docs/other.md').review_reason, null);
});

test('setup-derived semantic boundaries open review without becoming a user request', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources, { semantic_boundary_sources: ['docs/small.md'] }));

  const review = reviewFor(response, 'docs/small.md');
  assert.equal(review.review_required, false);
  assert.equal(review.review_reason, 'semantic_boundaries');
});

test('above-target and user-request reasons take precedence over derived semantic boundaries', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  write(root, 'docs/big.md', markdownSource(1200));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources, {
    split_requested: ['docs/small.md'],
    semantic_boundary_sources: ['docs/small.md', 'docs/big.md'],
  }));

  assert.equal(reviewFor(response, 'docs/small.md').review_reason, 'user_requested');
  assert.equal(reviewFor(response, 'docs/big.md').review_reason, 'above_target');
});

test('semantic boundary sources require unique selected migrate paths', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  const sources = discoverSources(root);
  for (const semantic_boundary_sources of [
    'docs/small.md',
    [''],
    ['docs/small.md', 'docs/small.md'],
    ['docs/missing.md'],
  ]) {
    const response = run(planRequest(root, sources, { semantic_boundary_sources }));
    assert.equal(response.result, 'blocked', JSON.stringify(semantic_boundary_sources));
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  }
});

// ----------------------------------------------------- invalid settings override

test('an invalid max_words_per_file override leaves the built-in default (1000) effective, and the trigger uses it', (t) => {
  const root = repo(t);
  writeManifestWithSettings(root, { max_words_per_file: -5 });
  const content = markdownSource(1200);
  write(root, 'docs/big.md', content);
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.deepEqual(response.data.settings, { max_words_per_file: 1000 });
  const review = reviewFor(response, 'docs/big.md');
  assert.equal(review.word_count, countWords(content));
  assert.equal(review.review_required, true);
  assert.equal(review.review_reason, 'above_target');
});

// ------------------------------------------------------------- exceeding never blocks

test('a source above the target still migrates, executable stays true, and nothing about the plan itself is blocked', (t) => {
  const root = repo(t);
  write(root, 'docs/big.md', markdownSource(1200));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources));

  assert.equal(response.result, 'ok');
  assert.equal(response.data.plan.executable, true);
  const entry = response.data.plan.entries.find((item) => item.path === 'docs/big.md');
  assert.equal(entry.disposition, 'migrate');
});

// ------------------------------------------------------- payload validation

test('a non-array split_requested is UNSUPPORTED_INPUT before anything is computed', (t) => {
  const root = repo(t);
  write(root, 'docs/small.md', markdownSource(10));
  const sources = discoverSources(root);
  const response = run(planRequest(root, sources, { split_requested: 'docs/small.md' }));

  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
});
