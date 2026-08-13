// conformance/validation -- the validate verdict surface and the write-gate field
// checks that share its finding vocabulary. Merged from the per-issue files for
// #49 (validate reporting and v0.1 fallbacks), #51 (link verdicts), #78
// (pre-/post-write field gates) and #143 (the YAML 1.2 frontmatter subset).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assertEnvelope,
  binding,
  bundle,
  repository,
  runWrapper,
  treeHash,
  writeManifest,
} = require('../../test-support/snapshot');

const readWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-read.js');
const writeWrapper = path.join(__dirname, '..', '..', 'scripts', 'okf-write.js');

describe('validate reporting and fallbacks', () => {
  const fallbackPhrase = 'v0.1 consumed using v0.2 fallback';

  function rootFor(t, prefix = 'okf-49-') {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
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
    const processResult = cp.spawnSync(process.execPath, [readWrapper], {
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
    // #197: `validate` is not exempt from the activation gate the way `admit`
    // is, so its admission always resolves through the manifest -- the
    // manifest here must declare the symlinked path itself as the bundle root
    // rather than relying on `bundle` overriding an unrelated default.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-49-symlinked-bundle-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.okf-workspace.json'), JSON.stringify({
      schema_version: 1,
      workspace_id: '3f8c1b2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b',
      repositories: [{ name: 'repo', path: '.', local: true }],
      bundles: [{ alias: 'repo', owner: 'repo', root: 'linked-bundle', okf_version: '0.2', project_mode: 'knowledge-only' }],
    }));
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
      bundles: [{ alias: 'docs', owner: 'app', root: 'docs', okf_version: '0.2', project_mode: 'knowledge-only' }],
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

  // -------------------------------------------------------------- word count (#197)

  test('validate reports a substantive concept\'s word_count as continuous letter/number runs -- headings, frontmatter, table cells, and code count, Markdown marks do not -- and omits it for the generated connector file', (t) => {
    const root = rootFor(t);
    const content = [
      '---',
      'type: Note',
      '---',
      '# Heading one',
      '',
      'Some **bold** text.',
      '',
      '| A | B |',
      '|---|---|',
      '| x1 | two words |',
      '',
      '```',
      'code fence text',
      '```',
      '',
    ].join('\n');
    write(root, 'safe.md', content);
    fs.mkdirSync(path.join(root, 'agents'));
    write(root, path.join('agents', 'okf.md'), '---\ntitle: OKF agent connector\ntype: Playbook\n---\n# OKF agent connector\n\nSome prose that would inflate a count if it were reported.\n');

    const result = validateUnchanged(root);
    assert.equal(result.response.result, 'ok');
    // type, Note, Heading, one, Some, bold, text, A, B, x1, two, words, code, fence, text
    assert.equal(concept(result, 'safe.md').word_count, 15);
    assert.equal(Object.hasOwn(concept(result, 'agents/okf.md'), 'word_count'), false);
    // The count alone never produces a finding -- it is data, not a warning.
    assert.deepEqual(result.response.findings, []);
  });
});


describe('link verdicts', () => {
  function rootFor(t) {
    const root = repository(t, 'okf-51-links-');
    bundle(root);
    return root;
  }

  function write(root, name, content) {
    fs.writeFileSync(path.join(root, name), content);
  }

  function validate(root) {
    return run(root, 'validate', { bundle: root, today: '2026-08-04' });
  }

  function run(root, operation, payload) {
    const processResult = cp.spawnSync(process.execPath, [readWrapper], {
      input: JSON.stringify({
        protocol: 'okf-wrapper/1',
        skill: 'okf-read',
        operation,
        payload: { cwd: root, ...payload },
      }),
      encoding: 'utf8',
    });
    assert.equal(processResult.status, 0);
    assert.equal(processResult.stderr, '');
    return JSON.parse(processResult.stdout);
  }

  test('validate reports source-link verdicts from in-bundle target existence', (t) => {
    const root = rootFor(t);
    write(root, 'present.md', '---\ntype: Note\n---\n# Present\n');
    write(root, 'links.md', '---\ntype: Note\nsources:\n  - resource: present.md\n  - resource: missing.md\n---\n# Links\n');

    const result = validate(root);

    assert.deepEqual(result.data.link_verdicts, [
      { path: 'links.md', resource: 'present.md', verdict: 'resolves' },
      { path: 'links.md', resource: 'missing.md', verdict: 'unexpectedly-broken' },
    ]);
    assert.deepEqual(result.findings.find((finding) => finding.code === 'UNRESOLVED_INTERNAL_LINK'), {
      code: 'UNRESOLVED_INTERNAL_LINK',
      origin: 'okf',
      severity: 'warning',
      blocks: false,
      detail: { path: 'links.md', resource: 'missing.md' },
    });
  });

  test('validate reports a directory target as an unexpectedly broken link', (t) => {
    const root = rootFor(t);
    fs.mkdirSync(path.join(root, 'concepts'));
    write(root, 'links.md', '---\ntype: Note\nsources:\n  - resource: concepts\n---\n# Links\n');

    const result = validate(root);

    assert.deepEqual(result.data.link_verdicts, [
      { path: 'links.md', resource: 'concepts', verdict: 'unexpectedly-broken' },
    ]);
    assert.deepEqual(result.findings.find((finding) => finding.code === 'UNRESOLVED_INTERNAL_LINK'), {
      code: 'UNRESOLVED_INTERNAL_LINK',
      origin: 'okf',
      severity: 'warning',
      blocks: false,
      detail: { path: 'links.md', resource: 'concepts' },
    });
  });

  test('validate keeps Markdown-link verdicts independent of status and earlier navigation', (t) => {
    const root = rootFor(t);
    write(root, 'deprecated.md', '---\ntype: Note\nstatus: deprecated\n---\n# Deprecated\n');
    write(root, 'links.md', '---\ntype: Note\n---\n[Deprecated](deprecated.md)\n');

    const beforeNavigation = validate(root).data.link_verdicts;
    const read = run(root, 'read', {
      target: 'deprecated',
      bundle: root,
      candidates: [{ path: '.', bundle: '.', declared: true, named_by_user: true }],
    });
    const afterNavigation = validate(root).data.link_verdicts;

    assert.equal(read.operation, 'read');
    assert.equal(read.result, 'ok');
    assert.deepEqual(read.data.read.map((record) => record.path), ['deprecated.md']);
    assert.deepEqual(beforeNavigation, [
      { path: 'links.md', resource: 'deprecated.md', verdict: 'resolves' },
    ]);
    assert.deepEqual(afterNavigation, beforeNavigation);
  });
});


/*
Issue #94 (applying the issue #86 resolution to issue #78's fixtures) —
wrapper-seam fixtures for the twelve post-write validation checks
`validation.postWrite` runs against the primary saved concept after a
publish. Each fixture builds a bundle under the OS temp dir and drives
`scripts/okf-write.js` as a child process, asserting on the one JSON
response line — the same seam `test/write-gate.test.js` uses.

Check                       Finding code                  Pass observable                                     Fail observable
 1 bundle-root declaration   ROOT_DECLARATION_NOT_EXACT    selected manifest bundle's `okf_version` is "0.2"   none (unreachable, 4)
 2 project mode              PROJECT_MODE_INVALID          selected manifest bundle's `project_mode` is valid  none (unreachable, 4)
 3 concept re-read           FRONTMATTER_UNPARSEABLE       written concept re-parses                           none (unreachable, 1)
 4 written-tree compare      POST_WRITE_VALIDATION_FAILED  re-read tree equals the expected tree               none (unreachable, 1)
 5 reserved bundle files     BUNDLE_FILES_NONCONFORMING    every reserved file parses                          `blocked` (2)
 6 concept type              TYPE_MISSING                  concept carries a non-empty `type`                  `blocked` (2)
 7 sources                   SOURCE_RESOURCE_MISSING       every source names a resource                       `blocked` (2)
 8 generated                 GENERATED_BY_MISSING          every generated entry names a `by`                  `blocked` (2)
 9 runtime                   RUNTIME_MISSING               `Attested Computation` carries a `runtime`          `blocked` (2)
10 identity prefix           HUMAN_PREFIX_MISSING          `author` carries a human/agent/tool prefix          `blocked` (2)
11 links                     UNRESOLVED_INTERNAL_LINK      every reference resolves to an existing file        `applied` with a warning (3)
12 upstreams                 DEPENDS_ON_BLOCKED_CONCEPT    no source is a blocked concept                      `failed/incomplete`

The outer exception handler around `postWrite` is error containment, not a
thirteenth check: it has no pass observation, and no wrapper fixture forces
its fail observation through a normal request (that would be fault
injection, which issue #86 rules out).

The pass column is covered by one shared conformant fixture rather than one
fixture per check: that request drives every check's pass branch in a single
`applied` response, so per-check pass fixtures would only duplicate it.

Four facts limit the fail column, and each is a property of the runtime, not
of these fixtures:

 1. Checks 3 and 4 re-verify what the pre-write gate already proved with the
    same parser over the same bytes (`roundTripMismatch`), so no wrapper-level
    input reaches them failing. No fail fixture exists for them.
 2. Checks 5-10 also run in the pre-write gate, which returns `blocked` before
    the write happens. `postWrite` is therefore never entered for those inputs,
    and its copies of these checks are unreachable through the wrapper. The
    shared fixture below asserts what does happen — the pre-write block, with
    the check's own code and the concept untouched on disk.
 3. Check 11 reports a warning, not a blocker, so it cannot move the result off
    `applied`. A source that resolves to a directory takes this same branch:
    a directory is not an existing file for this check.
 4. Checks 1 and 2 (#197) read the selected manifest bundle record, resolved
    once before the write and reused unchanged for the post-write re-check —
    never the bundle root's own `index.md`, which a concept `revise` can reach
    but the manifest never can. The self-corrupting-write scenario these two
    checks existed to catch (a write whose own target is the check's source)
    is gone by construction, so like checks 3 and 4 they have no fail fixture;
    the file instead pins the decoupling itself (below).

Consequence: eleven of the twelve checks have no `failed/incomplete` observable
reachable from a normal wrapper request, so this file covers their reachable
observable instead — the pre-write `blocked` case for checks 5-10, no forced
fixture for checks 3, 4, 1, and 2, whose fail conditions stay documented
rather than fixture-forced, and a decoupling proof for checks 1 and 2 in place
of their retired fail fixture. This reflects the issue #86 resolution and
issue #197's write-gate relocation, not a renegotiated criterion.
*/
describe('pre- and post-write field gates', () => {
  function bundle(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-78-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
    fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
    fs.writeFileSync(path.join(root, 'good.md'), '---\ntype: Note\ntitle: Good\n---\n# Good\n');
    return root;
  }

  function request(root, { operation = 'revise', concept = 'note.md', set = { title: 'After' }, evidence } = {}) {
    const bindings = evidence === undefined ? [binding(root, 'evidence.md')] : evidence;
    return {
      protocol: 'okf-wrapper/1',
      skill: 'okf-write',
      operation,
      task_kind: 'fix',
      scope: { concepts: [concept] },
      payload: { cwd: root, bundle: root, concept, set, evidence: bindings },
    };
  }

  function run(value) {
    const result = cp.spawnSync(process.execPath, [writeWrapper], {
      input: JSON.stringify(value), encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const response = JSON.parse(result.stdout);
    assert.equal(result.stdout, `${JSON.stringify(response)}\n`);
    return response;
  }

  test('a fully conformant new concept passes every post-write check', (t) => {
    const root = bundle(t);
    const response = run(request(root, {
      operation: 'create',
      concept: 'child.md',
      set: {
        type: 'Attested Computation',
        runtime: 'node',
        sources: [{ resource: 'good.md' }],
        generated: [{ by: 'agent:tool' }],
        author: 'human:tester',
        confirmed: 'human:tester',
      },
    }));
    assert.equal(response.result, 'applied');
    assert.equal(response.data.validation, 'valid');
    assert.deepEqual(response.findings, []);
    assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Attested Computation/);
  });

  // #197: checks 1 and 2 read `okf_version`/`project_mode` off the selected
  // manifest bundle record now, never off the bundle root's own `index.md` --
  // the root is navigation only, and a concept write can never reach the
  // manifest. The two tests this replaced revised `index.md` itself to prove
  // `postWrite` catches a write that corrupts its own gate source; that
  // scenario is gone by construction (a `revise` targets one concept file, and
  // `index.md` is no longer that source), so both checks join checks 3/4 in
  // having no `failed/incomplete` observable reachable from a normal wrapper
  // request. This test instead pins the decoupling itself: corrupting
  // `index.md`'s frontmatter no longer affects any other concept's write gate.
  test('revising index.md itself no longer affects the write gate for other concepts', (t) => {
    const root = bundle(t);
    const corrupt = run(request(root, {
      concept: 'index.md',
      set: { type: 'Bundle', okf_version: '0.3', project_mode: 'both' },
    }));
    assert.equal(corrupt.result, 'applied');
    assert.match(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), /okf_version: "0.3"/);

    const stillGates = run(request(root, { concept: 'good.md', set: { title: 'After' } }));
    assert.equal(stillGates.result, 'applied');
    assert.equal(stillGates.findings.some((f) => f.code === 'ROOT_DECLARATION_NOT_EXACT' || f.code === 'PROJECT_MODE_INVALID'), false);
  });

  test('a created concept whose source is blocked reports incomplete after the write', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'blocked.md'), '---\ntitle: No type here\n---\n# Blocked\n');
    const response = run(request(root, {
      operation: 'create',
      concept: 'child.md',
      set: { type: 'Note', sources: [{ resource: 'blocked.md' }] },
    }));
    assert.equal(response.result, 'failed/incomplete');
    assert.equal(response.data.validation, 'failed');
    const finding = response.findings.find((f) => f.code === 'DEPENDS_ON_BLOCKED_CONCEPT');
    assert.ok(finding, 'expected DEPENDS_ON_BLOCKED_CONCEPT');
    assert.equal(finding.origin, 'suite');
    assert.deepEqual(finding.detail, { path: 'child.md', blocked_concept: 'blocked.md' });
    assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Note/);
  });

  test('an unresolved reference is reported as a warning and the write stays applied', (t) => {
    const root = bundle(t);
    const response = run(request(root, {
      operation: 'create',
      concept: 'child.md',
      set: { type: 'Note', sources: [{ resource: 'missing.md' }] },
    }));
    assert.equal(response.result, 'applied');
    assert.equal(response.data.validation, 'valid');
    const finding = response.findings.find((f) => f.code === 'UNRESOLVED_INTERNAL_LINK');
    assert.ok(finding, 'expected UNRESOLVED_INTERNAL_LINK');
    assert.equal(finding.origin, 'okf');
    assert.deepEqual(finding.detail, { path: 'child.md', resource: 'missing.md' });
    assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /resource: missing\.md/);
  });

  test('a source that resolves to a directory is reported as an unresolved link, not read', (t) => {
    const root = bundle(t);
    fs.mkdirSync(path.join(root, 'a-directory'));
    const response = run(request(root, {
      operation: 'create',
      concept: 'child.md',
      set: { type: 'Note', sources: [{ resource: 'a-directory' }] },
    }));
    assert.equal(response.result, 'applied');
    assert.equal(response.data.validation, 'valid');
    const finding = response.findings.find((f) => f.code === 'UNRESOLVED_INTERNAL_LINK');
    assert.ok(finding, 'expected UNRESOLVED_INTERNAL_LINK');
    assert.equal(finding.origin, 'okf');
    assert.deepEqual(finding.detail, { path: 'child.md', resource: 'a-directory' });
    assert.match(fs.readFileSync(path.join(root, 'child.md'), 'utf8'), /type: Note/);
  });

  // Each case below is blocked by the pre-write gate, which owns the same check.
  // The assertion is the gate's own finding code plus the concept untouched.
  function preWriteBlock(t, code, set) {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    const before = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
    const response = run(request(root, { set }));
    assert.equal(response.result, 'blocked');
    assert.equal(response.data.validation, 'not-run');
    const finding = response.findings.find((f) => f.code === code);
    assert.ok(finding, `expected ${code}`);
    assert.equal(finding.origin, 'okf');
    assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), before);
  }

  test('a reserved bundle file that fails to parse is reported by the pre-write gate', (t) => {
    const root = bundle(t);
    fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');
    fs.writeFileSync(path.join(root, 'log.md'), '---\ntype: Log\n');
    const before = fs.readFileSync(path.join(root, 'note.md'), 'utf8');
    const response = run(request(root));
    assert.equal(response.result, 'blocked');
    const finding = response.findings.find((f) => f.code === 'BUNDLE_FILES_NONCONFORMING');
    assert.ok(finding, 'expected BUNDLE_FILES_NONCONFORMING');
    assert.equal(finding.origin, 'okf');
    assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), before);
  });

  test('a blanked concept type is reported by the pre-write gate', (t) => {
    preWriteBlock(t, 'TYPE_MISSING', { type: '' });
  });

  test('a blanked source resource is reported by the pre-write gate', (t) => {
    preWriteBlock(t, 'SOURCE_RESOURCE_MISSING', { sources: [{ resource: '' }] });
  });

  test('a blanked generated-by is reported by the pre-write gate', (t) => {
    preWriteBlock(t, 'GENERATED_BY_MISSING', { generated: [{ by: '' }] });
  });

  test('a blanked attested-computation runtime is reported by the pre-write gate', (t) => {
    preWriteBlock(t, 'RUNTIME_MISSING', { type: 'Attested Computation', runtime: '' });
  });

  test('an author without a human/agent/tool prefix is reported by the pre-write gate', (t) => {
    preWriteBlock(t, 'HUMAN_PREFIX_MISSING', { author: 'bob' });
  });
});


/*
Issue #143 — widen the shared frontmatter reader (`parseYAML` in
`scripts/lib/validation.js`) to cover the YAML constructs OKF v0.2 concept
frontmatter genuinely uses, and to conservatively refuse every other
construct with a specific finding rather than silently parsing it into a
different meaning than a real YAML 1.2 parser would give it.

Every case below drives the one contract seam (`scripts/okf-write.js`'s
`revise` operation, reading an on-disk fixture written by hand as raw YAML
text) so the assertions observe the wrapper's behavior, not the shape of
`scripts/lib/validation.js`. A widened construct is proven by: the revise is
`applied` (which is only possible if the construct parsed and then
round-tripped through the write gate's `roundTripMismatch` check), and the
concept file on disk now shows the correctly-decoded, canonically
re-serialized value. A blocked construct is proven by: the revise is
`blocked` with a `FRONTMATTER_UNPARSEABLE` finding naming the construct, and
the concept file on disk is byte-identical to before the attempt.
*/
describe('YAML 1.2 frontmatter subset', () => {
  function makeBundle(t, conceptFrontmatter) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-143-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.git'));
    writeManifest(root, '.');
    fs.writeFileSync(path.join(root, 'index.md'), '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n');
    fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
    fs.writeFileSync(path.join(root, 'note.md'), conceptFrontmatter);
    return root;
  }

  function revise(root, set = { title: 'After' }) {
    return runWrapper(writeWrapper, {
      protocol: 'okf-wrapper/1',
      skill: 'okf-write',
      operation: 'revise',
      task_kind: 'fix',
      scope: { concepts: ['note.md'] },
      payload: { cwd: root, bundle: root, concept: 'note.md', set, evidence: [binding(root, 'evidence.md')] },
    });
  }

  function notePath(root) {
    return path.join(root, 'note.md');
  }

  // -------------------------------------------------------- widened constructs

  function widensTo(t, { given, becomes, set }) {
    const root = makeBundle(t, given);
    const response = revise(root, set);
    assert.equal(response.result, 'applied', JSON.stringify(response.findings));
    const written = fs.readFileSync(notePath(root), 'utf8');
    for (const fragment of becomes) assert.ok(written.includes(fragment), `expected ${JSON.stringify(fragment)} in:\n${written}`);
  }

  test('widen: YAML 1.2 core-schema capitalized booleans (True/TRUE/False/FALSE) resolve to real booleans', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nflag_a: True\nflag_b: TRUE\nflag_c: False\nflag_d: FALSE\n---\n# Note\n',
      becomes: ['flag_a: true', 'flag_b: true', 'flag_c: false', 'flag_d: false'],
    });
  });

  test('widen: YAML 1.2 core-schema capitalized nulls (Null/NULL) resolve to real null', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nfield_a: Null\nfield_b: NULL\n---\n# Note\n',
      becomes: ['field_a: null', 'field_b: null'],
    });
  });

  test('widen: a single-line flow sequence of scalars parses and canonicalizes to block form', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\ntags: [architecture, decision]\n---\n# Note\n',
      becomes: ['tags:\n  - architecture\n  - decision'],
    });
  });

  test('widen: an empty flow sequence and an empty flow mapping are recognized', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nempty_list: []\nempty_map: {}\n---\n# Note\n',
      becomes: ['empty_list: []', 'empty_map: {}'],
    });
  });

  test('widen: a flow sequence item that is itself a quoted string containing a comma is not mis-split', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\ntags: ["a,b", c]\n---\n# Note\n',
      becomes: ['tags:\n  - a,b\n  - c'],
    });
  });

  test('widen: double-quoted escape sequences \\t, \\r, and \\0 decode to their real control characters, not a mangled literal', (t) => {
    const root = makeBundle(t, '---\ntype: Note\nt_field: "a\\tb"\nr_field: "a\\rb"\nz_field: "a\\0b"\n---\n# Note\n');
    const response = revise(root);
    assert.equal(response.result, 'applied', JSON.stringify(response.findings));
    const written = fs.readFileSync(notePath(root), 'utf8');
    assert.ok(written.includes('a\tb'), 'tab must survive as a real tab byte, not the literal text "atb"');
    assert.ok(written.includes('a\rb'), 'CR must survive as a real CR byte, not the literal text "arb"');
    assert.ok(written.includes('a\0b'), 'NUL must survive as a real NUL byte, not the literal text "a0b"');
  });

  test('widen: double-quoted \\n forces re-quoting on write, and \\\\ / \\" decode to one real character each', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nnl_field: "before\\nafter"\nbs_field: "a\\\\b"\nqt_field: "say \\"hi\\""\n---\n# Note\n',
      becomes: ['nl_field: "before\\nafter"', 'bs_field: a\\b', 'qt_field: say "hi"'],
    });
  });

  test('widen: a single-quoted doubled quote decodes to one literal quote', (t) => {
    widensTo(t, {
      given: "---\ntype: Note\nphrase: 'it''s here'\n---\n# Note\n",
      becomes: ["phrase: it's here"],
    });
  });

  test('widen: a non-ASCII key and value survive a read-modify-write unchanged', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nключ: значение\n---\n# Note\n',
      becomes: ['ключ: значение'],
    });
  });

  test('widen: a sequence of mappings with more than one key per item (the sources[] shape) parses fully', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nsources:\n  - resource: a.md\n    id: x\n  - resource: b.md\n---\n# Note\n',
      becomes: ['sources:\n  - id: x\n    resource: a.md\n  - resource: b.md'],
    });
  });

  // ---------------------------------------------- already-correct, no change

  test('already correct: YAML 1.1 words yes/no/on/off stay plain strings under YAML 1.2, unchanged', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\na: yes\nb: no\nc: on\nd: off\n---\n# Note\n',
      becomes: ['a: yes', 'b: no', 'c: on', 'd: off'],
    });
  });

  test('already correct: a bare date and a sexagesimal-looking value stay plain strings under YAML 1.2, unchanged', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nd: 2021-01-01\ns: 1:30:00\n---\n# Note\n',
      becomes: ['d: 2021-01-01', 's: 1:30:00'],
    });
  });

  test('already correct: comments glued to a scalar with no leading space are not treated as comments', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\ncode: 5#not-a-comment\n---\n# Note\n',
      becomes: ['code: "5#not-a-comment"'],
    });
  });

  test('already correct: a comment after a quoted value containing a hash is stripped correctly', (t) => {
    widensTo(t, {
      given: '---\ntype: Note\nnote: "a # not a comment" # a real comment\n---\n# Note\n',
      becomes: ['note: "a # not a comment"'],
    });
  });

  // --------------------------------------------------------- blocked, loud

  function blocksWith(t, { given, code, reasonIncludes }) {
    const root = makeBundle(t, given);
    const before = fs.readFileSync(notePath(root));
    const response = revise(root);
    assert.equal(response.result, 'blocked');
    const finding = response.findings.find((item) => item.code === code);
    assert.ok(finding, `expected a ${code} finding, got ${JSON.stringify(response.findings)}`);
    assert.equal(finding.origin, 'okf');
    assert.equal(finding.severity, 'error');
    assert.equal(finding.blocks, true);
    assert.equal(finding.detail.path, 'note.md');
    assert.ok(
      finding.detail.reason.includes(reasonIncludes),
      `expected reason to include ${JSON.stringify(reasonIncludes)}, got ${JSON.stringify(finding.detail.reason)}`,
    );
    assert.deepEqual(fs.readFileSync(notePath(root)), before, 'a blocked construct must never reach disk');
    return finding;
  }

  test('block: a block scalar (|) is refused, not silently flattened', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nbody: |\n  line one\n  line two\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'block scalars are not supported',
    });
  });

  test('block: a folded block scalar (>) is refused, not silently flattened', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nbody: >\n  line one\n  line two\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'block scalars are not supported',
    });
  });

  test('block: a non-empty flow mapping is refused, not silently flattened', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nmeta: {a: 1}\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'flow mappings are not supported',
    });
  });

  test('block: a flow sequence containing a nested flow collection is refused, not silently truncated', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\ntags: [[a], b]\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'nested flow collection is not supported',
    });
  });

  test('block: an anchor is refused, not silently treated as a plain word', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nfield: &anchor value\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'unsupported construct',
    });
  });

  test('block: an alias is refused, not silently treated as a plain word', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nfield: *anchor\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'unsupported construct',
    });
  });

  test('block: an explicit tag is refused, not silently treated as a plain word', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nfield: !!str value\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'unsupported construct',
    });
  });

  test('block: a bare document-end marker ("...") inside frontmatter is refused by name', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\na: 1\n...\nb: 2\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'multi-document markers are not supported',
    });
  });

  test('block: nested sequences (a list of lists) are refused, not silently flattened', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nmatrix:\n  - - 1\n    - 2\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'nested sequences are not supported',
    });
  });

  test('block: duplicate keys are refused, not silently resolved to the last value', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\na: 1\na: 2\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: "duplicate key 'a'",
    });
  });

  test('block: a hex integer literal is refused, not silently kept as its literal text', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nn: 0x1A\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: "numeric literal '0x1A' is not supported",
    });
  });

  test('block: an octal integer literal is refused, not silently kept as its literal text', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nn: 0o17\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: "numeric literal '0o17' is not supported",
    });
  });

  test('block: a leading-zero decimal integer is refused rather than silently demoted to a string', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nn: 007\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: "numeric literal '007' cannot be represented exactly",
    });
  });

  test('block: an integer beyond safe precision is refused rather than silently truncated', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nn: 123456789012345678901234567890\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'cannot be represented exactly',
    });
  });

  test('block: an unsupported double-quoted escape sequence is refused, not silently stripped of its backslash', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nfield: "a\\x41b"\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: "unsupported escape sequence '\\x'",
    });
  });

  test('block: an unsupported unicode escape sequence is refused, not silently stripped of its backslash', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\nfield: "a\\u0041b"\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: "unsupported escape sequence '\\u'",
    });
  });

  test('block: an unterminated flow sequence is refused rather than silently absorbing the next line', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\ntags: [a, b\nother: value\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'flow sequence must open and close on the same line',
    });
  });

  test('block: a trailing comma in a flow sequence is refused rather than silently producing a null entry', (t) => {
    blocksWith(t, {
      given: '---\ntype: Note\ntags: [a, b,]\n---\n# Note\n',
      code: 'FRONTMATTER_UNPARSEABLE',
      reasonIncludes: 'flow sequence item is empty',
    });
  });
});
