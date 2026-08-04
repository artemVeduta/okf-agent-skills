/**
 * PROTOTYPE — throwaway fake world for the concept-restructuring machine.
 *
 * Not part of the portable module. It exists only so the reducer can be driven:
 * an in-memory multi-bundle corpus and a crude planner that turns a requested
 * operation into a manifest of atomic effects.
 *
 * Everything here is replaced by the real bundle reader and the real planners.
 */

import {
  classifyEdit,
  ks,
  tierOf,
  type ApprovedPlan,
  type ArchivePolicy,
  type BundleFacts,
  type BundleId,
  type ConceptId,
  type ConceptKey,
  type ConceptStatus,
  type ConceptView,
  type EffectStep,
  type FingerprintItem,
  type InboundLink,
  type InboundLinkSet,
  type Injected,
  type InjectedPolicies,
  type LineageRecord,
  type LinkFateEntry,
  type LinkId,
  type LinkIncompleteness,
  type Observed,
  type OperationManifest,
  type Plan,
  type PostOpChecks,
  type ProvenanceAssignmentEntry,
  type RedirectPolicy,
  type RecoveryEvidence,
  type ReviewDependency,
  type RollbackAuthorizationMode,
  type ScheduledRepair,
  type SnapshotEntry,
  type SourceEntry,
  type SupersedeEdgeRepresentation,
  type ValidationVerdict,
  type VerificationEvent,
} from './restructure.ts';

// ---------------------------------------------------------------------------
// Hashing. Deliberately trivial and dependency-free; only equality matters.
// ---------------------------------------------------------------------------

export function h(s: string): string {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(16).padStart(8, '0');
}

const B = (s: string) => s as BundleId;
const C = (s: string) => s as ConceptId;
const K = (bundle: string, id: string): ConceptKey => ({ bundle: B(bundle), id: C(id) });

// ---------------------------------------------------------------------------
// Concepts.
// ---------------------------------------------------------------------------

export interface Concept {
  readonly key: ConceptKey;
  readonly status: ConceptStatus | null;
  readonly statusExplicit: boolean;
  readonly body: string;
  readonly verification: readonly VerificationEvent[];
  readonly sources: readonly SourceEntry[];
}

export type Corpus = readonly Concept[];

export function observe(c: Concept): Observed {
  const contentHash = h(`${c.status ?? 'absent'}|${c.body}`);
  const verificationHash = h(c.verification.map((e) => `${e.actor}@${e.at}`).join(','));
  const view: ConceptView = {
    key: c.key,
    status: c.status,
    statusExplicit: c.statusExplicit,
    verification: { events: c.verification },
    sources: c.sources,
    tier: tierOf({ events: c.verification }),
  };
  return {
    key: c.key,
    exists: true,
    contentHash,
    verificationHash,
    observedHash: h(`${contentHash}|${verificationHash}`),
    status: c.status,
    view,
  };
}

export function observeAll(corpus: Corpus): readonly Observed[] {
  return corpus.map(observe);
}

export function find(corpus: Corpus, key: ConceptKey): Concept | null {
  return corpus.find((c) => ks(c.key) === ks(key)) ?? null;
}

function hashOf(corpus: Corpus, key: ConceptKey): string | null {
  const c = find(corpus, key);
  return c ? observe(c).observedHash : null;
}

// ---------------------------------------------------------------------------
// Bundles.
// ---------------------------------------------------------------------------

export const OKF = 'okf';
export const PARTNER = 'partner';
export const VENDOR = 'vendor';

function bundleFacts(spec: Spec): readonly BundleFacts[] {
  const primary: BundleFacts = {
    bundle: B(OKF),
    ledgerKey: 'github.com/acme/okf#/',
    mode: spec.unknownMode ? 'unknown' : spec.knowledgeOnly ? 'knowledge-only' : 'code-backed',
    writability: 'writable',
    epoch: 7,
    generation: 'g-1',
    schema: spec.ledgerCorrupt ? 'corrupt' : 'ok',
  };
  if (spec.op !== 'move' || !spec.crossBundle) return [primary];
  const dest: BundleFacts = {
    bundle: B(PARTNER),
    ledgerKey: 'github.com/acme/partner#/',
    mode: spec.unknownModeDestination ? 'unknown' : 'code-backed',
    writability: spec.readOnlyDestination ? 'read-only-federated' : 'writable',
    epoch: 3,
    generation: 'p-1',
    schema: 'ok',
  };
  // Canonical ledgerKey order matters at lock time; deliberately unsorted here.
  return [dest, primary];
}

// ---------------------------------------------------------------------------
// Seed corpus.
// ---------------------------------------------------------------------------

const HUMAN: VerificationEvent[] = [{ actor: 'human:ana', at: '2026-05-01' }];
const MACHINE: VerificationEvent[] = [{ actor: 'agent:okf', at: '2026-05-02' }];

export function seedCorpus(spec: Spec): Corpus {
  const out: Concept[] = [
    {
      key: K(OKF, 'concepts/auth'),
      status: spec.deprecatedSource ? 'deprecated' : 'stable',
      statusExplicit: true,
      body: 'how authentication works; see [tokens](concepts/tokens.md)',
      verification: HUMAN,
      sources: [{ id: 'S1', resource: 'src/auth.ts' }],
    },
    {
      key: K(OKF, 'concepts/tokens'),
      status: 'stable',
      statusExplicit: true,
      body: 'token lifetimes and rotation',
      verification: spec.mixedTrust ? MACHINE : HUMAN,
      sources: [
        spec.provenanceCollision
          ? { id: 'S1', resource: 'src/tokens.ts' }
          : { id: 'S2', resource: 'src/tokens.ts' },
      ],
    },
    {
      key: K(OKF, 'concepts/big'),
      status: 'stable',
      statusExplicit: true,
      body: 'a long concept covering routing AND caching',
      verification: HUMAN,
      sources: [{ id: 'S3', resource: 'src/big.ts' }],
    },
    {
      key: K(OKF, 'concepts/routing'),
      status: 'stable',
      statusExplicit: true,
      body: 'request routing rules',
      verification: HUMAN,
      sources: [{ id: 'S4', resource: 'src/routing.ts' }],
    },
    {
      key: K(OKF, 'concepts/session'),
      status: spec.predecessorDeprecated ? 'deprecated' : 'stable',
      statusExplicit: true,
      body: 'session handling',
      verification: HUMAN,
      sources: [{ id: 'S5', resource: 'src/session.ts' }],
    },
    {
      key: K(OKF, 'concepts/holder-a'),
      status: 'stable',
      statusExplicit: true,
      body: `first holder: see [x](${primarySourceId(spec)}.md)`,
      verification: MACHINE,
      sources: [],
    },
    {
      key: K(OKF, 'concepts/holder-b'),
      status: 'stable',
      statusExplicit: true,
      body: `second holder: see [y](${primarySourceId(spec)}.md)`,
      verification: HUMAN,
      sources: [],
    },
    {
      key: K(OKF, 'concepts/downstream'),
      status: 'stable',
      statusExplicit: true,
      body: 'depends on the auth concept for review',
      verification: MACHINE,
      sources: [],
    },
    {
      key: K(OKF, 'concepts/index'),
      status: null,
      statusExplicit: false,
      body: 'index: auth, tokens, big, routing, session',
      verification: [],
      sources: [],
    },
    {
      key: K(VENDOR, 'concepts/vendor-notes'),
      status: 'stable',
      statusExplicit: true,
      body: `vendored: see [z](okf-workspace://okf/${primarySourceId(spec)})`,
      verification: [],
      sources: [],
    },
  ];
  if (spec.outputCollides) {
    out.push({
      key: K(OKF, outputIds(spec)[0]),
      status: 'stable',
      statusExplicit: true,
      body: 'a concept already sitting at the planned output id',
      verification: [],
      sources: [],
    });
  }
  if (spec.folderCollision) {
    out.push({
      key: K(OKF, `${outputIds(spec)[0]}/nested`),
      status: 'stable',
      statusExplicit: true,
      body: 'a folder-concept nested under the planned output id',
      verification: [],
      sources: [],
    });
  }
  if (spec.destinationOccupied) {
    out.push({
      key: K(spec.crossBundle ? PARTNER : OKF, moveTargetId()),
      status: 'stable',
      statusExplicit: true,
      body: 'a redirect artifact occupying the destination',
      verification: [],
      sources: [],
    });
  }
  if (spec.foldedDelete || spec.gatedDelete) {
    out.push({
      key: K(OKF, 'concepts/legacy-note'),
      status: 'stable',
      statusExplicit: true,
      body: 'a note whose content is duplicated in the successor',
      verification: [],
      sources: [],
    });
  }
  if (spec.successorExists) {
    out.push({
      key: K(OKF, 'concepts/session-v2'),
      status: 'stable',
      statusExplicit: true,
      body: 'a successor authored earlier',
      verification: [],
      sources: [],
    });
  }
  if (spec.op === 'move' && spec.crossBundle) {
    out.push({
      key: K(PARTNER, 'concepts/placeholder'),
      status: 'stable',
      statusExplicit: true,
      body: 'partner bundle placeholder',
      verification: [],
      sources: [],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spec — every hard case is a flag on this.
// ---------------------------------------------------------------------------

export interface Spec {
  readonly op: 'merge' | 'split' | 'move' | 'supersede';
  readonly label: string;

  readonly crossBundle?: boolean;
  readonly knowledgeOnly?: boolean;
  readonly unknownMode?: boolean;
  readonly unknownModeDestination?: boolean;
  readonly ledgerCorrupt?: boolean;
  readonly bundleRoot?: boolean;
  readonly readOnlyDestination?: boolean;

  readonly omitSourceFate?: boolean;
  readonly deprecatedSource?: boolean;
  readonly reviveStep?: boolean;
  readonly deleteSources?: boolean;
  readonly deletionProof?: 'none' | 'ok' | 'unique';
  readonly mixedTrust?: boolean;

  readonly outputCollides?: boolean;
  readonly folderCollision?: boolean;
  readonly duplicateOutputs?: boolean;
  readonly emptyOutput?: boolean;
  readonly identicalOutput?: boolean;
  readonly notExplicitDraft?: boolean;
  readonly missingProvenance?: boolean;
  readonly provenanceCollision?: boolean;

  readonly incompleteLinks?: boolean;
  readonly unassignedFate?: boolean;
  readonly rewriteReadOnly?: boolean;
  readonly aliasFanOut?: boolean;
  readonly breakageUnlisted?: boolean;
  readonly escapedLink?: boolean;

  readonly omitReviewImpact?: boolean;
  readonly inlineRepair?: boolean;
  readonly unobservableDep?: boolean;

  readonly badOrdering?: boolean;
  readonly broadRebuild?: boolean;
  readonly moveAndEditOneStep?: boolean;
  readonly moveAlsoEdits?: boolean;
  readonly missingLineage?: boolean;
  readonly supersedeCycle?: boolean;
  readonly foldedDelete?: boolean;
  readonly gatedDelete?: boolean;
  readonly redirectStep?: boolean;
  readonly noRedirectRetire?: boolean;

  readonly predecessorDeprecated?: boolean;
  readonly successorExists?: boolean;
  readonly destinationOccupied?: boolean;
  readonly noIndexStep?: boolean;
  readonly dropRollbackFor?: string;

  readonly indexEarly?: boolean;
  readonly editSource?: boolean;
  readonly rewriteFirst?: boolean;
  readonly archiveRelocate?: boolean;
  readonly supersedeEdge?: SupersedeEdgeRepresentation;
  readonly rollbackAuth?: RollbackAuthorizationMode;
}

function primarySourceId(spec: Spec): string {
  if (spec.op === 'split') return 'concepts/big';
  if (spec.op === 'move') return 'concepts/routing';
  if (spec.op === 'supersede') return 'concepts/session';
  return 'concepts/auth';
}
function outputIds(spec: Spec): readonly string[] {
  if (spec.op === 'merge') return ['concepts/identity'];
  if (spec.op === 'split') return spec.duplicateOutputs ? ['concepts/big-a', 'concepts/big-a'] : ['concepts/big-a', 'concepts/big-b'];
  if (spec.op === 'move') return [moveTargetId()];
  return ['concepts/session-v2'];
}
function moveTargetId(): string {
  return 'concepts/net/routing';
}
function mergeSourceIds(): readonly string[] {
  return ['concepts/auth', 'concepts/tokens'];
}

// ---------------------------------------------------------------------------
// Injected policies. Every one names its owning ticket and its open question.
// ---------------------------------------------------------------------------

const T24 = 'Design concept merge, split, redirect, and inbound-link semantics';
const T14 = 'Design archive lifecycle and discoverability';
const T7 = 'Define validation, growth, compaction, and approval contracts';

function inj<T>(value: T, ownedBy: string, openQuestion: string): Injected<T> {
  return { value, ownedBy, openQuestion };
}

function policies(spec: Spec, fates: readonly LinkFateEntry[], prov: readonly ProvenanceAssignmentEntry[]): InjectedPolicies {
  return {
    redirects: inj<RedirectPolicy>(
      spec.redirectStep ? { mode: 'candidate', artifact: 'concept-file', followable: true, authorization: 'blocked-pending-semantics' } : { mode: 'off' },
      T24,
      'Is a redirect a file, a field, an index entry, or a manifest-only record — and is it followable?',
    ),
    archive: inj<ArchivePolicy>(
      spec.op === 'supersede' && spec.archiveRelocate ? { kind: 'relocate', archiveRoot: 'archive/' } : { kind: 'deprecate-in-place' },
      T14,
      'The same user intent expands into a metadata edit or a full identity-changing move. Which?',
    ),
    sourceDisposition: inj(spec.deleteSources ? ('delete' as const) : ('deprecate' as const), T24, 'Are merge/split sources deprecated or deleted by default?'),
    supersedeEdge: inj<SupersedeEdgeRepresentation>(spec.supersedeEdge ?? 'none', T14, 'What represents a supersede edge, and what archive metadata exists at all?'),
    rollbackAuthorization: inj<RollbackAuthorizationMode>(
      spec.rollbackAuth ?? 'requires-fresh-approval',
      T7,
      'May a documented, pre-approved rollback execute without a second approval before the epoch advances?',
    ),
    deprecatedHiddenFromIndex: inj(true, T14, 'Does deprecation have a retrieval side effect rollback cannot reverse?'),
    inboundLinkFates: inj(fates, T24, 'Which split output inherits which inbound link; may an okf-workspace:// alias fan out?'),
    provenanceAssignment: inj(prov, T24, 'How does sources[] union on merge and partition on split; what is the dedup rule?'),
  };
}

// ---------------------------------------------------------------------------
// Effects — the projector. Each effect is applied to the corpus for real, so
// afterHash is a fact and the frame shows a genuine occupancy diff.
// ---------------------------------------------------------------------------

export function applyEffect(corpus: Corpus, step: EffectStep, pre: Corpus): Corpus {
  const target = step.target;
  const without = corpus.filter((c) => ks(c.key) !== ks(target));
  switch (step.kind) {
    case 'CREATE_OUTPUT': {
      return [
        ...corpus,
        {
          key: target,
          status: step.outputDraft?.statusExplicit === false ? null : 'draft',
          statusExplicit: step.outputDraft?.statusExplicit !== false,
          body: step.outputDraft?.empty ? '' : `authored by ${step.rationale}`,
          verification: [],
          sources: [],
        },
      ];
    }
    case 'MOVE_PATH': {
      if (step.action === 'CREATE') {
        const src = step.movedFrom ? find(corpus, step.movedFrom) : null;
        if (!src) return corpus;
        return [...corpus, { ...src, key: target }];
      }
      return without;
    }
    case 'STATUS_TRANSITION': {
      const c = find(corpus, target);
      if (!c) return corpus;
      const to: ConceptStatus = step.rationale.includes('deprecated -> stable') ? 'stable' : 'deprecated';
      return corpus.map((x) => (ks(x.key) === ks(target) ? { ...x, status: to, statusExplicit: true } : x));
    }
    case 'DELETE_CONCEPT':
    case 'UNDO_CREATE':
    case 'REDIRECT_RETIRE':
      return without;
    case 'CONTENT_EDIT':
      return corpus.map((x) => (ks(x.key) === ks(target) ? { ...x, body: `${x.body} [edited]` } : x));
    case 'LINK_REWRITE': {
      const link = step.link;
      if (!link) return corpus;
      const to = step.rationale.split('->')[1]?.trim() ?? '';
      return corpus.map((x) =>
        ks(x.key) === ks(target) ? { ...x, body: x.body.replace(link.to.id, to) } : x,
      );
    }
    case 'INDEX_REGEN':
      return corpus.map((x) =>
        ks(x.key) === ks(target)
          ? { ...x, body: `index: ${corpus.filter((c) => c.key.bundle === target.bundle).map((c) => c.key.id).join(', ')}` }
          : x,
      );
    case 'RESTORE_BYTES': {
      const original = find(pre, target);
      return original ? [...without, original] : without;
    }
    case 'REDIRECT_PUBLISH':
      return [
        ...corpus,
        { key: target, status: 'stable', statusExplicit: true, body: 'redirect artifact', verification: [], sources: [] },
      ];
  }
}

// ---------------------------------------------------------------------------
// The planner.
// ---------------------------------------------------------------------------

interface Draft {
  readonly kind: EffectStep['kind'];
  readonly bundle: string;
  readonly target: ConceptKey;
  readonly action: EffectStep['action'];
  readonly risk: EffectStep['risk'];
  readonly escape: EffectStep['escape'];
  readonly approvalScope: EffectStep['approvalScope'];
  readonly rationale: string;
  readonly link?: InboundLink;
  readonly movedFrom?: ConceptKey;
  readonly indexScope?: EffectStep['indexScope'];
  readonly deletionProof?: EffectStep['deletionProof'];
  readonly outputDraft?: EffectStep['outputDraft'];
  readonly claimAffectingOverride?: boolean;
}

export interface Fixture {
  readonly spec: Spec;
  readonly label: string;
  readonly pre: Corpus;
  readonly approved: ApprovedPlan;
  readonly finalProjection: Corpus;
}

function buildLinks(spec: Spec): { set: InboundLinkSet; fates: LinkFateEntry[]; breakage: LinkId[] } {
  const src = K(OKF, primarySourceId(spec));
  const dest =
    spec.op === 'move'
      ? K(spec.crossBundle ? PARTNER : OKF, moveTargetId())
      : K(OKF, outputIds(spec)[0]);

  const links: InboundLink[] = [
    {
      id: 'L1' as LinkId,
      from: K(OKF, 'concepts/holder-a'),
      to: src,
      linkForm: { form: 'in-bundle-markdown' },
      holderWritability: 'writable',
      occurrence: 18,
    },
    {
      id: 'L2' as LinkId,
      from: K(OKF, 'concepts/holder-b'),
      to: src,
      linkForm: { form: 'in-bundle-markdown' },
      holderWritability: 'writable',
      occurrence: 19,
    },
    {
      id: 'L3' as LinkId,
      from: K(VENDOR, 'concepts/vendor-notes'),
      to: src,
      linkForm: { form: 'workspace-alias', alias: 'okf' },
      holderWritability: 'read-only-vendored',
      occurrence: 22,
    },
  ];

  const fates: LinkFateEntry[] = [
    { link: 'L1' as LinkId, fate: spec.unassignedFate ? { fate: 'unassigned' } : { fate: 'rewrite', to: dest } },
    { link: 'L2' as LinkId, fate: { fate: 'rewrite', to: dest } },
    {
      link: 'L3' as LinkId,
      fate: spec.rewriteReadOnly
        ? { fate: 'rewrite', to: dest }
        : { fate: 'knowingly-broken-approved', why: 'holder bundle is read-only-vendored; the alias cannot be rewritten' },
    },
  ];
  if (spec.aliasFanOut) {
    fates.push({ link: 'L3' as LinkId, fate: { fate: 'rewrite', to: K(OKF, outputIds(spec)[1] ?? outputIds(spec)[0]) } });
    fates[2] = { link: 'L3' as LinkId, fate: { fate: 'rewrite', to: dest } };
  }

  const incompleteness: LinkIncompleteness[] = spec.incompleteLinks ? ['inactive-required-member'] : [];
  return {
    set: { links, complete: !spec.incompleteLinks, incompleteness },
    fates,
    breakage: spec.breakageUnlisted || spec.rewriteReadOnly || spec.aliasFanOut ? [] : (['L3'] as LinkId[]),
  };
}

function reviewImpactOf(spec: Spec): { deps: ReviewDependency[]; repairs: ScheduledRepair[] } {
  if (spec.omitReviewImpact) return { deps: [], repairs: [] };
  const owner = K(OKF, 'concepts/downstream');
  const locator = primarySourceId(spec);
  const dep: ReviewDependency = {
    owner,
    locator,
    hasBaseline: true,
    finding: spec.unobservableDep
      ? { kind: 'unobservable', reason: 'the federation member holding the evidence is inactive' }
      : { kind: 'unavailable', oldLocator: locator },
    capturedObservation: { evidence: 'preview-time read of the old locator', accepted: false },
    openFindings: ['OF-1: the routing table is out of date'],
    structuralInvalidity: [],
  };
  const repair: ScheduledRepair = {
    mapping: dep,
    oldLocator: locator,
    newLocator: null,
    becomes: spec.unobservableDep
      ? { kind: 'unobservable', reason: 'the federation member holding the evidence is inactive' }
      : { kind: 'unavailable', oldLocator: locator },
    evidence: 'recorded for a separate reviewed operation; never performed inline',
  };
  return { deps: [dep], repairs: [repair] };
}

function outputDependencies(spec: Spec): readonly ReviewDependency[] {
  return outputIds(spec).map((id) => ({
    owner: K(OKF, id),
    locator: `src/${id.split('/').pop()}.ts`,
    hasBaseline: false,
    finding: { kind: 'no-baseline' as const },
    capturedObservation: { evidence: 'observed while previewing the output', accepted: false as const },
    openFindings: [],
    structuralInvalidity: [],
  }));
}

function draftsFor(spec: Spec): Draft[] {
  const out: Draft[] = [];
  const bundle = OKF;
  const links = buildLinks(spec).set.links;
  const dest =
    spec.op === 'move'
      ? K(spec.crossBundle ? PARTNER : OKF, moveTargetId())
      : K(OKF, outputIds(spec)[0]);

  const draftFacts = (identical: boolean) => ({
    statusExplicit: !spec.notExplicitDraft,
    verificationEmpty: true,
    empty: !!spec.emptyOutput,
    byteIdenticalToSource: identical,
  });

  if (spec.op === 'merge' || spec.op === 'split') {
    const outs = outputIds(spec);
    outs.forEach((id, i) => {
      out.push({
        kind: 'CREATE_OUTPUT',
        bundle: spec.crossBundle && i === 1 ? PARTNER : bundle,
        target: K(spec.crossBundle && i === 1 ? PARTNER : bundle, id),
        action: 'CREATE',
        risk: 'REVIEW',
        escape: 'contained',
        approvalScope: 'approved',
        rationale: `${spec.op} output ${id}`,
        outputDraft: draftFacts(!!spec.identicalOutput && i === 0),
      });
    });
    if (!spec.omitSourceFate) {
      const sources = spec.op === 'merge' ? mergeSourceIds() : [primarySourceId(spec)];
      for (const id of sources) {
        const stepBundle = spec.crossBundle && spec.op === 'merge' && id !== sources[0] ? PARTNER : bundle;
        if (spec.reviveStep && id === primarySourceId(spec)) {
          out.push({
            kind: 'STATUS_TRANSITION',
            bundle,
            target: K(bundle, id),
            action: 'MODIFY',
            risk: 'REVIEW',
            escape: 'contained',
            approvalScope: 'approved',
            rationale: `explicit deprecated -> stable revival of ${id} before it is merged`,
          });
        }
        out.push(
          spec.deleteSources
            ? {
                kind: 'DELETE_CONCEPT',
                bundle: stepBundle,
                target: K(stepBundle, id),
                action: 'DELETE',
                risk: 'DESTRUCTIVE',
                escape: 'contained',
                approvalScope: 'approved',
                rationale: `source ${id} deleted per injected sourceDisposition`,
                deletionProof:
                  spec.deletionProof === 'none'
                    ? null
                    : {
                        supersededBy: K(bundle, outs[0]),
                        redundantWith: null,
                        holdsUniqueDurableContext: spec.deletionProof === 'unique',
                        evidence: 'every claim appears verbatim in the output',
                      },
              }
            : {
                kind: 'STATUS_TRANSITION',
                bundle: stepBundle,
                target: K(stepBundle, id),
                action: 'MODIFY',
                risk: 'CAUTION',
                escape: 'contained',
                approvalScope: 'approved',
                rationale: `source ${id} deprecated`,
              },
        );
      }
    }
  }

  if (spec.op === 'move') {
    const from = spec.bundleRoot ? K(OKF, '') : K(OKF, primarySourceId(spec));
    out.push({
      kind: 'MOVE_PATH',
      bundle: dest.bundle,
      target: dest,
      action: 'CREATE',
      risk: 'REVIEW',
      escape: 'contained',
      approvalScope: 'approved',
      movedFrom: from,
      rationale: `write-new-then-swap: create ${ks(dest)} from ${ks(from)}`,
      claimAffectingOverride: spec.moveAndEditOneStep ? true : undefined,
    });
    out.push({
      kind: 'MOVE_PATH',
      bundle: OKF,
      target: from,
      action: 'MOVE',
      risk: 'REVIEW',
      escape: 'contained',
      approvalScope: 'approved',
      rationale: `write-new-then-swap: remove ${ks(from)} at its owning bundle`,
    });
    if (spec.moveAlsoEdits) {
      out.push({
        kind: 'CONTENT_EDIT',
        bundle: dest.bundle,
        target: dest,
        action: 'MODIFY',
        risk: 'REVIEW',
        escape: 'contained',
        approvalScope: 'approved',
        rationale: 'content edit requested in the same command, kept as its own step',
      });
    }
  }

  if (spec.op === 'supersede') {
    const successor = K(OKF, 'concepts/session-v2');
    out.push(spec.successorExists ? {
      kind: 'CONTENT_EDIT',
      bundle,
      target: successor,
      action: 'MODIFY',
      risk: 'REVIEW',
      escape: 'contained',
      approvalScope: 'approved',
      rationale: 'record the supersede relationship in the pre-existing successor',
    } : {
      kind: 'CREATE_OUTPUT',
      bundle,
      target: successor,
      action: 'CREATE',
      risk: 'REVIEW',
      escape: 'contained',
      approvalScope: 'approved',
      rationale: 'supersede successor authored verbatim from the predecessor',
      outputDraft: draftFacts(false),
    });
    if (spec.archiveRelocate) {
      out.push({
        kind: 'MOVE_PATH',
        bundle,
        target: K(bundle, 'archive/concepts/session'),
        action: 'CREATE',
        risk: 'REVIEW',
        escape: 'contained',
        approvalScope: 'approved',
        movedFrom: K(bundle, 'concepts/session'),
        rationale: 'archive policy relocate: create at the archive root',
      });
      out.push({
        kind: 'MOVE_PATH',
        bundle,
        target: K(bundle, 'concepts/session'),
        action: 'MOVE',
        risk: 'REVIEW',
        escape: 'contained',
        approvalScope: 'approved',
        rationale: 'archive policy relocate: remove the predecessor at its old identity',
      });
    } else {
      out.push({
        kind: 'STATUS_TRANSITION',
        bundle,
        target: K(bundle, 'concepts/session'),
        action: 'MODIFY',
        risk: 'CAUTION',
        escape: 'contained',
        approvalScope: 'approved',
        rationale: 'predecessor stable -> deprecated inside the approved composite',
      });
    }
    if (spec.foldedDelete || spec.gatedDelete) {
      out.push({
        kind: 'DELETE_CONCEPT',
        bundle,
        target: K(bundle, 'concepts/legacy-note'),
        action: 'DELETE',
        risk: 'DESTRUCTIVE',
        escape: 'contained',
        approvalScope: spec.gatedDelete ? 'approved' : 'inherited',
        rationale: 'deletion folded into the supersede request',
        deletionProof: {
          supersededBy: successor,
          redundantWith: null,
          holdsUniqueDurableContext: false,
          evidence: 'content is duplicated in the successor',
        },
      });
    }
  }

  if (spec.redirectStep) {
    out.push({
      kind: 'REDIRECT_PUBLISH',
      bundle: OKF,
      target: K(OKF, primarySourceId(spec)),
      action: 'CREATE',
      risk: 'REVIEW',
      escape: 'escaped',
      approvalScope: 'approved',
      rationale: 'candidate redirect artifact at the vacated identity',
    });
  }

  // Link rewrites, one step per link — there is no bulk substitution kind.
  for (const link of links) {
    const fate = buildLinks(spec).fates.find((f) => f.link === link.id)?.fate;
    if (!fate || fate.fate !== 'rewrite') continue;
    if (link.holderWritability !== 'writable' && !spec.rewriteReadOnly) continue;
    out.push({
      kind: 'LINK_REWRITE',
      bundle: link.from.bundle,
      target: link.from,
      action: 'MODIFY',
      risk: 'SAFE',
      escape: spec.escapedLink ? 'escaped' : 'contained',
      approvalScope: 'inherited',
      link,
      rationale: `manifest-bound substitution at byte ${link.occurrence}: ${link.to.id} -> ${fate.to.id}`,
    });
  }

  if (spec.editSource) {
    out.push({
      kind: 'CONTENT_EDIT',
      bundle: OKF,
      target: K(OKF, primarySourceId(spec)),
      action: 'MODIFY',
      risk: 'REVIEW',
      escape: 'contained',
      approvalScope: 'approved',
      rationale: 'strip the material that moved into the output',
    });
  }

  if (spec.inlineRepair) {
    out.push({
      kind: 'CONTENT_EDIT',
      bundle: OKF,
      target: K(OKF, 'concepts/downstream'),
      action: 'MODIFY',
      risk: 'REVIEW',
      escape: 'contained',
      approvalScope: 'approved',
      rationale: 'repair the third party review dependency inline',
    });
  }

  if (!spec.noIndexStep) {
    out.push({
      kind: 'INDEX_REGEN',
      bundle: OKF,
      target: K(OKF, 'concepts/index'),
      action: 'MODIFY',
      risk: 'SAFE',
      escape: 'observable-local',
      approvalScope: 'inherited',
      indexScope: spec.broadRebuild ? 'broad-rebuild' : 'directly-affected',
      rationale: 'regenerate the index entries this operation directly affects',
    });
    if (spec.op === 'move' && spec.crossBundle) {
      out.push({
        kind: 'INDEX_REGEN',
        bundle: PARTNER,
        target: K(PARTNER, 'concepts/index'),
        action: 'MODIFY',
        risk: 'SAFE',
        escape: 'observable-local',
        approvalScope: 'inherited',
        indexScope: 'directly-affected',
        rationale: 'regenerate the destination bundle index',
      });
    }
  }

  if (spec.indexEarly) {
    const idx = out.findIndex((d) => d.kind === 'INDEX_REGEN');
    const firstRemoval = out.findIndex((d) => d.kind === 'STATUS_TRANSITION' || d.kind === 'DELETE_CONCEPT' || (d.kind === 'MOVE_PATH' && d.action === 'MOVE'));
    if (idx >= 0 && firstRemoval >= 0) {
      const [regen] = out.splice(idx, 1);
      out.splice(firstRemoval, 0, regen);
    }
  }

  if (spec.rewriteFirst) {
    const rewrites = out.filter((d) => d.kind === 'LINK_REWRITE');
    const rest = out.filter((d) => d.kind !== 'LINK_REWRITE');
    out.length = 0;
    out.push(...rewrites, ...rest);
  }

  if (spec.badOrdering) {
    // Retire the source before the output exists.
    const removalIdx = out.findIndex((d) => d.kind === 'STATUS_TRANSITION' || (d.kind === 'MOVE_PATH' && d.action === 'MOVE') || d.kind === 'DELETE_CONCEPT');
    if (removalIdx > 0) {
      const [removal] = out.splice(removalIdx, 1);
      out.unshift(removal);
    }
  }
  // The primary source is a third party's review-dependency target; the marker
  // is what admission reads when it demands the breakage be listed.
  return out.map((d) =>
    (d.kind === 'STATUS_TRANSITION' || d.kind === 'DELETE_CONCEPT' || (d.kind === 'MOVE_PATH' && d.action === 'MOVE')) &&
    d.target.id === primarySourceId(spec)
      ? { ...d, rationale: `${d.rationale} has-review-dependents` }
      : d,
  );
}

function planOf(spec: Spec): Plan {
  switch (spec.op) {
    case 'merge':
      return { kind: 'merge', bundle: B(OKF), sources: mergeSourceIds().map(C), output: C(outputIds(spec)[0]) };
    case 'split':
      return { kind: 'split', bundle: B(OKF), source: C(primarySourceId(spec)), outputs: outputIds(spec).map(C) };
    case 'move':
      return {
        kind: 'move',
        from: spec.bundleRoot ? K(OKF, '') : K(OKF, primarySourceId(spec)),
        to: spec.bundleRoot ? K(OKF, 'moved-root') : K(spec.crossBundle ? PARTNER : OKF, moveTargetId()),
        alsoEditsContent: !!spec.moveAlsoEdits,
      };
    case 'supersede':
      return {
        kind: 'supersede',
        predecessor: K(OKF, 'concepts/session'),
        successor: K(OKF, 'concepts/session-v2'),
        createSuccessor: true,
      };
  }
}

function lineageOf(spec: Spec): readonly LineageRecord[] {
  if (spec.missingLineage) return [];
  const NC = 'none — identity changed; no UUID or frontmatter claims continuity' as const;
  if (spec.op === 'merge') {
    return mergeSourceIds().map((id) => ({
      retiredIdentity: K(OKF, id),
      mintedIdentities: [K(OKF, outputIds(spec)[0])],
      reason: 'merge' as const,
      continuity: NC,
    }));
  }
  if (spec.op === 'split') {
    return [
      {
        retiredIdentity: K(OKF, primarySourceId(spec)),
        mintedIdentities: outputIds(spec).map((id) => K(OKF, id)),
        reason: 'split' as const,
        continuity: NC,
      },
    ];
  }
  if (spec.op === 'move') {
    return [
      {
        retiredIdentity: spec.bundleRoot ? K(OKF, '') : K(OKF, primarySourceId(spec)),
        mintedIdentities: [K(spec.crossBundle ? PARTNER : OKF, moveTargetId())],
        reason: 'move' as const,
        continuity: NC,
      },
    ];
  }
  if (spec.archiveRelocate) {
    return [
      {
        retiredIdentity: K(OKF, 'concepts/session'),
        mintedIdentities: [K(OKF, 'archive/concepts/session')],
        reason: 'archive-relocation' as const,
        continuity: NC,
      },
    ];
  }
  return [];
}

/** Turns a requested operation into a manifest of atomic effects. */
export function plan(spec: Spec): Fixture {
  const pre = seedCorpus(spec);
  const drafts = draftsFor(spec);
  const { set, fates, breakage } = buildLinks(spec);
  const { deps, repairs } = reviewImpactOf(spec);

  const steps: EffectStep[] = [];
  let cur: Corpus = pre;
  drafts.forEach((d, ordinal) => {
    const beforeHash = hashOf(cur, d.target);
    const classification =
      d.claimAffectingOverride === true
        ? ({ claimAffecting: true, reason: 'a single step claiming both a path change and a content change' } as const)
        : classifyEdit(d.kind, true, true);
    const step: EffectStep = {
      ordinal,
      kind: d.kind,
      bundle: B(d.bundle),
      target: d.target,
      action: d.action,
      risk: d.risk,
      escape: d.escape,
      approvalScope: d.approvalScope,
      beforeHash,
      afterHash: null,
      classification,
      deletionProof: d.deletionProof ?? null,
      link: d.link ?? null,
      indexScope: d.indexScope ?? null,
      movedFrom: d.movedFrom ?? null,
      outputDraft: d.outputDraft ?? null,
      rationale: d.rationale,
    };
    const next = applyEffect(cur, step, pre);
    steps.push({ ...step, afterHash: hashOf(next, d.target) });
    cur = next;
  });

  const finalProjection = cur;

  // Inverse steps, authored at seal time and durable before the first mutation.
  const rollbackSteps: EffectStep[] = [];
  [...steps].reverse().forEach((s, i) => {
    if (spec.dropRollbackFor && s.target.id === spec.dropRollbackFor) return;
    const kind =
      s.kind === 'CREATE_OUTPUT' || (s.kind === 'MOVE_PATH' && s.action === 'CREATE')
        ? ('UNDO_CREATE' as const)
        : s.kind === 'REDIRECT_PUBLISH'
          ? ('REDIRECT_RETIRE' as const)
          : ('RESTORE_BYTES' as const);
    rollbackSteps.push({
      ...s,
      ordinal: i,
      kind,
      action: kind === 'UNDO_CREATE' ? 'DELETE' : 'MODIFY',
      approvalScope: 'approved',
      classification: classifyEdit(kind, true, true),
      beforeHash: hashOf(finalProjection, s.target),
      afterHash: hashOf(pre, s.target),
      rationale: `inverse of step ${s.ordinal} (${s.kind}) on ${ks(s.target)}`,
    });
  });

  const provenance: ProvenanceAssignmentEntry[] = [];
  if (!spec.missingProvenance && (spec.op === 'merge' || spec.op === 'split')) {
    const sources = spec.op === 'merge' ? mergeSourceIds() : [primarySourceId(spec)];
    for (const outId of outputIds(spec)) {
      for (const sid of sources) {
        const c = find(pre, K(OKF, sid));
        for (const e of c?.sources ?? []) provenance.push({ output: ks(K(OKF, outId)), entry: e });
      }
    }
  }
  const collisions = spec.provenanceCollision
    ? [
        {
          kind: 'same-id-different-resource' as const,
          entries: [
            { id: 'S1', resource: 'src/auth.ts' },
            { id: 'S1', resource: 'src/tokens.ts' },
          ],
        },
      ]
    : [];

  const manifest: OperationManifest = {
    operationId: `op-${spec.op}-${h(spec.label)}`,
    plan: planOf(spec),
    revertOf: null,
    bundles: bundleFacts(spec),
    steps,
    lineage: lineageOf(spec),
    rollbackSteps,
    inboundLinks: set,
    linkFates: fates,
    approvedBreakage: breakage,
    reviewImpact: [...deps, ...outputDependencies(spec)],
    scheduledRepairs: repairs,
    provenance,
    provenanceCollisions: collisions,
    visibilityIntents: [
      `deprecated concepts hidden from the index: ${'true'} (injected, owned by ${T14})`,
      spec.op === 'supersede'
        ? 'a stable, human-reviewed predecessor is superseded by an unverified draft; retrieval will prefer the successor'
        : 'index entries for the affected identities change',
    ],
    supersedeChain: spec.supersedeCycle
      ? [K(OKF, 'concepts/session-v2'), K(OKF, 'concepts/session-v0')]
      : spec.op === 'supersede'
        ? [K(OKF, 'concepts/session-v0')]
        : [],
    policies: policies(spec, fates, provenance),
    manifestHash: h(`${spec.label}|${steps.length}`),
  };

  const approved: ApprovedPlan = {
    manifest,
    requestOccurrenceId: 'req-1',
    tokenId: 'P-1',
    fingerprint: h(`fp|${spec.label}`),
    items: fingerprintItems(pre, steps),
    epochAtConfirm: Object.fromEntries(manifest.bundles.map((b) => [b.ledgerKey, b.epoch])),
    recoveryEvidenceHash: 'ev-1',
  };

  return { spec, label: spec.label, pre, approved, finalProjection };
}

/** Only paths that EXIST at approval time. A path appearing later is `added to scope`. */
export function fingerprintItems(corpus: Corpus, steps: readonly EffectStep[]): readonly FingerprintItem[] {
  const out: FingerprintItem[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    const key = s.movedFrom ?? s.target;
    if (seen.has(ks(key))) continue;
    const c = find(corpus, key);
    if (!c) continue;
    seen.add(ks(key));
    const o = observe(c);
    out.push({ path: ks(key), contentHash: o.contentHash, verificationHash: o.verificationHash, action: s.action, risk: s.risk });
  }
  return out;
}

/** Recomputed against the live corpus at recheck time, with a fresh planned action. */
export function observedItems(corpus: Corpus, steps: readonly EffectStep[]): readonly FingerprintItem[] {
  const out: FingerprintItem[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    const key = s.movedFrom ?? s.target;
    if (seen.has(ks(key))) continue;
    const c = find(corpus, key);
    if (!c) continue;
    seen.add(ks(key));
    const o = observe(c);
    const already = s.kind === 'STATUS_TRANSITION' && c.status === 'deprecated';
    out.push({
      path: ks(key),
      contentHash: o.contentHash,
      verificationHash: o.verificationHash,
      action: already ? 'KEEP' : s.action,
      risk: s.risk,
    });
  }
  // Anything now sitting at a planned CREATE destination is new scope.
  for (const s of steps) {
    if (s.kind !== 'CREATE_OUTPUT' && !(s.kind === 'MOVE_PATH' && s.action === 'CREATE')) continue;
    if (seen.has(ks(s.target))) continue;
    const c = find(corpus, s.target);
    if (!c) continue;
    seen.add(ks(s.target));
    const o = observe(c);
    out.push({ path: ks(s.target), contentHash: o.contentHash, verificationHash: o.verificationHash, action: s.action, risk: s.risk });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recovery evidence, snapshots, validation. All injected, none decided here.
// ---------------------------------------------------------------------------

export function snapshotEntry(corpus: Corpus, key: ConceptKey): SnapshotEntry {
  const c = find(corpus, key);
  return {
    key,
    existedBefore: c !== null,
    bytesRef: c ? (`bytes:${h(c.body)}` as SnapshotEntry['bytesRef']) : null,
    observedHash: c ? observe(c).observedHash : '(absent)',
  };
}

export function goodEvidence(corpus: Corpus, keys: readonly ConceptKey[]): RecoveryEvidence {
  return {
    previewComplete: true,
    snapshot: { id: 'snap-1', entries: keys.map((k) => snapshotEntry(corpus, k)) },
    snapshotOutsideMutationTarget: true,
    restoredIntoDisposableLocation: true,
    restoredContentHashVerified: true,
    rollbackProcedureDocumented: true,
    boundToApprovedPreview: true,
    stale: false,
    evidenceHash: 'ev-1',
  };
}

export function badEvidence(corpus: Corpus, keys: readonly ConceptKey[]): RecoveryEvidence {
  return { ...goodEvidence(corpus, keys), restoredContentHashVerified: false, stale: true };
}

export function validationVerdict(ok: boolean): ValidationVerdict {
  return { okfValid: ok, detail: ok ? [] : ['frontmatter: required key `status` missing on an output'] };
}

// ---------------------------------------------------------------------------
// Post-operation checks. Injected verdicts; this ticket does not specify them.
// ---------------------------------------------------------------------------

export function postOpChecks(
  fixture: Fixture,
  corpus: Corpus,
  opts: {
    identity?: 'pass' | 'fail';
    link?: 'pass' | 'fail';
    dependency?: 'pass' | 'fail';
    danglingAlias?: boolean;
    structural?: boolean;
    crossBundleSameId?: boolean;
  } = {},
): PostOpChecks {
  const m = fixture.approved.manifest;
  const resolutions = m.inboundLinks.links.map((link) => {
    const fate = m.linkFates.find((f) => f.link === link.id)?.fate;
    if (fate?.fate === 'knowingly-broken-approved') {
      return [link.id, { state: 'knowingly-broken-approved' as const, approvedInPlanAs: fate.why }] as const;
    }
    if (opts.danglingAlias && link.linkForm.form === 'workspace-alias') {
      return [
        link.id,
        { state: 'unexpectedly-broken' as const, detail: `okf-workspace://${link.linkForm.alias}/${link.to.id} resolves to nothing` },
      ] as const;
    }
    return [link.id, { state: 'resolves' as const }] as const;
  });
  void corpus;
  return {
    identityChecks: opts.identity ?? 'pass',
    linkChecks: opts.danglingAlias ? 'fail' : (opts.link ?? 'pass'),
    dependencyChecks: opts.structural ? 'fail' : (opts.dependency ?? 'pass'),
    linkResolutions: resolutions,
    findings: opts.crossBundleSameId
      ? ['advisory: the same Concept ID exists in another bundle; cross-bundle duplication is not an error']
      : [],
    structuralInvalidity: opts.structural
      ? ['the output inherited a review scope that contains itself', 'the dependency graph closes a cycle']
      : [],
    contentCoverage: {
      checkableByValidation: false,
      diff: 'sum-preservation across outputs is not machine-checkable; a human must confirm nothing was dropped',
    },
  };
}
