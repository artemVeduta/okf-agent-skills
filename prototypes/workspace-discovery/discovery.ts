/**
 * PROTOTYPE — workspace discovery, trust, and routing state transitions.
 *
 * QUESTION BEING PROTOTYPED
 *
 * When a user drives the harness working directory across six workspace topologies and
 * both Tilt scenarios, which deterministic discovery and routing transitions feel safe
 * and unsurprising, given that:
 *   1. the machine must never read above or sideways from a repository unless explicitly
 *      authorized, and
 *   2. the human must always be able to see *which* gate refused, because each gate has a
 *      different fix and may require harness-specific configuration.
 *
 * This file is the part worth keeping: a pure resolver over an injected filesystem view
 * and an injected authority record. No I/O, no clock, no randomness, no harness coupling.
 * `world.ts` supplies the fake filesystem; `driver.ts`/`tui.ts` supply the shell.
 *
 * Rule quotes are from docs/research/workspace-topology-and-routing.md (§ numbers inline).
 * Cross-bundle merge/subsumption semantics are deliberately NOT decided here — see #22/#24.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Filesystem model — the abstraction the resolver depends on (world.ts implements it)
// ---------------------------------------------------------------------------

export interface Node {
  path: string;
  /** Canonical repository identity. Stable across path changes; a directory name is not enough (§6.2). */
  repo?: string;
  /** `.git` is a file: this is a worktree of `repo`. */
  worktree?: boolean;
  /** Declared submodule of the enclosing repo — excluded by default (§3.6). */
  submodule?: boolean;
  /** A git repo physically inside another repo's working tree, undeclared — an anomaly (§3.6). */
  nested?: boolean;
  /** An `okf/` bundle exists on disk here. */
  bundle?: boolean;
  /** Bundle is committed but not checked out; served from the git index (§3.6). */
  sparseBundle?: boolean;
  /** Monorepo manager manifest at this repo root; values are member paths relative to it (§6.3.2). */
  members?: string[];
  /** This path is a symlink resolving to the given absolute target. */
  symlink?: string;
  /** Declared but not on disk — only reachable as `declared_missing` (§3.4). */
  absent?: boolean;
  /** The OS/sandbox refuses to read this subtree regardless of trust. */
  unreadable?: boolean;
  /** Current git HEAD; part of the proposed cache key (§7.2). */
  head?: string;
  /** Opaque bundle content state; part of the proposed cache key (§7.2). */
  content?: string;
}

export interface ManifestEntry {
  id: string;
  /** Path relative to the manifest (§6.2). */
  path: string;
  /** The repository identity this entry expects to find (§6.2). */
  expectedRepo?: string;
  /** Required entries make an unresolved workspace *incomplete* (§7.5). */
  required?: boolean;
}

export interface Manifest {
  schemaVersion: string;
  workspaceRoot: string;
  bundles: ManifestEntry[];
}

export interface Fs {
  nodes: Node[];
  /** Where the manifest physically sits, if it is on disk at all. */
  manifestAt: string | null;
  manifest: Manifest | null;
}

// ---------------------------------------------------------------------------
// Authority — everything the user or harness has explicitly granted
// ---------------------------------------------------------------------------

export type Harness = 'claude-code' | 'codex' | 'opencode';
export type SymlinkPolicy = 'deny' | 'within-workspace' | 'allowlist';

/**
 * The bootstrap candidates exercised by this prototype (§7.3). This is not exhaustive:
 * whether harness-native multi-root bootstrap belongs here remains undecided.
 * Note what is absent: the working directory, a `projects/` folder, and a dependency symlink.
 */
export interface Bootstrap {
  kind: 'workspace-root' | 'manifest-on-disk' | 'manifest-supplied';
  root: string;
}

export interface Authority {
  /** User-selected workspace root, if any. */
  selectedRoot: string | null;
  /** A manifest handed in out-of-band, for the case where it sits above the git root. */
  manifestSupplied: boolean;
  /** Canonical repository identities the user has trusted (§7.3) — never path strings. */
  trusted: string[];
  symlinkPolicy: SymlinkPolicy;
  /** Allowlisted external symlink targets, used only under the `allowlist` policy. */
  allowlist: string[];
  harness: Harness;
  /** Explicit additional-directory grants beyond the native root (for example, Codex `--add-dir`). */
  grants: string[];
  /** Opt-in, shallow, advisory peer scan (§6.3). Never authorizes anything. */
  peerScan: boolean;
}

// ---------------------------------------------------------------------------
// Verdict vocabulary
// ---------------------------------------------------------------------------

export type Verdict = 'ROUTE' | 'CLIP' | 'INCOMPLETE' | 'FLAG' | 'REFUSE' | 'RECORDED';

/** Which of the four gates refused. Each gate has a different fix. */
export type Gate = 'REACH' | 'PRESENCE' | 'TRUST' | 'ACCESS';

export type BlockCode =
  // reach — the boundary refused. Nothing about an undisclosed target is reported.
  | 'CWD_NOT_A_WORKSPACE'
  | 'ABOVE_GIT_ROOT'
  | 'SIDEWAYS_SIBLING'
  | 'OUTSIDE_WORKSPACE'
  | 'EXCLUDED_PATH'
  | 'SYMLINK_DENIED'
  | 'SYMLINK_ESCAPE'
  | 'SYMLINK_CYCLE'
  | 'SYMLINK_BROKEN'
  | 'SUBMODULE_EXCLUDED'
  | 'NESTED_REPO_ANOMALY'
  | 'MANIFEST_MAJOR_VERSION'
  // presence — the world does not (yet) hold what was declared
  | 'REPO_ABSENT'
  | 'NOT_A_REPOSITORY'
  | 'BUNDLE_ABSENT'
  // trust — reachable and present, but this repository identity is not trusted
  | 'REPO_UNTRUSTED'
  | 'IDENTITY_CHANGED'
  // access — trusted, but this harness cannot read it
  | 'HARNESS_NO_ACCESS'
  // routing — nothing is broken; there is simply nowhere legal to put the write
  | 'NO_LOCAL_BUNDLE'
  | 'ADVISORY_ONLY'
  | 'OK';

/**
 * §6.2's six statuses, plus `untrusted`, which §6.2 has no word for.
 * A repository that is reachable, present, and readable but not trusted is none of
 * `declared_missing` / `not_a_repository` / `bundle_missing` / `access_denied` / `invalid`.
 */
export type EntryStatus =
  | 'available'
  | 'declared_missing'
  | 'not_a_repository'
  | 'bundle_missing'
  | 'access_denied'
  | 'untrusted'
  | 'invalid'
  | 'out_of_reach'
  | 'advisory';

export type CandidateSource = 'walk-up' | 'monorepo-member' | 'manifest' | 'peer-scan' | 'named';

/**
 * The codes that name something *outside* the authorized scope. Only these are withheld from
 * an unnamed candidate — everything else was refused from inside the scope the user already
 * has, so reporting it discloses nothing they could not already see.
 */
const OUTSIDE_SCOPE = new Set<BlockCode>([
  'ABOVE_GIT_ROOT',
  'SIDEWAYS_SIBLING',
  'OUTSIDE_WORKSPACE',
  'SYMLINK_ESCAPE',
  'CWD_NOT_A_WORKSPACE',
]);

export interface Entry {
  id: string;
  /** The bundle path, or `<undisclosed>` when the boundary refused something the user never named. */
  path: string;
  declaredPath: string;
  repoIdentity: string | null;
  source: CandidateSource;
  status: EntryStatus;
  /** Every gate that refused. Trust and access are reported together, never one at a time. */
  failed: Gate[];
  code: BlockCode;
  required: boolean;
  /** Path segments between cwd and this bundle's directory; Infinity when not an ancestor. */
  distance: number;
  note?: string;
}

export type ScopePhase = 'unscoped' | 'repo' | 'federated' | 'rejected';

export interface Resolution {
  phase: ScopePhase;
  scopeRoot: string | null;
  repoRoot: string | null;
  /** Which signal authorized the current scope. */
  authority: string;
  /** Admitted bundles, nearest first. */
  admitted: Entry[];
  /** Candidates that failed a gate, in the same order they were considered. */
  refused: Entry[];
  /** Everything considered, before gating — so a named path can be adjudicated against its declaration. */
  candidates: Candidate[];
  /** Boundary refusals for paths the user never named — counted, never named back. */
  undisclosed: number;
  anomalies: string[];
  complete: boolean;
  writeTarget: Entry | null;
  writeCode: BlockCode;
  /** §7.2's proposed key: repository identity + git HEAD + bundle content state. */
  docCacheKey: string;
  /** The same key plus the facts §7.2 omits: trust, symlink policy, resolved link targets. */
  cacheKey: string;
}

export interface Outcome {
  verdict: Verdict;
  code: BlockCode;
  summary: string;
  /** Which gate, what was expected, what was observed. Never a bare "denied". */
  detail: string[];
  /** The single next action that unblocks the human. */
  nextAction: string;
}

// ---------------------------------------------------------------------------
// Path primitives (§7.3 containment: normalize lexically, then validate canonically)
// ---------------------------------------------------------------------------

/** Hard-coded exclusion list (§7.4). Not overridable — see README. */
export const EXCLUDED = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'target', 'out', '.next', '.nuxt', 'coverage', '.idea', '.vscode',
]);

export function segments(p: string): string[] {
  return p.split('/').filter(Boolean);
}

export function depth(p: string): number {
  return segments(p).length;
}

/** Self first, then each ancestor, ending at `/`. */
export function ancestorsOf(p: string): string[] {
  const segs = segments(p);
  const out: string[] = [];
  for (let i = segs.length; i > 0; i--) out.push('/' + segs.slice(0, i).join('/'));
  out.push('/');
  return out;
}

export function isAncestor(a: string, b: string): boolean {
  if (a === '/') return true;
  return b === a || b.startsWith(a + '/');
}

export function nodeAt(fs: Fs, path: string): Node | undefined {
  return fs.nodes.find((n) => n.path === path);
}

/** True when the path exists on disk (a declared-but-absent node does not). */
function exists(fs: Fs, path: string): boolean {
  const own = nodeAt(fs, path);
  if (own) return !own.absent;
  // implied by a descendant node, unless an ancestor is absent
  const covered = fs.nodes.some((n) => !n.absent && isAncestor(path, n.path));
  const cut = fs.nodes.some((n) => n.absent && isAncestor(n.path, path));
  return covered && !cut;
}

export type CanonResult =
  | { ok: true; real: string; viaSymlink: boolean }
  | { ok: false; why: 'SYMLINK_CYCLE' | 'SYMLINK_BROKEN' };

/**
 * Resolve every symlink on the path. Containment is checked on this result, never on the
 * lexical path (§3.6, §7.3) — and it is recomputed on every call, so a retargeted link
 * cannot ride an earlier approval.
 */
export function canon(fs: Fs, path: string): CanonResult {
  let current = path;
  let viaSymlink = false;
  const seen = new Set<string>();
  for (let hop = 0; hop < 40; hop++) {
    if (seen.has(current)) return { ok: false, why: 'SYMLINK_CYCLE' };
    seen.add(current);
    const link = shallowestLinkOn(fs, current);
    if (!link) return { ok: true, real: current, viaSymlink };
    viaSymlink = true;
    const rest = current.slice(link.at.length);
    const next = (link.target + rest) || '/';
    if (!exists(fs, link.target)) return { ok: false, why: 'SYMLINK_BROKEN' };
    current = next;
  }
  return { ok: false, why: 'SYMLINK_CYCLE' };
}

function shallowestLinkOn(fs: Fs, p: string): { at: string; target: string } | null {
  const chain = ancestorsOf(p).reverse();
  for (const a of chain) {
    const n = nodeAt(fs, a);
    if (n?.symlink) return { at: a, target: n.symlink };
  }
  return null;
}

/** The nearest ancestor-or-self that is a repository root. Finding it is always allowed. */
export function repoRootOf(fs: Fs, path: string): Node | null {
  for (const a of ancestorsOf(path)) {
    const n = nodeAt(fs, a);
    if (n?.repo && !n.absent) return n;
  }
  return null;
}

/** An excluded segment strictly between `from` and `to` (§7.4). */
function excludedBetween(from: string, to: string): string | null {
  if (!isAncestor(from, to)) return null;
  const extra = segments(to.slice(from === '/' ? 0 : from.length));
  return extra.find((s) => EXCLUDED.has(s)) ?? null;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface Candidate {
  id: string;
  declaredPath: string;
  source: CandidateSource;
  required: boolean;
  expectedRepo?: string;
  /** The user named this path themselves, so naming it back discloses nothing. */
  named: boolean;
  /** Manifest opt-in overrides the default submodule exclusion (§3.6). */
  submoduleOptIn?: boolean;
  note?: string;
}

export function resolve(fs: Fs, auth: Authority, cwd: string): Resolution {
  const cwdCanon = canon(fs, cwd);
  const here = cwdCanon.ok ? cwdCanon.real : cwd;
  const repo = repoRootOf(fs, here);
  const repoRoot = repo?.path ?? null;
  /** Nothing above this may even be *looked at* without a bootstrap signal (§6.3.3, §7.3). */
  const ceiling = repoRoot ?? here;

  // A manifest above the ceiling cannot be discovered — finding it would require the very
  // upward walk that needs it as authorization. §3.3 permits "a manifest at/above CWD";
  // §6.3.3/§7.3 forbid the walk. The prototype resolves the conflict this way and the
  // out-of-band `manifestSupplied` path exists precisely to cover the case.
  const manifestDiscoverable =
    fs.manifest !== null &&
    fs.manifestAt !== null &&
    isAncestor(fs.manifestAt, here) &&
    isAncestor(ceiling, fs.manifestAt);
  const manifestActive = fs.manifest !== null && (manifestDiscoverable || auth.manifestSupplied);
  const manifestRoot = fs.manifestAt ?? fs.manifest?.workspaceRoot ?? null;

  if (manifestActive && majorOf(fs.manifest!.schemaVersion) !== 1) {
    return rejected(fs, auth, here, repoRoot, fs.manifest!.schemaVersion);
  }

  const bootstrap = pickBootstrap(auth, here, manifestActive, manifestDiscoverable, manifestRoot);
  const phase: ScopePhase = bootstrap ? 'federated' : repoRoot ? 'repo' : 'unscoped';
  const scopeRoot = bootstrap ? bootstrap.root : repoRoot;

  const candidates = enumerate(fs, auth, here, ceiling, repo, phase, scopeRoot, bootstrap, manifestActive, manifestRoot);

  const admitted: Entry[] = [];
  const refused: Entry[] = [];
  const anomalies: string[] = [];
  let undisclosed = 0;

  for (const c of candidates) {
    const entry = gate(fs, auth, here, repoRoot, scopeRoot, c);
    if (entry.note?.startsWith('anomaly:')) anomalies.push(entry.note.slice(9).trim());
    if (entry.status === 'available') admitted.push(entry);
    else if (OUTSIDE_SCOPE.has(entry.code) && !c.named) undisclosed++;
    else refused.push(entry);
  }

  admitted.sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path));

  const required = [...admitted, ...refused].filter((e) => e.required);
  const complete = required.every((e) => e.status === 'available');

  const { writeTarget, writeCode } = routeWrite(fs, here, repoRoot, phase, admitted);

  return {
    phase,
    scopeRoot,
    repoRoot,
    authority: describeAuthority(phase, bootstrap, repoRoot),
    admitted,
    refused,
    candidates,
    undisclosed,
    anomalies,
    complete,
    writeTarget,
    writeCode,
    docCacheKey: docCacheKey(fs, repo, admitted),
    cacheKey: fullCacheKey(fs, auth, repo, admitted),
  };
}

function majorOf(v: string): number {
  return Number.parseInt(v.split('.')[0] ?? '', 10);
}

function rejected(fs: Fs, auth: Authority, here: string, repoRoot: string | null, version: string): Resolution {
  return {
    phase: 'rejected',
    scopeRoot: null,
    repoRoot,
    authority: `manifest rejected: unknown major schema_version ${version}`,
    admitted: [],
    refused: [],
    candidates: [],
    undisclosed: 0,
    anomalies: [],
    complete: false,
    writeTarget: null,
    writeCode: 'MANIFEST_MAJOR_VERSION',
    docCacheKey: '-',
    cacheKey: '-',
  };
}

function pickBootstrap(
  auth: Authority,
  here: string,
  manifestActive: boolean,
  manifestDiscoverable: boolean,
  manifestRoot: string | null,
): Bootstrap | null {
  if (auth.selectedRoot && isAncestor(auth.selectedRoot, here)) {
    return { kind: 'workspace-root', root: auth.selectedRoot };
  }
  if (manifestActive && manifestRoot) {
    return {
      kind: manifestDiscoverable ? 'manifest-on-disk' : 'manifest-supplied',
      root: manifestRoot,
    };
  }
  // Deliberately absent: a harness grant. Granting read access is not a scope decision —
  // see README ("access is not authority"). §7.3 also allows treating harness-native
  // multi-root as a bootstrap signal; that is a separate policy choice, left UNDECIDED.
  return null;
}

function describeAuthority(phase: ScopePhase, bootstrap: Bootstrap | null, repoRoot: string | null): string {
  if (bootstrap) return `${bootstrap.kind} @ ${bootstrap.root}`;
  if (phase === 'repo') return `current repository (no grant needed) @ ${repoRoot}`;
  return 'none — cwd is an input to discovery, not a workspace (§1)';
}

// ---------------------------------------------------------------------------
// Candidate enumeration
// ---------------------------------------------------------------------------

function enumerate(
  fs: Fs,
  auth: Authority,
  here: string,
  ceiling: string,
  repo: Node | null,
  phase: ScopePhase,
  scopeRoot: string | null,
  bootstrap: Bootstrap | null,
  manifestActive: boolean,
  manifestRoot: string | null,
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    if (seen.has(c.declaredPath)) return;
    seen.add(c.declaredPath);
    out.push(c);
  };

  // 1. Manifest entries first: explicit beats implicit (§4.3.1).
  if (manifestActive && manifestRoot && bootstrap) {
    for (const e of fs.manifest!.bundles) {
      const rel = e.path === '.' ? '' : e.path;
      push({
        id: e.id,
        declaredPath: e.path.startsWith('/') ? e.path : rel ? joinPath(manifestRoot, rel) : manifestRoot,
        source: 'manifest',
        required: e.required === true,
        expectedRepo: e.expectedRepo,
        named: true,
        submoduleOptIn: true,
      });
    }
  }

  // 2. Walk up from cwd to the repository root, never past it (§6.3.1).
  for (const dir of ancestorsOf(here)) {
    if (!isAncestor(ceiling, dir)) break;
    const n = nodeAt(fs, dir);
    if (n && (n.bundle || n.sparseBundle)) {
      // §1 says not every subdirectory is a monorepo child; §6.3.1 walks up to any okf/.
      // Both rules fire here and the doc never reconciles them — surfaced, not resolved.
      const orphan =
        repo?.members !== undefined &&
        dir !== repo.path &&
        !repo.members.some((m) => joinPath(repo.path, m) === dir);
      push({
        id: labelOf(dir),
        declaredPath: dir,
        source: 'walk-up',
        required: false,
        named: false,
        note: orphan ? 'bundle in a directory the monorepo manager does not declare (§1 vs §6.3.1)' : undefined,
      });
    }
    if (dir === ceiling) break;
  }

  // 3. Declared monorepo members — not every subdirectory is a child (§1, §6.3.2).
  // Only from the monorepo root: standing inside one child does not pull in its siblings,
  // which is the same sideways rule as between repositories, one level down (§9, §5.3).
  if (repo?.members && here === repo.path) {
    for (const m of repo.members) {
      const dir = joinPath(repo.path, m);
      const n = nodeAt(fs, dir);
      if (n && (n.bundle || n.sparseBundle)) {
        push({ id: labelOf(dir), declaredPath: dir, source: 'monorepo-member', required: false, named: false });
      }
    }
  }

  // 4. Opt-in, shallow, advisory peer scan. Candidates never enter the routing graph (§6.3).
  if (auth.peerScan && scopeRoot) {
    for (const child of immediateChildren(fs, scopeRoot)) {
      if (EXCLUDED.has(basename(child))) continue;
      push({ id: labelOf(child), declaredPath: child, source: 'peer-scan', required: false, named: false });
    }
  }

  return out;
}

/** Immediate child directories of `root`, including ones implied by deeper nodes. */
function immediateChildren(fs: Fs, root: string): string[] {
  const out = new Set<string>();
  for (const n of fs.nodes) {
    if (n.absent || n.path === root || !isAncestor(root, n.path)) continue;
    const rest = segments(n.path.slice(root === '/' ? 0 : root.length));
    if (rest.length > 0) out.add(joinPath(root, rest[0]));
  }
  return [...out].sort();
}

function joinPath(a: string, b: string): string {
  return (a === '/' ? '' : a) + '/' + b.replace(/^\/+/, '');
}

function basename(p: string): string {
  return segments(p).at(-1) ?? '/';
}

function labelOf(p: string): string {
  return segments(p).slice(-2).join('/') || p;
}

// ---------------------------------------------------------------------------
// The gates
//
// REACH runs first and short-circuits, because a path the boundary refused must not be
// stat-ed, trust-checked, or named back unless the user named it first.
// PRESENCE runs next; there is nothing to trust or read at a path that is not there.
// TRUST and ACCESS then run TOGETHER and both failures are reported, because they have
// different fixes ("trust this repo" vs "reconfigure the harness") and making the human
// discover them one at a time is the maze this prototype exists to prevent.
// ---------------------------------------------------------------------------

export function gate(
  fs: Fs,
  auth: Authority,
  here: string,
  repoRoot: string | null,
  scopeRoot: string | null,
  c: Candidate,
): Entry {
  const base: Omit<Entry, 'status' | 'failed' | 'code'> = {
    id: c.id,
    path: c.named ? bundlePath(c.declaredPath) : '<undisclosed>',
    declaredPath: c.declaredPath,
    repoIdentity: null,
    source: c.source,
    required: c.required,
    distance: isAncestor(c.declaredPath, here) ? depth(here) - depth(c.declaredPath) : Infinity,
  };

  // --- REACH -------------------------------------------------------------
  if (!scopeRoot) {
    return { ...base, status: 'out_of_reach', failed: ['REACH'], code: 'CWD_NOT_A_WORKSPACE' };
  }

  const resolved = canon(fs, c.declaredPath);
  if (!resolved.ok) {
    return { ...base, status: 'out_of_reach', failed: ['REACH'], code: resolved.why };
  }
  const real = resolved.real;

  if (resolved.viaSymlink && auth.symlinkPolicy === 'deny') {
    return { ...base, status: 'out_of_reach', failed: ['REACH'], code: 'SYMLINK_DENIED' };
  }

  // Containment and the symlink allowlist are one check, not two. Written as two, the
  // allowlist is unreachable: a target it admits is by definition outside the workspace,
  // so a second containment test would reject everything the first one just allowed.
  // §3.5's "reject escape from the declared workspace *unless explicitly allowed*" is the
  // reading that makes the `allowlist` policy value mean anything, so the allowlist extends
  // the containment envelope — and only for paths actually reached through a symlink.
  const allowlisted =
    resolved.viaSymlink &&
    auth.symlinkPolicy === 'allowlist' &&
    auth.allowlist.some((a) => isAncestor(a, real));

  if (!isAncestor(scopeRoot, real) && !allowlisted) {
    const code: BlockCode = resolved.viaSymlink
      ? 'SYMLINK_ESCAPE'
      : isAncestor(real, scopeRoot)
        ? 'ABOVE_GIT_ROOT'
        : repoRoot && scopeRoot === repoRoot
          ? 'SIDEWAYS_SIBLING'
          : 'OUTSIDE_WORKSPACE';
    return { ...base, status: 'out_of_reach', failed: ['REACH'], code };
  }

  const bad = excludedBetween(scopeRoot, real);
  if (bad) {
    return { ...base, status: 'out_of_reach', failed: ['REACH'], code: 'EXCLUDED_PATH', note: `excluded segment: ${bad}/` };
  }

  const node = nodeAt(fs, real);

  // A submodule is a vendored dependency *of an enclosing repo* (§3.6). When cwd is inside it,
  // it is the current repository — excluding it would leave the session with no bundle at all.
  if (node?.submodule && !c.submoduleOptIn && real !== repoRoot) {
    return { ...base, status: 'out_of_reach', failed: ['REACH'], code: 'SUBMODULE_EXCLUDED' };
  }
  if (node?.nested) {
    return {
      ...base,
      path: bundlePath(real),
      status: 'out_of_reach',
      failed: ['REACH'],
      code: 'NESTED_REPO_ANOMALY',
      note: `anomaly: ${real} is a git repo inside another repo's working tree; knowledge scope is ambiguous`,
    };
  }

  // Past the boundary. From here the path may be named back to the human.
  const disclosed: Omit<Entry, 'status' | 'failed' | 'code'> = { ...base, path: bundlePath(real) };

  if (c.source === 'peer-scan') {
    return { ...disclosed, status: 'advisory', failed: [], code: 'ADVISORY_ONLY', note: 'suggestion only; not in the routing graph' };
  }

  // --- PRESENCE ----------------------------------------------------------
  if (!node || node.absent) {
    return { ...disclosed, status: 'declared_missing', failed: ['PRESENCE'], code: 'REPO_ABSENT' };
  }
  if (c.source === 'manifest' && !node.repo) {
    return { ...disclosed, status: 'not_a_repository', failed: ['PRESENCE'], code: 'NOT_A_REPOSITORY' };
  }
  if (!node.bundle && !node.sparseBundle) {
    return { ...disclosed, status: 'bundle_missing', failed: ['PRESENCE'], code: 'BUNDLE_ABSENT' };
  }

  // --- TRUST and ACCESS, jointly ----------------------------------------
  const owner = repoRootOf(fs, real);
  const identity = owner?.repo ?? null;
  const withId = { ...disclosed, repoIdentity: identity };
  const failed: Gate[] = [];
  let code: BlockCode = 'OK';

  const identityChanged = c.expectedRepo !== undefined && identity !== c.expectedRepo;
  const isCurrentRepo = repoRoot !== null && owner?.path === repoRoot;
  // A non-repository workspace root has no identity to key trust on (§7.3 gives no rule).
  // The prototype treats the act of authorizing the root as trusting what has no repo of its own.
  const noIdentity = identity === null && isAncestor(scopeRoot, real);
  const trusted = isCurrentRepo || noIdentity || (identity !== null && auth.trusted.includes(identity));
  if (identityChanged) {
    failed.push('TRUST');
    code = 'IDENTITY_CHANGED';
  } else if (!trusted) {
    failed.push('TRUST');
    code = 'REPO_UNTRUSTED';
  }

  if (!harnessCanReach(fs, auth, here, repoRoot, real)) {
    failed.push('ACCESS');
    if (code === 'OK') code = 'HARNESS_NO_ACCESS';
  }

  if (failed.length > 0) {
    const status: EntryStatus = failed.includes('TRUST')
      ? identityChanged
        ? 'invalid'
        : 'untrusted'
      : 'access_denied';
    return { ...withId, status, failed, code };
  }

  return {
    ...withId,
    status: 'available',
    failed: [],
    code: 'OK',
    note: node.sparseBundle && !node.bundle ? 'served from the git index (sparse checkout)' : c.note,
  };
}

function bundlePath(dir: string): string {
  return joinPath(dir, 'okf');
}

/**
 * A manifest does not grant filesystem access (§7.3). Native access is limited to the current
 * repository (or cwd without one); explicit additional-directory grants widen access only.
 */
export function harnessCanReach(
  fs: Fs,
  auth: Authority,
  here: string,
  repoRoot: string | null,
  target: string,
): boolean {
  const blocked = fs.nodes.some((n) => n.unreadable && isAncestor(n.path, target));
  if (blocked) return false;
  const native = repoRoot ?? here;
  if (isAncestor(native, target)) return true;
  return auth.grants.some((g) => isAncestor(g, target));
}

// ---------------------------------------------------------------------------
// Write routing
//
// Reads may federate. Writes never do: the write target is the nearest admitted bundle
// at or above cwd *inside the current repository*. A federated peer or a workspace-level
// bundle is never a write target, so widening read scope can never silently redirect a write.
// The doc states no write rule at all — this is the prototype's proposal (§4.3.2 adjacent).
// ---------------------------------------------------------------------------

function routeWrite(
  fs: Fs,
  here: string,
  repoRoot: string | null,
  phase: ScopePhase,
  admitted: Entry[],
): { writeTarget: Entry | null; writeCode: BlockCode } {
  if (phase === 'unscoped') return { writeTarget: null, writeCode: 'CWD_NOT_A_WORKSPACE' };
  if (!repoRoot) return { writeTarget: null, writeCode: 'NO_LOCAL_BUNDLE' };
  const local = admitted.filter(
    (e) => e.distance !== Infinity && isAncestor(repoRoot, e.declaredPath),
  );
  const target = local[0] ?? null;
  return { writeTarget: target, writeCode: target ? 'OK' : 'NO_LOCAL_BUNDLE' };
}

// ---------------------------------------------------------------------------
// Cache keys (§7.2)
// ---------------------------------------------------------------------------

function shortHash(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 10);
}

/** Exactly §7.2's proposed key: repository identity + git HEAD + bundle content state. */
function docCacheKey(fs: Fs, repo: Node | null, _admitted: Entry[]): string {
  return shortHash([repo?.repo ?? 'none', repo?.head ?? 'none', repo?.content ?? 'none']);
}

function fullCacheKey(fs: Fs, auth: Authority, repo: Node | null, admitted: Entry[]): string {
  return shortHash([
    docCacheKey(fs, repo, admitted),
    // The facts §7.2's proposed key omits. Without these, revoking trust or retargeting a
    // symlink leaves a stale admission cached under an unchanged key.
    [...auth.trusted].sort().join(','),
    auth.symlinkPolicy,
    auth.harness,
    [...auth.grants].sort().join(','),
    ...admitted.map((e) => e.path),
  ]);
}

// ---------------------------------------------------------------------------
// Adjudication — the three query verbs
// ---------------------------------------------------------------------------

export function openRead(r: Resolution): Outcome {
  if (r.phase === 'rejected') {
    return {
      verdict: 'REFUSE',
      code: 'MANIFEST_MAJOR_VERSION',
      summary: 'the workspace manifest declares a major schema version this build does not understand.',
      detail: [r.authority, 'no scope is established; autodiscovery is not a fallback for a rejected manifest'],
      nextAction: 'upgrade the skill, or remove the manifest to fall back to repository scope.',
    };
  }
  if (r.phase === 'unscoped') {
    return {
      verdict: 'REFUSE',
      code: 'CWD_NOT_A_WORKSPACE',
      summary: 'the working directory is not inside a repository and nothing has authorized a wider scope.',
      detail: [
        'expected  a git repository at or above cwd, or an explicit workspace root / manifest',
        'observed  neither — cwd alone is an input to discovery, not a workspace (§1)',
        `${r.refused.length + r.undisclosed} candidate(s) were left unexamined`,
      ],
      nextAction: 'select a workspace root explicitly, or cd into a repository.',
    };
  }
  if (r.anomalies.length > 0) {
    return {
      verdict: 'FLAG',
      code: 'NESTED_REPO_ANOMALY',
      summary: 'the repository layout makes knowledge scope ambiguous; a human has to resolve it.',
      detail: r.anomalies,
      nextAction: 'declare which repository owns the overlapping path, or remove the nesting.',
    };
  }
  if (!r.complete) {
    const missing = r.refused.filter((e) => e.required);
    return {
      verdict: 'INCOMPLETE',
      code: missing[0]?.code ?? 'REPO_ABSENT',
      summary: `${r.admitted.length} bundle(s) in scope, but a required entry is unavailable.`,
      detail: missing.map((e) => `required ${e.id}  ${e.status}  (${e.failed.join('+')}) ${e.path}`),
      nextAction: nextActionFor(missing[0]),
    };
  }
  const clipped = r.refused.filter((e) => OUTSIDE_SCOPE.has(e.code));
  if (clipped.length > 0) {
    return {
      verdict: 'CLIP',
      code: clipped[0].code,
      summary: `${r.admitted.length} bundle(s) in scope; ${clipped.length} declared path(s) stopped at the boundary.`,
      detail: clipped.map((e) => `${e.id}  ${e.code}  ${e.declaredPath}`),
      nextAction: nextActionFor(clipped[0]),
    };
  }
  return {
    verdict: 'ROUTE',
    code: 'OK',
    summary: `${r.admitted.length} bundle(s) in scope, nearest first.`,
    detail: [
      `authority  ${r.authority}`,
      ...r.admitted.map((e) => `${e.distance === Infinity ? ' peer' : `d=${e.distance}`}  ${e.path}  [${e.source}]`),
      ...(r.undisclosed > 0
        ? [`${r.undisclosed} path(s) beyond the boundary were not examined and are not named here`]
        : []),
    ],
    nextAction: 'read the admitted bundles nearest-first; cross-bundle merge is out of scope (#22/#24).',
  };
}

export function routeWriteOutcome(r: Resolution): Outcome {
  if (r.writeTarget) {
    return {
      verdict: 'ROUTE',
      code: 'OK',
      summary: `writes go to ${r.writeTarget.path}.`,
      detail: [
        `nearest admitted bundle at or above cwd, inside ${r.repoRoot}`,
        'read scope may be wider; write scope never crosses the repository boundary',
      ],
      nextAction: 'write the concept into that bundle.',
    };
  }
  const peers = r.admitted.filter((e) => e.distance === Infinity || !isAncestor(r.repoRoot ?? ' ', e.declaredPath)).length;
  const noRepo = r.repoRoot === null;
  return {
    verdict: 'REFUSE',
    code: r.writeCode,
    summary: noRepo
      ? 'there is no repository here to own the write.'
      : 'no bundle exists in this repository, and a federated bundle is never a write target.',
    detail: [
      `repository  ${r.repoRoot ?? 'none'}`,
      `readable but ineligible  ${peers} bundle(s) outside this repository`,
      'discovery is read-only: it never creates okf/ (§8 Scenario A)',
    ],
    nextAction: noRepo
      ? 'cd into a repository; a workspace root is a read boundary, not a write target.'
      : 'run the manual `init` operation to create a bundle in this repository.',
  };
}

/**
 * Adjudicate one path the human named. Naming it back is not a disclosure.
 *
 * A named path that a manifest already declares is judged against that declaration, which is
 * what makes `not_a_repository` and `IDENTITY_CHANGED` reachable at all: both are claims about
 * a declaration, not about a path. A path nobody declared can only ever be missing a bundle.
 */
export function reachOutcome(fs: Fs, auth: Authority, r: Resolution, here: string, path: string): Outcome {
  const declared = r.candidates.find((c) => c.declaredPath === path && c.source === 'manifest');
  const entry = gate(fs, auth, here, r.repoRoot, r.scopeRoot, {
    ...(declared ?? {}),
    id: declared?.id ?? labelOf(path),
    declaredPath: path,
    source: declared ? 'manifest' : 'named',
    required: declared?.required ?? false,
    named: true,
  });
  if (entry.status === 'available') {
    return {
      verdict: 'ROUTE',
      code: 'OK',
      summary: `${entry.path} passed all four gates.`,
      detail: [
        `reach     inside ${r.scopeRoot}`,
        `presence  bundle on disk${entry.note ? ` (${entry.note})` : ''}`,
        `trust     repository identity ${entry.repoIdentity}`,
        `access    readable by ${auth.harness}`,
      ],
      nextAction: 'the bundle may be read.',
    };
  }
  return {
    verdict: 'REFUSE',
    code: entry.code,
    summary: `${entry.failed.join(' + ')} refused ${entry.declaredPath}.`,
    detail: gateDetail(auth, r, entry),
    nextAction: nextActionFor(entry),
  };
}

function gateDetail(auth: Authority, r: Resolution, e: Entry): string[] {
  const out: string[] = [`status    ${e.status}`, `gate(s)   ${e.failed.join(' + ')}`];
  if (e.failed.includes('REACH')) {
    out.push(`expected  a path inside ${r.scopeRoot ?? '(no scope)'}`);
    out.push(`observed  ${e.code} — the boundary refused before anything else was checked`);
  }
  if (e.failed.includes('PRESENCE')) out.push(`observed  ${e.code} at ${e.declaredPath}`);
  if (e.failed.includes('TRUST')) {
    out.push(
      e.code === 'IDENTITY_CHANGED'
        ? `observed  a different repository identity than the manifest declared (${e.repoIdentity})`
        : `observed  repository identity ${e.repoIdentity} is not in the trusted set`,
    );
  }
  if (e.failed.includes('ACCESS')) {
    out.push(`observed  ${auth.harness} cannot read it; a declaration is not an access grant (§7.3)`);
  }
  if (e.note) out.push(e.note);
  return out;
}

function nextActionFor(e: Entry | undefined): string {
  if (!e) return 'nothing to do.';
  const fixes: string[] = [];
  if (e.failed.includes('REACH')) fixes.push(reachFix(e.code));
  if (e.failed.includes('PRESENCE')) fixes.push(presenceFix(e.code));
  if (e.failed.includes('TRUST')) {
    fixes.push(
      e.code === 'IDENTITY_CHANGED'
        ? 'confirm which repository this entry means, then update the manifest identity'
        : `trust repository identity ${e.repoIdentity}`,
    );
  }
  if (e.failed.includes('ACCESS')) fixes.push('configure access to the path (Codex sandbox root: `--add-dir <path>`; OS denial: adjust filesystem permissions)');
  return fixes.join('; then ') + '.';
}

function reachFix(code: BlockCode): string {
  switch (code) {
    case 'ABOVE_GIT_ROOT':
    case 'SIDEWAYS_SIBLING':
    case 'OUTSIDE_WORKSPACE':
    case 'CWD_NOT_A_WORKSPACE':
      return 'select a workspace root explicitly, or declare the path in a manifest';
    case 'SYMLINK_DENIED':
      return 'change the symlink policy from deny';
    case 'SYMLINK_ESCAPE':
      return 'allowlist the resolved target, or move it inside the workspace';
    case 'SYMLINK_CYCLE':
      return 'break the symlink cycle';
    case 'SYMLINK_BROKEN':
      return 'repair or remove the dangling symlink';
    case 'EXCLUDED_PATH':
      return 'move the bundle out of the excluded directory';
    case 'SUBMODULE_EXCLUDED':
      return 'opt the submodule in explicitly in the manifest';
    case 'NESTED_REPO_ANOMALY':
      return 'declare which repository owns the overlapping path';
    default:
      return 'widen the scope explicitly';
  }
}

function presenceFix(code: BlockCode): string {
  switch (code) {
    case 'REPO_ABSENT':
      return 'clone the declared repository (status will move declared_missing -> available)';
    case 'NOT_A_REPOSITORY':
      return 'point the manifest entry at a repository, or drop it';
    default:
      return 'run the manual `init` operation to create a bundle there';
  }
}

/** Render-agnostic explanation of the current scope, for any shell. */
export function explainScope(r: Resolution): string[] {
  switch (r.phase) {
    case 'unscoped':
      return [
        'no scope. cwd is not inside a repository and nothing has widened it.',
        'the portable floor without an additional-directory grant: Codex gives a skill nothing above cwd when there is no repo (§2.1).',
      ];
    case 'rejected':
      return [r.authority, 'autodiscovery is not a fallback for a manifest this build cannot parse.'];
    case 'repo':
      return [
        `repository scope: ${r.repoRoot}`,
        'the current repository is trusted implicitly; siblings and ancestors are not (§7.3).',
      ];
    case 'federated':
      return [
        `federated scope: ${r.scopeRoot}`,
        `authorized by ${r.authority}`,
        'declaration widens what may be looked at; it grants neither trust nor filesystem access.',
      ];
  }
}
