/**
 * PROTOTYPE — keystroke glue. One path from a key to a new world, shared by the TUI and the
 * walkthrough, so every scripted case exercises exactly what a hand-driven session does.
 */

import {
  explainScope,
  openRead,
  reachOutcome,
  repoRootOf,
  resolve,
  routeWriteOutcome,
  type Authority,
  type Fs,
  type Harness,
  type Outcome,
  type Resolution,
  type SymlinkPolicy,
} from './discovery.ts';
import {
  bumpSchemaMajor,
  checkout,
  cloneAbsent,
  dropBundle,
  editBundle,
  FIXTURES,
  moveRepo,
  retargetLinks,
  swapIdentity,
  toggleManifestOnDisk,
  type Fixture,
} from './world.ts';

export const HARNESSES: Harness[] = ['claude-code', 'codex', 'opencode'];
export const POLICIES: SymlinkPolicy[] = ['within-workspace', 'deny', 'allowlist'];

export interface World {
  fixture: Fixture;
  fs: Fs;
  cwd: string;
  cwdIndex: number;
  namedIndex: number;
  auth: Authority;
  last: Outcome | null;
  lastAction: string;
}

function freshAuthority(): Authority {
  return {
    selectedRoot: null,
    manifestSupplied: false,
    trusted: [],
    symlinkPolicy: 'within-workspace',
    allowlist: [],
    harness: 'claude-code',
    grants: [],
    peerScan: false,
  };
}

export function createWorld(fixtureIndex = 0): World {
  const fixture = FIXTURES[fixtureIndex];
  return {
    fixture,
    fs: fixture.fs,
    cwd: fixture.cwds[0],
    cwdIndex: 0,
    namedIndex: 0,
    auth: freshAuthority(),
    last: null,
    lastAction: `fixture -> ${fixture.name}`,
  };
}

export function currentResolution(w: World): Resolution {
  return resolve(w.fs, w.auth, w.cwd);
}

export function namedPath(w: World): string {
  return w.fixture.namedPaths[w.namedIndex % w.fixture.namedPaths.length];
}

function adjudicated(w: World, label: string, outcome: Outcome): World {
  return { ...w, lastAction: label, last: outcome };
}

function recorded(w: World, label: string): World {
  return { ...w, lastAction: label, last: null };
}

function cycle<T>(list: T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

function identityAt(w: World, path: string): string | null {
  return repoRootOf(w.fs, path)?.repo ?? null;
}

export function step(w: World, key: string): World {
  // --- fixture and cursor ---
  if (/^[1-8]$/.test(key)) return createWorld(Number(key) - 1);

  switch (key) {
    case 'n':
    case 'p': {
      const list = w.fixture.cwds;
      const next = (w.cwdIndex + (key === 'n' ? 1 : list.length - 1)) % list.length;
      return recorded({ ...w, cwdIndex: next, cwd: list[next] }, `cd ${list[next]}`);
    }
    case 'e': {
      const next = (w.namedIndex + 1) % w.fixture.namedPaths.length;
      return recorded({ ...w, namedIndex: next }, `named path -> ${w.fixture.namedPaths[next]}`);
    }

    // --- the three query verbs ---
    case 'r':
      return adjudicated(w, 'open read scope', openRead(currentResolution(w)));
    case 'w':
      return adjudicated(w, 'route a write', routeWriteOutcome(currentResolution(w)));
    case 'x': {
      const path = namedPath(w);
      return adjudicated(w, `reach ${path}`, reachOutcome(w.fs, w.auth, currentResolution(w), w.cwd, path));
    }

    // --- authority ---
    case 'b':
      return recorded(
        { ...w, auth: { ...w.auth, selectedRoot: w.fixture.federationRoot } },
        `select workspace root ${w.fixture.federationRoot}`,
      );
    case 'B':
      return recorded({ ...w, auth: { ...w.auth, selectedRoot: null } }, 'clear selected workspace root');
    case 'm':
      return recorded(
        { ...w, auth: { ...w.auth, manifestSupplied: !w.auth.manifestSupplied } },
        `manifest supplied out-of-band -> ${!w.auth.manifestSupplied}`,
      );
    case 'M':
      return recorded({ ...w, fs: toggleManifestOnDisk(w.fs, w.fixture) }, 'toggle manifest on disk');
    case 'V':
      return recorded({ ...w, fs: bumpSchemaMajor(w.fs) }, 'toggle manifest schema major version');
    case 't': {
      const id = identityAt(w, namedPath(w));
      if (!id || w.auth.trusted.includes(id)) return recorded(w, `trust ${id ?? '(no repository there)'} — no change`);
      return recorded({ ...w, auth: { ...w.auth, trusted: [...w.auth.trusted, id] } }, `trust identity ${id}`);
    }
    case 'T': {
      const all = [...new Set(w.fs.nodes.map((n) => n.repo).filter((r): r is string => !!r))];
      return recorded({ ...w, auth: { ...w.auth, trusted: all } }, `trust all ${all.length} identities`);
    }
    case 'u':
      return recorded({ ...w, auth: { ...w.auth, trusted: [] } }, 'revoke all trust');
    case 's': {
      const next = cycle(POLICIES, w.auth.symlinkPolicy);
      return recorded({ ...w, auth: { ...w.auth, symlinkPolicy: next } }, `symlink policy -> ${next}`);
    }
    case 'a': {
      const on = w.auth.allowlist.length > 0;
      return recorded({ ...w, auth: { ...w.auth, allowlist: on ? [] : ['/opt'] } }, `allowlist -> ${on ? 'empty' : '/opt'}`);
    }
    case 'h': {
      const next = cycle(HARNESSES, w.auth.harness);
      return recorded({ ...w, auth: { ...w.auth, harness: next } }, `harness -> ${next}`);
    }
    case 'g':
      return recorded(
        { ...w, auth: { ...w.auth, grants: ['/'] } },
        'explicit additional-directory grant -> / (Codex `--add-dir` style; still not a scope decision)',
      );
    case 'G':
      return recorded({ ...w, auth: { ...w.auth, grants: [] } }, 'revoke harness grants');
    case 'o':
      return recorded({ ...w, auth: { ...w.auth, peerScan: !w.auth.peerScan } }, `advisory peer scan -> ${!w.auth.peerScan}`);

    // --- world mutations ---
    case 'c':
      return recorded({ ...w, fs: cloneAbsent(w.fs) }, 'clone the declared-missing repository');
    case 'd':
      return recorded({ ...w, fs: dropBundle(w.fs, w.cwd) }, 'delete the nearest bundle');
    case 'k': {
      const from = repoRootOf(w.fs, namedPath(w))?.path;
      if (!from) return recorded(w, 'move repository — no repository at the named path');
      const to = `${from}-moved`;
      const cwd = w.cwd.startsWith(from) ? to + w.cwd.slice(from.length) : w.cwd;
      return recorded({ ...w, fs: moveRepo(w.fs, from, to), cwd }, `move ${from} -> ${to} (identity unchanged)`);
    }
    case 'K': {
      const root = repoRootOf(w.fs, namedPath(w))?.path;
      if (!root) return recorded(w, 'swap identity — no repository at the named path');
      return recorded({ ...w, fs: swapIdentity(w.fs, root) }, `swap the repository identity at ${root}`);
    }
    case 'L':
      return recorded({ ...w, fs: retargetLinks(w.fs) }, 'retarget every symlink to /opt/attacker/loot');
    case 'H':
      return recorded({ ...w, fs: checkout(w.fs, w.cwd) }, 'git checkout (bumps HEAD)');
    case 'f':
      return recorded({ ...w, fs: editBundle(w.fs, repoRootOf(w.fs, w.cwd)?.path ?? w.cwd) }, 'edit bundle content');

    default:
      return w;
  }
}

export { explainScope };
