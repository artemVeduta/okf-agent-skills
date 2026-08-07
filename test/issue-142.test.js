const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');

// `discover` needs an active bundle (it excludes the bundle root from its own scan),
// so the fixture always writes `.okf-active` unless a test asks for an inactive one,
// the opposite default from #138's `inspect`/`repair` fixtures.
function repo(t, { active = true } = {}) {
  const root = temporaryRoot(t, 'okf-142-repo-');
  fs.mkdirSync(path.join(root, '.git'));
  if (active) fs.writeFileSync(path.join(root, '.okf-active'), '');
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function discoverRequest(root, payload = {}) {
  return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, ...payload } };
}

function run(value) {
  return runWrapper(wrapper, value);
}

function sourceFor(response, relativePath) {
  return response.data.sources.find((entry) => entry.path === relativePath);
}

// ------------------------------------------------------------------ markdown

test('classifies a plain UTF-8 Markdown file with no frontmatter', (t) => {
  const root = repo(t);
  write(root, 'notes.md', '# Notes\n\nJust prose, and a [standard link](https://example.test/).\n');
  const response = run(discoverRequest(root));
  assert.equal(response.result, 'ok');
  assert.deepEqual(sourceFor(response, 'notes.md'), {
    path: 'notes.md', category: 'markdown', format: 'markdown', reason: 'utf8_markdown',
  });
});

test('classifies a plain UTF-8 Markdown file with compatible YAML frontmatter', (t) => {
  const root = repo(t);
  write(root, 'decisions/use-postgres.md', '---\ntitle: Use Postgres\n---\n# Use Postgres\n');
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'decisions/use-postgres.md'), {
    path: 'decisions/use-postgres.md', category: 'markdown', format: 'markdown', reason: 'utf8_markdown_with_frontmatter',
  });
});

test('classifies a Markdown file whose frontmatter block does not parse as ambiguous, with a question', (t) => {
  const root = repo(t);
  write(root, 'broken.md', '---\ntitle: [unterminated\n---\n# Broken\n');
  const response = run(discoverRequest(root));
  const entry = sourceFor(response, 'broken.md');
  assert.equal(entry.category, 'ambiguous');
  assert.equal(entry.format, 'markdown');
  assert.match(entry.reason, /^incompatible_frontmatter:/);
  assert.equal(typeof entry.question, 'string');
  assert.ok(entry.question.length > 0);
});

// ------------------------------------------------------- obsidian / mediawiki

test('classifies a Markdown file carrying an Obsidian wikilink as unsupported', (t) => {
  const root = repo(t);
  write(root, 'note.md', '# Note\n\nSee [[Other Note]] for background.\n');
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'note.md'), {
    path: 'note.md', category: 'unsupported', format: 'obsidian', reason: 'obsidian_construct',
  });
});

test('classifies a Markdown file carrying an Obsidian callout as unsupported', (t) => {
  const root = repo(t);
  write(root, 'note.md', '# Note\n\n> [!warning] Careful\n> This is a callout.\n');
  const response = run(discoverRequest(root));
  assert.equal(sourceFor(response, 'note.md').format, 'obsidian');
});

test('classifies a Markdown file carrying a Dataview inline field as unsupported', (t) => {
  const root = repo(t);
  write(root, 'note.md', '# Task\n\nStatus:: In progress\nDue:: 2026-09-01\n');
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'note.md'), {
    path: 'note.md', category: 'unsupported', format: 'obsidian', reason: 'obsidian_construct',
  });
});

test('classifies a Markdown file carrying MediaWiki markup as unsupported', (t) => {
  const root = repo(t);
  write(root, 'export.md', "== Section ==\n\n'''Bold claim''' backed by a source.<ref>citation</ref>\n");
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'export.md'), {
    path: 'export.md', category: 'unsupported', format: 'mediawiki', reason: 'mediawiki_markup',
  });
});

test('a wiki example quoted inside a fenced code block does not trigger wiki classification', (t) => {
  const root = repo(t);
  write(root, 'guide.md', '# Guide\n\n```\n[[Not a real link]]\n```\n\nOrdinary prose.\n');
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'guide.md'), {
    path: 'guide.md', category: 'markdown', format: 'markdown', reason: 'utf8_markdown',
  });
});

// ---------------------------------------------------------------- non-UTF-8

test('a non-UTF-8 Markdown file is ambiguous, refusing to classify it as a guess', (t) => {
  const root = repo(t);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'garbled.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  const response = run(discoverRequest(root));
  const entry = sourceFor(response, 'garbled.md');
  assert.equal(entry.category, 'ambiguous');
  assert.equal(entry.reason, 'not_utf8');
  assert.equal(typeof entry.question, 'string');
  assert.ok(entry.question.length > 0);
});

// -------------------------------------------------------- unsupported formats

test('classifies an HTML file confirmed by content as unsupported', (t) => {
  const root = repo(t);
  write(root, 'export.html', '<!doctype html>\n<html><body><p>Hi</p></body></html>\n');
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'export.html'), {
    path: 'export.html', category: 'unsupported', format: 'html', reason: 'html_markup',
  });
});

test('classifies a PDF file confirmed by its magic bytes as unsupported', (t) => {
  const root = repo(t);
  write(root, 'report.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from([0, 1, 2, 3])]));
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'report.pdf'), {
    path: 'report.pdf', category: 'unsupported', format: 'pdf', reason: 'pdf_signature',
  });
});

test('classifies a Word file confirmed by its ZIP container signature as unsupported', (t) => {
  const root = repo(t);
  write(root, 'spec.docx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest of the zip')]));
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'spec.docx'), {
    path: 'spec.docx', category: 'unsupported', format: 'word', reason: 'word_signature',
  });
});

test('classifies a legacy Word file confirmed by its OLE container signature as unsupported', (t) => {
  const root = repo(t);
  write(root, 'old.doc', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('rest')]));
  const response = run(discoverRequest(root));
  assert.equal(sourceFor(response, 'old.doc').format, 'word');
});

test('a document-looking extension whose content does not confirm it is ambiguous, not guessed', (t) => {
  const root = repo(t);
  write(root, 'not-a.pdf', 'just plain text, not a PDF at all\n');
  const response = run(discoverRequest(root));
  const entry = sourceFor(response, 'not-a.pdf');
  assert.equal(entry.category, 'ambiguous');
  assert.equal(entry.reason, 'extension_signature_mismatch:pdf');
  assert.ok(entry.question.length > 0);
});

// -------------------------------------------------------------------- other

test('classifies a non-document file as other without dropping it from the inventory', (t) => {
  const root = repo(t);
  write(root, 'data/config.json', '{"key":"value"}\n');
  write(root, 'LICENSE', 'MIT\n');
  const response = run(discoverRequest(root));
  assert.deepEqual(sourceFor(response, 'data/config.json'), {
    path: 'data/config.json', category: 'other', format: 'json', reason: 'not_a_candidate_document_format',
  });
  assert.deepEqual(sourceFor(response, 'LICENSE'), {
    path: 'LICENSE', category: 'other', format: 'no_extension', reason: 'not_a_candidate_document_format',
  });
});

// ---------------------------------------------------------------- exclusions

test('excludes .git, node_modules, and the bundle directory itself from the scan', (t) => {
  const root = repo(t);
  write(root, '.git/config', 'not a real git config\n');
  write(root, 'node_modules/some-pkg/readme.md', '# Vendored\n');
  write(root, 'okf/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  write(root, 'docs/keep.md', '# Keep\n');
  const response = run(discoverRequest(root));
  const paths = response.data.sources.map((entry) => entry.path);
  assert.ok(paths.includes('docs/keep.md'));
  assert.ok(!paths.some((p) => p.startsWith('.git/')));
  assert.ok(!paths.some((p) => p.startsWith('node_modules/')));
  assert.ok(!paths.some((p) => p.startsWith('okf/') || p === 'okf'));
});

test('honors a non-default bundle directory name for the exclusion', (t) => {
  const root = repo(t);
  write(root, 'docs/bundle/index.md', '---\nokf_version: "0.2"\n---\n# Bundle\n');
  write(root, 'docs/keep.md', '# Keep\n');
  const response = run(discoverRequest(root, { bundle: 'docs/bundle' }));
  const paths = response.data.sources.map((entry) => entry.path);
  assert.ok(paths.includes('docs/keep.md'));
  assert.ok(!paths.some((p) => p.startsWith('docs/bundle/')));
});

// ------------------------------------------------------------ incomplete walk

test('an unreadable symlink degrades the inventory honestly instead of silently', (t) => {
  const root = repo(t);
  write(root, 'real.md', '# Real\n');
  write(root, 'docs/keep.md', '# Keep\n');
  fs.symlinkSync(path.join(root, 'real.md'), path.join(root, 'linked.md'));
  const response = run(discoverRequest(root));
  assert.equal(response.data.complete, false);
  const finding = response.findings.find((item) => item.code === 'unreadable');
  assert.ok(finding, 'expected an unreadable finding when the walk is partial');
  assert.equal(finding.blocks, false);
  assert.deepEqual(finding.detail, { gate: 'discovery', reason: 'incomplete_walk' });
  // The walk still reports everything it could actually observe.
  assert.ok(response.data.sources.some((entry) => entry.path === 'docs/keep.md'));
  assert.ok(!response.data.sources.some((entry) => entry.path === 'linked.md'));
});

test('a complete walk reports no unreadable finding and data.complete: true', (t) => {
  const root = repo(t);
  write(root, 'docs/keep.md', '# Keep\n');
  const response = run(discoverRequest(root));
  assert.equal(response.data.complete, true);
  assert.deepEqual(response.findings, []);
});

// --------------------------------------------------------- activation gate

test('discover reports not-configured entirely outside a Git repository', (t) => {
  const root = temporaryRoot(t, 'okf-142-no-repo-');
  const response = run(discoverRequest(root));
  assert.equal(response.result, 'not-configured');
});

test('discover does not bypass the activation gate: an inactive bundle answers not-configured', (t) => {
  const root = repo(t, { active: false });
  write(root, 'docs/keep.md', '# Keep\n');
  const response = run(discoverRequest(root));
  assert.equal(response.result, 'not-configured');
  assert.equal(response.data.sources, undefined);
});

test('discover reports ACTIVATION_MARKER_INVALID like every other operation on a broken marker', (t) => {
  const root = repo(t, { active: false });
  fs.mkdirSync(path.join(root, '.okf-active'));
  const response = run(discoverRequest(root));
  assert.equal(response.result, 'blocked');
  assert.equal(response.data.code, 'ACTIVATION_MARKER_INVALID');
});

// -------------------------------------------------------- automatic + router

test('automatic invocation of discover is silent, matching every other setup operation\'s automatic behavior', (t) => {
  const root = repo(t);
  const result = spawnWrapper(wrapper, { ...discoverRequest(root), invocation: 'automatic' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('the generic okf router reaches discover too, still behind the activation gate', (t) => {
  const active = repo(t);
  write(active, 'docs/keep.md', '# Keep\n');
  const ok = runWrapper(routerWrapper, { ...discoverRequest(active), skill: 'okf' });
  assert.equal(ok.skill, 'okf');
  assert.equal(ok.result, 'ok');
  assert.ok(ok.data.sources.some((entry) => entry.path === 'docs/keep.md'));

  const inactive = repo(t, { active: false });
  const notConfigured = runWrapper(routerWrapper, { ...discoverRequest(inactive), skill: 'okf' });
  assert.equal(notConfigured.result, 'not-configured');
});
