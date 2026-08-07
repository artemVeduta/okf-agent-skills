const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, spawnWrapper, temporaryRoot } = require('../test-support/snapshot');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const routerWrapper = path.join(__dirname, '..', 'scripts', 'okf.js');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// `plan`/`aggregate` run without a valid `.okf-active` marker (like `inspect`/
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

function run(value) {
  return runWrapper(wrapper, value);
}

function dir(...segments) {
  const target = path.join(...segments);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
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
  ]));

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
      { alias: 'bar', owner: path.basename(root), root: 'packages/bar/okf', required: true, mode: 'source' },
      { alias: 'foo', owner: path.basename(root), root: 'packages/foo/okf', required: true, mode: 'source' },
    ],
  );

  // The generated manifest is not written by `aggregate`; it validates and is
  // persisted only through `repair`'s existing hand-authored-manifest path.
  assert.equal(fs.existsSync(path.join(root, '.okf-workspace.json')), false);
  const repaired = run(repairRequest(root, ['manifest'], { manifest }));
  assert.equal(repaired.result, 'applied');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.okf-workspace.json'), 'utf8')), manifest);
});

test('aggregate reports "partial" and names the failed package and its reason, never silently dropping it', (t) => {
  const root = twoPackageWorkspace(t);
  const response = run(aggregateRequest(root, [
    { package: 'foo', status: 'ok' },
    { package: 'bar', status: 'failed', reason: 'evidence file missing' },
  ]));

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
  ]));
  const foo = response.data.packages.find((p) => p.package === 'foo');
  assert.deepEqual(foo.warnings, ['duplicate concept candidate']);
});

test('aggregate keeps a salvaged workspace_id when the caller supplies one', (t) => {
  const root = twoPackageWorkspace(t);
  const workspaceId = '77777777-7777-4777-8777-777777777777';
  const response = run(aggregateRequest(root, [
    { package: 'foo', status: 'ok' },
    { package: 'bar', status: 'ok' },
  ], { workspace_id: workspaceId }));
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
