const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const scripts = path.join(repo, 'scripts');
const wrapper = path.join(scripts, 'okf-read.js');
const runtime = require(path.join(scripts, 'lib', 'runtime'));
const defaultServices = require(path.join(scripts, 'lib', 'services'));

const dataKeys = ['coverage', 'found', 'match', 'read', 'scope'];
const resultLabels = new Set(['ok', 'degraded', 'not-configured', 'unavailable']);
const matchLabels = new Set(['found', 'no match in searched scope']);
const coverageLabels = new Set(['complete', 'non-exhaustive']);
const findingLabels = new Set(['missing', 'unreadable', 'unobservable', 'invalid']);
const retiredLabels = ['insufficient', 'CLIPPED', 'MISS', 'UNDISCOVERED', 'UNSEARCHED', 'FILTERED'];

function repository(t, prefix = 'okf-50-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
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
    { alias: 'first', owner: 'app', root: 'first', required: true, mode: 'source' },
    { alias: 'second', owner: 'app', root: 'second', required: true, mode: 'source' },
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

test('optional inactive bundles do not degrade an active read', (t) => {
  const root = repository(t);
  const live = bundle(root, 'live');
  const concept = writeConcept(live, 'note.md', 'type: Note', '# partial-admission-50\n');
  manifest(root, [
    { alias: 'live', owner: 'app', root: 'live', required: false, mode: 'source' },
    { alias: 'missing', owner: 'app', root: 'missing', required: false, mode: 'source' },
  ]);

  const response = runRuntime(request(root, 'read', 'note', { candidates: [] }));
  assertNavigation(response);
  assert.equal(response.result, 'ok');
  assert.equal(response.data.coverage, 'complete');
  assert.equal(readRecord(response, 'note.md').content, concept.content);
  assert.equal(response.findings.some((item) => item.code === 'unreadable'), false);
  assert.equal(response.findings.some((item) => item.code === 'BUNDLE_MISSING'), false);
});

test('navigation is unavailable with no active admitted bundle and exposes only fixed findings', (t) => {
  const root = repository(t);
  manifest(root, [{ alias: 'missing', owner: 'app', root: 'missing', required: true, mode: 'source' }]);

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
  fs.unlinkSync(path.join(root, '.okf-active'));

  for (const [operation, value] of [['read', 'missing'], ['search', 'missing-query']]) {
    const response = assertProcess(runWrapper(directRequest(root, operation, value)));
    assert.equal(response.result, 'not-configured');
    assertNavigation(response);
    assert.deepEqual(response.findings, []);
  }
});

test('invalid activation keeps navigation in the fixed result vocabulary', (t) => {
  const root = repository(t, 'okf-50-invalid-marker-');
  fs.writeFileSync(path.join(root, '.okf-active'), 'invalid');

  const response = assertProcess(runWrapper(directRequest(root, 'read', 'missing')));
  assert.equal(response.result, 'unavailable');
  assertNavigation(response);
  assertFinding(response, 'unreadable');
});
