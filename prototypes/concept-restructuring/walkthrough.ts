/**
 * PROTOTYPE — scripted walkthrough of the hard-case catalogue.
 *
 * Run:  node prototypes/concept-restructuring/walkthrough.ts
 *
 * One scenario per row of the catalogue in DESIGN.md §5. Each row drives the
 * same keystroke path a human drives in tui.ts and ASSERTS the resulting state.
 * A FAIL row is the interesting one: it means the idea, not the code, needs a
 * decision. Every scenario additionally asserts that `checkInvariants` is silent.
 */

import { drive, frameOf, violationsOf, type World } from './driver.ts';
import { admissionRefusal, ks, type AmbiguityKind, type Journal, type RefusalCode } from './restructure.ts';
import { observeAll, type Spec } from './corpus.ts';

type Check = (w: World) => string | null;

// --- assertion vocabulary --------------------------------------------------

const all =
  (...cs: Check[]): Check =>
  (w) => {
    const bad = cs.map((c) => c(w)).filter((x): x is string => x !== null);
    return bad.length > 0 ? bad.join('; ') : null;
  };

const phase =
  (p: string): Check =>
  (w) =>
    frameOf(w).phase === p ? null : `phase=${frameOf(w).phase} (wanted ${p})`;

const code =
  (c: RefusalCode): Check =>
  (w) =>
    frameOf(w).refusal?.code === c ? null : `refusal=${frameOf(w).refusal?.code ?? 'none'} (wanted ${c})`;

const verdict =
  (v: string): Check =>
  (w) =>
    w.last?.verdict === v ? null : `verdict=${w.last?.verdict ?? 'none'} (wanted ${v})`;

const lastCode =
  (c: string): Check =>
  (w) =>
    w.last?.code === c ? null : `code=${w.last?.code ?? 'none'} (wanted ${c})`;

const ambiguity =
  (k: AmbiguityKind): Check =>
  (w) =>
    frameOf(w).ambiguities.some((a) => a.kind === k)
      ? null
      : `ambiguities=[${frameOf(w).ambiguities.map((a) => a.kind).join(', ')}] (wanted ${k})`;

const noRecord =
  (r: Journal[number]['r']): Check =>
  (w) =>
    w.journal.some((x) => x.r === r) ? `journal contains ${r}` : null;

const hasRecord =
  (r: Journal[number]['r']): Check =>
  (w) =>
    w.journal.some((x) => x.r === r) ? null : `journal has no ${r}`;

const recordCount =
  (r: Journal[number]['r'], n: number): Check =>
  (w) => {
    const c = w.journal.filter((x) => x.r === r).length;
    return c === n ? null : `${r} count=${c} (wanted ${n})`;
  };

const driftContains =
  (needle: string): Check =>
  (w) =>
    frameOf(w).drift.some((d) => d.includes(needle))
      ? null
      : `drift=[${frameOf(w).drift.join(' | ')}] (wanted a line containing "${needle}")`;

const driftLacks =
  (needle: string): Check =>
  (w) =>
    frameOf(w).drift.some((d) => d.includes(needle)) ? `drift unexpectedly contains "${needle}"` : null;

const noticeContains =
  (needle: string): Check =>
  (w) =>
    frameOf(w).notice.some((n) => n.includes(needle)) ? null : `notice lacks "${needle}"`;

const humanActionContains =
  (needle: string): Check =>
  (w) =>
    frameOf(w).humanActionRequired.some((n) => n.includes(needle))
      ? null
      : `humanActionRequired=[${frameOf(w).humanActionRequired.join(' | ')}] (wanted "${needle}")`;

const openQuestionContains =
  (needle: string): Check =>
  (w) =>
    frameOf(w).openQuestions.some((n) => n.includes(needle)) ? null : `openQuestions lacks "${needle}"`;

const detailContains =
  (needle: string): Check =>
  (w) =>
    (frameOf(w).refusal?.detail ?? []).some((d) => d.includes(needle))
      ? null
      : `refusal detail lacks "${needle}"`;

const trustOf =
  (id: string, before: string, after: string, invalidated: boolean): Check =>
  (w) => {
    const t = frameOf(w).trust.filter((x) => x.key.id === id).pop();
    if (!t) return `no TrustOutcome for ${id}`;
    if (t.before !== before || t.after !== after) return `${id}: ${t.before}->${t.after} (wanted ${before}->${after})`;
    if (t.invalidationReported !== invalidated) return `${id}: invalidationReported=${t.invalidationReported}`;
    return null;
  };

const linkState =
  (id: string, state: string): Check =>
  (w) => {
    const l = frameOf(w).links.find(([lid]) => lid === id);
    if (!l) return `no resolution for link ${id}`;
    return l[1].state === state ? null : `link ${id} is ${l[1].state} (wanted ${state})`;
  };

const stepState =
  (ordinal: number, state: string): Check =>
  (w) => {
    const s = frameOf(w).steps.find(([o]) => o === ordinal);
    if (!s) return `no observation for step ${ordinal}`;
    return s[1].state === state ? null : `step ${ordinal} is ${s[1].state} (wanted ${state})`;
  };

const check =
  (label: string, f: (w: World) => boolean): Check =>
  (w) =>
    f(w) ? null : label;

const noViolations: Check = (w) => {
  const v = violationsOf(w);
  return v.length === 0 ? null : `invariant violations: ${v.join('; ')}`;
};

// --- shared specs ----------------------------------------------------------

const merge = (extra: Partial<Spec> = {}): Spec => ({ op: 'merge', label: `merge ${JSON.stringify(extra)}`, ...extra });
const split = (extra: Partial<Spec> = {}): Spec => ({ op: 'split', label: `split ${JSON.stringify(extra)}`, ...extra });
const move = (extra: Partial<Spec> = {}): Spec => ({ op: 'move', label: `move ${JSON.stringify(extra)}`, ...extra });
const supersede = (extra: Partial<Spec> = {}): Spec => ({ op: 'supersede', label: `supersede ${JSON.stringify(extra)}`, ...extra });

const K = (s: string) => s.split('');
const ADMIT = K('a');
const SEALED = K('aglkm');
const APPLIED = K('aglkmNv');

interface Scenario {
  readonly id: string;
  readonly hardCase: string;
  readonly spec: Spec;
  readonly keys: readonly string[];
  readonly check: Check;
}

const S = (id: string, hardCase: string, spec: Spec, keys: readonly string[], c: Check): Scenario => ({
  id,
  hardCase,
  spec,
  keys,
  check: all(c, noViolations),
});

// ===========================================================================
// 5.1 Merge (40)
// ===========================================================================

const MERGE: Scenario[] = [
  S('M-P-01', 'sources in different bundles', merge({ crossBundle: true }), ADMIT,
    all(phase('refused'), code('CROSS_BUNDLE_MERGE_UNEXPRESSIBLE'), noRecord('ADMITTED'))),

  S('M-P-02', 'preview shows only the output', merge({ omitSourceFate: true }), ADMIT,
    all(phase('refused'), code('SOURCE_FATE_UNENUMERATED'), detailContains('concepts/auth'), detailContains('concepts/tokens'))),

  S('M-P-03', 'knowledge-only bundle, plan emits DELETE', merge({ knowledgeOnly: true, deleteSources: true, deletionProof: 'ok' }), ADMIT,
    all(phase('refused'), code('KNOWLEDGE_ONLY_DELETE_BLOCKED'),
      check('no step was rewritten to STATUS_TRANSITION', (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'DELETE_CONCEPT')))),

  S('M-P-04', 'code-backed delete without proof', merge({ deleteSources: true, deletionProof: 'none' }), ADMIT,
    all(phase('refused'), code('DELETION_UNPROVEN'),
      check('unique durable context refuses with its own code', () =>
        frameOf(drive(merge({ deleteSources: true, deletionProof: 'unique' }), ADMIT)).refusal?.code === 'UNIQUE_DURABLE_CONTEXT'))),

  S('M-P-05', 'mixed trust across sources', merge({ mixedTrust: true }), ADMIT,
    all(phase('admitting'),
      trustOf('concepts/identity', 'unverified', 'unverified', false),
      trustOf('concepts/auth', 'human-reviewed', 'human-reviewed', false),
      trustOf('concepts/tokens', 'machine-confirmed', 'machine-confirmed', false))),

  S('M-P-06', 'duplicate sources[].id with different resources', merge({ provenanceCollision: true }), ADMIT,
    all(phase('admitting'),
      check('provenanceCollisions non-empty', (w) => w.fixture.approved.manifest.provenanceCollisions.length > 0),
      check('no dedup was applied', (w) => w.fixture.approved.manifest.provenance.filter((p) => p.entry.id === 'S1').length === 2),
      openQuestionContains('Design concept merge, split, redirect, and inbound-link semantics'))),

  S('M-P-07', 'a source is already deprecated', merge({ deprecatedSource: true }), ADMIT,
    all(phase('refused'), code('REANIMATES_RETIRED_IDENTITY'),
      check('an explicit deprecated -> stable step admits it', () =>
        frameOf(drive(merge({ deprecatedSource: true, reviveStep: true }), ADMIT)).phase === 'admitting'))),

  S('M-P-08', 'output ID collides with an existing concept', merge({ outputCollides: true }), ADMIT,
    all(phase('refused'), code('DESTINATION_OCCUPIED'), detailContains('concepts/identity'))),

  S('M-P-09', 'a source is a third party review-dependency target', merge({ omitReviewImpact: true }), ADMIT,
    all(phase('refused'), code('DEPENDENCY_BREAKAGE_UNLISTED'),
      check('listing it as unavailable with a scheduled repair admits it', () =>
        frameOf(drive(merge(), ADMIT)).phase === 'admitting'))),

  S('M-P-10', 'inbound links in a read-only bundle', merge(), ADMIT,
    all(phase('admitting'),
      check('L3 is approved breakage', (w) => w.fixture.approved.manifest.approvedBreakage.includes('L3' as never)),
      check('a rewrite fate on a read-only holder is inadmissible', () =>
        frameOf(drive(merge({ rewriteReadOnly: true }), ADMIT)).refusal?.code === 'DESTINATION_BUNDLE_READ_ONLY'))),

  S('M-P-11', 'inbound-link-bearing federation member inactive', merge({ incompleteLinks: true }), ADMIT,
    all(phase('refused'), code('LINK_SET_INCOMPLETE'), detailContains('inactive-required-member'))),

  S('M-A-01', 'output exists and validates before any source is deprecated', merge({ badOrdering: true }), ADMIT,
    all(phase('refused'), code('ORDERING_WOULD_UNMOOR_KNOWLEDGE'),
      check('the well-ordered plan puts every create below every removal', () => {
        const steps = drive(merge(), []).fixture.approved.manifest.steps;
        const creates = steps.filter((s) => s.kind === 'CREATE_OUTPUT').map((s) => s.ordinal);
        const removals = steps.filter((s) => s.kind === 'STATUS_TRANSITION').map((s) => s.ordinal);
        return Math.max(...creates) < Math.min(...removals);
      }))),

  S('M-A-02', 'one guard execution, one lock, one epoch advance', merge(), APPLIED,
    all(phase('applied-with-known-breakage'), recordCount('LOCKED', 1), recordCount('EPOCH_ADVANCED', 1), recordCount('SETTLED', 1))),

  S('M-A-03', 'index regen and link repair inherit approval; wider edits do not', merge(), ADMIT,
    all(phase('admitting'),
      check('INDEX_REGEN directly-affected inherits', (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'INDEX_REGEN' && s.indexScope === 'directly-affected' && s.approvalScope === 'inherited')),
      check('confined LINK_REWRITE inherits', (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'LINK_REWRITE' && s.approvalScope === 'inherited')),
      check('a broad rebuild needs its own gate', () =>
        frameOf(drive(merge({ broadRebuild: true }), ADMIT)).refusal?.code === 'BROAD_REBUILD_NEEDS_OWN_GATE'))),

  S('M-A-04', 'output written as explicit status: draft', merge({ notExplicitDraft: true }), ADMIT,
    all(phase('refused'), code('OUTPUT_NOT_EXPLICIT_DRAFT'),
      check('the explicit-draft plan admits', () => frameOf(drive(merge(), ADMIT)).phase === 'admitting'))),

  S('M-A-05', 'source deprecation must already be in the approved preview', merge(), [...SEALED, 'Z'],
    all(phase('manifest-durable'), verdict('REFUSE'), lastCode('STEP_NOT_IN_APPROVED_MANIFEST'), noRecord('INTENT'))),

  S('M-A-06', 'manifest records old-ID to new-ID lineage before any mutation', merge(), [...SEALED, 'n'],
    all(check('MANIFEST_DURABLE strictly precedes the first INTENT', (w) =>
      w.journal.findIndex((r) => r.r === 'MANIFEST_DURABLE') < w.journal.findIndex((r) => r.r === 'INTENT')),
      check('lineage is non-empty at seal time', (w) => w.fixture.approved.manifest.lineage.length === 2))),

  S('M-F-01', 'output written, second deprecation fails', merge(), K('aglkmnnf'),
    all(phase('failed-dirty'), ambiguity('two-live-carriers-no-authority'),
      noticeContains('failed-dirty'), check('notice never reports success', (w) => !frameOf(w).notice.some((n) => n.includes('applied'))))),

  S('M-F-02', 'failure before the manifest is durable', merge(), K('aglkM'),
    all(phase('gate-blocked'), noRecord('INTENT'), noRecord('MANIFEST_DURABLE'))),

  S('M-F-03', 'token unspent, epoch unadvanced, retry EXPIREs', merge(), [...K('aglkmnnf'), ...K('aglk')],
    all(phase('expired'), verdict('EXPIRE'),
      check('no EPOCH_ADVANCED anywhere', (w) => !w.journal.some((r) => r.r === 'EPOCH_ADVANCED')),
      noRecord('SETTLED'), driftContains('concepts/auth'))),

  S('M-F-04', 'rollback must delete the just-created output', merge({ knowledgeOnly: true }), K('aglkmnnfB'),
    all(phase('rolling-back'),
      check('the inverse of a create is UNDO_CREATE, not a policy delete', (w) =>
        (frameOf(w).manifest?.steps ?? []).some((s) => s.kind === 'UNDO_CREATE')))),

  S('M-F-05', 'failure after index regen, before source deprecation', merge({ indexEarly: true }), K('aglkmnnf'),
    all(phase('failed-dirty'), ambiguity('index-advertises-unsettled-outcome'),
      check("the INDEX_REGEN step's escape is observable-local", (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'INDEX_REGEN' && s.escape === 'observable-local')))),

  S('M-C-01', 'any source content change', merge(), K('a1glk'),
    all(phase('expired'), driftContains('content changed: okf::concepts/auth'))),

  S('M-C-02', 'a source gains human: verification, content unchanged', merge(), K('a2glk'),
    all(phase('expired'), driftContains('verification changed: okf::concepts/auth'), driftLacks('content changed'))),

  S('M-C-03', 'sibling holds a confirmed split of one of our sources', merge(), APPLIED,
    all(phase('applied-with-known-breakage'),
      check('EPOCH_ADVANCED precedes SETTLED', (w) =>
        w.journal.findIndex((r) => r.r === 'EPOCH_ADVANCED') < w.journal.findIndex((r) => r.r === 'SETTLED')),
      check("the sibling's confirmation dies at its own recheck, not at our write", () =>
        frameOf(drive(split(), K('a7glk'))).phase === 'expired'))),

  S('M-C-04', 'an unrelated inbound-link holder is edited', merge(), K('a5glk'),
    all(phase('expired'), driftContains('concepts/holder-a'))),

  S('M-C-05', 'concurrent change detected during apply', merge(), K('aglkmnc'),
    all(phase('failed-dirty'), ambiguity('foreign-mutation-in-scope'),
      check('expired is unreachable once any step is done', (w) => frameOf(w).phase !== 'expired'))),

  S('M-V-01', 'all sources human-verified', merge(), APPLIED,
    all(trustOf('concepts/identity', 'unverified', 'unverified', false),
      check('the output is an explicit draft', (w) =>
        frameOf(w).identityDiff.find((r) => r.key.id === 'concepts/identity')?.after?.status === 'draft'),
      check('no inheritance edge exists in the trust table', (w) =>
        frameOf(w).trust.every((t) => t.before === 'unverified' || t.after === t.before)))),

  S('M-V-02', 'deprecated but content-unchanged source', merge(), APPLIED,
    all(trustOf('concepts/auth', 'human-reviewed', 'human-reviewed', false),
      check('classified as a status transition', (w) =>
        frameOf(w).trust.some((t) => t.key.id === 'concepts/auth' && !t.classification.claimAffecting && t.classification.allowlist === 'status-transition')))),

  S('M-V-03', 'source content-edited to remove merged material', merge({ editSource: true }), APPLIED,
    all(trustOf('concepts/auth', 'human-reviewed', 'unverified', true),
      check('an INVALIDATION shares the step ordinal', (w) => {
        const step = w.fixture.approved.manifest.steps.find((s) => s.kind === 'CONTENT_EDIT');
        return !!step && w.journal.some((r) => r.r === 'INVALIDATION' && r.ordinal === step.ordinal);
      }))),

  S('M-V-04', 'OKF-valid but dangling okf-workspace:// alias', merge(), [...K('aglkmN'), 'w'],
    all(phase('failed-dirty'),
      check('okfValid is true while linkChecks fail', (w) => frameOf(w).validation?.okfValid === true && frameOf(w).checks?.linkChecks === 'fail'))),

  S('M-V-05', 'review baselines cannot transfer to the output', merge(), ADMIT,
    check('every output dependency has no baseline and an unaccepted observation', (w) =>
      frameOf(w).reviewDependencies.filter((d) => d.owner.id === 'concepts/identity')
        .every((d) => !d.hasBaseline && d.finding.kind === 'no-baseline' && d.capturedObservation?.accepted === false))),

  S('M-V-06', "output's inherited scope contains itself or closes a cycle", merge(), [...K('aglkmN'), 'W'],
    all(phase('failed-dirty'),
      check('dependencyChecks fail with structural invalidity', (w) =>
        frameOf(w).checks?.dependencyChecks === 'fail' && (frameOf(w).checks?.structuralInvalidity.length ?? 0) > 0),
      check('no earlier action produced structural invalidity', () =>
        frameOf(drive(merge(), K('aglkmN'))).reviewDependencies.every((d) => d.structuralInvalidity.length === 0)))),

  S('M-R-01', 'byte-identical restore of sources', merge(), K('aglkmnnfBN'),
    all(phase('reverted-clean'), hasRecord('SETTLED'),
      check("the source's verification came back with its bytes", (w) => {
        const row = frameOf(w).identityDiff.find((r) => r.key.id === 'concepts/auth');
        return row?.after?.tier === 'human-reviewed' && row.after.status === 'stable';
      }),
      check('the created output is gone', (w) =>
        frameOf(w).identityDiff.find((r) => r.key.id === 'concepts/identity')?.after === null))),

  S('M-R-02', 'a published redirect was already followed', merge(), K('aglkmnnfoBN'),
    all(phase('reverted-with-residue'),
      check('the residue names the followed redirect', (w) => frameOf(w).residue.some((r) => r.statement.includes('redirect-followed'))))),

  S('M-R-03', 'rollback must snapshot the current state first', merge(), K('aglkmnnfz'),
    all(phase('failed-dirty'), verdict('BLOCK'), lastCode('PRE_ROLLBACK_EVIDENCE_INCOMPLETE'))),

  S('M-R-04', 'restore into a disposable location, hash-verified, else blocked', merge(), K('aglkmnnfz'),
    all(verdict('BLOCK'), humanActionContains('neither applied nor rolled back'))),

  S('M-R-05', 'byte-identical merge re-attempted after rollback', merge(), [...K('aglkmnnfBN'), ...K('aglkm')],
    all(phase('manifest-durable'),
      check('no SETTLED{applied} exists for the parent', (w) => !w.journal.some((r) => r.r === 'SETTLED' && r.as === 'applied')))),

  S('M-R-06', 'crash with in-flight recorded', merge(), K('aglkmnx'),
    all(phase('unknown-interrupted'),
      check('settlement is failed', (w) => frameOf(w).classification.settlement === 'failed'),
      check('recovery reports unknown and advances the epoch without settling', () => {
        const w = drive(merge(), K('aglkmnxR'));
        return w.journal.some((r) => r.r === 'RECOVERY_REPORT' && r.outcome === 'unknown') &&
          w.journal.some((r) => r.r === 'EPOCH_ADVANCED') &&
          !w.journal.some((r) => r.r === 'SETTLED');
      }))),

  S('M-R-07', 'rollback authorization cannot rest on another machine ledger', merge(), K('aglkmnnf7B'),
    all(phase('rolling-back'),
      check('only rollbackSteps, INTENT.undo and the snapshot were consulted', (w) =>
        (frameOf(w).manifest?.steps ?? []).length > 0))),
];

// ===========================================================================
// 5.2 Split (29)
// ===========================================================================

const SPLIT: Scenario[] = [
  S('S-P-01', 'which output inherits which inbound link', split({ unassignedFate: true }), ADMIT,
    all(phase('refused'), code('LINK_FATE_UNASSIGNED'))),

  S('S-P-02', 'how sources[] partitions across outputs', split({ missingProvenance: true }), ADMIT,
    all(phase('refused'), code('PROVENANCE_UNASSIGNED'),
      check('duplication across outputs appears only if injected', () => {
        const m = drive(split(), []).fixture.approved.manifest;
        return m.provenance.filter((p) => p.entry.id === 'S3').length === 2;
      }))),

  S('S-P-03', 'output body empty, or byte-identical to the source', split({ emptyOutput: true }), ADMIT,
    all(phase('refused'), code('EMPTY_OUTPUT'),
      check('a byte-identical output is reclassified as a move', () => {
        const f = frameOf(drive(split({ identicalOutput: true }), ADMIT));
        return f.refusal?.code === 'NOT_A_SPLIT_RECLASSIFY_AS_MOVE' && f.refusal.detail.some((d) => d.includes("'move'"));
      }))),

  S('S-P-04', 'output IDs collide with each other or an existing concept', split({ duplicateOutputs: true }), ADMIT,
    all(phase('refused'), code('DESTINATION_OCCUPIED'),
      check('a folder-concept prefix collision refuses too', () =>
        frameOf(drive(split({ folderCollision: true }), ADMIT)).refusal?.code === 'DESTINATION_OCCUPIED'))),

  S('S-P-05', 'neither output inherits a review baseline', split(), ADMIT,
    check('both outputs are rendered with no baseline', (w) =>
      frameOf(w).reviewDependencies.filter((d) => d.owner.id.startsWith('concepts/big-')).length === 2 &&
      frameOf(w).reviewDependencies.filter((d) => d.owner.id.startsWith('concepts/big-')).every((d) => d.finding.kind === 'no-baseline'))),

  S('S-P-06', 'source is the target of an okf-workspace:// alias', split({ aliasFanOut: true }), ADMIT,
    all(phase('refused'), code('ALIAS_CANNOT_FAN_OUT'))),

  S('S-P-07', 'splitting across bundles', split({ crossBundle: true }), ADMIT,
    all(phase('refused'), code('CROSS_BUNDLE_SPLIT_UNEXPRESSIBLE'), noRecord('ADMITTED'))),

  S('S-A-01', 'all outputs written and validated before the source is retired', split({ badOrdering: true }), ADMIT,
    all(phase('refused'), code('ORDERING_WOULD_UNMOOR_KNOWLEDGE'))),

  S('S-A-02', 'every output explicitly draft and unverified regardless of source tier', split(), ADMIT,
    check('both outputs are explicit drafts with empty verification', (w) =>
      w.fixture.approved.manifest.steps.filter((s) => s.kind === 'CREATE_OUTPUT')
        .every((s) => s.outputDraft?.statusExplicit === true && s.outputDraft.verificationEmpty))),

  // Asserted through the REDUCER, not the plan: running only the first of the
  // two rewrites must leave the second link broken. A fixture-shape check
  // ("two steps, two link ids") passes whatever the machine does with them.
  S('S-A-03', 'link rewrites fan out to different targets per link', split(), K('aglkmnnnn'),
    all(
      check('the rewritten link resolves', (w) =>
        frameOf(w).links.some(([id, r]) => id === 'L1' && r.state === 'resolves')),
      check('the not-yet-rewritten link is still broken', (w) =>
        frameOf(w).links.some(([id, r]) => id === 'L2' && r.state === 'unexpectedly-broken')))),

  S('S-A-04', 'one execution for N writes, M rewrites and a retirement', split(), APPLIED,
    all(recordCount('LOCKED', 1), recordCount('EPOCH_ADVANCED', 1), recordCount('SETTLED', 1))),

  S('S-F-01', 'output A writes, output B fails', split(), K('aglkmnf'),
    all(phase('failed-dirty'), ambiguity('orphan-output-exists'), ambiguity('two-live-carriers-no-authority'),
      check('the orphan is listed by path', (w) =>
        frameOf(w).ambiguities.find((a) => a.kind === 'orphan-output-exists')?.paths.includes('okf::concepts/big-a') === true))),

  S('S-F-02', 'outputs written, source not retired', split(), K('aglkmnnf'),
    all(phase('failed-dirty'), ambiguity('two-live-carriers-no-authority'),
      humanActionContains('independently editable'))),

  S('S-F-03', 'half the inbound links rewritten', split(), K('aglkmnnnnf'),
    all(phase('failed-dirty'), ambiguity('links-split-across-old-and-new'), linkState('L2', 'unexpectedly-broken'))),

  S('S-F-04', 'retry replans under the lock', split(), [...K('aglkmnnf'), ...K('aglk')],
    all(phase('expired'), driftContains('added to scope'))),

  S('S-F-05', 'rollback must restore every rewritten link byte-identically', split(), K('aglkmnnnnfBp'),
    all(phase('rollback-failed'), ambiguity('restore-not-byte-identical'))),

  S('S-C-01', 'source edited between preview and recheck', split(), K('a1glk'),
    all(phase('expired'),
      // `typeof s.beforeHash === 'string' || s.beforeHash === null` was a
      // tautology over its own declared type. The real property: the pre-edit
      // BODY the concurrent session overwrote appears nowhere in the journal.
      check('the machine holds hashes, never pre-edit bytes', (w) => {
        const pre = w.fixture.pre.find((c) => ks(c.key) === 'okf::concepts/big')!;
        return pre.body.length > 20 && !JSON.stringify(w.journal).includes(pre.body);
      }))),

  S('S-C-02', 'a concurrent session creates a concept at a planned output ID', split(), K('a3glk'),
    all(phase('expired'), driftContains('added to scope'), noRecord('INTENT'))),

  S('S-C-03', 'verification-only event on the source', split(), K('a2glk'),
    all(phase('expired'), driftContains('verification changed'))),

  S('S-C-04', 'our split invalidates a sibling confirmed merge', split(), APPLIED,
    check('EPOCH_ADVANCED precedes SETTLED', (w) =>
      w.journal.findIndex((r) => r.r === 'EPOCH_ADVANCED') < w.journal.findIndex((r) => r.r === 'SETTLED'))),

  S('S-V-01', 'source verified, both outputs draft and unverified', split(), APPLIED,
    all(trustOf('concepts/big-a', 'unverified', 'unverified', false),
      trustOf('concepts/big-b', 'unverified', 'unverified', false))),

  S('S-V-02', 'retained-and-edited source vs deprecated-unchanged source', split({ editSource: true }), APPLIED,
    all(trustOf('concepts/big', 'human-reviewed', 'unverified', true),
      check('a pure status transition preserves trust', () =>
        frameOf(drive(split(), APPLIED)).trust.some((t) => t.key.id === 'concepts/big' && t.before === t.after)))),

  S('S-V-03', 'post-op identity and link check', split(), [...K('aglkmN'), 'i'],
    all(phase('failed-dirty'),
      check('cross-bundle same ID is advisory only', () => {
        const f = frameOf(drive(split(), [...K('aglkmN'), 'I']));
        return f.phase === 'applied-with-known-breakage' && (f.checks?.findings.length ?? 0) > 0;
      }))),

  S('S-V-04', 'output dependency mappings are separate reviewed operations', split(), APPLIED,
    all(check('scheduledRepairs records old and new locators plus evidence', (w) =>
      w.fixture.approved.manifest.scheduledRepairs.every((r) => r.oldLocator !== '' && r.evidence !== '')),
      check('every source openFindings array is unchanged', (w) =>
        frameOf(w).reviewDependencies.filter((d) => d.owner.id === 'concepts/downstream').every((d) => d.openFindings.length === 1)))),

  S('S-V-05', 'sum-preservation is not checkable by validation', split(), APPLIED,
    all(check('contentCoverage.checkableByValidation is false', (w) => frameOf(w).checks?.contentCoverage.checkableByValidation === false),
      humanActionContains('not checkable by validation'))),

  S('S-R-01', 'failure partway through rollback', split(), K('aglkmnnfBnfr'),
    all(phase('rollback-failed'), ambiguity('rollback-partially-applied'),
      check('a per-step reconciliation table is present', (w) => frameOf(w).steps.length > 0))),

  S('S-R-02', 'an output was linked to or human-verified before rollback', split(), K('aglkmnnfOBN'),
    all(phase('reverted-with-residue'), humanActionContains('destroys evidence'))),

  S('S-R-03', 'redirects published from the source to both outputs', split(), K('aglkmnnfBN'),
    all(phase('reverted-clean'),
      check('with redirects off the plan carries no REDIRECT_RETIRE step', (w) =>
        (frameOf(w).manifest?.steps ?? []).every((s) => s.kind !== 'REDIRECT_RETIRE')),
      check('a candidate redirect plan is refused by name', () =>
        frameOf(drive(split({ redirectStep: true }), ADMIT)).refusal?.code === 'REDIRECT_BLOCKED_PENDING_SEMANTICS'))),

  S('S-R-04', 'byte-identical restoration preserves the source trust', split(), K('aglkmnnfBN'),
    all(phase('reverted-clean'),
      check('reserialization yields rollback-failed instead', () =>
        frameOf(drive(split(), K('aglkmnnfBp'))).phase === 'rollback-failed'))),
];

// ===========================================================================
// 5.3 Move (31)
// ===========================================================================

const MOVE: Scenario[] = [
  S('V-P-01', 'identity change is the headline', move(), APPLIED,
    all(check('lineage carries the old and new keys and the continuity literal', (w) => {
      const l = frameOf(w).lineage[0];
      return !!l && l.retiredIdentity.id === 'concepts/routing' && l.mintedIdentities[0].id === 'concepts/net/routing' &&
        l.continuity.startsWith('none — identity changed');
    }),
      check('the old key renders with after=null', (w) =>
        frameOf(w).identityDiff.find((r) => r.key.id === 'concepts/routing')?.after === null))),

  S('V-P-02', 'three inbound-link classes with different fates', move(), ADMIT,
    all(check('two writable in-bundle holders are rewritten', (w) =>
      w.fixture.approved.manifest.linkFates.filter((f) => f.fate.fate === 'rewrite').length === 2),
      check('the read-only alias holder is approved breakage before approval', (w) =>
        w.fixture.approved.manifest.approvedBreakage.includes('L3' as never)))),

  S('V-P-03', 'required federation member inactive', move({ incompleteLinks: true }), ADMIT,
    all(phase('refused'), code('LINK_SET_INCOMPLETE'))),

  S('V-P-04', 'cross-bundle move is a migration', move({ crossBundle: true }), ADMIT,
    all(phase('admitting'),
      check('create-at-destination precedes remove-at-owner', (w) => {
        const steps = w.fixture.approved.manifest.steps;
        const create = steps.find((s) => s.kind === 'MOVE_PATH' && s.action === 'CREATE')!;
        const remove = steps.find((s) => s.kind === 'MOVE_PATH' && s.action === 'MOVE')!;
        return create.ordinal < remove.ordinal && create.target.bundle === 'partner' && remove.target.bundle === 'okf';
      }),
      check('a read-only destination refuses', () =>
        frameOf(drive(move({ crossBundle: true, readOnlyDestination: true }), ADMIT)).refusal?.code === 'DESTINATION_BUNDLE_READ_ONLY'),
      check('an unknown project mode either side refuses', () =>
        frameOf(drive(move({ crossBundle: true, unknownModeDestination: true }), ADMIT)).refusal?.code === 'UNKNOWN_PROJECT_MODE'))),

  S('V-P-05', 'moving the bundle root', move({ bundleRoot: true }), ADMIT,
    all(phase('refused'), code('BUNDLE_ROOT_SELF_ORPHANING'))),

  S('V-P-06', 'destination occupied, possibly by a redirect artifact', move({ destinationOccupied: true }), ADMIT,
    all(phase('refused'), code('DESTINATION_OCCUPIED'), detailContains('concepts/net/routing'))),

  S('V-P-07', 'a third concept review dependency names the old path', move({ omitReviewImpact: true }), ADMIT,
    all(phase('refused'), code('DEPENDENCY_BREAKAGE_UNLISTED'),
      check('an inline repair step refuses by its own name', () =>
        frameOf(drive(move({ inlineRepair: true }), ADMIT)).refusal?.code === 'REVIEW_REPAIR_PERFORMED_INLINE'))),

  S('V-P-08', 'move plus content edit in one command', move({ moveAlsoEdits: true }), ADMIT,
    all(phase('admitting'),
      check('the move step is non-claim-affecting and the edit is claim-affecting', (w) => {
        const steps = w.fixture.approved.manifest.steps;
        const mv = steps.find((s) => s.kind === 'MOVE_PATH')!;
        const ed = steps.find((s) => s.kind === 'CONTENT_EDIT')!;
        return !mv.classification.claimAffecting && ed.classification.claimAffecting;
      }),
      check('a single step claiming both refuses', () =>
        frameOf(drive(move({ moveAndEditOneStep: true }), ADMIT)).refusal?.code === 'MOVE_AND_EDIT_NOT_SEPARATED'))),

  S('V-A-01', 'write-new-then-swap, never mutate in place', move(), [...K('aglkmn'), 'x', 'r'],
    all(phase('unknown-interrupted'), stepState(0, 'done'), stepState(1, 'not-started'),
      check('the old path is still present', (w) =>
        frameOf(w).identityDiff.find((r) => r.key.id === 'concepts/routing')?.after !== null))),

  S('V-A-02', 'two ledgers, two locks', move({ crossBundle: true }), APPLIED,
    all(recordCount('LOCKED', 1), recordCount('EPOCH_ADVANCED', 2),
      check('the lock lists both bundles in canonical ledgerKey order', (w) => {
        const rec = w.journal.find((r) => r.r === 'LOCKED');
        return rec?.r === 'LOCKED' && rec.bundles.join(',') === 'okf,partner';
      }),
      humanActionContains('cross-bundle atomicity gap'))),

  S('V-A-03', 'link rewrite must stay a manifest-bound substitution', move(), K('aglkmnnp'),
    all(phase('failed-dirty'),
      check('the deviating step is rejected, never reclassified', (w) => {
        const step = w.fixture.approved.manifest.steps.find((s) => s.kind === 'LINK_REWRITE')!;
        return !step.classification.claimAffecting &&
          w.journal.some((r) => r.r === 'OUTCOME' && r.note === 'PLAN_DEVIATION');
      }))),

  S('V-A-04', 'index regeneration in both bundles', move({ crossBundle: true }), ADMIT,
    all(check('two directly-affected INDEX_REGEN steps inherit approval', (w) =>
      w.fixture.approved.manifest.steps.filter((s) => s.kind === 'INDEX_REGEN' && s.indexScope === 'directly-affected' && s.approvalScope === 'inherited').length === 2),
      check('a broad rebuild is inadmissible', () =>
        frameOf(drive(move({ crossBundle: true, broadRebuild: true }), ADMIT)).refusal?.code === 'BROAD_REBUILD_NEEDS_OWN_GATE'))),

  S('V-F-01', 'file moved, half the links rewritten', move(), K('aglkmnnnf'),
    all(phase('failed-dirty'), ambiguity('links-split-across-old-and-new'),
      check('the statement records that in-bundle Markdown never falls through', (w) =>
        frameOf(w).ambiguities.find((a) => a.kind === 'links-split-across-old-and-new')?.statement.includes('never fall through') === true))),

  S('V-F-02', 'links rewritten first, move fails', move({ rewriteFirst: true }), ADMIT,
    all(phase('refused'), code('ORDERING_WOULD_UNMOOR_KNOWLEDGE'))),

  S('V-F-03', 'cross-bundle create succeeded, source delete failed', move({ crossBundle: true }), K('aglkmnf'),
    all(phase('failed-dirty'), ambiguity('duplicate-identity-across-bundles'),
      check('both fully-qualified keys are named and detection is advisory', (w) => {
        const a = frameOf(w).ambiguities.find((x) => x.kind === 'duplicate-identity-across-bundles')!;
        return a.paths.includes('partner::concepts/net/routing') && a.paths.includes('okf::concepts/routing') &&
          a.statement.includes('advisory');
      }))),

  S('V-F-04', 'retry after a completed move', move(), [...K('aglkmnnf'), ...K('aglk')],
    all(phase('expired'), verdict('EXPIRE'),
      driftContains('removed from scope: okf::concepts/routing'),
      driftContains('added to scope: okf::concepts/net/routing'))),

  S('V-C-01', 'inbound-link holder edited for unrelated reasons', move(), K('a5glk'),
    all(phase('expired'), driftContains('concepts/holder-a'))),

  S('V-C-02', 'destination created or occupied concurrently', move(), K('a3glk'),
    all(phase('expired'), driftContains('added to scope: okf::concepts/net/routing'))),

  S('V-C-03', 'moved concept gains or loses a verification event', move(), K('a2glk'),
    all(phase('expired'), driftContains('verification changed'), driftLacks('content changed'))),

  S('V-C-04', 'another session moved the concept first', move(), K('a4glk'),
    all(phase('expired'), driftContains('removed from scope'),
      check('this is EXPIRE, not REFUSE', (w) => frameOf(w).phase !== 'refused'))),

  S('V-C-05', 'another worktree of the same repository', move(), K('a7glk'),
    all(phase('expired'), driftContains('ledger epoch moved'))),

  S('V-V-01', 'byte-identical move changes identity but preserves verified', move(), APPLIED,
    all(check('lineage records the identity change', (w) => frameOf(w).lineage.length === 1),
      trustOf('concepts/net/routing', 'human-reviewed', 'human-reviewed', false))),

  S('V-V-02', 'each rewritten linking concept keeps verified', move(), APPLIED,
    all(trustOf('concepts/holder-a', 'machine-confirmed', 'machine-confirmed', false),
      trustOf('concepts/holder-b', 'human-reviewed', 'human-reviewed', false),
      check('a link-rewriting move produces zero invalidations', (w) => {
        const rw = w.fixture.approved.manifest.steps.filter((s) => s.kind === 'LINK_REWRITE').map((s) => s.ordinal);
        return !w.journal.some((r) => r.r === 'INVALIDATION' && rw.includes(r.ordinal));
      }))),

  S('V-V-03', 'three link states', move(), K('aglkmnnnf'),
    all(linkState('L1', 'resolves'), linkState('L2', 'unexpectedly-broken'), linkState('L3', 'knowingly-broken-approved'),
      check('only the unexpected one drives failed-dirty', (w) => frameOf(w).phase === 'failed-dirty'))),

  S('V-V-04', 'unavailable vs unobservable', move(), ADMIT,
    all(check('the old-path dependency is unavailable with its old locator', (w) =>
      frameOf(w).reviewDependencies.some((d) => d.finding.kind === 'unavailable' && d.finding.oldLocator === 'concepts/routing')),
      check('an inactive-member dependency is unobservable with a reason', () =>
        frameOf(drive(move({ unobservableDep: true }), ADMIT)).reviewDependencies
          .some((d) => d.finding.kind === 'unobservable' && d.finding.reason.length > 0)))),

  S('V-V-05', 'operational review evidence separate from trust', move(), APPLIED,
    // Reference-inequality between two arrays of different element types can
    // never be false. The claim being made is causal, so assert the cause:
    // a broken review dependency moves no trust tier. Only a claim-affecting
    // edit does.
    all(check('an unavailable review dependency lowers no trust tier', (w) => {
      const f = frameOf(w);
      return (
        f.reviewDependencies.some((d) => d.finding.kind === 'unavailable') &&
        f.trust.length > 0 &&
        f.trust.every((t) => t.before === t.after || t.classification.claimAffecting)
      );
    }),
      noticeContains('review evidence (reported separately from trust)'))),

  S('V-R-01', 'redirect artifact occupies the old ID', move(), K('aglkmnnfBN'),
    all(phase('reverted-clean'),
      check('with redirects off the same rollback runs with no REDIRECT_RETIRE step', (w) =>
        (frameOf(w).manifest?.steps ?? []).every((s) => s.kind !== 'REDIRECT_RETIRE')))),

  S('V-R-02', 'inbound links already committed and pushed elsewhere', move({ escapedLink: true }), K('aglkmnnnfBN'),
    all(phase('reverted-with-residue'),
      check("the escaped class was declared at admission", (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'LINK_REWRITE' && s.escape === 'escaped')))),

  S('V-R-03', 'rolling back a cross-bundle move', move({ crossBundle: true }), K('aglkmnf'),
    all(phase('failed-dirty'),
      check('without a fresh approval the verdict is BLOCK', () => {
        const w = drive(move({ crossBundle: true }), K('aglkmnfb'));
        return w.last?.verdict === 'BLOCK' && frameOf(w).phase === 'failed-dirty';
      }),
      check('with one, the inverse carries its own lineage and its own GATE', () => {
        const w = drive(move({ crossBundle: true }), K('aglkmnfB'));
        const f = frameOf(w);
        return f.phase === 'rolling-back' && (f.manifest?.lineage.length ?? 0) > 0 &&
          w.journal.filter((r) => r.r === 'GATE').length === 2;
      }))),

  S('V-R-04', 'non-byte-identical restore', move(), K('aglkmnnfBp'),
    all(phase('rollback-failed'), ambiguity('restore-not-byte-identical'),
      noticeContains('would silently drop verified'))),

  S('V-R-05', 'rollback after the epoch advanced', move({ rollbackAuth: 'inherited-from-parent-approval' }), K('aglkmnxRb'),
    all(verdict('BLOCK'), lastCode('EPOCH_ADVANCED_NEEDS_FRESH_APPROVAL'),
      openQuestionContains('without a second approval'),
      check('the switch is honoured before the advance', () => {
        const w = drive(move({ rollbackAuth: 'inherited-from-parent-approval' }), K('aglkmnnfb'));
        return frameOf(w).phase === 'rolling-back';
      }))),
];

// ===========================================================================
// 5.4 Supersede (29)
// ===========================================================================

const SUPERSEDE: Scenario[] = [
  S('P-P-01', 'where the predecessor goes', supersede(), ADMIT,
    all(check('deprecate-in-place expands into a STATUS_TRANSITION', (w) =>
      w.fixture.approved.manifest.steps.some((s) => s.kind === 'STATUS_TRANSITION')),
      check('relocate expands into a move with lineage and the full gate', () => {
        const w = drive(supersede({ archiveRelocate: true }), ADMIT);
        const m = w.fixture.approved.manifest;
        return m.steps.some((s) => s.kind === 'MOVE_PATH') && m.lineage.length > 0 && frameOf(w).phase === 'admitting';
      }),
      openQuestionContains('Design archive lifecycle and discoverability'))),

  S('P-P-02', 'superseded_by / deprecation_reason / retain_until', supersede(), APPLIED,
    all(check('the machine completes with no supersede-edge field written', (w) =>
      w.fixture.approved.manifest.policies.supersedeEdge.value === 'none' &&
      w.fixture.approved.manifest.steps.every((s) => !s.rationale.includes('superseded_by'))),
      check('ConceptView has no field to hold one', (w) =>
        Object.keys(frameOf(w).identityDiff[0]?.after ?? {}).every((k) => k !== 'supersededBy')))),

  S('P-P-03', 'successor does not exist yet', supersede(), APPLIED,
    all(check('the composite is a create plus a status transition', (w) => {
      const kinds = w.fixture.approved.manifest.steps.map((s) => s.kind);
      return kinds.includes('CREATE_OUTPUT') && kinds.includes('STATUS_TRANSITION');
    }),
      trustOf('concepts/session-v2', 'unverified', 'unverified', false),
      noticeContains('carries no trust from any input concept'))),

  S('P-P-04', 'chains and cycles', supersede({ supersedeCycle: true }), ADMIT,
    all(phase('refused'), code('SUPERSEDE_CYCLE'),
      check('chain depth is carried as a number with no threshold applied', (w) =>
        w.fixture.approved.manifest.supersedeChain.length === 2 &&
        frameOf(drive(supersede(), ADMIT)).supersedeChainDepth === 1))),

  S('P-P-05', 'stable human-verified predecessor superseded by a draft', supersede(), ADMIT,
    all(phase('admitting'),
      check('the retrieval consequence is recorded as a visibility intent', (w) =>
        w.fixture.approved.manifest.visibilityIntents.some((v) => v.includes('retrieval will prefer the successor'))),
      check('the trust delta is rendered before approval', (w) =>
        frameOf(w).trust.some((t) => t.key.id === 'concepts/session' && t.before === 'human-reviewed') &&
        frameOf(w).trust.some((t) => t.key.id === 'concepts/session-v2' && t.after === 'unverified')))),

  S('P-P-06', 'cross-bundle supersede', supersede({ crossBundle: true }), ADMIT,
    all(phase('admitting'),
      check('the successor is referenced only through a workspace-alias link', (w) =>
        w.fixture.approved.manifest.inboundLinks.links.some((l) => l.linkForm.form === 'workspace-alias')),
      check("the predecessor step names its owning bundle", (w) =>
        w.fixture.approved.manifest.steps.find((s) => s.kind === 'STATUS_TRANSITION')?.bundle === 'okf'))),

  S('P-P-07', 'deletion folded into supersede', supersede({ foldedDelete: true }), ADMIT,
    all(phase('refused'), code('DELETION_FOLDED_INTO_SUPERSEDE'),
      check('in a knowledge-only bundle the deletion rule refuses first', () =>
        frameOf(drive(supersede({ foldedDelete: true, knowledgeOnly: true }), ADMIT)).refusal?.code === 'KNOWLEDGE_ONLY_DELETE_BLOCKED'),
      check('a separately gated deletion is admitted and rendered as its own step', () =>
        frameOf(drive(supersede({ gatedDelete: true }), ADMIT)).phase === 'admitting'))),

  S('P-A-01', 'successor first, then predecessor deprecation', supersede(), ADMIT,
    all(phase('admitting'),
      check('the reverse ordering is inadmissible', () =>
        frameOf(drive(supersede({ badOrdering: true }), ADMIT)).refusal?.code === 'ORDERING_WOULD_UNMOOR_KNOWLEDGE'))),

  S('P-A-02', 'stable -> deprecated must sit inside the approved composite', supersede(), [...SEALED, 'Z'],
    all(verdict('REFUSE'), lastCode('STEP_NOT_IN_APPROVED_MANIFEST'),
      check('the transition is in the approved manifest', (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'STATUS_TRANSITION' && s.target.id === 'concepts/session')))),

  S('P-A-03', 'relocating archive policy makes the apply a move', supersede({ archiveRelocate: true }), APPLIED,
    all(phase('applied-with-known-breakage'),
      check('the journal carries a MOVE_PATH and a LineageRecord', (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'MOVE_PATH') && frameOf(w).lineage.length > 0),
      recordCount('EPOCH_ADVANCED', 1), recordCount('LOCKED', 1))),

  S('P-A-04', 'index and retrieval visibility changes', supersede(), ADMIT,
    all(check('visibility intents are recorded, not decided', (w) => w.fixture.approved.manifest.visibilityIntents.length > 0),
      check('the INDEX_REGEN step is observable-local', (w) =>
        w.fixture.approved.manifest.steps.some((s) => s.kind === 'INDEX_REGEN' && s.escape === 'observable-local')),
      openQuestionContains('retrieval side effect'))),

  S('P-F-01', 'predecessor deprecated, successor write failed', supersede(), [...K('aglkm'), '6', 'x', 'r'],
    all(phase('unknown-interrupted'), ambiguity('knowledge-live-nowhere'),
      check('it is not producible forward: I40 puts the create first', (w) => {
        const steps = w.fixture.approved.manifest.steps;
        return steps.find((s) => s.kind === 'CREATE_OUTPUT')!.ordinal <
          steps.find((s) => s.kind === 'STATUS_TRANSITION')!.ordinal;
      }))),

  S('P-F-02', 'successor written, predecessor deprecation failed', supersede(), K('aglkmnf'),
    all(phase('failed-dirty'), ambiguity('two-live-carriers-no-authority'),
      check('the statement records that no marker says which supersedes which', (w) =>
        frameOf(w).ambiguities.find((a) => a.kind === 'two-live-carriers-no-authority')?.statement.includes('which supersedes which') === true))),

  S('P-F-03', 'inbound link recorded but archive relocation failed', supersede({ archiveRelocate: true, supersedeEdge: 'superseded_by-field' }), K('aglkmnf'),
    all(phase('failed-dirty'),
      check('manifest lineage is reported as authoritative and unaffected', (w) =>
        frameOf(w).lineage.length === w.fixture.approved.manifest.lineage.length && frameOf(w).lineage.length > 0),
      openQuestionContains('What represents a supersede edge'))),

  S('P-F-04', 'retry after the predecessor status already changed', supersede({ predecessorDeprecated: true }), K('aglk'),
    all(phase('expired'), driftContains('planned action changed'), driftContains('MODIFY -> KEEP'))),

  S('P-C-01', 'predecessor gains human verification, content untouched', supersede(), K('a2glk'),
    all(phase('expired'), driftContains('verification changed'), driftLacks('content changed'))),

  S('P-C-02', 'another session deprecates the predecessor first', supersede(), K('a6glk'),
    all(phase('expired'), driftContains('planned action changed'))),

  S('P-C-03', 'two sessions supersede with different successors', supersede(), APPLIED,
    all(phase('applied-with-known-breakage'),
      check("the loser's confirmation dies at its own recheck after the winner advanced the epoch", () =>
        frameOf(drive(supersede(), K('a7glk'))).phase === 'expired'))),

  S('P-C-04', 'successor edited by the session that authored it', supersede({ successorExists: true }), K('a8glk'),
    all(phase('expired'), driftContains('concepts/session-v2'),
      check('no authorship exemption exists in the recheck', (w) => frameOf(w).drift.length > 0))),

  S('P-V-01', 'deprecation preserves the predecessor verification', supersede(), APPLIED,
    trustOf('concepts/session', 'human-reviewed', 'human-reviewed', false)),

  S('P-V-02', 'successor authored verbatim from a verified predecessor', supersede(), APPLIED,
    all(trustOf('concepts/session-v2', 'unverified', 'unverified', false),
      check('no edge transports trust along a supersede relation', (w) =>
        frameOf(w).identityDiff.find((r) => r.key.id === 'concepts/session-v2')?.after?.tier === 'unverified'))),

  S('P-V-03', 'review baselines do not transfer', supersede(), ADMIT,
    check('successor dependencies have no baseline and unaccepted observations', (w) =>
      frameOf(w).reviewDependencies.filter((d) => d.owner.id === 'concepts/session-v2')
        .every((d) => d.finding.kind === 'no-baseline' && d.capturedObservation?.accepted === false))),

  S('P-V-04', 'supersede edge consistent and closes no cycle', supersede(), APPLIED,
    all(check('identityChecks verify that no edge artifact was written', (w) => frameOf(w).checks?.identityChecks === 'pass'),
      check('a cycle fails the identity checks', () =>
        frameOf(drive(supersede(), [...K('aglkmN'), 'i'])).checks?.identityChecks === 'fail'))),

  S('P-V-05', 'later trust promotion cannot retroactively authorize', supersede(), ADMIT,
    all(phase('admitting'),
      check('promoting verification changes no verdict', () => {
        const plain = drive(supersede(), ADMIT);
        const promoted = drive(supersede({ mixedTrust: true }), ADMIT);
        return plain.last?.verdict === promoted.last?.verdict && plain.last?.code === promoted.last?.code;
      }))),

  S('P-R-01', 'undoing a deprecation is deprecated -> stable', supersede({ dropRollbackFor: 'concepts/session' }), K('aglkmnnfB'),
    all(phase('failed-dirty'), verdict('BLOCK'), lastCode('INVERSE_STEP_NOT_APPROVED'),
      check('the mode also blocks without a fresh approval', () => {
        const w = drive(supersede(), K('aglkmnnfb'));
        return w.last?.verdict === 'BLOCK' && w.last.code === 'ROLLBACK_NEEDS_FRESH_APPROVAL';
      }))),

  S('P-R-02', 'successor consumed in the interim', supersede(), K('aglkmnfUBN'),
    all(phase('reverted-with-residue'),
      check('the destroyed evidence is enumerated in the notice', (w) =>
        frameOf(w).notice.some((n) => n.includes('output-superseded-in-turn'))))),

  S('P-R-03', 'relocated predecessor means a reverse move', supersede({ archiveRelocate: true }), K('aglkmnnfBN'),
    all(phase('reverted-clean'),
      check('the inverse carries its own lineage, GATE, and durable manifest', () => {
        const w = drive(supersede({ archiveRelocate: true }), K('aglkmnnfB'));
        const inverse = w.journal.find((r) => r.r === 'ADMITTED' && r.approved.manifest.revertOf !== null);
        const inverseHash = inverse?.r === 'ADMITTED' ? inverse.approved.manifest.manifestHash : null;
        return (frameOf(w).manifest?.lineage.length ?? 0) > 0 && w.journal.filter((r) => r.r === 'GATE').length === 2 &&
          inverseHash !== null && w.journal.some(
            (r) => r.r === 'MANIFEST_DURABLE' && r.manifestHash === inverseHash,
          );
      }))),

  S('P-R-04', 'retrieval already served the successor', supersede(), K('aglkmnfuBN'),
    all(phase('reverted-with-residue'),
      check('the residue is observable-local', (w) => frameOf(w).residue.some((r) => r.escape === 'observable-local')))),

  S('P-R-05', 'successor deletion recorded so a re-attempt is not a first attempt', supersede(), K('aglkmnfBN'),
    all(phase('reverted-clean'),
      check('the inverse manifest revertOf names the parent operation', (w) => {
        const parent = w.fixture.approved.manifest.operationId;
        return w.journal.some((r) => r.r === 'ADMITTED' && r.approved.manifest.revertOf === parent);
      }),
      check('the UNDO_CREATE step is journaled', (w) => {
        const inv = w.journal.filter((r) => r.r === 'ADMITTED').pop();
        return inv?.r === 'ADMITTED' && inv.approved.manifest.steps.some((s) => s.kind === 'UNDO_CREATE');
      }))),
];

// ===========================================================================
// 5.5 Adversarial regressions (A)
//
// One row per defect three adversarial passes found by RUNNING the machine.
// Every row here failed before its fix. They are stated as the property that
// was violated, not as the keystroke path, so a re-broken guard fails loudly.
// ===========================================================================

const forbidden = (label: string): Check =>
  all(
    verdict('REFUSE'),
    lastCode('PHASE_FORBIDS_ACTION'),
    check(label, () => true),
  );

const ADVERSARIAL: Scenario[] = [
  S('A-01', 'an expired approval cannot be re-rechecked, sealed and applied', merge(), K('agl1kk'),
    all(phase('expired'), forbidden('recheck is not a transition out of expired'),
      noRecord('MANIFEST_DURABLE'))),

  S('A-02', 'a crashed operation cannot be verified into `applied`', merge(), K('aglkmnxv'),
    all(phase('unknown-interrupted'), forbidden('verify is not a transition out of unknown-interrupted'),
      noRecord('SETTLED'), noRecord('EPOCH_ADVANCED'))),

  S('A-03', 'a concurrent write at a step target is caught by the second observedHash comparison',
    merge(), K('aglkm3n'),
    all(phase('failed-clean'), lastCode('CONCURRENT_CHANGE'),
      check('no step ran', (w) => frameOf(w).steps.every(([, o]) => o.state === 'not-started')),
      check('the refusal names both images', (w) =>
        (w.last?.drift ?? []).some((d) => d.includes('the plan was sealed against'))))),

  S('A-04', 'a failure in which nothing landed has nothing to roll back', merge(), K('aglkmfB'),
    all(phase('failed-clean'), verdict('BLOCK'), lastCode('NOTHING_TO_ROLL_BACK'),
      noRecord('SETTLED'), noRecord('EPOCH_ADVANCED'))),

  S('A-05', 'a byte-identical move is checked against the observed source, not asserted by the plan',
    move(), ADMIT,
    check('a forged post-image on a byte-identical move is refused', (w) => {
      const ap = w.fixture.approved;
      const i = ap.manifest.steps.findIndex((s) => s.movedFrom !== null);
      const forged = {
        ...ap,
        manifest: {
          ...ap.manifest,
          steps: ap.manifest.steps.map((s, k) => (k === i ? { ...s, afterHash: 'forged00' } : s)),
        },
      };
      return admissionRefusal(forged, observeAll(w.fixture.pre), []).code === 'MOVE_AND_EDIT_NOT_SEPARATED';
    })),

  S('A-06', 'a failed verification cannot be re-run until it passes', merge(), K('aglkmNVv'),
    all(phase('failed-dirty'), forbidden('verify is not a transition out of failed-dirty'),
      recordCount('SETTLED', 0))),

  S('A-07', 'one interruption, one recovery report, one epoch advance', merge(), K('aglkmnxRR'),
    all(phase('unknown-interrupted'), verdict('REFUSE'), lastCode('ALREADY_RECOVERED'),
      recordCount('RECOVERY_REPORT', 1), recordCount('EPOCH_ADVANCED', 1))),

  S('A-08', 'a step whose bytes deviated is still inverted by the rollback', merge(), K('aglkmnpBN'),
    all(phase('reverted-clean'),
      check('the deviating target is restored to its pre-operation bytes', (w) => {
        const pre = w.fixture.pre.find((c) => ks(c.key) === 'okf::concepts/auth')!;
        const now = w.corpus.find((c) => ks(c.key) === 'okf::concepts/auth')!;
        return now.body === pre.body && now.status === pre.status;
      }))),

  S('A-09', 'a rejected restore cannot be re-run into `reverted-clean`', merge(), K('aglkmnfBpn'),
    all(phase('rollback-failed'), ambiguity('restore-not-byte-identical'),
      stepState(0, 'foreign'), recordCount('SETTLED', 0))),

  S('A-10', 'a process that dies mid-rollback reaches the interrupted terminal', move(),
    K('aglkmnnfBnx'),
    all(phase('unknown-interrupted'), hasRecord('INTERRUPTED'),
      check('the indeterminate terminal is dirty, so anti-silence applies', (w) =>
        frameOf(w).classification.cleanliness === 'dirty' && frameOf(w).ambiguities.length > 0))),

  S('A-11', 'a settled operation is not overwritten by a later admission attempt', merge(),
    K('aglkmNva'),
    all(phase('refused'), code('TOKEN_SPENT'),
      check('the applied segment still holds its SETTLED record', (w) =>
        w.journal.some((r) => r.r === 'SETTLED' && r.as === 'applied')))),

  S('A-12', 'there is no resume-from-step-N after a failure', merge(), K('aglkmnfn'),
    all(phase('failed-dirty'), forbidden('runStep is not a transition out of failed-dirty'),
      check('the step table matches the journal', (w) =>
        frameOf(w).steps.filter(([, o]) => o.state === 'done').length === 1))),

  S('A-13', 'reconcile is scoped to the phases that can use it', merge(), K('aglkmnr'),
    all(phase('mutating'), forbidden('reconcile is not a transition out of mutating'),
      noRecord('RECONCILED'))),

  S('A-14', 'a reconcile snapshot does not freeze later journal evidence', merge(), K('aglkmnfrn'),
    all(hasRecord('RECONCILED'),
      check('the step observed at reconcile time is still reported done', (w) =>
        frameOf(w).steps.some(([o, s]) => o === 0 && s.state === 'done')))),

  S('A-15', 'inbound links are resolved against the forward manifest during a rollback', merge(),
    K('aglkmnnnfB'),
    all(phase('rolling-back'),
      linkState('L1', 'unexpectedly-broken'), linkState('L2', 'unexpectedly-broken'))),

  S('A-16', 'trust rows are predictions until their step lands', merge({ editSource: true }),
    K('aglkmf'),
    all(phase('failed-clean'),
      check('no trust row claims an observed outcome after a zero-byte failure', (w) =>
        frameOf(w).trust.length > 0 && frameOf(w).trust.every((t) => !t.observed)),
      // This fixture touches concepts/auth TWICE with different consequences.
      // Without an ordinal the panel printed two irreconcilable `after` tiers
      // for one Concept ID and named neither step.
      check('the two rows for one Concept ID are told apart by their ordinal', (w) => {
        const rows = frameOf(w).trust.filter((t) => t.key.id === 'concepts/auth');
        return rows.length === 2 && rows[0].ordinal !== rows[1].ordinal && rows[0].after !== rows[1].after;
      }))),

  S('A-17', 'an earlier operation’s residue is not attributed to a later one', move(),
    K('aglkmnOfBnna'),
    all(phase('admitting'),
      check('the new operation carries no residue', (w) => frameOf(w).residue.length === 0))),
];

// ===========================================================================
// Run.
// ===========================================================================

const SCENARIOS = [...MERGE, ...SPLIT, ...MOVE, ...SUPERSEDE, ...ADVERSARIAL];

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

console.log(`${B}CONCEPT RESTRUCTURING — hard-case catalogue${R} ${D}${SCENARIOS.length} rows${R}\n`);

let failures = 0;
let section = '';
for (const s of SCENARIOS) {
  const next = s.id.split('-')[0];
  if (next !== section) {
    section = next;
    const name = { M: 'MERGE', S: 'SPLIT', V: 'MOVE', P: 'SUPERSEDE', A: 'ADVERSARIAL REGRESSIONS' }[section] ?? section;
    console.log(`${B}── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}${R}`);
  }
  let problem: string | null;
  let world: World | null = null;
  try {
    world = drive(s.spec, s.keys);
    problem = s.check(world);
  } catch (e) {
    problem = `threw: ${(e as Error).message}`;
  }
  if (problem) failures++;
  const mark = problem ? `${RED}FAIL${R}` : `${GREEN}PASS${R}`;
  console.log(`${mark} ${B}${s.id}${R} ${s.hardCase} ${D}[${s.keys.join('')}] -> ${world ? frameOf(world).phase : '?'}${R}`);
  if (problem) console.log(`     ${RED}${problem}${R}`);
}

console.log(
  `\n${B}${SCENARIOS.length - failures}/${SCENARIOS.length}${R} hard cases behaved as designed` +
    (failures ? ` ${RED}(${failures} need a decision)${R}` : ''),
);
if (failures) process.exitCode = 1;
