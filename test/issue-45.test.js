const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const Module = require('node:module');

const repo = path.resolve(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures');
const wrapper = path.join(repo, 'scripts', 'okf-write.js');
const validation = require(path.join(repo, 'scripts', 'lib', 'validation.js'));

const responseKeys = ['protocol', 'skill', 'operation', 'result', 'scope', 'evidence_limits', 'data', 'findings', 'next_action'];

function copyBundle() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-45-'));
  fs.cpSync(path.join(fixtures, 'base'), target, { recursive: true });
  fs.mkdirSync(path.join(target, '.git'));
  fs.writeFileSync(path.join(target, '.okf-active'), '');
  return target;
}

function replaceRoot(bundle, fixture) {
  fs.copyFileSync(path.join(fixtures, 'roots', fixture), path.join(bundle, 'index.md'));
}

function request(bundle, concept = 'concept.md', set = { title: 'Changed title' }, extra = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-write',
    operation: 'revise',
    payload: { bundle, concept, set, cwd: bundle, ...extra.payload },
    ...extra,
  };
}

function runWrapper(value) {
  const run = cp.spawnSync(process.execPath, [wrapper], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
  });
  let response;
  try {
    response = run.stdout ? JSON.parse(run.stdout) : undefined;
  } catch (error) {
    response = undefined;
  }
  return { stdout: run.stdout, stderr: run.stderr, status: run.status, response };
}

function finding(response, code) {
  return (response && response.findings || []).find((item) => item.code === code);
}

// Parses the frontmatter of a written file back into a tree, so assertions can be made
// about key names, scalar types and values, sequence order and mapping structure only.
function treeOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  return validation.parseYAML(lines.slice(1, end).join('\n'));
}

function writeConcept(bundle, name, frontmatter, body = '# Concept\n') {
  fs.writeFileSync(path.join(bundle, name), `---\n${frontmatter}\n---\n${body}`);
}

function assertRootBlocked(result, observed, type) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.response.result, 'blocked');
  assert.deepEqual(result.response.findings, [
    {
      code: 'ROOT_DECLARATION_NOT_EXACT',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { observed, observed_type: type },
    },
  ]);
}

test('root declaration gate blocks four non-exact roots and permits the exact string', () => {
  const cases = [
    ['undeclared-index.md', null, 'absent'],
    ['old-index.md', '0.1', 'string'],
    ['future-index.md', '9.9', 'string'],
    ['number-index.md', 0.2, 'number'],
  ];
  for (const [fixture, observed, type] of cases) {
    const bundle = copyBundle();
    replaceRoot(bundle, fixture);
    const before = fs.readFileSync(path.join(bundle, 'concept.md'));
    assertRootBlocked(runWrapper(request(bundle)), observed, type);
    assert.deepEqual(fs.readFileSync(path.join(bundle, 'concept.md')), before);
  }

  const bundle = copyBundle();
  const result = runWrapper(request(bundle));
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.response.result, 'ok');
  assert.equal(result.response.data.written, true);
});

test('a CRLF root that declares the exact string is not reported as absent', () => {
  const bundle = copyBundle();
  fs.writeFileSync(path.join(bundle, 'index.md'), '---\r\nokf_version: "0.2"\r\n---\r\n# Root\r\n');
  const result = runWrapper(request(bundle));
  assert.equal(result.response.result, 'ok');
  assert.equal(finding(result.response, 'ROOT_DECLARATION_NOT_EXACT'), undefined);
});

test('root gate cannot be overridden by settings or a payload force flag', () => {
  const plainBundle = copyBundle();
  replaceRoot(plainBundle, 'old-index.md');
  const settingsBundle = copyBundle();
  replaceRoot(settingsBundle, 'old-index.md');
  const payloadBundle = copyBundle();
  replaceRoot(payloadBundle, 'old-index.md');
  const plain = runWrapper(request(plainBundle));
  const settings = runWrapper(request(settingsBundle, 'concept.md', { title: 'Changed title' }, { settings: { force: true } }));
  const payload = runWrapper(request(payloadBundle, 'concept.md', { title: 'Changed title', force: true }));
  assert.equal(settings.stdout, plain.stdout);
  assert.equal(payload.stdout, plain.stdout);
  assert.equal(fs.readFileSync(path.join(settingsBundle, 'concept.md'), 'utf8'), fs.readFileSync(path.join(plainBundle, 'concept.md'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(payloadBundle, 'concept.md'), 'utf8'), fs.readFileSync(path.join(plainBundle, 'concept.md'), 'utf8'));
});

test('unknown third-party frontmatter survives a real mutation as an equal parse tree', () => {
  const bundle = copyBundle();
  const result = runWrapper(request(bundle));
  assert.equal(result.response.result, 'ok');
  assert.deepEqual(treeOf(path.join(bundle, 'concept.md')), {
    type: 'Note',
    title: 'Changed title',
    verified: ['human: reviewer'],
    third_party: {
      string: 'hello',
      integer: 7,
      float: 3.14,
      boolean: true,
      null_value: null,
      url: 'https://example.com/#top',
      empty_list: [],
      empty_map: {},
      nested: { answer: 42 },
      sequence: ['first', 'second'],
      mapping_sequence: [{ name: 'alpha', value: 1 }, { name: 'beta', value: false }],
    },
  });
  // Comments, mapping order, quote style, and scalar spelling are deliberately not asserted.
});

test('reading does not coerce scalars or cut a value at an inline hash', () => {
  const bundle = copyBundle();
  writeConcept(bundle, 'concept.md', [
    'type: Note',
    'url: https://example.com/#top',
    'padded: 007',
    'scaled: 0.20',
    'huge: 12345678901234567890',
    'quoted: "#ff0000"',
    'commented: value # a comment',
  ].join('\n'));
  const result = runWrapper(request(bundle, 'concept.md', {}));
  assert.equal(result.response.result, 'ok');
  assert.equal(result.response.data.written, true);
  assert.deepEqual(treeOf(path.join(bundle, 'concept.md')), {
    type: 'Note',
    url: 'https://example.com/#top',
    padded: '007',
    scaled: '0.20',
    huge: '12345678901234567890',
    quoted: '#ff0000',
    commented: 'value',
  });
});

test('a quoted scalar containing a quote survives the round trip', () => {
  const bundle = copyBundle();
  const result = runWrapper(request(bundle, 'concept.md', { title: 'a "quoted" \\ backslash' }));
  assert.equal(result.response.result, 'ok');
  assert.equal(treeOf(path.join(bundle, 'concept.md')).title, 'a "quoted" \\ backslash');
});

test('lossy serialization is blocked before write', () => {
  const bundle = copyBundle();
  const conceptPath = path.join(bundle, 'concept.md');
  const before = fs.readFileSync(conceptPath);
  let writes = 0;
  const services = {
    readFile: (file) => fs.readFileSync(file, 'utf8'),
    exists: fs.existsSync,
    writeFile: () => { writes += 1; },
    serializeFrontmatter: () => '---\ntype: Note\ntitle: Changed title\n---\n',
  };
  const result = validation.evaluate(request(bundle), services);
  assert.equal(result.result, 'blocked');
  assert.equal(writes, 0);
  assert.deepEqual(fs.readFileSync(conceptPath), before);
  assert.equal(finding(result, 'PARSE_TREE_MISMATCH').detail.construct, 'third_party');
  // The caller's services record is not mutated with defaults.
  assert.deepEqual(Object.keys(services), ['readFile', 'exists', 'writeFile', 'serializeFrontmatter']);
});

test('semantic no-op writes no bytes and real mutation preserves the body', () => {
  const bundle = copyBundle();
  const conceptPath = path.join(bundle, 'concept.md');
  const before = fs.readFileSync(conceptPath);
  const noOp = runWrapper(request(bundle, 'concept.md', { title: 'Original title' }));
  assert.equal(noOp.response.result, 'ok');
  assert.equal(noOp.response.data.written, false);
  assert.deepEqual(fs.readFileSync(conceptPath), before);

  const body = before.toString().match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1];
  const changed = runWrapper(request(bundle));
  assert.equal(changed.response.data.written, true);
  const afterBody = fs.readFileSync(conceptPath, 'utf8').match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1];
  assert.equal(afterBody, body);
});

test('verified is read bare or as a list and always written as a list', () => {
  for (const stored of ['verified: "human: reviewer"', 'verified:\n  - "human: reviewer"']) {
    const bundle = copyBundle();
    writeConcept(bundle, 'concept.md', `type: Note\n${stored}`);
    const result = runWrapper(request(bundle, 'concept.md', { verified: 'human: other' }));
    assert.equal(result.response.result, 'ok');
    assert.equal(result.response.data.written, true);
    assert.deepEqual(treeOf(path.join(bundle, 'concept.md')).verified, ['human: other']);
  }

  const bundle = copyBundle();
  writeConcept(bundle, 'concept.md', 'type: Note\nverified: "human: reviewer"');
  const listInput = runWrapper(request(bundle, 'concept.md', { verified: ['human: other'] }));
  assert.equal(listInput.response.result, 'ok');
  assert.deepEqual(treeOf(path.join(bundle, 'concept.md')).verified, ['human: other']);
});

test('section, producer, and parse-tree blockers propagate only to derivatives', () => {
  const cases = [
    {
      mutate: (bundle) => writeConcept(bundle, 'concept.md', 'type: Note\n: bad', 'body\n'),
      set: { title: 'Changed title' },
      code: 'FRONTMATTER_UNPARSEABLE',
      // A stored concept that cannot be read is blocked for every dependant.
      propagates: true,
    },
    {
      mutate: (bundle) => fs.copyFileSync(path.join(fixtures, 'obligations', 'source-resource.md'), path.join(bundle, 'concept.md')),
      set: { title: 'Changed title' },
      code: 'SOURCE_RESOURCE_MISSING',
      propagates: true,
    },
    {
      // A parse-tree mismatch is a property of the tree being written, not of the stored
      // file: a stored concept the reader accepts always survives the canonical writer.
      // It therefore blocks the affected concept only.
      mutate: () => {},
      set: { title: 'Changed title', huge: 1e21 },
      code: 'PARSE_TREE_MISMATCH',
      propagates: false,
    },
  ];

  for (const { mutate, set, code, propagates } of cases) {
    const bundle = copyBundle();
    mutate(bundle);
    const before = fs.readFileSync(path.join(bundle, 'concept.md'));
    const blocked = runWrapper(request(bundle, 'concept.md', set));
    assert.equal(blocked.response.result, 'blocked');
    assert.ok(finding(blocked.response, code), code);
    assert.deepEqual(fs.readFileSync(path.join(bundle, 'concept.md')), before);

    const derivative = runWrapper(request(bundle, 'derivative.md'));
    if (propagates) {
      assert.equal(derivative.response.result, 'blocked');
      assert.deepEqual(finding(derivative.response, 'DEPENDS_ON_BLOCKED_CONCEPT').detail, {
        path: 'derivative.md',
        blocked_concept: 'concept.md',
      });
    } else {
      assert.equal(derivative.response.result, 'ok');
    }

    const independent = runWrapper(request(bundle, 'independent.md'));
    assert.equal(independent.response.result, 'ok');
    assert.deepEqual(independent.response.findings, []);
  }
});

test('an unparseable frontmatter finding reports the file-relative line', () => {
  const bundle = copyBundle();
  writeConcept(bundle, 'concept.md', 'type: Note\n: bad', 'body\n');
  const result = runWrapper(request(bundle));
  assert.deepEqual(finding(result.response, 'FRONTMATTER_UNPARSEABLE').detail, {
    path: 'concept.md',
    line: 3,
    reason: 'empty key',
  });
});

test('an upstream SHOULD violation is reported without blocking the downstream', () => {
  const bundle = copyBundle();
  const result = runWrapper(request(bundle, 'downstream.md'));
  assert.equal(result.response.result, 'ok');
  assert.equal(result.response.data.written, true);
  const warning = finding(result.response, 'UNRESOLVED_INTERNAL_LINK');
  assert.deepEqual(warning, {
    code: 'UNRESOLVED_INTERNAL_LINK',
    origin: 'okf',
    severity: 'warning',
    blocks: false,
    detail: { path: 'should.md', resource: 'missing-resource.md' },
  });
});

test('each producer obligation has its own blocking code', () => {
  const cases = [
    ['source-resource.md', 'SOURCE_RESOURCE_MISSING'],
    ['generated-by.md', 'GENERATED_BY_MISSING'],
    ['runtime.md', 'RUNTIME_MISSING'],
    ['human-prefix.md', 'HUMAN_PREFIX_MISSING'],
  ];
  for (const [fixture, code] of cases) {
    const bundle = copyBundle();
    fs.copyFileSync(path.join(fixtures, 'obligations', fixture), path.join(bundle, 'concept.md'));
    const result = runWrapper(request(bundle));
    assert.equal(result.response.result, 'blocked');
    assert.ok(finding(result.response, code), code);
  }
});

test('the human prefix is required of human actors and not of recognized agents', () => {
  const bundle = copyBundle();
  writeConcept(bundle, 'concept.md', 'type: Note\nauthor: "agent:okf-writer"\nconfirmed: "human: reviewer"');
  const allowed = runWrapper(request(bundle));
  assert.equal(allowed.response.result, 'ok');

  writeConcept(bundle, 'concept.md', 'type: Note\nconfirmed: nobody');
  const blocked = runWrapper(request(bundle));
  assert.equal(blocked.response.result, 'blocked');
  assert.deepEqual(finding(blocked.response, 'HUMAN_PREFIX_MISSING').detail, {
    path: 'concept.md',
    field: 'confirmed',
    value: 'nobody',
  });

  // The rule is scoped to author and confirmed; verified is not an actor field.
  writeConcept(bundle, 'concept.md', 'type: Note\nverified: no-prefix');
  assert.equal(runWrapper(request(bundle)).response.result, 'ok');

  // A falsy but present runtime or type is not a missing one.
  writeConcept(bundle, 'concept.md', 'type: Attested Computation\nruntime: false');
  assert.equal(runWrapper(request(bundle)).response.result, 'ok');
});

test('a set payload cannot bypass the concept rules', () => {
  const bundle = copyBundle();
  const conceptPath = path.join(bundle, 'concept.md');
  const before = fs.readFileSync(conceptPath);
  const result = runWrapper(request(bundle, 'concept.md', {
    sources: [{ title: 'no resource' }],
    type: 'Attested Computation',
    author: 'nobody',
  }));
  assert.equal(result.response.result, 'blocked');
  for (const code of ['SOURCE_RESOURCE_MISSING', 'RUNTIME_MISSING', 'HUMAN_PREFIX_MISSING']) {
    assert.ok(finding(result.response, code), code);
  }
  assert.deepEqual(fs.readFileSync(conceptPath), before);

  const cleared = runWrapper(request(bundle, 'concept.md', { type: '' }));
  assert.equal(cleared.response.result, 'blocked');
  assert.ok(finding(cleared.response, 'TYPE_MISSING'));
});

test('a concept path outside the bundle root is refused', () => {
  const bundle = copyBundle();
  const victimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-45-victim-'));
  const victim = path.join(victimDir, 'victim.md');
  fs.writeFileSync(victim, '---\ntype: Note\n---\n# Victim\n');
  const before = fs.readFileSync(victim);
  const escape = path.relative(bundle, victim);
  const result = runWrapper(request(bundle, escape));
  assert.equal(result.status, 0);
  assert.equal(result.response.result, 'blocked');
  assert.deepEqual(finding(result.response, 'CONCEPT_OUTSIDE_BUNDLE').detail, { path: escape });
  assert.deepEqual(fs.readFileSync(victim), before);
});

test('a present but unparseable index.md or log.md blocks the write', () => {
  for (const name of ['index.md', 'log.md']) {
    const bundle = copyBundle();
    const conceptPath = path.join(bundle, 'concept.md');
    const before = fs.readFileSync(conceptPath);
    fs.writeFileSync(path.join(bundle, name), '---\nokf_version: "0.2"\n: bad\n---\n# Broken\n');
    const result = runWrapper(request(bundle));
    assert.equal(result.response.result, 'blocked');
    if (name === 'log.md') {
      assert.deepEqual(finding(result.response, 'BUNDLE_FILES_NONCONFORMING').detail, {
        file: 'log.md',
        line: 3,
        reason: 'empty key',
      });
    } else {
      // An unparseable root cannot declare the version, so the root gate fires first.
      assert.ok(finding(result.response, 'ROOT_DECLARATION_NOT_EXACT'));
    }
    assert.deepEqual(fs.readFileSync(conceptPath), before);
  }
});

test('an empty sequence entry does not fail the run', () => {
  const bundle = copyBundle();
  writeConcept(bundle, 'concept.md', 'type: Note\nsources:\n  - ');
  const result = runWrapper(request(bundle));
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.response.result, 'ok');
  assert.deepEqual(treeOf(path.join(bundle, 'concept.md')).sources, [null]);
});

test('four-space indentation is read rather than rejected', () => {
  const bundle = copyBundle();
  writeConcept(bundle, 'concept.md', 'type: Note\nnested:\n    answer: 42\nsources:\n- resource: upstream.md');
  const result = runWrapper(request(bundle, 'concept.md', {}));
  assert.equal(result.response.result, 'ok');
  const tree = treeOf(path.join(bundle, 'concept.md'));
  assert.deepEqual(tree.nested, { answer: 42 });
  assert.deepEqual(tree.sources, [{ resource: 'upstream.md' }]);
});

test('constructs the reader does not support are parse failures, not silent losses', () => {
  const cases = [
    ['a:b: 1', 'a colon inside a key requires quoting'],
    ['tabbed:\n\tvalue: 1', 'tab indentation is not supported'],
    ['block: |\n  text', 'block scalars are not supported'],
    ['unbalanced: "open', 'unterminated quoted scalar'],
    ['dup:\n  - key: 1\n    key: 2', "duplicate key 'key'"],
  ];
  for (const [frontmatter, reason] of cases) {
    const bundle = copyBundle();
    writeConcept(bundle, 'concept.md', `type: Note\n${frontmatter}`);
    const result = runWrapper(request(bundle));
    assert.equal(result.response.result, 'blocked', frontmatter);
    assert.equal(finding(result.response, 'FRONTMATTER_UNPARSEABLE').detail.reason, reason);
  }
});

test('an unterminated frontmatter block is a parse failure, not an absent one', () => {
  const bundle = copyBundle();
  fs.writeFileSync(path.join(bundle, 'concept.md'), '---\ntype: Note\n# no closing delimiter\n');
  const result = runWrapper(request(bundle));
  assert.equal(result.response.result, 'blocked');
  assert.equal(finding(result.response, 'FRONTMATTER_UNPARSEABLE').detail.reason, 'unterminated frontmatter block');
});

test('unsupported operations are valid blocked responses', () => {
  const bundle = copyBundle();
  const result = runWrapper({ protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'delete', payload: { cwd: bundle } });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.response.result, 'blocked');
  assert.equal(result.response.data.code, 'UNKNOWN_OPERATION');
});

test('malformed JSON and unknown request fields are rejected at the wrapper boundary', () => {
  const cases = [
    '{',
    '[]',
    JSON.stringify({ protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', payload: {}, extra: true }),
    JSON.stringify({ protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', payload: { concept: 'concept.md' } }),
    JSON.stringify({ protocol: 'okf-wrapper/1', skill: 'okf-write', operation: 'revise', payload: { bundle: '/tmp' } }),
  ];
  for (const input of cases) {
    const result = runWrapper(input);
    assert.equal(result.status, 64, input);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.length > 0 && !result.stderr.includes(' at '));
  }
});

test('an internal failure exits 70 with a complete response', () => {
  const bundle = copyBundle();
  fs.mkdirSync(path.join(bundle, 'directory.md'));
  const result = runWrapper(request(bundle, 'directory.md'));
  assert.equal(result.status, 70);
  assert.deepEqual(Object.keys(result.response), responseKeys);
  assert.equal(result.response.result, 'failed/incomplete');
  assert.equal(result.response.data.code, 'RUNTIME_FAILURE');
  assert.deepEqual(result.response.findings, []);
  assert.equal(result.response.next_action, null);
});

test('stdout carries exactly one newline-terminated JSON object in declared key order', () => {
  const bundle = copyBundle();
  const large = runWrapper(request(bundle, 'concept.md', {
    sources: Array.from({ length: 4000 }, () => ({ title: 'no resource' })),
  }));
  assert.equal(large.status, 0);
  assert.equal(large.stderr, '');
  assert.ok(large.stdout.length > 100000);
  assert.equal(large.stdout.split('\n').length, 2);
  assert.equal(large.stdout.endsWith('\n'), true);
  assert.deepEqual(Object.keys(JSON.parse(large.stdout)), responseKeys);
  assert.equal(large.response.findings.length, 4000);

  const ok = runWrapper(request(bundle));
  assert.equal(ok.stderr, '');
  assert.equal(ok.stdout.split('\n').length, 2);
  assert.deepEqual(Object.keys(ok.response), responseKeys);
});

test('the identical request against identical state produces byte-identical responses', () => {
  const bundle = copyBundle();
  const conceptPath = path.join(bundle, 'concept.md');
  const before = fs.readFileSync(conceptPath);
  const payload = request(bundle);
  const first = runWrapper(payload);
  fs.writeFileSync(conceptPath, before);
  const second = runWrapper(payload);
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(first.stdout, second.stdout);
});

test('the repository has no dependency manifest and scripts use only built-ins or relatives', () => {
  assert.equal(fs.existsSync(path.join(repo, 'package.json')), false);
  const scripts = path.join(repo, 'scripts');
  assert.equal(fs.existsSync(scripts), true);
  assert.deepEqual(fs.readdirSync(path.join(scripts, 'lib')).sort(), [
    'admission.js', 'manifest.js', 'presence.js', 'protocol.js', 'reach.js', 'routing.js',
    'runtime.js', 'services.js', 'trust.js', 'validation.js',
  ]);

  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  }
  visit(scripts);
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const name = match[1].replace(/^node:/, '');
      assert.ok(name.startsWith('.') || Module.builtinModules.includes(name), `${file}: ${name}`);
    }
  }
});
