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
  h,
  observe,
  observeAll,
  observedItems,
  plan,
  postOpChecks,
  snapshotEntry,
  validationVerdict,
  applyEffect,
  type Corpus,
  type Fixture,
  type Spec,
} from './corpus.ts';
import {
  derive,
  inverseApprovalExpectation,
  ks,
  reduce,
  segments,
  stepEvents,
  checkInvariants,
  type Action,
  type ApprovedPlan,
  type BundleFacts,
  type ConceptKey,
  type EffectStep,
  type Frame,
  type Journal,
  type RecoveryEvidence,
  type Step,
  type SnapshotEntry,
} from './restructure.ts';

export interface World {
  readonly fixture: Fixture;
  readonly corpus: Corpus;
  readonly bundles: readonly BundleFacts[];
  readonly journal: Journal;
  readonly last: Step | null;
  readonly lastAction: string;
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

/** The target as it stands immediately before the write: I5's second reading. */
function beforeImage(world: World, s: EffectStep): string | null {
  return observedImage(world, s.target);
}

function observedImage(world: World, key: ConceptKey): string | null {
  const c = find(world.corpus, key);
  return c ? observe(c).observedHash : null;
}

function parentIntentUndo(parentSegment: Journal, s: EffectStep): SnapshotEntry | null {
  const ordinal = s.inverseOf;
  if (ordinal === null) return null;
  return stepEvents(parentSegment, ordinal).intent?.undo ?? null;
}

function undoFor(world: World, s: EffectStep): SnapshotEntry | null {
  if (s.inverseOf === null) return snapshotEntry(world.corpus, s.target);
  const allSegments = segments(world.journal);
  const parent = allSegments.length >= 2 ? allSegments[allSegments.length - 2] : [];
  return parentIntentUndo(parent, s);
}

interface BegunStep {
  readonly world: World;
  readonly undo: SnapshotEntry | null;
  readonly intentRecorded: boolean;
}

function beginEffect(world: World, label: string, s: EffectStep): BegunStep {
  const undo = undoFor(world, s);
  if (undo === null) return { world, undo, intentRecorded: false };
  const begun = dispatch(world, label, {
    kind: 'beginStep',
    ordinal: s.ordinal,
    observedBefore: beforeImage(world, s),
    sourceObservedBefore: s.inverseOf === null && s.movedFrom ? observedImage(world, s.movedFrom) : null,
    undo,
  });
  const appended = begun.journal.slice(world.journal.length);
  const events = stepEvents(appended, s.ordinal);
  const intentRecorded = events.intent !== null && events.outcome === null;
  return { world: begun, undo, intentRecorded };
}

function afterImage(corpus: Corpus, s: EffectStep): string | null {
  const c = find(corpus, s.target);
  return c ? observe(c).observedHash : null;
}

function completeEffect(
  world: World,
  label: string,
  s: EffectStep,
  outcome: 'ok' | 'io-failure' | 'concurrent-change-detected',
  observedAfter: string | null,
  observedAfterKnown: boolean,
  corpus: Corpus = world.corpus,
): World {
  return dispatch(world, label, {
    kind: 'completeStep',
    ordinal: s.ordinal,
    outcome,
    observedAfter,
    observedAfterKnown,
  }, corpus);
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

function rollbackEvidence(evidence: RecoveryEvidence): RecoveryEvidence {
  const content = evidence.snapshot?.entries.map((entry) => [
    ks(entry.key),
    entry.contentHash,
    entry.verificationHash,
  ]) ?? [];
  return {
    ...evidence,
    evidenceHash: h(`rollback-evidence|${evidence.snapshot?.id ?? '(none)'}|${JSON.stringify(content)}`),
  };
}

function rollbackApproval(world: World, evidence: RecoveryEvidence): ApprovedPlan | null {
  const allSegments = segments(world.journal);
  const parentSegment = allSegments[allSegments.length - 1] ?? [];
  const admitted = [...parentSegment].reverse().find((record) => record.r === 'ADMITTED');
  if (!admitted || admitted.r !== 'ADMITTED') return null;
  const parentApproved = admitted.approved;
  const expectation = inverseApprovalExpectation(parentApproved, parentSegment, evidence.evidenceHash);

  return {
    ...parentApproved,
    manifest: expectation.manifest,
    requestOccurrenceId: expectation.requestOccurrenceId,
    tokenId: expectation.tokenId,
    fingerprint: h(expectation.fingerprintPayload),
    items: expectation.items,
    recoveryEvidenceHash: expectation.recoveryEvidenceHash,
  };
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
      const label = `run step ${s.ordinal} ${s.kind} ${ks(s.target)}`;
      const begun = beginEffect(world, label, s);
      if (!begun.intentRecorded) return begun.world;
      const next = applyEffect(begun.world.corpus, s, begun.undo);
      return completeEffect(begun.world, label, s, 'ok', afterImage(next, s), true, next);
    }
    case 'N': {
      let w = world;
      for (;;) {
        const s = nextPending(w);
        if (!s) break;
        w = step(w, 'n');
      }
      return w;
    }
    case 'f': {
      const s = nextPending(world);
      if (!s) return world;
      const label = `run step ${s.ordinal} (write fails before landing; post-image known)`;
      const begun = beginEffect(world, label, s);
      if (!begun.intentRecorded) return begun.world;
      return completeEffect(begun.world, label, s, 'io-failure', beforeImage(world, s), true);
    }
    case 'F': {
      const s = nextPending(world);
      if (!s) return world;
      const label = `run step ${s.ordinal} (partial write fails)`;
      const begun = beginEffect(world, label, s);
      if (!begun.intentRecorded) return begun.world;
      const next = applyEffect(begun.world.corpus, s, begun.undo);
      return completeEffect(begun.world, label, s, 'io-failure', afterImage(next, s), true, next);
    }
    case 'c': {
      const s = nextPending(world);
      if (!s) return world;
      const label = `run step ${s.ordinal} (concurrent change detected; post-image unknown)`;
      const begun = beginEffect(world, label, s);
      if (!begun.intentRecorded) return begun.world;
      return completeEffect(begun.world, label, s, 'concurrent-change-detected', null, false);
    }
    case 'p': {
      // Produced bytes differ from the sealed post-image: a rewrite that also
      // reflowed, or a restore that reserialized frontmatter.
      const s = nextPending(world);
      if (!s) return world;
      const label = `run step ${s.ordinal} (bytes deviate from the sealed post-image)`;
      const begun = beginEffect(world, label, s);
      if (!begun.intentRecorded) return begun.world;
      const applied = applyEffect(begun.world.corpus, s, begun.undo);
      const gone = find(applied, s.target) === null;
      const deviated: Corpus = gone
        ? // The removal left a tombstone: absence was the sealed post-image.
          [...applied, { key: s.target, status: 'deprecated' as const, statusExplicit: true, body: 'residual artifact left by an incomplete removal', verification: [], sources: [] }]
        : applied.map((c) => (ks(c.key) === ks(s.target) ? { ...c, body: `${c.body}\r\n` } : c));
      return completeEffect(begun.world, label, s, 'ok', afterImage(deviated, s), true, deviated);
    }

    case 'Z': {
      // A step that is not in the approved manifest: there is no channel that
      // could introduce one during `mutating`.
      const target = manifest.steps[0];
      if (!target) return world;
      return dispatch(world, 'run a step that is not in the approved manifest', {
        kind: 'beginStep',
        ordinal: 999,
        observedBefore: beforeImage(world, target),
        sourceObservedBefore: null,
        undo: snapshotEntry(world.corpus, target.target),
      });
    }

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
      return dispatch(world, 'process dies (in-flight, no SETTLED)', { kind: 'crash' });
    case 'X': {
      // Death between the write landing and the journal append.
      const s = nextPending(world);
      if (!s) return world;
      const label = `process dies after step ${s.ordinal} wrote, before the journal append`;
      const begun = beginEffect(world, label, s);
      if (!begun.intentRecorded) return begun.world;
      const next = applyEffect(begun.world.corpus, s, begun.undo);
      return dispatch(begun.world, label, { kind: 'crash' }, next);
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
      {
        const evidence = rollbackEvidence(goodEvidence(world.corpus, keysTouched(world)));
        const approval = rollbackApproval(world, evidence);
        if (!approval) return world;
        return dispatch(world, 'begin rollback (fresh approval)', {
          kind: 'beginRollback',
          preRollbackEvidence: evidence,
          freshApproval: approval,
        });
      }
    case 'z':
      {
        const evidence = rollbackEvidence(badEvidence(world.corpus, keysTouched(world)));
        const approval = rollbackApproval(world, evidence);
        if (!approval) return world;
        return dispatch(world, 'begin rollback (pre-rollback snapshot unverified)', {
          kind: 'beginRollback',
          preRollbackEvidence: evidence,
          freshApproval: approval,
        });
      }

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
    case '9': {
      const source = manifest.steps.find((s) => s.movedFrom)?.movedFrom;
      if (!source) return world;
      return editConcept(
        world,
        source,
        (c) => ({ ...c, body: `${c.body} (edited by another session before the move write)` }),
        'another session edits the move source before its first write',
      );
    }

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
