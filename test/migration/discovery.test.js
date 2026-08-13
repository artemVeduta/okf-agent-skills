// Domain: migration — what the discovery scan sees before anything is migrated:
// source classification, exclusions, walk honesty, and monorepo package boundaries.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot, writeManifest } = require('../../test-support/snapshot');

const wrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf.js');

function run(value) {
  return runWrapper(wrapper, value);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test.describe('source classification and walk completeness', () => {
  // `discover` needs an active bundle (it excludes the bundle root from its own scan),
  // so the fixture always writes a valid manifest unless a test asks for an inactive
  // one, the opposite default from #138's `inspect`/`repair` fixtures.
  function repo(t, { active = true } = {}) {
    const root = temporaryRoot(t, 'okf-142-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    if (active) writeManifest(root, '.');
    return root;
  }

  function discoverRequest(root, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'discover', payload: { cwd: root, ...payload } };
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

  test('a symlink escaping the repository degrades the inventory honestly instead of silently', (t) => {
    const root = repo(t);
    const outside = temporaryRoot(t, 'okf-142-outside-');
    fs.writeFileSync(path.join(outside, 'real.md'), '# Real\n');
    write(root, 'docs/keep.md', '# Keep\n');
    fs.symlinkSync(path.join(outside, 'real.md'), path.join(root, 'linked.md'));
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

  test('a symlink resolving inside the repository keeps the walk complete and lists the file once', (t) => {
    const root = repo(t);
    write(root, 'docs/keep.md', '# Keep\n');
    fs.symlinkSync(path.join(root, 'docs', 'keep.md'), path.join(root, 'linked.md'));
    fs.symlinkSync(path.join(root, 'docs'), path.join(root, 'linked-dir'), 'dir');
    const response = run(discoverRequest(root));
    assert.equal(response.data.complete, true);
    assert.deepEqual(response.findings, []);
    const paths = response.data.sources.map((entry) => entry.path);
    assert.deepEqual(paths.filter((p) => p.endsWith('keep.md')), ['docs/keep.md']);
    assert.ok(!paths.some((p) => p.startsWith('linked')));
  });

  test('a symlink cycle inside the repository terminates with a complete walk', (t) => {
    const root = repo(t);
    write(root, 'docs/keep.md', '# Keep\n');
    fs.symlinkSync(path.join(root, 'docs'), path.join(root, 'docs', 'loop'), 'dir');
    const response = run(discoverRequest(root));
    assert.equal(response.data.complete, true);
    assert.ok(response.data.sources.some((entry) => entry.path === 'docs/keep.md'));
  });

  test('an unreadable directory still degrades the walk', (t) => {
    const root = repo(t);
    write(root, 'docs/keep.md', '# Keep\n');
    const closed = path.join(root, 'closed');
    fs.mkdirSync(closed);
    fs.writeFileSync(path.join(closed, 'hidden.md'), '# Hidden\n');
    fs.chmodSync(closed, 0o000);
    try {
      const response = run(discoverRequest(root));
      assert.equal(response.data.complete, false);
      assert.ok(response.findings.some((item) => item.code === 'unreadable'));
    } finally {
      fs.chmodSync(closed, 0o755);
    }
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

  test('discover reports MANIFEST_INVALID like every other operation on a broken manifest', (t) => {
    const root = repo(t, { active: false });
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'not json');
    const response = run(discoverRequest(root));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'MANIFEST_INVALID');
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
});

test.describe('discovery ignores the files setup itself writes', () => {
  // #165: `/okf-setup` writes `.okf-workspace.json` at the Git root, beside the
  // bundle. A `discover` call in the same session must not report the file
  // setup itself just wrote (or its own occurrence ledger) as a candidate
  // migration source.
  function discoverRequest(root) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-setup',
      operation: 'discover',
      payload: { cwd: root },
    };
  }

  test('a fresh bootstrap discovers zero sources in an otherwise empty repository', (t) => {
    const root = temporaryRoot(t, 'okf-165-repo-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.writeFileSync(path.join(root, '.okf-occurrences.json'), '{}\n');

    const response = runWrapper(wrapper, discoverRequest(root));
    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.sources, []);
  });

  test('a document deeper in the tree sharing an excluded name is still discovered', (t) => {
    const root = temporaryRoot(t, 'okf-165-nested-');
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', '.okf-workspace.json'), '{}\n');

    const response = runWrapper(wrapper, discoverRequest(root));
    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.sources.map((entry) => entry.path), ['docs/.okf-workspace.json']);
  });
});

test.describe('package boundaries, per-package briefs, and result aggregation', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  // `plan`/`aggregate` run without a valid manifest (like `inspect`/
  // `repair`), so this builds a bare Git repository directly.
  function repo(t) {
    return temporaryRoot(t, 'okf-135-repo-');
  }

  function git(root) {
    fs.mkdirSync(path.join(root, '.git'));
  }

  function planRequest(root, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'plan', payload: { cwd: root, ...payload } };
  }

  function aggregateRequest(root, results, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'aggregate', payload: { cwd: root, results, ...payload } };
  }

  function repairRequest(root, targets, payload = {}) {
    return { protocol: 'okf-wrapper/1', skill: 'okf-setup', operation: 'repair', payload: { cwd: root, targets, ...payload } };
  }

  function dir(...segments) {
    const target = path.join(...segments);
    fs.mkdirSync(target, { recursive: true });
    return target;
  }

  // ------------------------------------------------------- no monorepo signal

  test('plan reports monorepo: false with no signal present, and outside a Git repository reports not-configured', (t) => {
    const root = repo(t);
    git(root);
    assert.deepEqual(run(planRequest(root)).data, { monorepo: false, ambiguous: false, signals: [], packages: [], briefs: [] });

    const outside = temporaryRoot(t, 'okf-135-no-repo-');
    assert.equal(run(planRequest(outside)).result, 'not-configured');
  });

  test('a single detected package is not a monorepo', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'solo');
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, false);
    assert.deepEqual(response.data.signals, ['pnpm-workspace']);
    assert.equal(response.data.packages.length, 1);
  });

  // ------------------------------------------------------------ each signal

  test('detects package boundaries from .gitmodules', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'vendor', 'lib');
    dir(root, 'vendor', 'other');
    write(root, '.gitmodules', [
      '[submodule "vendor/lib"]',
      '\tpath = vendor/lib',
      '\turl = https://example.test/lib.git',
      '[submodule "vendor/other"]',
      '\tpath = vendor/other',
      '\turl = https://example.test/other.git',
    ].join('\n'));

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.equal(response.data.ambiguous, false);
    assert.deepEqual(response.data.signals, ['gitmodules']);
    assert.deepEqual(
      response.data.packages.sort((a, b) => (a.path < b.path ? -1 : 1)),
      [
        { package: 'lib', path: 'vendor/lib', separate_repo: true },
        { package: 'other', path: 'vendor/other', separate_repo: true },
      ],
    );
  });

  test('detects package boundaries from a root package.json workspaces field, literal path and single-level glob', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'core');
    dir(root, 'apps', 'web');
    dir(root, 'apps', 'admin');
    write(root, 'package.json', JSON.stringify({ name: 'root', workspaces: ['packages/core', 'apps/*'] }));

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.deepEqual(response.data.signals, ['npm-workspaces']);
    assert.deepEqual(
      response.data.packages.sort((a, b) => (a.path < b.path ? -1 : 1)),
      [
        { package: 'admin', path: 'apps/admin', separate_repo: false },
        { package: 'web', path: 'apps/web', separate_repo: false },
        { package: 'core', path: 'packages/core', separate_repo: false },
      ].sort((a, b) => (a.path < b.path ? -1 : 1)),
    );
  });

  test('detects package boundaries from a yarn-style workspaces.packages object form', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'a');
    dir(root, 'packages', 'b');
    write(root, 'package.json', JSON.stringify({ workspaces: { packages: ['packages/a', 'packages/b'] } }));

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.equal(response.data.packages.length, 2);
  });

  test('detects package boundaries from pnpm-workspace.yaml', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'foo');
    dir(root, 'packages', 'bar');
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.deepEqual(response.data.signals, ['pnpm-workspace']);
    assert.deepEqual(
      response.data.packages.map((p) => p.package).sort(),
      ['bar', 'foo'],
    );
  });

  test('detects package boundaries from a Cargo.toml [workspace] members list', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'crates', 'a');
    dir(root, 'crates', 'b');
    write(root, 'Cargo.toml', '[workspace]\nmembers = ["crates/a", "crates/b"]\n');

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.deepEqual(response.data.signals, ['cargo-workspace']);
    assert.deepEqual(response.data.packages.map((p) => p.package).sort(), ['a', 'b']);
  });

  test('detects package boundaries from a go.work use block', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'mod-a');
    dir(root, 'mod-b');
    write(root, 'go.work', 'go 1.21\n\nuse (\n\t./mod-a\n\t./mod-b\n)\n');

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.deepEqual(response.data.signals, ['go-work']);
    assert.deepEqual(response.data.packages.map((p) => p.package).sort(), ['mod-a', 'mod-b']);
  });

  test('a mix of a workspace package and a Git submodule package is not ambiguous when the two name different paths', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'apps', 'web');
    dir(root, 'vendor', 'lib');
    write(root, 'package.json', JSON.stringify({ workspaces: ['apps/web'] }));
    write(root, '.gitmodules', '[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = https://example.test/lib.git\n');

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.equal(response.data.ambiguous, false);
    assert.deepEqual(
      response.data.packages.sort((a, b) => (a.path < b.path ? -1 : 1)),
      [
        { package: 'web', path: 'apps/web', separate_repo: false },
        { package: 'lib', path: 'vendor/lib', separate_repo: true },
      ],
    );
  });

  // ------------------------------------------------------------------- ambiguous

  test('a package boundary that cannot be established deterministically is reported as a question, never guessed', (t) => {
    const root = repo(t);
    git(root);
    write(root, 'package.json', JSON.stringify({ workspaces: ['packages/**'] }));

    const response = run(planRequest(root));
    assert.equal(response.result, 'ok');
    assert.equal(response.data.monorepo, true);
    assert.equal(response.data.ambiguous, true);
    assert.deepEqual(response.data.packages, []);
    assert.deepEqual(response.data.briefs, []);
    assert.ok(response.data.reason.includes('unsupported_glob'));
    assert.ok(typeof response.data.question === 'string' && response.data.question.length > 0);
  });

  test('two signals disagreeing about the same path are ambiguous rather than resolved by precedence', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'foo');
    write(root, 'package.json', JSON.stringify({ workspaces: ['packages/foo'] }));
    write(root, '.gitmodules', '[submodule "packages/foo"]\n\tpath = packages/foo\n\turl = https://example.test/foo.git\n');

    const response = run(planRequest(root));
    assert.equal(response.data.monorepo, true);
    assert.equal(response.data.ambiguous, true);
    assert.ok(response.data.reason.includes('conflicting_signals'));
  });

  test('an unparseable root package.json is ambiguous, not silently skipped', (t) => {
    const root = repo(t);
    git(root);
    write(root, 'package.json', '{ not json');

    const response = run(planRequest(root));
    assert.equal(response.data.ambiguous, true);
    assert.ok(response.data.reason.includes('unparseable_package_json'));
  });

  // -------------------------------------------------------------- brief shape

  test('plan builds one immutable brief per package: package-relative for a workspace package, own-repo-relative for a submodule', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'apps', 'web');
    dir(root, 'vendor', 'lib');
    write(root, 'package.json', JSON.stringify({ workspaces: ['apps/web'] }));
    write(root, '.gitmodules', '[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = https://example.test/lib.git\n');

    const response = run(planRequest(root, { project_mode: 'knowledge-only', mappings: [{ from: 'docs/a.md', to: 'a.md' }] }));
    const briefs = response.data.briefs.sort((a, b) => (a.package < b.package ? -1 : 1));

    assert.deepEqual(briefs, [
      {
        package: 'lib',
        package_root: 'vendor/lib',
        cwd: path.join(root, 'vendor', 'lib'),
        bundle: 'okf',
        project_mode: 'knowledge-only',
        mappings: [{ from: 'docs/a.md', to: 'a.md' }],
        okf_version: '0.2',
      },
      {
        package: 'web',
        package_root: 'apps/web',
        cwd: root,
        bundle: 'apps/web/okf',
        project_mode: 'knowledge-only',
        mappings: [{ from: 'docs/a.md', to: 'a.md' }],
        okf_version: '0.2',
      },
    ]);
  });

  test('plan defaults project_mode to null and mappings to an empty array when omitted, and honors a non-default bundle name', (t) => {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'a');
    dir(root, 'packages', 'b');
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');

    const response = run(planRequest(root, { bundle: 'docs' }));
    for (const brief of response.data.briefs) {
      assert.equal(brief.project_mode, null);
      assert.deepEqual(brief.mappings, []);
      assert.equal(brief.okf_version, '0.2');
      assert.ok(brief.bundle.endsWith('/docs'));
    }
  });

  test('plan refuses an unsupported project_mode or a non-array mappings without computing anything', (t) => {
    const root = repo(t);
    git(root);
    for (const payload of [{ project_mode: 'sandbox' }, { mappings: 'not-an-array' }]) {
      const response = run(planRequest(root, payload));
      assert.equal(response.result, 'blocked');
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    }
  });

  // -------------------------------------------------------------- aggregation

  function twoPackageWorkspace(t) {
    const root = repo(t);
    git(root);
    dir(root, 'packages', 'foo');
    dir(root, 'packages', 'bar');
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
    return root;
  }

  test('aggregate reports "complete" and a valid multi-package manifest when every package succeeded', (t) => {
    const root = twoPackageWorkspace(t);
    const response = run(aggregateRequest(root, [
      { package: 'foo', status: 'ok' },
      { package: 'bar', status: 'ok' },
    ], { project_mode: 'code-backed' }));

    assert.equal(response.result, 'ok');
    assert.equal(response.data.status, 'complete');
    assert.deepEqual(response.data.failed, []);
    assert.deepEqual(
      response.data.packages.sort((a, b) => (a.package < b.package ? -1 : 1)),
      [
        { package: 'bar', status: 'ok', reason: null, warnings: [] },
        { package: 'foo', status: 'ok', reason: null, warnings: [] },
      ],
    );

    const manifest = response.data.manifest;
    assert.equal(manifest.schema_version, 1);
    assert.match(manifest.workspace_id, uuid);
    assert.deepEqual(manifest.repositories, [{ name: path.basename(root), path: '.', local: true }]);
    assert.deepEqual(
      manifest.bundles.sort((a, b) => (a.alias < b.alias ? -1 : 1)),
      [
        { alias: 'bar', owner: path.basename(root), root: 'packages/bar/okf', okf_version: '0.2', project_mode: 'code-backed' },
        { alias: 'foo', owner: path.basename(root), root: 'packages/foo/okf', okf_version: '0.2', project_mode: 'code-backed' },
      ],
    );

    // The generated manifest is not written by `aggregate`; it validates and is
    // persisted only through `repair`'s existing hand-authored-manifest path.
    assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
    const repaired = run(repairRequest(root, ['manifest'], { manifest }));
    assert.equal(repaired.result, 'applied');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8')), manifest);
  });

  test('aggregate refuses to build a manifest without a recognized project_mode', (t) => {
    const root = twoPackageWorkspace(t);
    const results = [{ package: 'foo', status: 'ok' }, { package: 'bar', status: 'ok' }];
    for (const projectMode of [undefined, 'sandbox']) {
      const payload = projectMode === undefined ? {} : { project_mode: projectMode };
      const response = run(aggregateRequest(root, results, payload));
      assert.equal(response.result, 'blocked', JSON.stringify(payload));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(payload));
    }
  });

  test('aggregate reports "partial" and names the failed package and its reason, never silently dropping it', (t) => {
    const root = twoPackageWorkspace(t);
    const response = run(aggregateRequest(root, [
      { package: 'foo', status: 'ok' },
      { package: 'bar', status: 'failed', reason: 'evidence file missing' },
    ], { project_mode: 'code-backed' }));

    assert.equal(response.data.status, 'partial');
    assert.deepEqual(response.data.failed, ['bar']);
    const bar = response.data.packages.find((p) => p.package === 'bar');
    assert.deepEqual(bar, { package: 'bar', status: 'failed', reason: 'evidence file missing', warnings: [] });
    // The manifest still names every detected package, including the failed one —
    // it is `required` but will report `degraded` federation until it exists.
    assert.deepEqual(response.data.manifest.bundles.map((b) => b.alias).sort(), ['bar', 'foo']);
  });

  test('aggregate carries per-package warnings through untouched', (t) => {
    const root = twoPackageWorkspace(t);
    const response = run(aggregateRequest(root, [
      { package: 'foo', status: 'ok', warnings: ['duplicate concept candidate'] },
      { package: 'bar', status: 'ok' },
    ], { project_mode: 'code-backed' }));
    const foo = response.data.packages.find((p) => p.package === 'foo');
    assert.deepEqual(foo.warnings, ['duplicate concept candidate']);
  });

  test('aggregate keeps a salvaged workspace_id when the caller supplies one', (t) => {
    const root = twoPackageWorkspace(t);
    const workspaceId = '77777777-7777-4777-8777-777777777777';
    const response = run(aggregateRequest(root, [
      { package: 'foo', status: 'ok' },
      { package: 'bar', status: 'ok' },
    ], { workspace_id: workspaceId, project_mode: 'code-backed' }));
    assert.equal(response.data.manifest.workspace_id, workspaceId);
  });

  test('aggregate refuses a results list that omits a detected package, without computing a manifest', (t) => {
    const root = twoPackageWorkspace(t);
    const response = run(aggregateRequest(root, [{ package: 'foo', status: 'ok' }]));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
    assert.equal(response.data.manifest, undefined);
  });

  test('aggregate refuses a results entry naming an unknown package', (t) => {
    const root = twoPackageWorkspace(t);
    const response = run(aggregateRequest(root, [
      { package: 'foo', status: 'ok' },
      { package: 'bar', status: 'ok' },
      { package: 'ghost', status: 'ok' },
    ]));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  });

  test('aggregate refuses a duplicate package name, a failed result without a reason, and an ok result carrying a reason', (t) => {
    const root = twoPackageWorkspace(t);
    const cases = [
      [{ package: 'foo', status: 'ok' }, { package: 'foo', status: 'ok' }],
      [{ package: 'foo', status: 'failed' }, { package: 'bar', status: 'ok' }],
      [{ package: 'foo', status: 'ok', reason: 'should not be here' }, { package: 'bar', status: 'ok' }],
    ];
    for (const results of cases) {
      const response = run(aggregateRequest(root, results));
      assert.equal(response.result, 'blocked', JSON.stringify(results));
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', JSON.stringify(results));
    }
  });

  test('aggregate rejects a structurally empty results list at the protocol layer, before the runtime', (t) => {
    const root = twoPackageWorkspace(t);
    const result = spawnWrapper(wrapper, aggregateRequest(root, []));
    assert.equal(result.status, 64);
    assert.equal(result.stdout, '');
  });

  test('aggregate refuses when the workspace is not (or no longer) an unambiguous monorepo', (t) => {
    const root = repo(t);
    git(root);
    const response = run(aggregateRequest(root, [{ package: 'foo', status: 'ok' }]));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.code, 'UNSUPPORTED_INPUT');
  });

  test('aggregate reports not-configured entirely outside a Git repository', (t) => {
    const root = temporaryRoot(t, 'okf-135-no-repo-');
    const response = run(aggregateRequest(root, [{ package: 'foo', status: 'ok' }]));
    assert.equal(response.result, 'not-configured');
  });

  // -------------------------------------------------------- automatic + router

  test('automatic invocation of plan or aggregate is silent, matching every setup operation\'s automatic behavior', (t) => {
    const root = twoPackageWorkspace(t);
    const requests = [
      planRequest(root),
      aggregateRequest(root, [{ package: 'foo', status: 'ok' }, { package: 'bar', status: 'ok' }]),
    ];
    for (const request of requests) {
      const result = spawnWrapper(wrapper, { ...request, invocation: 'automatic' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    }
  });

  test('the generic okf router reaches plan and aggregate too, bypassing the activation gate', (t) => {
    const root = twoPackageWorkspace(t);
    const planned = runWrapper(routerWrapper, { ...planRequest(root), skill: 'okf' });
    assert.equal(planned.skill, 'okf');
    assert.equal(planned.result, 'ok');
    assert.equal(planned.data.monorepo, true);
  });
});
