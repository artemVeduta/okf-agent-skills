/**
 * PROTOTYPE — the fake filesystem the resolver reads.
 *
 * Eight fixtures: the six topology patterns of docs/research/workspace-topology-and-routing.md §3
 * and both Tilt walkthroughs of §8. Replaced by the real filesystem reader; nothing here is
 * worth keeping. Every mutator returns a new Fs — no in-place edits, so the resolver stays pure.
 */

import type { Fs, Node } from './discovery.ts';

export interface Fixture {
  key: string;
  name: string;
  note: string;
  fs: Fs;
  /** Interesting working directories, cycled with n/p. */
  cwds: string[];
  /** The federation root a user would select with `b`. */
  federationRoot: string;
  /** Paths worth adjudicating one at a time with `x`. */
  namedPaths: string[];
}

const R = (path: string, repo: string, extra: Partial<Node> = {}): Node => ({
  path,
  repo,
  head: 'HEAD0',
  content: 'c0',
  ...extra,
});

// --- 1. Monorepo with root knowledge + child projects (§3.1) ----------------

const monorepo: Fixture = {
  key: '1',
  name: 'Pattern 1 — monorepo with root knowledge + child projects',
  note: 'root bundle + declared member bundles; one bundle sits in a NON-member directory',
  federationRoot: '/home/dev/acme-platform',
  fs: {
    manifestAt: null,
    manifest: null,
    nodes: [
      R('/home/dev/acme-platform', 'R-acme', {
        bundle: true,
        members: ['packages/ui', 'packages/shared-utils', 'apps/web'],
      }),
      { path: '/home/dev/acme-platform/packages/ui', bundle: true, content: 'c0' },
      { path: '/home/dev/acme-platform/packages/shared-utils' },
      { path: '/home/dev/acme-platform/apps/web', bundle: true, content: 'c0' },
      { path: '/home/dev/acme-platform/apps/web/src/components' },
      { path: '/home/dev/acme-platform/tools/scripts', bundle: true, content: 'c0' },
      { path: '/home/dev/acme-platform/node_modules/@acme/ui', symlink: '/home/dev/acme-platform/packages/ui' },
    ],
  },
  cwds: [
    '/home/dev/acme-platform/apps/web/src/components',
    '/home/dev/acme-platform/packages/shared-utils',
    '/home/dev/acme-platform',
    '/home/dev/acme-platform/tools/scripts',
    '/home/dev/acme-platform/node_modules/@acme/ui',
  ],
  namedPaths: [
    '/home/dev/acme-platform/packages/ui',
    '/home/dev/acme-platform/node_modules/@acme/ui',
    '/home/dev/acme-platform/tools/scripts',
    '/home/dev',
  ],
};

// --- 2. Standalone repository (§3.2) ---------------------------------------

const standalone: Fixture = {
  key: '2',
  name: 'Pattern 2 — standalone repository',
  note: 'the deterministic base case, plus the parent directory that must NOT become a workspace',
  federationRoot: '/home/dev',
  fs: {
    manifestAt: null,
    manifest: null,
    nodes: [
      R('/home/dev/invoice-service', 'R-invoice', { bundle: true }),
      { path: '/home/dev/invoice-service/internal/billing' },
      { path: '/home/dev/invoice-service/vendor/dep', bundle: true, content: 'c0' },
      R('/home/dev/scratch-repo', 'R-scratch', { bundle: true }),
    ],
  },
  cwds: [
    '/home/dev/invoice-service/internal/billing',
    '/home/dev/invoice-service',
    '/home/dev',
    '/home/dev/invoice-service/vendor/dep',
  ],
  namedPaths: ['/home/dev/invoice-service', '/home/dev/scratch-repo', '/home/dev/invoice-service/vendor/dep'],
};

// --- 3. Several standalone repos connected for one workflow (§3.3) ---------

const connected: Fixture = {
  key: '3',
  name: 'Pattern 3 — several standalone repositories connected for one workflow',
  note: 'manifest declares five entries; ledger is required and not on disk',
  federationRoot: '/home/dev/checkout-flow',
  fs: {
    manifestAt: '/home/dev/checkout-flow',
    manifest: {
      schemaVersion: '1.2',
      workspaceRoot: '/home/dev/checkout-flow',
      bundles: [
        { id: 'api-gateway', path: 'api-gateway', expectedRepo: 'R-api' },
        { id: 'payments', path: 'payments', expectedRepo: 'R-pay' },
        { id: 'fraud-rules', path: 'fraud-rules', expectedRepo: 'R-fraud' },
        { id: 'notes', path: 'notes' },
        { id: 'ledger', path: 'ledger', expectedRepo: 'R-ledger', required: true },
      ],
    },
    nodes: [
      { path: '/home/dev/checkout-flow' },
      R('/home/dev/checkout-flow/api-gateway', 'R-api', { bundle: true }),
      R('/home/dev/checkout-flow/payments', 'R-pay', { bundle: true }),
      { path: '/home/dev/checkout-flow/payments/src' },
      R('/home/dev/checkout-flow/fraud-rules', 'R-fraud'),
      { path: '/home/dev/checkout-flow/notes' },
      R('/home/dev/checkout-flow/ledger', 'R-ledger', { bundle: true, absent: true }),
    ],
  },
  cwds: ['/home/dev/checkout-flow', '/home/dev/checkout-flow/payments/src', '/home/dev/checkout-flow/api-gateway'],
  namedPaths: [
    '/home/dev/checkout-flow/api-gateway',
    '/home/dev/checkout-flow/fraud-rules',
    '/home/dev/checkout-flow/notes',
    '/home/dev/checkout-flow/ledger',
    '/home/dev/checkout-flow/api-gateway-moved',
  ],
};

// --- 4. Non-repository workspace root with projects/ (§3.4) ----------------

const projectsRoot: Fixture = {
  key: '4',
  name: 'Pattern 4 — non-repository workspace root with projects/',
  note: 'a workspace-level bundle participates only when declared AND accessible',
  federationRoot: '/workspace',
  fs: {
    manifestAt: '/workspace',
    manifest: {
      schemaVersion: '1.0',
      workspaceRoot: '/workspace',
      bundles: [
        { id: 'workspace-root', path: '.' },
        { id: 'api-server', path: 'projects/api-server', expectedRepo: 'R-api2' },
        { id: 'worker', path: 'projects/worker', expectedRepo: 'R-worker' },
        { id: 'frontend', path: 'projects/frontend', expectedRepo: 'R-front', required: true },
      ],
    },
    nodes: [
      { path: '/workspace', bundle: true, content: 'c0' },
      R('/workspace/projects/api-server', 'R-api2', { bundle: true }),
      { path: '/workspace/projects/api-server/internal' },
      R('/workspace/projects/worker', 'R-worker', { bundle: true, unreadable: true }),
      R('/workspace/projects/frontend', 'R-front', { bundle: true, absent: true }),
    ],
  },
  cwds: ['/workspace', '/workspace/projects/api-server/internal', '/workspace/projects/api-server'],
  namedPaths: ['/workspace', '/workspace/projects/api-server', '/workspace/projects/worker', '/workspace/projects/frontend'],
};

// --- 5. Monorepo + standalone project side by side (§3.5) ------------------

const sideBySide: Fixture = {
  key: '5',
  name: 'Pattern 5 — monorepo + standalone project side by side',
  note: 'a dependency symlink into a sibling repo, and an external allowlist target',
  federationRoot: '/home/dev/work',
  fs: {
    manifestAt: null,
    manifest: null,
    nodes: [
      { path: '/home/dev/work' },
      R('/home/dev/work/platform', 'R-plat', { bundle: true, members: ['apps/console'] }),
      { path: '/home/dev/work/platform/apps/console', bundle: true, content: 'c0' },
      {
        path: '/home/dev/work/platform/apps/console/node_modules/@acme/design-kit',
        symlink: '/home/dev/work/design-kit',
      },
      R('/home/dev/work/design-kit', 'R-dk', { bundle: true }),
      R('/opt/shared-glossary', 'R-glossary', { bundle: true }),
      { path: '/home/dev/work/platform/docs-link', symlink: '/opt/shared-glossary' },
    ],
  },
  cwds: ['/home/dev/work/platform/apps/console', '/home/dev/work/design-kit', '/home/dev/work'],
  namedPaths: [
    '/home/dev/work/platform/apps/console/node_modules/@acme/design-kit',
    '/home/dev/work/platform/docs-link',
    '/home/dev/work/design-kit',
    '/opt/shared-glossary',
  ],
};

// --- 6. Complex nesting (§3.6) ---------------------------------------------

const nesting: Fixture = {
  key: '6',
  name: 'Pattern 6 — complex nesting',
  note: 'nested repo, submodule, worktree, sparse checkout, and a symlink out of the workspace',
  federationRoot: '/home/dev',
  fs: {
    manifestAt: null,
    manifest: null,
    nodes: [
      R('/home/dev/mothership', 'R-moth', { bundle: true }),
      R('/home/dev/mothership/embedded/legacy-tool', 'R-legacy', { bundle: true, nested: true }),
      R('/home/dev/mothership/vendor-sdk', 'R-sdk', { bundle: true, submodule: true }),
      { path: '/home/dev/mothership/sparse-area', sparseBundle: true, content: 'c0' },
      { path: '/home/dev/mothership/docs-src', symlink: '/opt/corp-docs' },
      R('/opt/corp-docs', 'R-corp', { bundle: true }),
      R('/home/dev/mothership-hotfix', 'R-moth', { bundle: true, worktree: true, head: 'HEAD1' }),
      { path: '/home/dev/mothership/loop-a', symlink: '/home/dev/mothership/loop-b' },
      { path: '/home/dev/mothership/loop-b', symlink: '/home/dev/mothership/loop-a' },
      { path: '/home/dev/mothership/dangling', symlink: '/home/dev/gone' },
    ],
  },
  cwds: [
    '/home/dev/mothership',
    '/home/dev/mothership/embedded/legacy-tool',
    '/home/dev/mothership/vendor-sdk',
    '/home/dev/mothership/sparse-area',
    '/home/dev/mothership-hotfix',
  ],
  namedPaths: [
    '/home/dev/mothership/vendor-sdk',
    '/home/dev/mothership/docs-src',
    '/home/dev/mothership/loop-a',
    '/home/dev/mothership/dangling',
    '/home/dev/mothership/embedded/legacy-tool',
    '/home/dev/mothership/sparse-area',
  ],
};

// --- 7. Tilt Scenario A — harness from the Tilt root (§8) ------------------

const tiltA: Fixture = {
  key: '7',
  name: 'Tilt Scenario A — harness starts at the Tilt root',
  note: 'no manifest on disk: project/ is a convention, not an authorization',
  federationRoot: '/workspace',
  fs: {
    manifestAt: null,
    manifest: {
      schemaVersion: '1.0',
      workspaceRoot: '/workspace',
      bundles: [
        { id: 'api-server', path: 'project/api-server', expectedRepo: 'R-a' },
        { id: 'worker', path: 'project/worker', expectedRepo: 'R-w' },
        { id: 'frontend', path: 'project/frontend', expectedRepo: 'R-f', required: true },
      ],
    },
    nodes: [
      { path: '/workspace' },
      R('/workspace/project/api-server', 'R-a', { bundle: true }),
      R('/workspace/project/worker', 'R-w', { bundle: true, unreadable: true }),
      R('/workspace/project/frontend', 'R-f', { bundle: true, absent: true }),
    ],
  },
  cwds: ['/workspace', '/workspace/project/api-server', '/workspace/project/frontend'],
  namedPaths: ['/workspace/project/api-server', '/workspace/project/worker', '/workspace/project/frontend'],
};

// --- 8. Tilt Scenario B — harness from the monorepo root (§8) --------------

const tiltB: Fixture = {
  key: '8',
  name: 'Tilt Scenario B — monorepo inside a Tilt workspace',
  note: 'the manifest sits ABOVE the git root, so it cannot be discovered — only supplied',
  federationRoot: '/workspace',
  fs: {
    manifestAt: '/workspace',
    manifest: {
      schemaVersion: '1.0',
      workspaceRoot: '/workspace',
      bundles: [
        { id: 'model', path: 'projects/model', expectedRepo: 'R-mod' },
        { id: 'ui-components', path: 'projects/ui-components', expectedRepo: 'R-ui' },
      ],
    },
    nodes: [
      { path: '/workspace' },
      R('/workspace/projects/client', 'R-cl', { bundle: true }),
      R('/workspace/projects/workers', 'R-wk', { bundle: true }),
      R('/workspace/projects/worker-manager', 'R-wm', {
        bundle: true,
        members: ['apps/scheduler', 'apps/dispatcher', 'packages/shared-utils'],
      }),
      { path: '/workspace/projects/worker-manager/apps/scheduler', bundle: true, content: 'c0' },
      { path: '/workspace/projects/worker-manager/apps/scheduler/src' },
      { path: '/workspace/projects/worker-manager/apps/dispatcher', bundle: true, content: 'c0' },
      { path: '/workspace/projects/worker-manager/packages/shared-utils', bundle: true, content: 'c0' },
      {
        path: '/workspace/projects/worker-manager/node_modules/@acme/ui-components',
        symlink: '/workspace/projects/ui-components',
      },
      R('/workspace/projects/model', 'R-mod', { bundle: true }),
      R('/workspace/projects/ui-components', 'R-ui', { bundle: true }),
    ],
  },
  cwds: [
    '/workspace/projects/worker-manager',
    '/workspace/projects/worker-manager/apps/scheduler/src',
    '/workspace',
  ],
  namedPaths: [
    '/workspace/projects/ui-components',
    '/workspace/projects/worker-manager/node_modules/@acme/ui-components',
    '/workspace/projects/model',
    '/workspace/projects/client',
  ],
};

export const FIXTURES: Fixture[] = [monorepo, standalone, connected, projectsRoot, sideBySide, nesting, tiltA, tiltB];

// ---------------------------------------------------------------------------
// World mutations — the facts the human toggles while driving
// ---------------------------------------------------------------------------

function mapNodes(fs: Fs, f: (n: Node) => Node): Fs {
  return { ...fs, nodes: fs.nodes.map(f) };
}

/** A declared-but-absent repository is cloned: declared_missing -> available (§3.4). */
export function cloneAbsent(fs: Fs): Fs {
  const target = fs.nodes.find((n) => n.absent);
  if (!target) return fs;
  return mapNodes(fs, (n) => (n.path === target.path ? { ...n, absent: false } : n));
}

/** The bundle nearest to `dir` (at or above it) is deleted. */
export function dropBundle(fs: Fs, dir: string): Fs {
  const owner = [...fs.nodes]
    .filter((n) => (n.bundle || n.sparseBundle) && (dir === n.path || dir.startsWith(n.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!owner) return fs;
  return mapNodes(fs, (n) => (n.path === owner.path ? { ...n, bundle: false, sparseBundle: false } : n));
}

/** Move a repository to a new path. Same canonical identity — trust must survive (§7.3). */
export function moveRepo(fs: Fs, from: string, to: string): Fs {
  return mapNodes(fs, (n) =>
    n.path === from || n.path.startsWith(from + '/') ? { ...n, path: to + n.path.slice(from.length) } : n,
  );
}

/** Replace the repository at `dir` with a different one. Trust must NOT transfer (§7.3). */
export function swapIdentity(fs: Fs, dir: string): Fs {
  return mapNodes(fs, (n) => (n.path === dir && n.repo ? { ...n, repo: `${n.repo}-imposter` } : n));
}

/** Point every symlink in the fixture at an external directory (the TOCTOU case, §7.3). */
export function retargetLinks(fs: Fs): Fs {
  return {
    ...fs,
    nodes: [
      ...fs.nodes.map((n) => (n.symlink && !n.symlink.startsWith('/opt/attacker') ? { ...n, symlink: '/opt/attacker/loot' } : n)),
      ...(fs.nodes.some((n) => n.path === '/opt/attacker/loot')
        ? []
        : [R('/opt/attacker/loot', 'R-attacker', { bundle: true })]),
    ],
  };
}

/** git checkout: bumps HEAD, which the proposed cache key does cover (§7.2). */
export function checkout(fs: Fs, dir: string): Fs {
  return mapNodes(fs, (n) => (dir === n.path || dir.startsWith(n.path + '/')) && n.repo ? { ...n, head: n.head === 'HEAD0' ? 'HEAD9' : 'HEAD0' } : n);
}

/** Edit bundle content: per-concept invalidation (§7.2). */
export function editBundle(fs: Fs, dir: string): Fs {
  return mapNodes(fs, (n) => (n.path === dir ? { ...n, content: n.content === 'c0' ? 'c1' : 'c0' } : n));
}

/** Take the manifest off disk / put it back. */
export function toggleManifestOnDisk(fs: Fs, fixture: Fixture): Fs {
  return { ...fs, manifestAt: fs.manifestAt ? null : fixture.fs.manifestAt ?? fixture.federationRoot };
}

/** Bump the manifest to an unreadable major version (§6.2). */
export function bumpSchemaMajor(fs: Fs): Fs {
  if (!fs.manifest) return fs;
  const major = Number.parseInt(fs.manifest.schemaVersion.split('.')[0] ?? '1', 10);
  return {
    ...fs,
    manifest: { ...fs.manifest, schemaVersion: major === 1 ? '2.0' : '1.0' },
  };
}
