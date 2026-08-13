const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Bundle domain: navigation -- exact reads, the search seam and its result
// vocabulary, deprecated-concept exclusion, and inbound-link enumeration.
const repo = path.resolve(__dirname, '..', '..');
const scripts = path.join(repo, 'scripts');
const runtime = require(path.join(scripts, 'lib', 'runtime'));
const defaultServices = require(path.join(scripts, 'lib', 'services'));

test.describe('exact reads, the search seam, and the result vocabulary', () => { // #50
  const wrapper = path.join(scripts, 'okf-read.js');

  const dataKeys = ['coverage', 'found', 'match', 'read', 'scope'];
  const resultLabels = new Set(['ok', 'degraded', 'not-configured', 'unavailable']);
  const matchLabels = new Set(['found', 'no match in searched scope']);
  const coverageLabels = new Set(['complete', 'non-exhaustive']);
  const findingLabels = new Set(['missing', 'unreadable', 'unobservable', 'invalid']);
  const retiredLabels = ['insufficient', 'CLIPPED', 'MISS', 'UNDISCOVERED', 'UNSEARCHED', 'FILTERED'];

  function repository(t, prefix = 'okf-50-') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    fs.mkdirSync(path.join(root, '.git'));
    manifest(root, [{ alias: 'app', owner: 'app', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }]);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
  }

  function bundle(root, relative = '.') {
    const target = path.resolve(root, relative);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'index.md'), '---\nokf_version: "0.2"\n---\n# Bundle\n');
    return target;
  }

  function writeConcept(bundleRoot, relative, frontmatter, body) {
    const file = path.join(bundleRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prefix = frontmatter === '' ? '' : `---\n${frontmatter}\n---\n`;
    const content = `${prefix}${body.endsWith('\n') ? body : `${body}\n`}`;
    fs.writeFileSync(file, content);
    return { file, content };
  }

  function manifest(root, bundles) {
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'app', path: '.', local: true }],
      bundles,
    }));
  }

  function request(root, operation, value, extra = {}) {
    const payload = { cwd: root, ...extra };
    if (operation === 'read') payload.target = value;
    if (operation === 'search') payload.query = value;
    return { protocol: 'okf-wrapper/1', skill: 'okf-read', operation, payload };
  }

  function directRequest(root, operation, value) {
    return request(root, operation, value, {
      bundle: root,
      candidates: [{ path: '.', bundle: '.', declared: true, named_by_user: true }],
    });
  }

  function runWrapper(value) {
    const run = childProcess.spawnSync(process.execPath, [wrapper], {
      input: JSON.stringify(value),
      encoding: 'utf8',
    });
    let response;
    try {
      response = run.stdout ? JSON.parse(run.stdout) : undefined;
    } catch {
      response = undefined;
    }
    return {
      status: run.status,
      stdout: run.stdout || '',
      stderr: run.stderr || '',
      response,
    };
  }

  function runRuntime(value, overrides = {}) {
    return runtime.run('okf-read', value, { ...defaultServices, ...overrides });
  }

  function assertProcess(result) {
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.ok(result.response);
    return result.response;
  }

  function assertNavigation(response) {
    assert.ok(resultLabels.has(response.result), response.result);
    for (const key of dataKeys) assert.equal(Object.hasOwn(response.data, key), true, key);
    assert.ok(matchLabels.has(response.data.match), response.data.match);
    assert.ok(coverageLabels.has(response.data.coverage), response.data.coverage);
    for (const item of response.findings) assert.ok(findingLabels.has(item.code), item.code);
    return response.data;
  }

  function list(value) {
    if (Array.isArray(value)) return value;
    return value === undefined || value === null ? [] : [value];
  }

  function records(response, field) {
    return list(response.data[field]).filter((item) => item !== null && typeof item === 'object');
  }

  function pathOf(item) {
    return typeof item === 'string' ? item : item && typeof item.path === 'string' ? item.path : undefined;
  }

  function pathMatches(item, relative) {
    const value = pathOf(item);
    return value !== undefined && (
      value === relative || value === `./${relative}` || value.endsWith(`/${relative}`) || value.endsWith(`${path.sep}${relative}`)
    );
  }

  function readRecord(response, relative) {
    return records(response, 'read').find((item) => pathMatches(item, relative));
  }

  function finding(response, code) {
    return response.findings.find((item) => item.code === code);
  }

  function assertFinding(response, code) {
    const item = finding(response, code);
    assert.ok(item, code);
    return item;
  }

  function provenanceOf(record) {
    return record.provenance;
  }

  function sourceFiles() {
    const files = [];
    function visit(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(file);
      }
    }
    visit(scripts);
    return files;
  }

  function hasStandalone(source, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(source);
  }

  test('navigation keeps the fixed vocabulary and ships no retired labels', () => {
    for (const file of sourceFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      for (const label of retiredLabels) assert.equal(hasStandalone(source, label), false, `${file}: ${label}`);
    }
  });

  test('read returns exact content, a bundle-relative path, and only authored provenance', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const source = { resource: 'reference.md', title: 'Reference' };
    const withSources = writeConcept(
      rootBundle,
      'with-sources.md',
      'type: Note\nsources:\n  - resource: reference.md\n    title: Reference',
      '# With sources\n',
    );
    writeConcept(rootBundle, 'reference.md', 'type: Note', '# Reference\n');
    const withoutSources = writeConcept(rootBundle, 'without-sources.md', 'type: Note\nsources: []', '# No sources\n');

    const observed = assertNavigation(assertProcess(runWrapper(directRequest(root, 'read', 'with-sources'))));
    assert.equal(observed.match, 'found');
    assert.equal(observed.coverage, 'complete');
    const read = readRecord({ data: observed }, 'with-sources.md');
    assert.ok(read);
    assert.equal(read.path, 'with-sources.md');
    assert.equal(path.isAbsolute(read.path), false);
    assert.equal(read.content, withSources.content);
    assert.deepEqual(provenanceOf(read), [source]);

    const empty = assertNavigation(assertProcess(runWrapper(directRequest(root, 'read', 'without-sources'))));
    const emptyRead = readRecord({ data: empty }, 'without-sources.md');
    assert.ok(emptyRead);
    assert.equal(emptyRead.content, withoutSources.content);
    assert.equal(provenanceOf(emptyRead), undefined);
  });

  test('an exact missing target returns no substitute and does not broaden the read', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const similar = writeConcept(rootBundle, 'missing-near.md', 'type: Note', '# Similar concept\n');

    const response = assertProcess(runWrapper(directRequest(root, 'read', 'missing')));
    const data = assertNavigation(response);
    assert.equal(data.match, 'no match in searched scope');
    assertFinding(response, 'missing');
    assert.equal(list(data.found).some((item) => pathMatches(item, path.basename(similar.file))), false);
    assert.deepEqual(records(response, 'read'), []);
    assert.equal(JSON.stringify(data).includes(path.basename(similar.file)), false);
  });

  test('a missing root index is preserved while body search uses the native adapter seam', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    fs.unlinkSync(path.join(rootBundle, 'index.md'));
    const concept = writeConcept(rootBundle, 'body-only.md', 'type: Note', '# body-only-query-50\n');

    const response = runRuntime(directRequest(root, 'search', 'body-only-query-50'), {
      search(scopeRoot, query) {
        assert.equal(scopeRoot, rootBundle);
        assert.equal(query, 'body-only-query-50');
        return [concept.file];
      },
    });
    const data = assertNavigation(response);
    assert.equal(response.operation, 'search');
    assert.equal(data.match, 'found');
    assert.ok(readRecord(response, 'body-only.md'));
    assert.ok(response.findings.some((item) => item.code === 'unreadable'));
    assert.equal(fs.existsSync(path.join(rootBundle, 'index.md')), false);
  });

  test('body search reports the known root index without interpreting its open schema', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const index = path.join(rootBundle, 'index.md');
    const malformed = '---\nokf_version: "0.2"\n: malformed\n---\n# Broken\n';
    fs.writeFileSync(index, malformed);
    const concept = writeConcept(rootBundle, 'body-only.md', 'type: Note', '# malformed-index-body-query-50\n');
    const before = fs.readFileSync(index);

    const response = runRuntime(directRequest(root, 'search', 'malformed-index-body-query-50'), {
      search(scopeRoot, query) {
        assert.equal(scopeRoot, rootBundle);
        assert.equal(query, 'malformed-index-body-query-50');
        return [concept.file];
      },
    });
    const data = assertNavigation(response);
    assert.equal(data.match, 'found');
    assert.ok(readRecord(response, 'body-only.md'));
    assert.equal(response.findings.some((item) => item.code === 'unreadable'), false);
    assert.deepEqual(fs.readFileSync(index), before);
  });

  test('a symlinked concept outside the admitted bundle is invalid and is not returned', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-50-outside-')));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const secret = writeConcept(outside, 'secret.md', 'type: Note', '# outside-content-50\n');
    fs.symlinkSync(secret.file, path.join(rootBundle, 'escape.md'));

    const response = assertProcess(runWrapper(directRequest(root, 'read', 'escape')));
    assertNavigation(response);
    assertFinding(response, 'invalid');
    assert.equal(readRecord(response, 'escape.md'), undefined);
    assert.equal(JSON.stringify(response.data).includes('outside-content-50'), false);
  });

  test('an unverified end of file is unobservable and degrades an exact read', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const concept = writeConcept(rootBundle, 'partial.md', 'type: Note', '# partial-body-50\n');
    const originalReadFile = defaultServices.readFile;

    const response = runRuntime(directRequest(root, 'read', 'partial'), {
      readFile(file) {
        const value = originalReadFile(file);
        if (typeof file === 'string' && path.resolve(file) === path.resolve(concept.file)) {
          return { content: value, complete: false };
        }
        return value;
      },
    });

    assert.ok(response);
    assertNavigation(response);
    assert.equal(response.result, 'degraded');
    assertFinding(response, 'unobservable');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assert.equal(readRecord(response, 'partial.md').content, concept.content);
  });

  test('a bundle above the provisional support ceiling still returns exact content without a complete claim', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const target = writeConcept(rootBundle, 'large.md', 'type: Note', '# large-bundle-target-50\n');
    const filler = '---\ntype: Note\n---\n# filler\n';
    for (let index = 0; index < 501; index++) {
      fs.writeFileSync(path.join(rootBundle, `filler-${String(index).padStart(3, '0')}.md`), filler);
    }

    const response = assertProcess(runWrapper(directRequest(root, 'read', 'large')));
    const data = assertNavigation(response);
    assert.equal(data.coverage, 'non-exhaustive');
    assert.equal(readRecord(response, 'large.md').content, target.content);
    assert.equal(JSON.stringify(data).includes('calibr'), false);
    assert.equal(JSON.stringify(data).includes('"complete"'), false);
  });

  test('successive runtime reads observe a changed concept without a hidden result cache', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const concept = writeConcept(rootBundle, 'changing.md', 'type: Note', '# first-content-50\n');
    const requestValue = directRequest(root, 'read', 'changing');
    const services = { ...defaultServices };

    const first = runtime.run('okf-read', requestValue, services);
    assert.equal(readRecord(first, 'changing.md').content, concept.content);

    const changed = writeConcept(rootBundle, 'changing.md', 'type: Note', '# second-content-50\n');
    const second = runtime.run('okf-read', requestValue, services);
    assert.equal(readRecord(second, 'changing.md').content, changed.content);
    assert.notEqual(readRecord(second, 'changing.md').content, readRecord(first, 'changing.md').content);
  });

  test('broad search returns relevant concepts from every admitted bundle without deduplication', (t) => {
    const root = repository(t);
    const first = bundle(root, 'first');
    const second = bundle(root, 'second');
    const firstConcept = writeConcept(first, 'same.md', 'type: Note', '# federated-body-query-50 from first\n');
    const secondConcept = writeConcept(second, 'same.md', 'type: Note', '# federated-body-query-50 from second\n');
    manifest(root, [
      { alias: 'first', owner: 'app', root: 'first', okf_version: '0.2', project_mode: 'knowledge-only' },
      { alias: 'second', owner: 'app', root: 'second', okf_version: '0.2', project_mode: 'knowledge-only' },
    ]);

    const response = runRuntime(request(root, 'search', 'federated-body-query-50', { candidates: [] }), {
      search(scopeRoot, query) {
        assert.equal(query, 'federated-body-query-50');
        return [path.join(scopeRoot, 'same.md')];
      },
    });
    assertNavigation(response);
    assert.equal(response.operation, 'search');
    assert.equal(response.data.match, 'found');
    const matches = records(response, 'read').filter((item) => pathMatches(item, 'same.md'));
    assert.equal(matches.length, 2);
    assert.deepEqual(
      matches.map((item) => ({ owner: item.bundle_alias, content: item.content }))
        .sort((a, b) => a.owner.localeCompare(b.owner)),
      [
        { owner: 'first', content: firstConcept.content },
        { owner: 'second', content: secondConcept.content },
      ],
    );
  });

  test('broad search rejects a native path outside the admitted bundle', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-50-search-outside-')));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const secret = writeConcept(outside, 'secret.md', 'type: Note', '# outside-search-content-50\n');

    const response = runRuntime(directRequest(root, 'search', 'outside-search-query-50'), {
      search(scopeRoot, query) {
        assert.equal(scopeRoot, rootBundle);
        assert.equal(query, 'outside-search-query-50');
        return [secret.file];
      },
    });

    assertNavigation(response);
    assert.equal(response.result, 'degraded');
    assert.equal(response.data.match, 'no match in searched scope');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assertFinding(response, 'invalid');
    assert.deepEqual(records(response, 'read'), []);
    assert.equal(JSON.stringify(response.data).includes('outside-search-content-50'), false);
  });

  test('ordinary search excludes observed deprecated concepts while exact read includes one with a warning', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const current = writeConcept(rootBundle, 'current.md', 'type: Note\nstatus: current', '# ordinary-status-query-50\n');
    const deprecated = writeConcept(rootBundle, 'old.md', 'type: Note\nstatus: deprecated', '# ordinary-status-query-50 deprecated\n');

    const ordinary = runRuntime(directRequest(root, 'search', 'ordinary-status-query-50'), {
      search(scopeRoot, query) {
        assert.equal(scopeRoot, rootBundle);
        assert.equal(query, 'ordinary-status-query-50');
        return [current.file, deprecated.file];
      },
    });
    assertNavigation(ordinary);
    assert.ok(readRecord(ordinary, 'current.md'));
    assert.equal(readRecord(ordinary, 'old.md'), undefined);

    const wordOnly = runRuntime(directRequest(root, 'search', 'deprecated'), {
      search(scopeRoot, query) {
        assert.equal(scopeRoot, rootBundle);
        assert.equal(query, 'deprecated');
        return [deprecated.file];
      },
    });
    assertNavigation(wordOnly);
    assert.equal(readRecord(wordOnly, 'old.md'), undefined);

    const exact = assertProcess(runWrapper(directRequest(root, 'read', 'old')));
    assertNavigation(exact);
    const exactRecord = readRecord(exact, 'old.md');
    assert.ok(exactRecord);
    assert.equal(exactRecord.content, deprecated.content);
    assert.ok(exact.findings.some((item) => (
      item.code === 'unreadable' &&
      item.severity === 'warning' &&
      item.detail &&
      item.detail.path === exactRecord.path
    )));
    assert.equal(JSON.stringify(exact.data).includes(current.content), false);
  });

  test('search without observed status is degraded and discloses the unevaluated archive predicate', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const concept = writeConcept(rootBundle, 'unknown-status.md', 'type: Note', '# unknown-status-query-50\n');
    const response = runRuntime(directRequest(root, 'search', 'unknown-status-query-50'), {
      search() {
        return [concept.file];
      },
    });

    assertNavigation(response);
    assert.equal(response.result, 'degraded');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assert.equal(response.data.archive_predicate, 'unevaluated');
    assert.equal(readRecord(response, 'unknown-status.md').content, concept.content);
  });

  test('a missing declared bundle degrades coverage but does not block an active read', (t) => {
    const root = repository(t);
    const live = bundle(root, 'live');
    const concept = writeConcept(live, 'note.md', 'type: Note', '# partial-admission-50\n');
    manifest(root, [
      { alias: 'live', owner: 'app', root: 'live', okf_version: '0.2', project_mode: 'knowledge-only' },
      { alias: 'missing', owner: 'app', root: 'missing', okf_version: '0.2', project_mode: 'knowledge-only' },
    ]);

    const response = runRuntime(request(root, 'read', 'note', { candidates: [] }));
    assertNavigation(response);
    // Every declared bundle is required now (#197): the missing sibling degrades
    // the overall result and coverage, but the runtime still serves the read the
    // active bundle can answer.
    assert.equal(response.result, 'degraded');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assert.equal(readRecord(response, 'note.md').content, concept.content);
    // The missing bundle is required now (#197), so admission is only partial:
    // navigation reports one summary `unreadable`/`admission_incomplete` finding,
    // without blocking the read the still-active `live` bundle can answer. The
    // per-candidate PRESENCE finding stays on the redacted candidate, not here.
    assert.equal(response.findings.some((item) => item.code === 'unreadable'), true);
    assert.equal(response.findings.some((item) => item.code === 'BUNDLE_MISSING'), false);
  });

  test('navigation is unavailable with no active admitted bundle and exposes only fixed findings', (t) => {
    const root = repository(t);
    manifest(root, [{ alias: 'missing', owner: 'app', root: 'missing', okf_version: '0.2', project_mode: 'knowledge-only' }]);

    const response = runRuntime(request(root, 'read', 'missing', { candidates: [] }));
    assertNavigation(response);
    assert.equal(response.result, 'unavailable');
    assertFinding(response, 'unreadable');
    assert.equal(response.findings.some((item) => item.code === 'BUNDLE_MISSING'), false);
    assert.deepEqual(records(response, 'read'), []);
  });

  test('an exact missing target inspects its bundle-root index without searching for substitutes', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    fs.unlinkSync(path.join(rootBundle, 'index.md'));
    const similar = writeConcept(rootBundle, 'missing-near.md', 'type: Note', '# exact-missing-index-50\n');
    let indexChecked = false;

    const response = runRuntime(directRequest(root, 'read', 'missing'), {
      exists(file) {
        if (path.resolve(file) === path.resolve(path.join(rootBundle, 'index.md'))) indexChecked = true;
        return defaultServices.exists(file);
      },
    });

    assertNavigation(response);
    assert.equal(response.result, 'degraded');
    assert.equal(indexChecked, true);
    assertFinding(response, 'unreadable');
    assert.equal(response.findings.some((item) => item.detail && item.detail.reason === 'missing_index'), true);
    assert.equal(readRecord(response, 'missing-near.md'), undefined);
    assert.equal(JSON.stringify(response.data).includes(path.basename(similar.file)), false);
  });

  test('native search does not run when the admitted bundle envelope is unobservable', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const concept = writeConcept(rootBundle, 'scope.md', 'type: Note', '# scope-guard-50\n');
    let navigationPhase = false;
    let injected = false;
    let searched = false;

    const response = runRuntime(directRequest(root, 'search', 'scope-guard-50'), {
      realpath(file) {
        if (navigationPhase && path.resolve(file) === path.resolve(rootBundle)) {
          injected = true;
          throw new Error('scope unavailable');
        }
        return defaultServices.realpath(file);
      },
      // Navigation resolves the root again after admission checks that it is a file.
      isFile(file) {
        const value = defaultServices.isFile(file);
        if (path.resolve(file) === path.resolve(rootBundle)) navigationPhase = true;
        return value;
      },
      search() {
        searched = true;
        return [concept.file];
      },
    });

    assertNavigation(response);
    assert.equal(injected, true);
    assert.equal(searched, false);
    assert.equal(response.result, 'unavailable');
    assertFinding(response, 'unobservable');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assert.deepEqual(records(response, 'read'), []);
  });

  test('incomplete enumeration prevents a complete navigation coverage claim', (t) => {
    const root = repository(t);
    const rootBundle = bundle(root);
    const concept = writeConcept(rootBundle, 'partial-enumeration.md', 'type: Note', '# enumeration-50\n');

    const response = runRuntime(directRequest(root, 'search', 'enumeration-50'), {
      listFiles(scopeRoot) {
        return { ...defaultServices.listFiles(scopeRoot), complete: false };
      },
      search() {
        return [concept.file];
      },
    });

    assertNavigation(response);
    assert.equal(response.result, 'degraded');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assertFinding(response, 'unobservable');
    assert.ok(readRecord(response, 'partial-enumeration.md'));
  });

  test('explicit navigation without activation keeps the navigation data shape', (t) => {
    const root = repository(t, 'okf-50-no-marker-');
    fs.unlinkSync(path.join(root, '.okf-workspace.json'));

    for (const [operation, value] of [['read', 'missing'], ['search', 'missing-query']]) {
      const response = assertProcess(runWrapper(directRequest(root, operation, value)));
      assert.equal(response.result, 'not-configured');
      assertNavigation(response);
      assert.deepEqual(response.findings, []);
    }
  });

  test('invalid activation keeps navigation in the fixed result vocabulary', (t) => {
    const root = repository(t, 'okf-50-invalid-marker-');
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), 'invalid');

    const response = assertProcess(runWrapper(directRequest(root, 'read', 'missing')));
    assert.equal(response.result, 'unavailable');
    assertNavigation(response);
    assertFinding(response, 'unreadable');
  });
});

test.describe('deprecated-concept exclusion and index preservation in search', () => { // #51
  const { bundle, repository } = require('../../test-support/snapshot');

  function navigationRepository(t) {
    const root = repository(t, 'okf-51-');
    bundle(root);
    return root;
  }

  function writeConcept(root, relative, frontmatter, body) {
    const file = path.join(root, relative);
    fs.writeFileSync(file, `---\n${frontmatter}\n---\n${body}\n`);
    return file;
  }

  function searchRequest(root, query, extra = {}) {
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-read',
      operation: 'search',
      payload: {
        cwd: root,
        bundle: root,
        candidates: [{ path: '.', bundle: '.', declared: true, named_by_user: true }],
        query,
        ...extra,
      },
    };
  }

  test('search explicitly includes a deprecated concept with a warning and preserves the index', (t) => {
    const root = navigationRepository(t);
    const index = path.join(root, 'index.md');
    const deprecated = writeConcept(root, 'old.md', 'type: Note\nstatus: deprecated', '# Legacy');
    const before = fs.readFileSync(index);

    const response = runtime.run(
      'okf-read',
      searchRequest(root, 'legacy-query', { include_deprecated: true }),
      { ...defaultServices, search: () => [deprecated] },
    );

    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.read.map((record) => record.path), ['old.md']);
    assert.deepEqual(response.findings, [{
      code: 'unreadable',
      origin: 'suite',
      severity: 'warning',
      blocks: false,
      detail: { gate: 'navigation', path: 'old.md', reason: 'deprecated_concept' },
    }]);
    assert.deepEqual(fs.readFileSync(index), before);
  });

  test('ordinary search excludes observed deprecated concepts and preserves the index', (t) => {
    const root = navigationRepository(t);
    const index = path.join(root, 'index.md');
    const current = writeConcept(root, 'current.md', 'type: Note\nstatus: current', '# Current');
    const deprecated = writeConcept(root, 'old.md', 'type: Note\nstatus: deprecated', '# Legacy');
    const before = fs.readFileSync(index);

    const response = runtime.run(
      'okf-read',
      searchRequest(root, 'ordinary-query'),
      { ...defaultServices, search: () => [current, deprecated] },
    );

    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.read.map((record) => record.path), ['current.md']);
    assert.equal(response.findings.some((item) => item.detail && item.detail.reason === 'deprecated_concept'), false);
    assert.deepEqual(fs.readFileSync(index), before);
  });

  test('a deprecated-only query and non-literal opt-in exclude observed deprecated concepts', (t) => {
    const root = navigationRepository(t);
    const index = path.join(root, 'index.md');
    const deprecated = writeConcept(root, 'old.md', 'type: Note\nstatus: deprecated', '# Legacy');

    for (const payload of [{}, { include_deprecated: 'true' }]) {
      const before = fs.readFileSync(index);
      const response = runtime.run(
        'okf-read',
        searchRequest(root, 'deprecated', payload),
        { ...defaultServices, search: () => [deprecated] },
      );

      assert.equal(response.result, 'ok');
      assert.equal(response.data.match, 'no match in searched scope');
      assert.deepEqual(response.data.read, []);
      assert.equal(response.findings.some((item) => item.detail && item.detail.reason === 'deprecated_concept'), false);
      assert.deepEqual(fs.readFileSync(index), before);
    }
  });

  test('search with unobserved status is degraded and preserves the index', (t) => {
    const root = navigationRepository(t);
    const index = path.join(root, 'index.md');
    const concept = writeConcept(root, 'unknown.md', 'type: Note', '# Unknown');
    const before = fs.readFileSync(index);

    const response = runtime.run(
      'okf-read',
      searchRequest(root, 'unknown-query'),
      { ...defaultServices, search: () => [concept] },
    );

    assert.equal(response.result, 'degraded');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assert.equal(response.data.archive_predicate, 'unevaluated');
    assert.deepEqual(response.data.read.map((record) => record.path), ['unknown.md']);
    assert.deepEqual(fs.readFileSync(index), before);
  });
});

test.describe('inbound-link enumeration', () => { // #62
  const { binding, writeManifest } = require('../../test-support/snapshot');
  const readWrapper = path.join(scripts, 'okf-read.js');
  const routerWrapper = path.join(scripts, 'okf.js');
  const writeWrapper = path.join(scripts, 'okf-write.js');

  function bundle(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-62-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
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
    const source = '---\ntype: Note\n---\nSee [target](target.md).\n';
    fs.writeFileSync(path.join(root, 'source.md'), source);
    const before = snapshot(root);

    const response = enumerate(root);

    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.inbound_links, {
      complete: true,
      incomplete_reasons: [],
      links: [{
        carrier: 'markdown.inline',
        source: { bundle_alias: 'repo', path: 'source.md', byte_offset: source.indexOf('target.md') },
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
      bundles: [{ alias: 'main', owner: 'app', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }],
    }));
    fs.writeFileSync(path.join(root, 'target.md'), '---\ntype: Note\n---\n# Target\n');
    const source = `---
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
`;
    fs.writeFileSync(path.join(root, 'source.md'), source);

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
    const source = `---
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
`;
    fs.writeFileSync(path.join(root, 'source.md'), source);
    const offsets = [...source.matchAll(/target\.md/g)].map((match) => match.index);

    const response = enumerate(root);

    assert.equal(response.result, 'ok');
    assert.deepEqual(response.data.inbound_links.links.map((link) => ({ carrier: link.carrier, reference: link.reference, byte_offset: link.source.byte_offset })), [
      { carrier: 'frontmatter.resource', reference: 'target.md', byte_offset: offsets[0] },
      { carrier: 'frontmatter.sources[].resource', reference: 'target.md', byte_offset: offsets[2] },
      { carrier: 'frontmatter.executor.resource', reference: 'target.md', byte_offset: offsets[3] },
      { carrier: 'frontmatter.attester.resource', reference: 'target.md', byte_offset: offsets[5] },
    ]);
  });

  // #197: `enumerate` is not exempt from the activation gate the way `admit` is
  // (see `runtime.js`'s `activationBypassOperations` comment), so its admission
  // always resolves through the manifest -- an explicit `candidates` override
  // naming some other path is silently replaced by the manifest's own declared
  // bundle, same as any other gated operation. To reach "no admitted bundle"
  // here the manifest's own declared bundle must fail admission for real: reads
  // tolerate a missing `index.md` (PRESENCE allows it), so an ownerless bundle
  // (declared but trusted by nothing) is used instead -- it fails TRUST, the
  // same "no bundle could actually be examined" outcome the old, now-discarded
  // explicit candidate produced. Every declared bundle is required now (#197),
  // so a required-but-inactive bundle also makes `coverage` non-exhaustive,
  // which is its own additional, and accurate, `admission_incomplete` reason.
  test('enumerate reports incomplete discovery with no admitted bundle', (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-62-no-bundle-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [],
      bundles: [{ alias: 'repo', owner: null, root: '.', okf_version: '0.2', project_mode: 'knowledge-only' }],
    }));

    const response = enumerate(root, {});

    assert.equal(response.result, 'unavailable');
    assert.equal(response.data.coverage, 'non-exhaustive');
    assert.deepEqual(response.data.inbound_links, {
      complete: false,
      incomplete_reasons: ['no_admitted_bundle', 'admission_incomplete'],
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
        { alias: 'main', owner: 'app', root: '.', okf_version: '0.2', project_mode: 'knowledge-only' },
        { alias: 'inactive', owner: 'app', root: 'absent', okf_version: '0.2', project_mode: 'knowledge-only' },
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
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-62-outside-')));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.writeFileSync(path.join(outside, 'material.md'), '---\ntype: Note\n---\n# Elsewhere\n');
    fs.symlinkSync(path.join(outside, 'material.md'), path.join(root, 'unreadable.md'));

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
        task_kind: 'fix', concept: 'note.md', set: { title: 'Changed' }, evidence: [binding(root, 'evidence.md')], ...payload,
      });
      const label = JSON.stringify(payload);
      assert.equal(response.result, 'blocked', label);
      assert.equal(response.data.code, 'UNSUPPORTED_INPUT', label);
      assert.equal(snapshot(root), before, label);
    }
  });
});
