/**
 * PROTOTYPE — throwaway glue between a keystroke and the restructuring machine.
 *
 * Kept separate from the terminal so the interactive shell (tui.ts) and the
 * scripted walkthrough (walkthrough.ts) drive the reducer through exactly the
 * same path. Nothing here is portable; `restructure.ts` is.
 */

import {
  find,
  goodEvidence,
  badEvidence,
  noFaults,
  observe,
  observeAll,
  observedItems,
  plan,
  postOpChecks,
  snapshotEntry,
  validationVerdict,
  applyEffect,
  type Corpus,
  type Faults,
  type Fixture,
  type Spec,
} from './corpus.ts';
import {
  derive,
  ks,
  reduce,
  checkInvariants,
  type Action,
  type BundleFacts,
  type ConceptKey,
  type EffectStep,
  type Frame,
  type Journal,
  type Step,
} from './restructure.ts';

export interface World {
  readonly fixture: Fixture;
  readonly corpus: Corpus;
  readonly bundles: readonly BundleFacts[];
  readonly journal: Journal;
  readonly last: Step | null;
  readonly lastAction: string;
  readonly faults: Faults;
  readonly log: readonly string[];
}

export function createWorld(spec: Spec): World {
  const fixture = plan(spec);
  return {
    fixture,
    corpus: fixture.pre,
    bundles: fixture.approved.manifest.bundles,
    journal: [],
    last: null,
    lastAction: '(none)',
    faults: noFaults(),
    log: [],
  };
}

export function frameOf(world: World): Frame {
  return derive(world.journal, observeAll(world.corpus));
}

export function violationsOf(world: World): readonly string[] {
  return checkInvariants(frameOf(world), world.journal).map((v) => `${v.rule}: ${v.detail}`);
}

function dispatch(world: World, label: string, action: Action, corpus: Corpus = world.corpus): World {
  const step = reduce(world.journal, observeAll(corpus), action);
  return {
    ...world,
    corpus,
    journal: step.journal,
    last: step,
    lastAction: label,
    log: [...world.log, `${label} -> ${step.verdict} ${step.code}`].slice(-6),
  };
}

/** The manifest currently in flight (the parent, or the inverse during rollback). */
function liveSteps(world: World): readonly EffectStep[] {
  return frameOf(world).manifest?.steps ?? [];
}

function nextPending(world: World): EffectStep | null {
  const frame = frameOf(world);
  const pending = frame.steps.find(([, o]) => o.state === 'not-started');
  if (!pending) return null;
  return liveSteps(world).find((s) => s.ordinal === pending[0]) ?? null;
}

function keysTouched(world: World): readonly ConceptKey[] {
  const out: ConceptKey[] = [];
  const seen = new Set<string>();
  for (const s of world.fixture.approved.manifest.steps) {
    for (const k of [s.target, s.movedFrom]) {
      if (!k || seen.has(ks(k))) continue;
      seen.add(ks(k));
      out.push(k);
    }
  }
  return out;
}

// --- one keystroke, one new world -----------------------------------------

export function step(world: World, key: string): World {
  const fixture = world.fixture;
  const manifest = fixture.approved.manifest;

  switch (key) {
    case 'a':
      return dispatch(world, 'admit approved plan', { kind: 'admit', approved: fixture.approved });

    case 'g':
      return dispatch(world, 'recovery gate (complete evidence)', {
        kind: 'gate',
        evidence: goodEvidence(world.corpus, keysTouched(world)),
      });
    case 'G':
      return dispatch(world, 'recovery gate (stale / unverified restore)', {
        kind: 'gate',
        evidence: badEvidence(world.corpus, keysTouched(world)),
      });

    case 'l':
      return dispatch(world, 'acquire per-bundle locks', { kind: 'lock' });

    case 'k':
      return dispatch(world, 'recheck against the live corpus', {
        kind: 'recheck',
        observed: observedItems(world.corpus, manifest.steps),
        bundles: world.bundles,
      });

    case 'm':
      return dispatch(world, 'seal manifest durably', { kind: 'sealManifest', ok: true });
    case 'M':
      return dispatch(world, 'seal manifest (write fails)', { kind: 'sealManifest', ok: false });

    case 'n': {
      const s = nextPending(world);
      if (!s) return world;
      const next = applyEffect(world.corpus, s, fixture.pre);
      const after = find(next, s.target) ? observe(find(next, s.target)!).observedHash : null;
      return dispatch(
        world,
        `run step ${s.ordinal} ${s.kind} ${ks(s.target)}`,
        { kind: 'runStep', ordinal: s.ordinal, outcome: 'ok', observedAfter: after, undo: snapshotEntry(world.corpus, s.target) },
        next,
      );
    }
    case 'N': {
      let w = world;
      for (let i = 0; i < 40; i++) {
        const s = nextPending(w);
        if (!s) break;
        w = step(w, 'n');
      }
      return w;
    }
    case 'f': {
      const s = nextPending(world);
      if (!s) return world;
      return dispatch(world, `run step ${s.ordinal} (write fails)`, {
        kind: 'runStep',
        ordinal: s.ordinal,
        outcome: 'io-failure',
        observedAfter: null,
        undo: snapshotEntry(world.corpus, s.target),
      });
    }
    case 'c': {
      const s = nextPending(world);
      if (!s) return world;
      return dispatch(world, `run step ${s.ordinal} (concurrent change detected)`, {
        kind: 'runStep',
        ordinal: s.ordinal,
        outcome: 'concurrent-change-detected',
        observedAfter: null,
        undo: snapshotEntry(world.corpus, s.target),
      });
    }
    case 'p': {
      // Produced bytes differ from the sealed post-image: a rewrite that also
      // reflowed, or a restore that reserialized frontmatter.
      const s = nextPending(world);
      if (!s) return world;
      const applied = applyEffect(world.corpus, s, fixture.pre);
      const gone = find(applied, s.target) === null;
      const deviated: Corpus = gone
        ? // The removal left a tombstone: absence was the sealed post-image.
          [...applied, { key: s.target, status: 'deprecated' as const, statusExplicit: true, body: 'residual artifact left by an incomplete removal', verification: [], sources: [] }]
        : applied.map((c) => (ks(c.key) === ks(s.target) ? { ...c, body: `${c.body}\r\n` } : c));
      const after = find(deviated, s.target) ? observe(find(deviated, s.target)!).observedHash : null;
      return dispatch(
        world,
        `run step ${s.ordinal} (bytes deviate from the sealed post-image)`,
        { kind: 'runStep', ordinal: s.ordinal, outcome: 'ok', observedAfter: after, undo: snapshotEntry(world.corpus, s.target) },
        deviated,
      );
    }

    case 'Z':
      // A step that is not in the approved manifest: there is no channel that
      // could introduce one during `mutating`.
      return dispatch(world, 'run a step that is not in the approved manifest', {
        kind: 'runStep',
        ordinal: 999,
        outcome: 'ok',
        observedAfter: null,
        undo: snapshotEntry(world.corpus, manifest.steps[0].target),
      });

    case 'v':
      return dispatch(world, 'post-operation verification', {
        kind: 'verify',
        verdict: validationVerdict(true),
        checks: postOpChecks(fixture, world.corpus),
      });
    case 'V':
      return dispatch(world, 'post-operation verification (OKF invalid)', {
        kind: 'verify',
        verdict: validationVerdict(false),
        checks: postOpChecks(fixture, world.corpus),
      });
    case 'w':
      return dispatch(world, 'post-operation verification (dangling workspace alias)', {
        kind: 'verify',
        verdict: validationVerdict(true),
        checks: postOpChecks(fixture, world.corpus, { danglingAlias: true }),
      });
    case 'W':
      return dispatch(world, 'post-operation verification (self-scoped / cyclic dependency)', {
        kind: 'verify',
        verdict: validationVerdict(true),
        checks: postOpChecks(fixture, world.corpus, { structural: true }),
      });
    case 'i':
      return dispatch(world, 'post-operation verification (duplicate Concept ID in bundle)', {
        kind: 'verify',
        verdict: validationVerdict(true),
        checks: postOpChecks(fixture, world.corpus, { identity: 'fail' }),
      });
    case 'I':
      return dispatch(world, 'post-operation verification (same ID in another bundle: advisory)', {
        kind: 'verify',
        verdict: validationVerdict(true),
        checks: postOpChecks(fixture, world.corpus, { crossBundleSameId: true }),
      });

    case 'x':
      return dispatch(world, 'process dies (in-flight, no SETTLED)', { kind: 'crash', duringStep: null });
    case 'X': {
      // Death between the write landing and the journal append.
      const s = nextPending(world);
      if (!s) return world;
      const next = applyEffect(world.corpus, s, fixture.pre);
      return dispatch(
        world,
        `process dies after step ${s.ordinal} wrote, before the journal append`,
        { kind: 'crash', duringStep: { ordinal: s.ordinal, undo: snapshotEntry(world.corpus, s.target) } },
        next,
      );
    }
    case 'r':
      return dispatch(world, 'reconcile journal against the observed world', { kind: 'reconcile' });
    case 'R':
      return dispatch(world, 'recover interrupted operation (human-invoked)', { kind: 'recoverInterrupted' });

    case 'b':
      return dispatch(world, 'begin rollback (no fresh approval)', {
        kind: 'beginRollback',
        preRollbackEvidence: goodEvidence(world.corpus, keysTouched(world)),
        freshApproval: null,
      });
    case 'B':
      return dispatch(world, 'begin rollback (fresh approval)', {
        kind: 'beginRollback',
        preRollbackEvidence: goodEvidence(world.corpus, keysTouched(world)),
        freshApproval: fixture.approved,
      });
    case 'z':
      return dispatch(world, 'begin rollback (pre-rollback snapshot unverified)', {
        kind: 'beginRollback',
        preRollbackEvidence: badEvidence(world.corpus, keysTouched(world)),
        freshApproval: fixture.approved,
      });

    case 'o':
      return dispatch(world, 'observation: a published redirect was followed', {
        kind: 'observe',
        ordinal: 0,
        what: 'redirect-followed',
        detail: 'a reader followed the redirect at the vacated identity',
      });
    case 'O':
      return dispatch(world, 'observation: an output was human-verified', {
        kind: 'observe',
        ordinal: 0,
        what: 'output-human-verified',
        detail: 'a human reviewed and verified the new output before the rollback',
      });
    case 'u':
      return dispatch(world, 'observation: retrieval served the successor', {
        kind: 'observe',
        ordinal: 0,
        what: 'retrieval-served',
        detail: 'retrieval already served the successor to an agent turn',
      });
    case 'U':
      return dispatch(world, 'observation: the output was superseded in turn', {
        kind: 'observe',
        ordinal: 0,
        what: 'output-superseded-in-turn',
        detail: 'a later operation superseded the output produced here',
      });

    case 'y': {
      const first = frameOf(world).ambiguities[0];
      if (!first) return world;
      return dispatch(world, `acknowledge ambiguity ${first.kind}`, { kind: 'acknowledge', ambiguity: first.kind });
    }

    // --- concurrent world mutations (between preview and apply) -----------
    case '1':
      return editConcept(world, primaryKey(world), (c) => ({ ...c, body: `${c.body} (edited by another session)` }), 'another session edits the source body');
    case '2':
      return editConcept(
        world,
        primaryKey(world),
        (c) => ({ ...c, verification: [...c.verification, { actor: 'human:bo', at: '2026-07-01' }] }),
        'another session adds a human: verification event (content untouched)',
      );
    case '3': {
      const target = manifest.steps.find((s) => s.kind === 'CREATE_OUTPUT' || (s.kind === 'MOVE_PATH' && s.action === 'CREATE'));
      if (!target) return world;
      return {
        ...world,
        corpus: [
          ...world.corpus,
          { key: target.target, status: 'stable', statusExplicit: true, body: 'created by a concurrent session', verification: [], sources: [] },
        ],
        lastAction: `another session creates a concept at ${ks(target.target)}`,
        last: null,
      };
    }
    case '4': {
      const key = primaryKey(world);
      return {
        ...world,
        corpus: world.corpus.map((c) => (ks(c.key) === ks(key) ? { ...c, key: { ...c.key, id: `${c.key.id}-moved` as typeof c.key.id } } : c)),
        lastAction: 'another session moved the concept first',
        last: null,
      };
    }
    case '5':
      return editConcept(
        world,
        manifest.inboundLinks.links[0].from,
        (c) => ({ ...c, body: `${c.body} (holder edited for unrelated reasons)` }),
        'an inbound-link holder is edited for unrelated reasons',
      );
    case '6':
      return editConcept(world, primaryKey(world), (c) => ({ ...c, status: 'deprecated' }), 'another session deprecates the concept first');
    case '7':
      return {
        ...world,
        bundles: world.bundles.map((b) => ({ ...b, epoch: b.epoch + 1, generation: `${b.generation}+` })),
        lastAction: 'another worktree of the same repository advanced the ledger',
        last: null,
      };
    case '8':
      return editConcept(
        world,
        manifest.steps.find((s) => s.kind === 'CREATE_OUTPUT' || s.kind === 'CONTENT_EDIT')?.target ?? primaryKey(world),
        (c) => ({ ...c, body: `${c.body} (edited by its own author)` }),
        'the successor is edited by the session that authored it',
      );

    default:
      return world;
  }
}

function primaryKey(world: World): ConceptKey {
  const m = world.fixture.approved.manifest;
  const s = m.steps.find((x) => x.movedFrom) ?? m.steps.find((x) => x.kind === 'STATUS_TRANSITION') ?? m.steps[0];
  return s.movedFrom ?? s.target;
}

function editConcept(
  world: World,
  key: ConceptKey,
  f: (c: Corpus[number]) => Corpus[number],
  label: string,
): World {
  return {
    ...world,
    corpus: world.corpus.map((c) => (ks(c.key) === ks(key) ? f(c) : c)),
    lastAction: label,
    last: null,
  };
}

/** The catalogue the interactive shell cycles through with `[` and `]`. */
export const FIXTURES: readonly Spec[] = [
  { op: 'merge', label: 'merge two verified sources into one draft output' },
  { op: 'merge', label: 'merge with the index regenerated early', indexEarly: true },
  { op: 'merge', label: 'merge that also edits a source (claim-affecting)', editSource: true },
  { op: 'merge', label: 'merge whose sources sit in different bundles', crossBundle: true },
  { op: 'merge', label: 'merge in a knowledge-only bundle that plans a DELETE', knowledgeOnly: true, deleteSources: true, deletionProof: 'ok' },
  { op: 'split', label: 'split one concept into two draft outputs' },
  { op: 'split', label: 'split with an unassigned inbound-link fate', unassignedFate: true },
  { op: 'split', label: 'split with a candidate redirect artifact', redirectStep: true },
  { op: 'move', label: 'in-bundle move (identity change, trust preserved)' },
  { op: 'move', label: 'cross-bundle move (migration, two ledgers)', crossBundle: true },
  { op: 'move', label: 'move whose link rewrite escaped to another repository', escapedLink: true },
  { op: 'move', label: 'move plus a content edit, kept as separate steps', moveAlsoEdits: true },
  { op: 'supersede', label: 'supersede, archive policy = deprecate-in-place' },
  { op: 'supersede', label: 'supersede, archive policy = relocate', archiveRelocate: true },
  { op: 'supersede', label: 'supersede with a deletion folded in', foldedDelete: true },
];

export function drive(spec: Spec, keys: readonly string[]): World {
  let world = createWorld(spec);
  for (const k of keys) world = step(world, k);
  return world;
}
