const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const wrapper = path.join(repo, 'scripts', 'okf-read.js');
assert.equal(typeof fs.symlinkSync, 'function', 'symlinkSync is required by issue 46 fixtures');

function temporaryRoot(prefix = 'okf-46-') {
  // A temporary directory may itself be a symlink on some platforms.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function repository(prefix) {
  const root = temporaryRoot(prefix);
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

function bundle(root, relative = '.') {
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'index.md'), '# Bundle\n');
  return target;
}

function runWrapper(value, cwd) {
  const run = cp.spawnSync(process.execPath, [wrapper], {
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
    cwd,
  });
  let response;
  try {
    response = run.stdout ? JSON.parse(run.stdout) : undefined;
  } catch {
    response = undefined;
  }
  return { stdout: run.stdout, stderr: run.stderr, status: run.status, response };
}

function request(cwd, candidates, workspaceRoot) {
  return {
    protocol: 'okf-wrapper/1',
    skill: 'okf-read',
    operation: 'admit',
    payload: {
      cwd,
      ...(workspaceRoot === undefined ? {} : { workspace_root: workspaceRoot }),
      candidates,
    },
  };
}

function candidate(entry, overrides = {}) {
  return { path: entry, ...overrides };
}

function onlyCandidate(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(result.response);
  assert.equal(result.response.data.candidates.length, 1);
  return result.response.data.candidates[0];
}

function assertReach(result, code) {
  const item = onlyCandidate(result);
  assert.equal(result.response.result, 'blocked');
  assert.equal(item.state, 'inactive');
  assert.equal(item.failed_gate, 'REACH');
  assert.equal(item.next_gate, null);
  assert.equal(item.findings[0].code, code);
  assert.equal(item.findings[0].detail.gate, 'REACH');
  return item.findings[0];
}

function assertPresence(result, code) {
  const item = onlyCandidate(result);
  assert.equal(result.response.result, 'blocked');
  assert.equal(item.failed_gate, 'PRESENCE');
  assert.equal(item.next_gate, null);
  assert.equal(item.findings[0].code, code);
  assert.equal(item.findings[0].detail.gate, 'PRESENCE');
  return item.findings[0];
}

test('reach refuses above-root, sibling, outside-workspace, symlink-escape, and no-workspace paths', () => {
  const root = repository('okf-46-reach-');
  bundle(root);
  const outside = temporaryRoot('okf-46-outside-');
  const cases = [
    {
      code: 'ABOVE_GIT_ROOT',
      request: request(root, [candidate('..')]),
      refused: path.dirname(root),
    },
    {
      code: 'SIDEWAYS_SIBLING',
      request: request(root, [candidate('sibling')], path.dirname(root)),
      refused: path.join(path.dirname(root), 'sibling'),
    },
    {
      code: 'OUTSIDE_WORKSPACE',
      request: request(root, [candidate('../outside-workspace')], root),
      refused: path.join(path.dirname(root), 'outside-workspace'),
    },
    {
      code: 'SYMLINK_ESCAPE',
      request: (() => {
        fs.symlinkSync(outside, path.join(root, 'escape'));
        return request(root, [candidate('escape')], root);
      })(),
      refused: path.join(root, 'escape'),
    },
    {
      code: 'CWD_NOT_A_WORKSPACE',
      request: request(outside, [candidate('.')]),
      refused: outside,
    },
  ];

  for (const item of cases) {
    const result = runWrapper(item.request);
    assertReach(result, item.code);
    assert.equal(result.stdout.includes(item.refused), false, item.code);
  }
});

test('named-by-user controls path disclosure in a reach refusal', () => {
  const root = repository('okf-46-disclosure-');
  const outside = path.join(path.dirname(root), 'unique-issue-46-sibling');
  const hidden = runWrapper(request(root, [candidate(outside)]));
  const hiddenFinding = assertReach(hidden, 'SIDEWAYS_SIBLING');
  assert.equal(hiddenFinding.detail.path, undefined);
  assert.equal(hidden.stdout.includes(outside), false);

  const visible = runWrapper(request(root, [candidate(outside, { named_by_user: true })]));
  const visibleFinding = assertReach(visible, 'SIDEWAYS_SIBLING');
  assert.equal(visibleFinding.detail.path, outside);
  assert.equal(visible.stdout.includes(outside), true);
});

test('only boolean true permits path disclosure in a reach refusal', () => {
  const root = repository('okf-46-disclosure-type-');
  const outside = path.join(path.dirname(root), 'unique-issue-46-typed-sibling');
  const result = runWrapper(request(root, [candidate(outside, { named_by_user: 'false' })]));
  const refusal = assertReach(result, 'SIDEWAYS_SIBLING');
  assert.equal(refusal.detail.path, undefined);
  assert.equal(result.stdout.includes(outside), false);
});

test('lexical reach refusals do not stat an out-of-scope candidate', () => {
  const root = repository('okf-46-nostat-');
  const danglingName = `${path.basename(root)}-dangling-outside`;
  const dangling = path.join(path.dirname(root), danglingName);
  fs.symlinkSync(path.join(path.dirname(root), 'does-not-exist'), dangling);
  const result = runWrapper(request(root, [candidate(`../${danglingName}`)], root));
  const finding = assertReach(result, 'OUTSIDE_WORKSPACE');
  assert.notEqual(finding.code, 'SYMLINK_UNRESOLVABLE');
  assert.equal(finding.detail.gate, 'REACH');
  assert.equal(result.response.data.candidates[0].findings.some((item) => item.detail.gate === 'PRESENCE'), false);

  const reach = require(path.join(repo, 'scripts', 'lib', 'reach.js'));
  const services = {
    exists: () => { throw new Error('exists called'); },
    realpath: () => { throw new Error('realpath called'); },
    gitRootOf: () => { throw new Error('gitRootOf called'); },
  };
  const base = { path: '/workspace/repo/candidate', declared: false, named_by_user: false };
  const lexical = [
    ['CWD_NOT_A_WORKSPACE', { gitRoot: null, workspaceRoot: null }],
    ['OUTSIDE_WORKSPACE', { gitRoot: '/workspace/repo', workspaceRoot: '/workspace' }, '/outside/candidate'],
    ['ABOVE_GIT_ROOT', { gitRoot: '/workspace/repo', workspaceRoot: null }, '/workspace'],
    ['SIDEWAYS_SIBLING', { gitRoot: '/workspace/repo', workspaceRoot: null }, '/workspace/sibling'],
  ];
  for (const [code, context, pathValue] of lexical) {
    const result = reach.evaluate({ ...base, path: pathValue || base.path }, context, services);
    assert.equal(result.passed, false, code);
    assert.equal(result.finding.code, code);
  }
});

test('symlink containment is recomputed, and dangling and cyclic links are reported', () => {
  const root = repository('okf-46-links-');
  bundle(root, 'inside');
  const target = temporaryRoot('okf-46-link-target-');
  bundle(target);
  const link = path.join(root, 'moving');
  fs.symlinkSync(path.join(root, 'inside'), link);
  const first = runWrapper(request(root, [candidate('moving')], root));
  assert.equal(onlyCandidate(first).failed_gate, null);

  fs.unlinkSync(link);
  fs.symlinkSync(target, link);
  const second = runWrapper(request(root, [candidate('moving')], root));
  assertReach(second, 'SYMLINK_ESCAPE');

  const dangling = path.join(root, 'dangling');
  fs.symlinkSync(path.join(root, 'missing-target'), dangling);
  const cycleA = path.join(root, 'cycle-a');
  const cycleB = path.join(root, 'cycle-b');
  fs.symlinkSync(cycleB, cycleA);
  fs.symlinkSync(cycleA, cycleB);
  for (const name of ['dangling', 'cycle-a']) {
    const result = runWrapper(request(root, [candidate(name)], root));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.ok(result.stdout);
    assert.ok(result.response);
    assert.notEqual(result.status, 70);
    assert.equal(result.response.data.candidates[0].failed_gate, 'REACH');
    assert.equal(result.response.data.candidates[0].findings[0].code, 'SYMLINK_UNRESOLVABLE');
  }
});

test('workspace root at filesystem root contains absolute candidates', () => {
  const root = repository('okf-46-filesystem-root-');
  bundle(root);
  const result = runWrapper(request(root, [candidate(root)], path.parse(root).root));
  const item = onlyCandidate(result);
  assert.equal(item.failed_gate, null);
  assert.equal(item.next_gate, 'TRUST');
});

test('presence accepts a child bundle below the filesystem root candidate', () => {
  const root = repository('okf-46-filesystem-root-child-');
  const child = path.join(root, 'declared-bundle');
  bundle(root, 'declared-bundle');
  const result = runWrapper(request(path.parse(root).root, [candidate(root, {
    declared: true,
    bundle: path.relative(root, child),
  })], path.parse(root).root));
  const item = onlyCandidate(result);
  assert.equal(item.failed_gate, null);
  assert.equal(item.next_gate, 'TRUST');
});

test('presence distinguishes declared missing, repository missing, bundle missing, and undeclared absence', () => {
  const root = repository('okf-46-presence-');
  bundle(root);
  const absentDeclared = runWrapper(request(root, [candidate('declared-missing', { declared: true })], root));
  assertPresence(absentDeclared, 'DECLARED_MISSING');

  const noRepo = path.join(root, 'no-repository');
  fs.mkdirSync(noRepo);
  const notRepository = runWrapper(request(root, [candidate('no-repository', { declared: true, requires_repository: true })], root));
  assertPresence(notRepository, 'NOT_A_REPOSITORY');

  const noBundle = path.join(root, 'no-bundle');
  fs.mkdirSync(noBundle);
  fs.mkdirSync(path.join(noBundle, '.git'));
  const missingBundle = runWrapper(request(root, [candidate('no-bundle', { declared: true, requires_repository: true })], root));
  assertPresence(missingBundle, 'BUNDLE_MISSING');

  const undeclared = runWrapper(request(root, [candidate('undeclared-missing', { requires_repository: true })], root));
  assertPresence(undeclared, 'BUNDLE_MISSING');
  assert.equal(undeclared.response.data.candidates[0].findings.some((item) => ['DECLARED_MISSING', 'NOT_A_REPOSITORY'].includes(item.code)), false);
});

test('presence rejects bundle paths outside the candidate, including symlinks', () => {
  const root = repository('okf-46-bundle-boundary-');
  bundle(root);
  const outside = temporaryRoot('okf-46-bundle-outside-');
  bundle(outside);
  const lexical = runWrapper(request(root, [candidate(root, { declared: true, bundle: `../${path.basename(outside)}` })], root));
  assertPresence(lexical, 'BUNDLE_MISSING');

  fs.symlinkSync(outside, path.join(root, 'linked-bundle'));
  const symlink = runWrapper(request(root, [candidate(root, { declared: true, bundle: 'linked-bundle' })], root));
  assertPresence(symlink, 'BUNDLE_MISSING');
});

test('topology handles monorepo siblings, submodules, and declared deeper roots', () => {
  const parent = repository('okf-46-topology-');
  const child = path.join(parent, 'child');
  const sibling = path.join(parent, 'sibling');
  fs.mkdirSync(child);
  fs.mkdirSync(sibling);
  fs.mkdirSync(path.join(child, '.git'));
  bundle(child);
  bundle(sibling);
  const monorepo = runWrapper(request(child, [candidate('child'), candidate('sibling')], parent));
  assert.equal(monorepo.status, 0);
  assert.equal(monorepo.response.data.candidates[0].failed_gate, null);
  assert.equal(monorepo.response.data.candidates[1].findings[0].code, 'SIDEWAYS_SIBLING');

  const submodule = path.join(parent, 'submodule');
  fs.mkdirSync(submodule);
  fs.mkdirSync(path.join(submodule, '.git'));
  bundle(submodule);
  const excluded = runWrapper(request(parent, [candidate('submodule')], parent));
  assertReach(excluded, 'SUBMODULE_EXCLUDED');
  const entered = runWrapper(request(submodule, [candidate('submodule')], parent));
  assert.equal(onlyCandidate(entered).failed_gate, null);

  const declared = runWrapper(request(parent, [candidate('submodule', { declared: true })], parent));
  const admitted = onlyCandidate(declared);
  assert.equal(admitted.failed_gate, null);
  assert.equal(admitted.findings.length, 1);
  assert.equal(admitted.findings[0].code, 'OVERLAPPING_CANONICAL_PATH');
  assert.equal(admitted.findings[0].origin, 'suite');
  assert.equal(admitted.findings[0].severity, 'warning');
  assert.equal(admitted.findings[0].blocks, false);
  assert.equal(admitted.findings[0].detail.gate, 'REACH');
  assert.equal(declared.response.result, 'ok');
  assert.equal(declared.stdout.includes(submodule), false);
});

test('a link inside the git root may not walk above it or sideways out of it', () => {
  const workspace = temporaryRoot('okf-46-link-topology-');
  const owner = path.join(workspace, 'repo-a');
  const neighbour = path.join(workspace, 'repo-b');
  for (const item of [owner, neighbour]) {
    fs.mkdirSync(path.join(item, '.git'), { recursive: true });
    bundle(item);
  }
  bundle(workspace, 'plain');
  fs.symlinkSync(path.join(workspace, 'plain'), path.join(owner, 'peek'));
  fs.symlinkSync(neighbour, path.join(owner, 'peek-repo'));
  fs.symlinkSync(workspace, path.join(owner, 'peek-up'));

  const cases = [
    ['repo-a/peek', 'SIDEWAYS_SIBLING'],
    ['repo-a/peek-repo', 'SIDEWAYS_SIBLING'],
    ['repo-a/peek-up', 'ABOVE_GIT_ROOT'],
  ];
  for (const [entry, code] of cases) {
    assertReach(runWrapper(request(owner, [candidate(entry)], workspace)), code);
  }
});

test('a declared candidate outside the git root is refused as outside the workspace', () => {
  const root = repository('okf-46-declared-outside-');
  bundle(root);
  const sibling = path.join(path.dirname(root), `${path.basename(root)}-declared-sibling`);
  bundle(sibling);
  const refusal = assertReach(
    runWrapper(request(root, [candidate(sibling, { declared: true, named_by_user: true })])),
    'OUTSIDE_WORKSPACE',
  );
  assert.equal(refusal.detail.path, sibling);

  // A declaration is explicit, so it walks sideways within a workspace root that holds it.
  const declared = runWrapper(request(root, [candidate(sibling, { declared: true })], path.dirname(root)));
  assert.equal(onlyCandidate(declared).failed_gate, null);
});

test('reach recomputes realpath containment on every call within one process', () => {
  const reach = require(path.join(repo, 'scripts', 'lib', 'reach.js'));
  const root = repository('okf-46-recompute-');
  bundle(root, 'inside');
  const outside = temporaryRoot('okf-46-recompute-outside-');
  const link = path.join(root, 'moving');
  fs.symlinkSync(path.join(root, 'inside'), link);
  const services = {
    exists: fs.existsSync,
    realpath: fs.realpathSync,
    isLink: (target) => {
      try {
        return fs.lstatSync(target).isSymbolicLink();
      } catch {
        return false;
      }
    },
    gitRootOf: (start) => {
      let current = start;
      while (!fs.existsSync(path.join(current, '.git'))) {
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
      }
      return current;
    },
  };
  const entry = { path: link, declared: false, named_by_user: false };
  const context = { cwd: root, gitRoot: root, workspaceRoot: root };
  assert.equal(reach.evaluate(entry, context, services).passed, true);

  fs.unlinkSync(link);
  fs.symlinkSync(outside, link);
  const second = reach.evaluate(entry, context, services);
  assert.equal(second.passed, false);
  assert.equal(second.finding.code, 'SYMLINK_ESCAPE');
});

test('an empty cwd or workspace root is invalid data, and a valid request ignores the process directory', () => {
  const root = repository('okf-46-process-cwd-');
  bundle(root);
  for (const empty of [{ cwd: '', workspace_root: root }, { cwd: root, workspace_root: '' }]) {
    const result = runWrapper({
      protocol: 'okf-wrapper/1',
      skill: 'okf-read',
      operation: 'admit',
      payload: { ...empty, candidates: [candidate('.')] },
    });
    assert.equal(result.status, 0);
    assert.equal(result.response.result, 'blocked');
    assert.equal(result.response.findings[0].code, 'INVALID');
    assert.deepEqual(result.response.data.candidates, []);
  }

  const payload = request(root, [candidate('.', { declared: true, requires_repository: true })], root);
  const fromRoot = runWrapper(payload, root);
  const fromElsewhere = runWrapper(payload, path.parse(root).root);
  assert.equal(onlyCandidate(fromRoot).next_gate, 'TRUST');
  assert.equal(fromRoot.stdout, fromElsewhere.stdout);
});

test('a candidate passing reach and presence waits at TRUST without blocking', () => {
  const root = repository('okf-46-success-');
  bundle(root);
  const result = runWrapper(request(root, [candidate('.', { declared: true, requires_repository: true })], root));
  const item = onlyCandidate(result);
  assert.equal(result.response.result, 'ok');
  assert.equal(item.failed_gate, null);
  assert.equal(item.next_gate, 'TRUST');
  assert.equal(item.state, 'inactive');
  assert.equal(item.findings.some((finding) => finding.blocks), false);
});
