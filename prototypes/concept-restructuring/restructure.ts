/**
 * PROTOTYPE — concept restructuring and rollback, FROM APPLY ONWARD.
 *
 * Pure reducer. No I/O, no imports, no clock, no console, no ANSI, nothing
 * written to disk. This is the only file in the prototype meant to outlive it.
 *
 * The machine starts at APPLY. The explicit request, the complete preview, the
 * confirmation binding and the fresh recheck are already-satisfied inputs from
 * the guard prototyped under "Prototype the portable manual-operation guard
 * state machine"; they are consumed here, never re-derived.
 *
 * The journal is the truth. `Phase` and `Classification` are derived from it,
 * never stored, so the phase can never disagree with the record.
 */

// ---------------------------------------------------------------------------
// 0. Values owned by other tickets. Never decided here; always rendered.
// ---------------------------------------------------------------------------

/** Wraps any value this ticket must not settle so the frame can show the gap. */
export interface Injected<T> {
  readonly value: T;
  /** Ticket title, rendered as the link target in every user-facing surface. */
  readonly ownedBy: string;
  /** Rendered verbatim next to every use, so a default never reads as decided. */
  readonly openQuestion: string;
}

/** Non-`off` modes exist only so a candidate plan can be RENDERED and refused. */
export type RedirectPolicy =
  | { readonly mode: 'off' }
  | {
      readonly mode: 'candidate';
      readonly artifact: 'concept-file' | 'frontmatter-field' | 'index-entry' | 'manifest-only';
      readonly followable: boolean;
      /** Type-level: no candidate mode can ever be admissible. */
      readonly authorization: 'blocked-pending-semantics';
    };

export type ArchivePolicy =
  | { readonly kind: 'deprecate-in-place' }
  | { readonly kind: 'relocate'; readonly archiveRoot: string };

export type SourceDisposition = 'deprecate' | 'delete' | 'leave';
export type SupersedeEdgeRepresentation = 'none' | 'superseded_by-field' | 'index-entry';
export type RollbackAuthorizationMode = 'inherited-from-parent-approval' | 'requires-fresh-approval';

/** Opaque verdict from a validator this ticket does not specify. */
export interface ValidationVerdict {
  readonly okfValid: boolean;
  readonly detail: readonly string[];
}

export interface InjectedPolicies {
  readonly redirects: Injected<RedirectPolicy>;
  readonly archive: Injected<ArchivePolicy>;
  readonly sourceDisposition: Injected<SourceDisposition>;
  readonly supersedeEdge: Injected<SupersedeEdgeRepresentation>;
  readonly rollbackAuthorization: Injected<RollbackAuthorizationMode>;
  readonly deprecatedHiddenFromIndex: Injected<boolean>;
  /** Per-link destination TABLE, never a function: renderable and toggleable. */
  readonly inboundLinkFates: Injected<readonly LinkFateEntry[]>;
  /** Provenance assignment TABLE, never a function, for the same reason. */
  readonly provenanceAssignment: Injected<readonly ProvenanceAssignmentEntry[]>;
}

// ---------------------------------------------------------------------------
// 1. Identity. Bundle identity = owner + bundle-root path; Concept ID =
//    bundle-relative path without `.md`. There is no other identifier, and no
//    field anywhere in this file claims continuity across an identity change.
// ---------------------------------------------------------------------------

export type BundleId = string & { readonly __bundle: unique symbol };
export type ConceptId = string & { readonly __concept: unique symbol };
export interface ConceptKey {
  readonly bundle: BundleId;
  readonly id: ConceptId;
}
export type ConceptKeyString = string;

export function ks(k: ConceptKey): ConceptKeyString {
  return `${k.bundle}::${k.id}`;
}
export function sameKey(a: ConceptKey, b: ConceptKey): boolean {
  return a.bundle === b.bundle && a.id === b.id;
}

export type ProjectMode = 'code-backed' | 'knowledge-only' | 'unknown';
export type Writability =
  | 'writable'
  | 'read-only-federated'
  | 'read-only-vendored'
  | 'read-only-generated'
  | 'read-only-workspace-root'
  | 'inactive-member';

export interface BundleFacts {
  readonly bundle: BundleId;
  /** Canonical bundle identity. Linked worktrees share this value. */
  readonly ledgerKey: string;
  readonly mode: ProjectMode;
  readonly writability: Writability;
  readonly epoch: number;
  readonly generation: string;
  readonly schema: 'ok' | 'unreadable' | 'newer' | 'corrupt';
}

// ---------------------------------------------------------------------------
// 2. Observation vs restoration. Two different types on purpose: the restore
//    path can only see BYTES, so no code path can reconstruct a file from a
//    parsed view and silently break byte-identity.
// ---------------------------------------------------------------------------

export type BytesRef = string & { readonly __bytes: unique symbol };

export interface Observed {
  readonly key: ConceptKey;
  readonly exists: boolean;
  readonly contentHash: string;
  /** Hash over the verification event list alone. */
  readonly verificationHash: string;
  /** H(contentHash, verificationHash) — THE fingerprint/recheck unit. */
  readonly observedHash: string;
  /**
   * DIVERGENCE from DESIGN.md §2: status is lifted out of the render-only view
   * because two admission guards genuinely need it (REANIMATES_RETIRED_IDENTITY
   * and planned-action drift). `verification` and `tier` stay inside `view`, and
   * no guard in this file reads `view` — only `derive` does. That is I23.
   */
  readonly status: ConceptStatus | null;
  /** RENDER ONLY. Read by `derive`; never by a guard. */
  readonly view: ConceptView | null;
}

/** The only input `restoreFrom` accepts. Carries no parsed fields at all. */
export interface SnapshotEntry {
  readonly key: ConceptKey;
  readonly existedBefore: boolean;
  readonly bytesRef: BytesRef | null;
  readonly observedHash: string;
}

export interface Snapshot {
  readonly id: string;
  readonly entries: readonly SnapshotEntry[];
}

/** Bytes in, hash out. There is no overload that accepts a parsed concept. */
export function restoreFrom(entry: SnapshotEntry): { readonly restoredHash: string | null } {
  return { restoredHash: entry.bytesRef === null ? null : entry.observedHash };
}

// ---------------------------------------------------------------------------
// 3. Parsed view. RENDERING ONLY. Never an input to restore, and no reducer
//    guard reads `verification` or `tier` (trust is evidence, never authority).
// ---------------------------------------------------------------------------

export type ConceptStatus = 'draft' | 'stable' | 'deprecated';
export type TrustTier = 'unverified' | 'machine-confirmed' | 'human-reviewed';

export interface VerificationEvent {
  readonly actor: string; // `human:<id>` promotes to human-reviewed
  readonly at: string;
}
export interface Verification {
  readonly events: readonly VerificationEvent[];
}

export interface SourceEntry {
  readonly id: string;
  readonly resource: string;
}

export interface ConceptView {
  readonly key: ConceptKey;
  /** `null` means the frontmatter key is absent, which the spec reads as stable. */
  readonly status: ConceptStatus | null;
  readonly statusExplicit: boolean;
  readonly verification: Verification;
  readonly sources: readonly SourceEntry[];
  readonly tier: TrustTier;
}

export function tierOf(v: Verification): TrustTier {
  if (v.events.length === 0) return 'unverified';
  return v.events.some((e) => e.actor.startsWith('human:')) ? 'human-reviewed' : 'machine-confirmed';
}

// ---------------------------------------------------------------------------
// 4. Trust. `trustFate` structurally cannot see identity, lineage, an input
//    concept, or a count — and neither can the classifier that feeds it.
// ---------------------------------------------------------------------------

export type NonClaimAllowlist =
  | 'byte-identical-path-move'
  | 'manifest-bound-link-substitution'
  | 'status-transition'
  /** DIVERGENCE: regenerating an index touches no concept claim. */
  | 'index-regeneration'
  /** DIVERGENCE: a byte-identical restore returns the verification with the bytes (I9). */
  | 'byte-identical-restore';

export type EditClassification =
  | { readonly claimAffecting: false; readonly allowlist: NonClaimAllowlist }
  | { readonly claimAffecting: true; readonly reason: string };

/** Inputs: effect kind and two byte-level facts. No key, no lineage, no tier. */
export function classifyEdit(
  kind: EffectKind,
  bytesUnchangedApartFromPath: boolean,
  substitutionConfinedToManifestTarget: boolean,
): EditClassification {
  switch (kind) {
    case 'MOVE_PATH':
      return bytesUnchangedApartFromPath
        ? { claimAffecting: false, allowlist: 'byte-identical-path-move' }
        : { claimAffecting: true, reason: 'move carried a content edit' };
    case 'LINK_REWRITE':
      return substitutionConfinedToManifestTarget
        ? { claimAffecting: false, allowlist: 'manifest-bound-link-substitution' }
        : { claimAffecting: true, reason: 'substitution left the manifest-bound target' };
    case 'STATUS_TRANSITION':
      return { claimAffecting: false, allowlist: 'status-transition' };
    case 'INDEX_REGEN':
    case 'REDIRECT_PUBLISH':
    case 'REDIRECT_RETIRE':
      return { claimAffecting: false, allowlist: 'index-regeneration' };
    case 'RESTORE_BYTES':
    case 'UNDO_CREATE':
      return { claimAffecting: false, allowlist: 'byte-identical-restore' };
    case 'CREATE_OUTPUT':
      return { claimAffecting: true, reason: 'newly authored body' };
    case 'CONTENT_EDIT':
      return { claimAffecting: true, reason: 'body content changed' };
    case 'DELETE_CONCEPT':
      return { claimAffecting: true, reason: 'concept removed' };
  }
}

/** Signature cannot receive identity. That is the whole guarantee. */
export function trustFate(before: Verification, c: EditClassification): Verification {
  return c.claimAffecting ? { events: [] } : before;
}

export interface TrustOutcome {
  readonly key: ConceptKey;
  readonly before: TrustTier;
  readonly after: TrustTier;
  readonly invalidationReported: boolean;
  readonly classification: EditClassification;
}

// ---------------------------------------------------------------------------
// 5. Links and review dependencies — three- and four-valued, never collapsed.
// ---------------------------------------------------------------------------

export type LinkId = string & { readonly __link: unique symbol };

export type LinkForm =
  | { readonly form: 'in-bundle-markdown' } // never falls through to another bundle
  | { readonly form: 'workspace-alias'; readonly alias: string }; // okf-workspace://

export interface InboundLink {
  readonly id: LinkId;
  readonly from: ConceptKey;
  readonly to: ConceptKey;
  readonly linkForm: LinkForm;
  readonly holderWritability: Writability;
  /** Byte offset of this occurrence: what makes a substitution provably confined. */
  readonly occurrence: number;
}

export type LinkFate =
  | { readonly fate: 'rewrite'; readonly to: ConceptKey }
  | { readonly fate: 'knowingly-broken-approved'; readonly why: string }
  | { readonly fate: 'unassigned' }; // admission refuses on any of these

export interface LinkFateEntry {
  readonly link: LinkId;
  readonly fate: LinkFate;
}

export type LinkIncompleteness =
  | 'inactive-required-member'
  | 'partial-workspace'
  | 'permission'
  | 'planner-truncated';

export interface InboundLinkSet {
  readonly links: readonly InboundLink[];
  readonly complete: boolean;
  readonly incompleteness: readonly LinkIncompleteness[];
}

/** Three states. Collapsing the middle into either neighbour is lossy. */
export type LinkResolution =
  | { readonly state: 'resolves' }
  | { readonly state: 'knowingly-broken-approved'; readonly approvedInPlanAs: string }
  | { readonly state: 'unexpectedly-broken'; readonly detail: string };

/** Four values. `unavailable` and `unobservable` are never mapped onto each other. */
export type ReviewFinding =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'changed' }
  | { readonly kind: 'unavailable'; readonly oldLocator: string }
  | { readonly kind: 'unobservable'; readonly reason: string }
  | { readonly kind: 'no-baseline' };

export interface ReviewDependency {
  readonly owner: ConceptKey;
  readonly locator: string;
  readonly hasBaseline: boolean;
  readonly finding: ReviewFinding;
  /** Captured for a preview. `accepted` is a literal `false`: never promotable. */
  readonly capturedObservation: { readonly evidence: string; readonly accepted: false } | null;
  readonly openFindings: readonly string[];
  /** Populated only by VERIFY: self-scope, traceability-record scope, cycles. */
  readonly structuralInvalidity: readonly string[];
}

export interface ScheduledRepair {
  readonly mapping: ReviewDependency;
  readonly oldLocator: string;
  readonly newLocator: string | null;
  readonly becomes: Extract<ReviewFinding, { kind: 'unavailable' | 'unobservable' }>;
  readonly evidence: string;
}
// Recorded, never performed: `ScheduledRepair` is not an `EffectStep`, so no
// `runStep` ordinal can execute one. That is the mechanism, not a marker field.

// ---------------------------------------------------------------------------
// 6. Plans. Illegal operations are UNCONSTRUCTIBLE, not merely refused.
//    Merge/split carry ONE BundleId, so cross-bundle merge cannot be built.
// ---------------------------------------------------------------------------

export interface MergePlan {
  readonly kind: 'merge';
  readonly bundle: BundleId;
  readonly sources: readonly ConceptId[];
  readonly output: ConceptId;
}
export interface SplitPlan {
  readonly kind: 'split';
  readonly bundle: BundleId;
  readonly source: ConceptId;
  readonly outputs: readonly ConceptId[];
}
export interface MovePlan {
  readonly kind: 'move';
  readonly from: ConceptKey;
  readonly to: ConceptKey;
  readonly alsoEditsContent: boolean;
}
export interface SupersedePlan {
  readonly kind: 'supersede';
  readonly predecessor: ConceptKey;
  readonly successor: ConceptKey;
  readonly createSuccessor: boolean;
}
export type Plan = MergePlan | SplitPlan | MovePlan | SupersedePlan;
export type OperationKind = Plan['kind'];

// ---------------------------------------------------------------------------
// 7. Effect steps — the unit of failure. `ordinal` is the identity; there is
//    no second step id. Ordering rules are ordinal comparisons, not a DAG.
// ---------------------------------------------------------------------------

export type EffectKind =
  | 'CREATE_OUTPUT'
  | 'CONTENT_EDIT'
  | 'STATUS_TRANSITION'
  | 'MOVE_PATH'
  | 'DELETE_CONCEPT' // policy delete, matrix-governed
  | 'UNDO_CREATE' // inverse of a create; NOT routed through the deletion rule
  | 'RESTORE_BYTES' // inverse of everything else
  | 'LINK_REWRITE'
  | 'INDEX_REGEN'
  | 'REDIRECT_PUBLISH' // representable so a candidate plan renders; never admissible
  | 'REDIRECT_RETIRE';

/** Guard fingerprint vocabulary, extended only by new planned actions. */
export type PlannedAction = 'CREATE' | 'MODIFY' | 'MOVE' | 'DELETE' | 'KEEP';
export type RiskClass = 'SAFE' | 'CAUTION' | 'REVIEW' | 'DESTRUCTIVE';

/** Declared AT ADMISSION so the human approves knowing rollback is partial. */
export type EscapeClass =
  | 'contained' // pure file bytes; byte restore is a complete undo
  | 'observable-local' // index/retrieval visibility a local reader may consume
  | 'escaped'; // published redirect, pushed cross-repo rewrite: never undoable

export interface DeletionProof {
  readonly supersededBy: ConceptKey | null;
  readonly redundantWith: ConceptKey | null;
  readonly holdsUniqueDurableContext: boolean; // true => blocked in both modes
  readonly evidence: string;
}

/** Draft facts a `CREATE_OUTPUT` must carry. DIVERGENCE: DESIGN.md asserts I1
 *  and the EMPTY_OUTPUT / NOT_A_SPLIT refusals without giving the step a field
 *  to hold the facts they read. This is that field. */
export interface OutputDraftFacts {
  readonly statusExplicit: boolean;
  readonly verificationEmpty: boolean;
  readonly empty: boolean;
  readonly byteIdenticalToSource: boolean;
}

export interface EffectStep {
  readonly ordinal: number; // total order AND identity
  readonly kind: EffectKind;
  readonly bundle: BundleId;
  readonly target: ConceptKey;
  readonly action: PlannedAction;
  readonly risk: RiskClass;
  readonly escape: EscapeClass;
  readonly approvalScope: 'approved' | 'inherited';
  /** Expected pre-state; `null` => target must not exist. */
  readonly beforeHash: string | null;
  /** Expected post-state, known at seal; `null` => target must not exist. */
  readonly afterHash: string | null;
  readonly classification: EditClassification;
  readonly deletionProof: DeletionProof | null;
  readonly link: InboundLink | null;
  readonly indexScope: 'directly-affected' | 'broad-rebuild' | null;
  /** Set on the write half of a move: the identity whose bytes these are. */
  readonly movedFrom: ConceptKey | null;
  readonly outputDraft: OutputDraftFacts | null;
  readonly rationale: string;
}

/** Derived only from journal records plus observation. Never assumed. */
export type StepObservation =
  | { readonly state: 'not-started' } // observed === beforeHash
  | { readonly state: 'done' } // observed === afterHash
  | { readonly state: 'indeterminate' } // INTENT logged, no OUTCOME
  | { readonly state: 'foreign'; readonly observedHash: string }; // matches neither

export function isWrite(s: EffectStep): boolean {
  return s.kind === 'CREATE_OUTPUT' || (s.kind === 'MOVE_PATH' && s.action === 'CREATE');
}
export function isRemoval(s: EffectStep): boolean {
  return (
    s.kind === 'DELETE_CONCEPT' ||
    s.kind === 'STATUS_TRANSITION' ||
    (s.kind === 'MOVE_PATH' && s.action === 'MOVE')
  );
}

// ---------------------------------------------------------------------------
// 8. Lineage and the operation manifest. Sealed before the first mutation and
//    IMMUTABLE thereafter; observations append to a separate log.
// ---------------------------------------------------------------------------

export interface LineageRecord {
  readonly retiredIdentity: ConceptKey;
  readonly mintedIdentities: readonly ConceptKey[];
  readonly reason: 'merge' | 'split' | 'move' | 'archive-relocation';
  /** The literal, rendered verbatim. There is no continuity field to set. */
  readonly continuity: 'none — identity changed; no UUID or frontmatter claims continuity';
}

export const NO_CONTINUITY = 'none — identity changed; no UUID or frontmatter claims continuity';

export interface ProvenanceAssignmentEntry {
  readonly output: ConceptKeyString;
  readonly entry: SourceEntry;
}
export interface ProvenanceCollision {
  readonly kind: 'same-id-different-resource' | 'same-resource-different-id';
  readonly entries: readonly SourceEntry[];
}

export interface OperationManifest {
  readonly operationId: string;
  readonly plan: Plan;
  /** Set when this manifest is the inverse of another. Rollback is an operation. */
  readonly revertOf: string | null;
  readonly bundles: readonly BundleFacts[];
  readonly steps: readonly EffectStep[];
  readonly lineage: readonly LineageRecord[];
  readonly rollbackSteps: readonly EffectStep[];
  readonly inboundLinks: InboundLinkSet;
  readonly linkFates: readonly LinkFateEntry[];
  readonly approvedBreakage: readonly LinkId[];
  readonly reviewImpact: readonly ReviewDependency[];
  readonly scheduledRepairs: readonly ScheduledRepair[];
  readonly provenance: readonly ProvenanceAssignmentEntry[];
  readonly provenanceCollisions: readonly ProvenanceCollision[];
  readonly visibilityIntents: readonly string[]; // recorded, never decided
  /** Predecessor's existing supersede chain. Rendered as a depth, never thresholded. */
  readonly supersedeChain: readonly ConceptKey[];
  readonly policies: InjectedPolicies;
  readonly manifestHash: string; // inside the approval fingerprint
}

// ---------------------------------------------------------------------------
// 9. Guard inputs consumed, never re-derived.
// ---------------------------------------------------------------------------

export interface FingerprintItem {
  readonly path: string;
  readonly contentHash: string;
  readonly verificationHash: string;
  readonly action: PlannedAction;
  readonly risk: RiskClass;
}

export interface ApprovedPlan {
  readonly manifest: OperationManifest;
  readonly requestOccurrenceId: string;
  readonly tokenId: string;
  readonly fingerprint: string;
  readonly items: readonly FingerprintItem[];
  readonly epochAtConfirm: Readonly<Record<string, number>>;
  readonly recoveryEvidenceHash: string | null;
}

/** A conjunction. Every member must hold, or the verdict is BLOCK. */
export interface RecoveryEvidence {
  readonly previewComplete: boolean;
  readonly snapshot: Snapshot | null;
  readonly snapshotOutsideMutationTarget: boolean;
  readonly restoredIntoDisposableLocation: boolean;
  readonly restoredContentHashVerified: boolean;
  readonly rollbackProcedureDocumented: boolean;
  readonly boundToApprovedPreview: boolean;
  readonly stale: boolean;
  readonly evidenceHash: string;
}

export function failedConjuncts(e: RecoveryEvidence): readonly string[] {
  const out: string[] = [];
  if (!e.previewComplete) out.push('previewComplete=false');
  if (e.snapshot === null) out.push('snapshot=null');
  if (!e.snapshotOutsideMutationTarget) out.push('snapshotOutsideMutationTarget=false');
  if (!e.restoredIntoDisposableLocation) out.push('restoredIntoDisposableLocation=false');
  if (!e.restoredContentHashVerified) out.push('restoredContentHashVerified=false');
  if (!e.rollbackProcedureDocumented) out.push('rollbackProcedureDocumented=false');
  if (!e.boundToApprovedPreview) out.push('boundToApprovedPreview=false');
  if (e.stale) out.push('stale=true');
  return out;
}

// ---------------------------------------------------------------------------
// 10. Ambiguity and residue — the anti-silence devices.
// ---------------------------------------------------------------------------

export type AmbiguityKind =
  | 'two-live-carriers-no-authority'
  | 'knowledge-live-nowhere'
  | 'orphan-output-exists'
  | 'links-split-across-old-and-new'
  | 'duplicate-identity-across-bundles'
  | 'index-advertises-unsettled-outcome'
  | 'foreign-mutation-in-scope'
  | 'restore-not-byte-identical'
  | 'rollback-partially-applied'
  | 'step-outcome-indeterminate'
  | 'unclassified-loss'; // the escape hatch that keeps the invariant total

export interface AmbiguityFinding {
  readonly kind: AmbiguityKind;
  readonly concepts: readonly ConceptKey[];
  readonly paths: readonly string[]; // orphans listed BY PATH
  readonly statement: string;
  readonly acknowledgedByHuman: boolean; // acknowledgement is not approval
}

export interface Residue {
  readonly ordinal: number;
  readonly escape: Exclude<EscapeClass, 'contained'>;
  readonly statement: string;
}

// ---------------------------------------------------------------------------
// 11. The journal. It is the truth; the frame is a projection of it.
// ---------------------------------------------------------------------------

export type ObservationKind =
  | 'redirect-followed'
  | 'retrieval-served'
  | 'downstream-commit'
  | 'output-human-verified'
  | 'output-linked-to'
  | 'output-superseded-in-turn';

export interface PostOpChecks {
  readonly identityChecks: 'pass' | 'fail';
  readonly linkChecks: 'pass' | 'fail';
  readonly dependencyChecks: 'pass' | 'fail';
  readonly linkResolutions: readonly (readonly [LinkId, LinkResolution])[];
  readonly findings: readonly string[];
  readonly structuralInvalidity: readonly string[];
  readonly contentCoverage: { readonly checkableByValidation: false; readonly diff: string };
}

export type JournalRecord =
  /**
   * DIVERGENCE: the whole `ApprovedPlan` is recorded (not just its manifest) so
   * the recheck can compare against the items the human actually saw, and
   * `world` is snapshotted so `identityDiff` has a "before".
   */
  | { readonly r: 'ADMITTED'; readonly approved: ApprovedPlan; readonly world: readonly Observed[] }
  | { readonly r: 'REFUSED'; readonly code: RefusalCode; readonly detail: readonly string[] }
  | { readonly r: 'GATE'; readonly evidence: RecoveryEvidence; readonly ok: boolean }
  | { readonly r: 'LOCKED'; readonly bundles: readonly BundleId[] }
  | { readonly r: 'RECHECK'; readonly ok: boolean; readonly drift: readonly string[] }
  | { readonly r: 'MANIFEST_DURABLE'; readonly manifestHash: string }
  | { readonly r: 'INTENT'; readonly ordinal: number; readonly undo: SnapshotEntry }
  | {
      readonly r: 'OUTCOME';
      readonly ordinal: number;
      readonly ok: boolean;
      readonly observedAfter: string | null;
      readonly note: string;
    }
  | { readonly r: 'INVALIDATION'; readonly ordinal: number; readonly concept: ConceptKey }
  | { readonly r: 'VERIFY'; readonly verdict: ValidationVerdict; readonly checks: PostOpChecks }
  | { readonly r: 'EPOCH_ADVANCED'; readonly bundle: BundleId; readonly from: number; readonly to: number }
  | { readonly r: 'SETTLED'; readonly as: 'applied' | 'reverted' } // the commit record
  | { readonly r: 'FAILURE'; readonly ordinal: number | null; readonly reason: string }
  | { readonly r: 'RECONCILED'; readonly steps: readonly (readonly [number, StepObservation])[] }
  | { readonly r: 'RECOVERY_REPORT'; readonly operationId: string; readonly outcome: 'unknown' }
  /**
   * DIVERGENCE from T19. The design says `crash` appends nothing, but liveness
   * is not a journal fact and I44 requires the phase to be derivable from the
   * journal alone. This record stands for the NEXT process's observation that
   * the journal is in-flight, has no SETTLED record, and has no live holder.
   */
  | { readonly r: 'INTERRUPTED' }
  /** DIVERGENCE: `acknowledge` must be durable, so it is a record, not a flag. */
  | { readonly r: 'ACKNOWLEDGED'; readonly kind: AmbiguityKind }
  /** Append-only observation log. NEVER amends the sealed manifest. */
  | {
      readonly r: 'OBSERVATION';
      readonly ordinal: number;
      readonly kind: ObservationKind;
      readonly detail: string;
    };

export type Journal = readonly JournalRecord[];

// ---------------------------------------------------------------------------
// 12. Phases, classification, refusal vocabulary.
// ---------------------------------------------------------------------------

export type Phase =
  | 'admitting'
  | 'refused' // clean terminal: the ask cannot be authorized
  | 'gate-blocked' // clean terminal: recovery evidence failed or stale
  | 'expired' // clean terminal: the world moved; fresh preview required
  | 'manifest-durable'
  | 'mutating'
  | 'verifying'
  | 'applied-clean'
  | 'applied-with-known-breakage'
  | 'failed-clean' // handled failure with ZERO steps done: no bytes moved
  | 'failed-dirty'
  | 'rolling-back'
  | 'reverted-clean'
  | 'reverted-with-residue'
  | 'rollback-failed'
  | 'unknown-interrupted';

export type Settlement = 'none' | 'applied' | 'reverted' | 'indeterminate';
export type Cleanliness = 'clean' | 'dirty';

export interface Classification {
  readonly settlement: Settlement;
  readonly cleanliness: Cleanliness;
  readonly terminal: boolean;
  readonly automaticRepairPermitted: boolean;
}

/** Pure function of Phase. NEVER stored beside it. */
export function classify(p: Phase): Classification {
  switch (p) {
    case 'admitting':
    case 'manifest-durable':
    case 'mutating':
    case 'verifying':
    case 'rolling-back':
      return { settlement: 'none', cleanliness: 'clean', terminal: false, automaticRepairPermitted: true };
    case 'refused':
    case 'gate-blocked':
    case 'expired':
    case 'failed-clean':
      return { settlement: 'none', cleanliness: 'clean', terminal: true, automaticRepairPermitted: false };
    case 'applied-clean':
    case 'applied-with-known-breakage':
      return { settlement: 'applied', cleanliness: 'clean', terminal: true, automaticRepairPermitted: false };
    case 'reverted-clean':
      return { settlement: 'reverted', cleanliness: 'clean', terminal: true, automaticRepairPermitted: false };
    /**
     * `reverted-with-residue` is byte-clean — every entry was restored — so it
     * is not `dirty`. Its loudness comes from a MANDATORY non-empty `residue`
     * list, checked by `checkInvariants`, not from the ambiguity taxonomy.
     */
    case 'reverted-with-residue':
      return { settlement: 'reverted', cleanliness: 'clean', terminal: true, automaticRepairPermitted: false };
    case 'failed-dirty':
      return { settlement: 'none', cleanliness: 'dirty', terminal: true, automaticRepairPermitted: false };
    case 'rollback-failed':
    case 'unknown-interrupted':
      return {
        settlement: 'indeterminate',
        cleanliness: 'dirty',
        terminal: true,
        automaticRepairPermitted: false,
      };
  }
}

export type RefusalCode =
  | 'CROSS_BUNDLE_MERGE_UNEXPRESSIBLE'
  | 'CROSS_BUNDLE_SPLIT_UNEXPRESSIBLE'
  | 'SOURCE_FATE_UNENUMERATED'
  | 'KNOWLEDGE_ONLY_DELETE_BLOCKED'
  | 'DELETION_UNPROVEN'
  | 'DELETION_FOLDED_INTO_SUPERSEDE'
  | 'UNIQUE_DURABLE_CONTEXT'
  | 'UNKNOWN_PROJECT_MODE'
  | 'DESTINATION_OCCUPIED'
  | 'DESTINATION_BUNDLE_READ_ONLY'
  | 'LINK_SET_INCOMPLETE'
  | 'LINK_FATE_UNASSIGNED'
  | 'ALIAS_CANNOT_FAN_OUT'
  | 'PROVENANCE_UNASSIGNED'
  | 'EMPTY_OUTPUT'
  | 'NOT_A_SPLIT_RECLASSIFY_AS_MOVE'
  | 'OUTPUT_NOT_EXPLICIT_DRAFT'
  | 'REANIMATES_RETIRED_IDENTITY'
  | 'REDIRECT_BLOCKED_PENDING_SEMANTICS'
  | 'BROAD_REBUILD_NEEDS_OWN_GATE'
  | 'ORDERING_WOULD_UNMOOR_KNOWLEDGE'
  | 'MOVE_AND_EDIT_NOT_SEPARATED'
  | 'BUNDLE_ROOT_SELF_ORPHANING'
  | 'LEDGER_FAILS_CLOSED'
  | 'SUPERSEDE_CYCLE'
  | 'LINEAGE_RECORD_MISSING'
  | 'DEPENDENCY_BREAKAGE_UNLISTED'
  | 'REVIEW_REPAIR_PERFORMED_INLINE'
  | 'TOKEN_SPENT';

// ---------------------------------------------------------------------------
// 13. The frame — everything rendered after every action. Derived, not stored.
// ---------------------------------------------------------------------------

export interface IdentityDiffRow {
  readonly key: ConceptKey;
  readonly before: ConceptView | null;
  readonly after: ConceptView | null;
}

export interface Frame {
  readonly phase: Phase;
  readonly classification: Classification;
  readonly manifest: OperationManifest | null;
  readonly manifestDurable: boolean;
  readonly steps: readonly (readonly [number, StepObservation])[];
  /** Occupancy diff: what sat at each Concept ID before and what sits there now. */
  readonly identityDiff: readonly IdentityDiffRow[];
  readonly lineage: readonly LineageRecord[];
  readonly links: readonly (readonly [LinkId, LinkResolution])[];
  readonly linkSetComplete: boolean;
  readonly reviewDependencies: readonly ReviewDependency[];
  readonly trust: readonly TrustOutcome[];
  readonly ambiguities: readonly AmbiguityFinding[];
  readonly residue: readonly Residue[];
  readonly recovery: RecoveryEvidence | null;
  readonly validation: ValidationVerdict | null;
  readonly checks: PostOpChecks | null;
  readonly notice: readonly string[]; // the notice contract
  readonly humanActionRequired: readonly string[];
  readonly openQuestions: readonly string[]; // from every Injected<T> touched
  readonly epochAdvances: readonly (readonly [BundleId, number])[];
  readonly settledAs: 'applied' | 'reverted' | null;
  readonly refusal: { readonly code: RefusalCode; readonly detail: readonly string[] } | null;
  readonly drift: readonly string[];
  readonly supersedeChainDepth: number;
}

export interface InvariantViolation {
  readonly rule: string;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// 14. Actions and the reducer.
// ---------------------------------------------------------------------------

export type Verdict = 'ALLOW' | 'REFUSE' | 'EXPIRE' | 'BLOCK' | 'RECORDED';

export type Action =
  | { readonly kind: 'admit'; readonly approved: ApprovedPlan }
  | { readonly kind: 'gate'; readonly evidence: RecoveryEvidence }
  | { readonly kind: 'lock' }
  | { readonly kind: 'recheck'; readonly observed: readonly FingerprintItem[]; readonly bundles: readonly BundleFacts[] }
  | { readonly kind: 'sealManifest'; readonly ok: boolean }
  | {
      readonly kind: 'runStep';
      readonly ordinal: number;
      readonly outcome: 'ok' | 'io-failure' | 'concurrent-change-detected';
      readonly observedAfter: string | null;
      readonly undo: SnapshotEntry;
    }
  | { readonly kind: 'verify'; readonly verdict: ValidationVerdict; readonly checks: PostOpChecks }
  /** `duringStep` models death between the write and the journal append. */
  | { readonly kind: 'crash'; readonly duringStep: { readonly ordinal: number; readonly undo: SnapshotEntry } | null }
  | { readonly kind: 'reconcile' }
  | { readonly kind: 'recoverInterrupted' }
  | {
      readonly kind: 'beginRollback';
      readonly preRollbackEvidence: RecoveryEvidence;
      readonly freshApproval: ApprovedPlan | null;
    }
  | { readonly kind: 'observe'; readonly ordinal: number; readonly what: ObservationKind; readonly detail: string }
  | { readonly kind: 'acknowledge'; readonly ambiguity: AmbiguityKind };

export interface Step {
  readonly journal: Journal;
  readonly frame: Frame;
  readonly verdict: Verdict;
  readonly code: string;
  readonly drift: readonly string[];
}

// ===========================================================================
// Journal segmentation. Split before each ADMITTED; the last segment is live.
// ===========================================================================

export function segments(j: Journal): readonly (readonly JournalRecord[])[] {
  const out: JournalRecord[][] = [[]];
  for (const rec of j) {
    if (rec.r === 'ADMITTED' && out[out.length - 1].length > 0) out.push([]);
    out[out.length - 1].push(rec);
  }
  return out;
}

function currentSegment(j: Journal): readonly JournalRecord[] {
  const s = segments(j);
  return s[s.length - 1];
}
function parentSegment(j: Journal): readonly JournalRecord[] | null {
  const s = segments(j);
  return s.length >= 2 ? s[s.length - 2] : null;
}
function findManifest(seg: readonly JournalRecord[]): OperationManifest | null {
  for (const r of seg) if (r.r === 'ADMITTED') return r.approved.manifest;
  return null;
}
function findApproved(seg: readonly JournalRecord[]): ApprovedPlan | null {
  for (const r of seg) if (r.r === 'ADMITTED') return r.approved;
  return null;
}
function admittedWorld(seg: readonly JournalRecord[]): readonly Observed[] {
  for (const r of seg) if (r.r === 'ADMITTED') return r.world;
  return [];
}
function has(seg: readonly JournalRecord[], r: JournalRecord['r']): boolean {
  return seg.some((x) => x.r === r);
}

// ===========================================================================
// Phase derivation. `settled <=> a durable SETTLED record exists`.
// ===========================================================================

export function derivePhase(j: Journal): Phase {
  const seg = currentSegment(j);
  if (seg.length === 0) return 'admitting';

  const refused = seg.find((r) => r.r === 'REFUSED');
  if (refused) return 'refused';

  const manifest = findManifest(seg);
  const isRollback = manifest !== null && manifest.revertOf !== null;

  const settled = seg.find((r) => r.r === 'SETTLED');
  if (settled && settled.r === 'SETTLED') {
    if (settled.as === 'reverted') {
      return residueOf(j).length > 0 ? 'reverted-with-residue' : 'reverted-clean';
    }
    return knownBreakage(j).length > 0 ? 'applied-with-known-breakage' : 'applied-clean';
  }

  const failed = seg.some((r) => r.r === 'FAILURE');
  if (isRollback) {
    if (failed) return 'rollback-failed';
    return 'rolling-back';
  }

  if (has(seg, 'INTERRUPTED')) return 'unknown-interrupted';
  if (has(seg, 'GATE') && seg.some((r) => r.r === 'GATE' && !r.ok)) return 'gate-blocked';
  if (seg.some((r) => r.r === 'RECHECK' && !r.ok)) return 'expired';

  if (failed) {
    const obs = stepObservations(j);
    const anyDone = obs.some(([, o]) => o.state === 'done' || o.state === 'foreign');
    return anyDone ? 'failed-dirty' : 'failed-clean';
  }

  if (has(seg, 'VERIFY')) return 'verifying';
  if (has(seg, 'INTENT')) return 'mutating';
  if (has(seg, 'MANIFEST_DURABLE')) return 'manifest-durable';
  return 'admitting';
}

function knownBreakage(j: Journal): readonly LinkId[] {
  const m = findManifest(currentSegment(j));
  if (!m) return [];
  return m.approvedBreakage;
}

// ===========================================================================
// Step observations.
// ===========================================================================

export function stepObservations(j: Journal): readonly (readonly [number, StepObservation])[] {
  const seg = currentSegment(j);
  const manifest = findManifest(seg);
  if (!manifest) return [];

  let reconciled: readonly (readonly [number, StepObservation])[] | null = null;
  for (const r of seg) if (r.r === 'RECONCILED') reconciled = r.steps;
  if (reconciled) return reconciled;

  const out: (readonly [number, StepObservation])[] = [];
  for (const step of manifest.steps) {
    const intent = seg.some((r) => r.r === 'INTENT' && r.ordinal === step.ordinal);
    const outcome = seg.find((r) => r.r === 'OUTCOME' && r.ordinal === step.ordinal);
    if (!intent) {
      out.push([step.ordinal, { state: 'not-started' }]);
    } else if (!outcome || outcome.r !== 'OUTCOME') {
      out.push([step.ordinal, { state: 'indeterminate' }]);
    } else if (outcome.ok) {
      out.push([step.ordinal, { state: 'done' }]);
    } else if (outcome.note === 'PLAN_DEVIATION') {
      out.push([step.ordinal, { state: 'foreign', observedHash: outcome.observedAfter ?? '?' }]);
    } else {
      out.push([step.ordinal, { state: 'not-started' }]);
    }
  }
  return out;
}

function observationFor(j: Journal, ordinal: number): StepObservation {
  const found = stepObservations(j).find(([o]) => o === ordinal);
  return found ? found[1] : { state: 'not-started' };
}

/** Read-only reconciliation of the journal against a freshly observed world. */
export function reconcileSteps(
  j: Journal,
  world: readonly Observed[],
): readonly (readonly [number, StepObservation])[] {
  const seg = currentSegment(j);
  const manifest = findManifest(seg);
  if (!manifest) return [];
  const byKey = new Map(world.map((o) => [ks(o.key), o]));
  return manifest.steps.map((step) => {
    const o = byKey.get(ks(step.target));
    const observed = o && o.exists ? o.observedHash : null;
    if (observed === step.afterHash) return [step.ordinal, { state: 'done' }] as const;
    if (observed === step.beforeHash) return [step.ordinal, { state: 'not-started' }] as const;
    const intent = seg.some((r) => r.r === 'INTENT' && r.ordinal === step.ordinal);
    const outcome = seg.some((r) => r.r === 'OUTCOME' && r.ordinal === step.ordinal);
    if (intent && !outcome) return [step.ordinal, { state: 'indeterminate' }] as const;
    return [step.ordinal, { state: 'foreign', observedHash: observed ?? '(absent)' }] as const;
  });
}

// ===========================================================================
// Residue: what a byte-perfect restore still cannot un-say.
// ===========================================================================

function residueOf(j: Journal): readonly Residue[] {
  const parent = parentSegment(j);
  if (!parent) return [];
  const manifest = findManifest(parent);
  if (!manifest) return [];

  const out: Residue[] = [];
  const doneOrdinals = new Set<number>();
  for (const r of parent) if (r.r === 'OUTCOME' && r.ok) doneOrdinals.add(r.ordinal);

  for (const step of manifest.steps) {
    if (!doneOrdinals.has(step.ordinal)) continue;
    if (step.escape === 'contained') continue;
    out.push({
      ordinal: step.ordinal,
      escape: step.escape,
      statement: `step ${step.ordinal} ${step.kind} on ${ks(step.target)} was ${step.escape}: restoring bytes does not un-say it`,
    });
  }
  for (const rec of j) {
    if (rec.r !== 'OBSERVATION') continue;
    out.push({
      ordinal: rec.ordinal,
      escape: 'observable-local',
      statement: `observed ${rec.kind} at step ${rec.ordinal}: ${rec.detail}`,
    });
  }
  return out;
}

// ===========================================================================
// Ambiguity computation — the anti-silence device. I43 makes it total.
// ===========================================================================

function ambiguitiesOf(j: Journal, world: readonly Observed[], phase: Phase): readonly AmbiguityFinding[] {
  const cls = classify(phase);
  const seg = currentSegment(j);
  const acked = new Set<AmbiguityKind>();
  for (const r of j) if (r.r === 'ACKNOWLEDGED') acked.add(r.kind);

  const out: AmbiguityFinding[] = [];
  const push = (
    kind: AmbiguityKind,
    concepts: readonly ConceptKey[],
    paths: readonly string[],
    statement: string,
  ) => {
    if (out.some((a) => a.kind === kind)) return;
    out.push({ kind, concepts, paths, statement, acknowledgedByHuman: acked.has(kind) });
  };

  if (phase === 'rollback-failed') {
    const manifest = findManifest(seg);
    const mismatch = seg.find((r) => r.r === 'FAILURE' && r.reason.includes('RESTORE_NOT_BYTE_IDENTICAL'));
    const obs = stepObservations(j);
    const notDone = (manifest?.steps ?? []).filter(
      (s) => obs.find(([o]) => o === s.ordinal)?.[1].state !== 'done',
    );
    push(
      'rollback-partially-applied',
      notDone.map((s) => s.target),
      notDone.map((s) => ks(s.target)),
      `rollback stopped with ${notDone.length} inverse step(s) unapplied; the state is neither the pre-operation state nor the post-operation state`,
    );
    if (mismatch) {
      const failed = (manifest?.steps ?? []).filter((s) => s.kind === 'RESTORE_BYTES' || s.kind === 'UNDO_CREATE');
      push(
        'restore-not-byte-identical',
        failed.map((s) => s.target),
        failed.map((s) => ks(s.target)),
        `a restored concept is not byte-identical to its snapshot; accepting it would silently drop verified on: ${failed.map((s) => ks(s.target)).join(', ')}`,
      );
    }
  }

  if (phase === 'failed-dirty' || phase === 'unknown-interrupted') {
    const manifest = findManifest(seg);
    const obs = stepObservations(j);
    const stateOf = (ordinal: number) => obs.find(([o]) => o === ordinal)?.[1].state ?? 'not-started';
    const steps = manifest?.steps ?? [];

    const writesDone = steps.filter((s) => isWrite(s) && stateOf(s.ordinal) === 'done');
    const writesPending = steps.filter((s) => isWrite(s) && stateOf(s.ordinal) !== 'done');
    const removalsDone = steps.filter((s) => isRemoval(s) && stateOf(s.ordinal) === 'done');
    const removalsPending = steps.filter((s) => isRemoval(s) && stateOf(s.ordinal) !== 'done');
    const rewrites = steps.filter((s) => s.kind === 'LINK_REWRITE');
    const rewritesDone = rewrites.filter((s) => stateOf(s.ordinal) === 'done');

    if (seg.some((r) => r.r === 'OUTCOME' && r.note === 'CONCURRENT_CHANGE')) {
      const o = seg.find((r) => r.r === 'OUTCOME' && r.note === 'CONCURRENT_CHANGE');
      const ordinal = o && o.r === 'OUTCOME' ? o.ordinal : -1;
      const target = steps.find((s) => s.ordinal === ordinal);
      push(
        'foreign-mutation-in-scope',
        target ? [target.target] : [],
        target ? [ks(target.target)] : [],
        `a concurrent change to ${target ? ks(target.target) : 'a step target'} was detected after bytes had already moved; aborting in place is no longer available`,
      );
    }
    if (seg.some((r) => r.r === 'OUTCOME' && r.note === 'PLAN_DEVIATION')) {
      const o = seg.find((r) => r.r === 'OUTCOME' && r.note === 'PLAN_DEVIATION');
      const ordinal = o && o.r === 'OUTCOME' ? o.ordinal : -1;
      const target = steps.find((s) => s.ordinal === ordinal);
      push(
        'unclassified-loss',
        target ? [target.target] : [],
        target ? [ks(target.target)] : [],
        `step ${ordinal} produced bytes that match neither its sealed before-image nor its sealed after-image; the write left the manifest-bound substitution and is rejected, not reclassified`,
      );
    }

    // Cross-bundle write landed, owner-side removal did not.
    const crossDup = writesDone.filter(
      (w) => w.movedFrom !== null && w.movedFrom.bundle !== w.target.bundle &&
        removalsPending.some((rm) => w.movedFrom !== null && sameKey(rm.target, w.movedFrom)),
    );
    if (crossDup.length > 0) {
      const keys = crossDup.flatMap((w) => (w.movedFrom ? [w.target, w.movedFrom] : [w.target]));
      push(
        'duplicate-identity-across-bundles',
        keys,
        keys.map(ks),
        `the same knowledge is now live under two fully-qualified identities: ${keys.map(ks).join(' and ')}. Detection is advisory only — nothing forbids the duplicate`,
      );
    }

    if (writesDone.length > 0 && removalsPending.length > 0 && crossDup.length === 0) {
      const keys = [...writesDone.map((s) => s.target), ...removalsPending.map((s) => s.target)];
      push(
        'two-live-carriers-no-authority',
        keys,
        keys.map(ks),
        `both ${writesDone.map((s) => ks(s.target)).join(', ')} and ${removalsPending.map((s) => ks(s.target)).join(', ')} are live and independently editable; no marker says which one carries the knowledge, and none says which supersedes which`,
      );
    }

    if (writesDone.length > 0 && writesPending.length > 0) {
      push(
        'orphan-output-exists',
        writesDone.map((s) => s.target),
        writesDone.map((s) => ks(s.target)),
        `output(s) ${writesDone.map((s) => ks(s.target)).join(', ')} exist on disk but the operation that authored them never settled`,
      );
    }

    if (removalsDone.length > 0 && writesDone.length === 0 && steps.some(isWrite)) {
      const keys = removalsDone.map((s) => s.target);
      push(
        'knowledge-live-nowhere',
        keys,
        keys.map(ks),
        `${keys.map(ks).join(', ')} was retired but no output carrying the knowledge exists`,
      );
    }

    if (rewritesDone.length > 0 && rewritesDone.length < rewrites.length) {
      const keys = rewrites.map((s) => s.target);
      push(
        'links-split-across-old-and-new',
        keys,
        keys.map(ks),
        `${rewritesDone.length} of ${rewrites.length} inbound links point at the new identity and the rest still point at the old one; in-bundle Markdown links never fall through to another bundle, so the unrewritten half resolves to nothing`,
      );
    }

    const indexDone = steps.filter((s) => s.kind === 'INDEX_REGEN' && stateOf(s.ordinal) === 'done');
    if (indexDone.length > 0) {
      push(
        'index-advertises-unsettled-outcome',
        indexDone.map((s) => s.target),
        indexDone.map((s) => ks(s.target)),
        `the index was regenerated and now advertises an outcome the operation never settled; any local reader may already have consumed it`,
      );
    }

    if (obs.some(([, o]) => o.state === 'indeterminate')) {
      const ords = obs.filter(([, o]) => o.state === 'indeterminate').map(([o]) => o);
      push(
        'step-outcome-indeterminate',
        [],
        ords.map((o) => `step ${o}`),
        `step(s) ${ords.join(', ')} logged an INTENT with no OUTCOME; whether their bytes landed is not knowable from the journal`,
      );
    }
    if (obs.some(([, o]) => o.state === 'foreign')) {
      const ords = obs.filter(([, o]) => o.state === 'foreign').map(([o]) => o);
      push(
        'unclassified-loss',
        [],
        ords.map((o) => `step ${o}`),
        `step(s) ${ords.join(', ')} observe bytes matching neither the sealed before-image nor the sealed after-image`,
      );
    }
  }

  // I43 made total: a dirty state can never be silent.
  if (cls.cleanliness === 'dirty' && out.length === 0) {
    push(
      'unclassified-loss',
      [],
      [],
      'this state is dirty and the taxonomy produced no named finding; that is itself the finding',
    );
  }
  return out;
}

// ===========================================================================
// Link resolution without a VERIFY record.
// ===========================================================================

function linkResolutions(j: Journal): readonly (readonly [LinkId, LinkResolution])[] {
  const seg = currentSegment(j);
  const manifest = findManifest(seg) ?? (parentSegment(j) ? findManifest(parentSegment(j)!) : null);
  if (!manifest) return [];

  let verify: PostOpChecks | null = null;
  for (const r of seg) if (r.r === 'VERIFY') verify = r.checks;
  if (verify) return verify.linkResolutions;

  const obs = stepObservations(j);
  const stateOf = (ordinal: number) => obs.find(([o]) => o === ordinal)?.[1].state ?? 'not-started';
  const removalDone = manifest.steps
    .filter(isRemoval)
    .some((s) => stateOf(s.ordinal) === 'done');

  return manifest.inboundLinks.links.map((link) => {
    const fate = manifest.linkFates.find((f) => f.link === link.id)?.fate ?? { fate: 'unassigned' as const };
    if (fate.fate === 'knowingly-broken-approved') {
      return [link.id, { state: 'knowingly-broken-approved', approvedInPlanAs: fate.why }] as const;
    }
    const step = manifest.steps.find((s) => s.kind === 'LINK_REWRITE' && s.link?.id === link.id);
    if (step && stateOf(step.ordinal) === 'done') return [link.id, { state: 'resolves' }] as const;
    if (removalDone) {
      return [
        link.id,
        {
          state: 'unexpectedly-broken',
          detail: `${ks(link.from)} still points at ${ks(link.to)}, which this operation retired`,
        },
      ] as const;
    }
    return [link.id, { state: 'resolves' }] as const;
  });
}

// ===========================================================================
// Trust outcomes.
// ===========================================================================

function trustOutcomes(j: Journal): readonly TrustOutcome[] {
  const seg = currentSegment(j);
  const manifest = findManifest(seg);
  if (!manifest) return [];
  const before = new Map(admittedWorld(seg).map((o) => [ks(o.key), o]));
  const invalidated = new Set<number>();
  for (const r of seg) if (r.r === 'INVALIDATION') invalidated.add(r.ordinal);

  const out: TrustOutcome[] = [];
  for (const step of manifest.steps) {
    // The bytes carry the verification: a move's write half reads the moved-from
    // observation, never a lineage rule and never another concept's tier.
    const sourceKey = step.movedFrom ?? step.target;
    const o = before.get(ks(sourceKey));
    const beforeV: Verification = o?.view?.verification ?? { events: [] };
    const afterV = trustFate(beforeV, step.classification);
    out.push({
      key: step.target,
      before: tierOf(beforeV),
      after: tierOf(afterV),
      invalidationReported: invalidated.has(step.ordinal),
      classification: step.classification,
    });
  }
  return out;
}

// ===========================================================================
// Notice contract and human action.
// ===========================================================================

function noticeOf(j: Journal, phase: Phase, ambiguities: readonly AmbiguityFinding[], residue: readonly Residue[]): readonly string[] {
  const seg = currentSegment(j);
  const manifest = findManifest(seg);
  const cls = classify(phase);
  if (!cls.terminal) return [];

  const lines: string[] = [];
  const id = manifest ? manifest.operationId : '(no manifest)';
  lines.push(`operation ${id}: ${phase} (settlement=${cls.settlement}, ${cls.cleanliness})`);

  const refused = seg.find((r) => r.r === 'REFUSED');
  if (refused && refused.r === 'REFUSED') {
    lines.push(`refused: ${refused.code}`);
    for (const d of refused.detail) lines.push(`  · ${d}`);
    return lines;
  }

  const recheck = seg.find((r) => r.r === 'RECHECK' && !r.ok);
  if (recheck && recheck.r === 'RECHECK') {
    lines.push('expired: the world moved after the approved preview; a fresh preview is required');
    for (const d of recheck.drift) lines.push(`  · ${d}`);
    return lines;
  }

  const gate = seg.find((r) => r.r === 'GATE' && !r.ok);
  if (gate && gate.r === 'GATE') {
    lines.push('blocked: recovery evidence is not a complete conjunction');
    for (const d of failedConjuncts(gate.evidence)) lines.push(`  · ${d}`);
    return lines;
  }

  if (manifest) {
    const obs = stepObservations(j);
    const done = obs.filter(([, o]) => o.state === 'done').length;
    lines.push(`steps: ${done}/${manifest.steps.length} done`);
    if (manifest.lineage.length > 0) {
      for (const l of manifest.lineage) {
        lines.push(
          `identity: ${ks(l.retiredIdentity)} -> ${l.mintedIdentities.map(ks).join(', ') || '(none)'} (${l.reason}); continuity: ${l.continuity}`,
        );
      }
    }
    const breakage = manifest.approvedBreakage;
    if (breakage.length > 0 && (phase === 'applied-with-known-breakage' || phase === 'applied-clean')) {
      lines.push(`standing report: permanently broken inbound links: ${breakage.join(', ')}`);
      for (const d of manifest.reviewImpact) {
        if (d.finding.kind === 'unavailable') lines.push(`  · review dependency now unavailable: ${d.locator}`);
      }
    }
    for (const s of manifest.steps) {
      if (s.kind !== 'CREATE_OUTPUT') continue;
      lines.push(
        `output ${ks(s.target)} is written as an explicit status: draft and carries no trust from any input concept`,
      );
    }
    if (manifest.reviewImpact.length > 0) {
      lines.push(`review evidence (reported separately from trust): ${manifest.reviewImpact.length} dependency mapping(s)`);
    }
  }

  for (const a of ambiguities) lines.push(`AMBIGUITY ${a.kind}: ${a.statement}`);
  for (const r of residue) lines.push(`RESIDUE ${r.escape}: ${r.statement}`);
  return lines;
}

function humanActionOf(
  j: Journal,
  phase: Phase,
  ambiguities: readonly AmbiguityFinding[],
): readonly string[] {
  const seg = currentSegment(j);
  const manifest = findManifest(seg) ?? (parentSegment(j) ? findManifest(parentSegment(j)!) : null);
  const out: string[] = [];

  if (phase === 'failed-dirty' || phase === 'rollback-failed' || phase === 'unknown-interrupted') {
    out.push('neither applied nor rolled back — a human must decide; the machine will not repair this automatically');
  }
  if (phase === 'gate-blocked') {
    out.push('neither applied nor rolled back — recovery evidence must be re-established before any byte moves');
  }
  for (const a of ambiguities) {
    if (a.kind === 'two-live-carriers-no-authority') {
      out.push('the duplicated carriers are independently editable until a retry; edits to either will diverge');
    }
  }
  if (manifest && manifest.bundles.length > 1) {
    out.push(
      `cross-bundle atomicity gap: ${manifest.bundles.length} ledgers advance separately; a crash between them leaves one ledger describing a world the other does not. No two-phase commit is claimed`,
    );
  }
  let checks: PostOpChecks | null = null;
  for (const r of seg) if (r.r === 'VERIFY') checks = r.checks;
  if (checks) {
    out.push(
      `content coverage is not checkable by validation: ${checks.contentCoverage.diff}`,
    );
  }
  if (j.some((r) => r.r === 'OBSERVATION' && (r.kind === 'output-human-verified' || r.kind === 'output-linked-to' || r.kind === 'output-superseded-in-turn'))) {
    if (phase === 'rolling-back' || phase === 'reverted-with-residue' || phase === 'reverted-clean' || phase === 'rollback-failed') {
      out.push('rollback destroys evidence a human already produced or consumed; acknowledge the destroyed evidence explicitly');
    }
  }
  return out;
}

function openQuestionsOf(m: OperationManifest | null): readonly string[] {
  if (!m) return [];
  const p = m.policies;
  const all: Injected<unknown>[] = [
    p.redirects,
    p.archive,
    p.sourceDisposition,
    p.supersedeEdge,
    p.rollbackAuthorization,
    p.deprecatedHiddenFromIndex,
    p.inboundLinkFates,
    p.provenanceAssignment,
  ];
  return all.map((i) => `${i.ownedBy}: ${i.openQuestion}`);
}

// ===========================================================================
// derive
// ===========================================================================

export function derive(j: Journal, world: readonly Observed[]): Frame {
  const phase = derivePhase(j);
  const cls = classify(phase);
  const seg = currentSegment(j);
  const parent = parentSegment(j);
  const manifest = findManifest(seg);
  const parentManifest = parent ? findManifest(parent) : null;

  const ambiguities = ambiguitiesOf(j, world, phase);
  const residue = residueOf(j);

  let validation: ValidationVerdict | null = null;
  let checks: PostOpChecks | null = null;
  for (const r of seg) if (r.r === 'VERIFY') { validation = r.verdict; checks = r.checks; }
  let recovery: RecoveryEvidence | null = null;
  for (const r of seg) if (r.r === 'GATE') recovery = r.evidence;

  const beforeWorld = new Map(admittedWorld(seg).map((o) => [ks(o.key), o]));
  const afterWorld = new Map(world.map((o) => [ks(o.key), o]));
  const keys: ConceptKey[] = [];
  const seen = new Set<string>();
  const addKey = (k: ConceptKey) => {
    if (seen.has(ks(k))) return;
    seen.add(ks(k));
    keys.push(k);
  };
  for (const s of manifest?.steps ?? []) {
    addKey(s.target);
    if (s.movedFrom) addKey(s.movedFrom);
  }
  for (const l of manifest?.lineage ?? []) {
    addKey(l.retiredIdentity);
    for (const m of l.mintedIdentities) addKey(m);
  }

  const identityDiff: IdentityDiffRow[] = keys.map((k) => ({
    key: k,
    before: beforeWorld.get(ks(k))?.view ?? null,
    after: afterWorld.get(ks(k))?.exists ? (afterWorld.get(ks(k))!.view ?? null) : null,
  }));

  const reviewDependencies = (manifest?.reviewImpact ?? []).map((d) =>
    checks && checks.structuralInvalidity.length > 0
      ? { ...d, structuralInvalidity: checks.structuralInvalidity }
      : d,
  );

  const epochAdvances: (readonly [BundleId, number])[] = [];
  for (const r of seg) if (r.r === 'EPOCH_ADVANCED') epochAdvances.push([r.bundle, r.to] as const);

  const settledRec = seg.find((r) => r.r === 'SETTLED');
  const refusedRec = seg.find((r) => r.r === 'REFUSED');
  let drift: readonly string[] = [];
  for (const r of seg) if (r.r === 'RECHECK' && !r.ok) drift = r.drift;

  const activeManifest = manifest ?? parentManifest;

  return {
    phase,
    classification: cls,
    manifest,
    manifestDurable: has(seg, 'MANIFEST_DURABLE'),
    steps: stepObservations(j),
    identityDiff,
    lineage: [...(parentManifest?.lineage ?? []), ...(manifest?.lineage ?? [])],
    links: linkResolutions(j),
    linkSetComplete: activeManifest ? activeManifest.inboundLinks.complete : true,
    reviewDependencies,
    trust: trustOutcomes(j),
    ambiguities,
    residue,
    recovery,
    validation,
    checks,
    notice: noticeOf(j, phase, ambiguities, residue),
    humanActionRequired: humanActionOf(j, phase, ambiguities),
    openQuestions: openQuestionsOf(activeManifest),
    epochAdvances,
    settledAs: settledRec && settledRec.r === 'SETTLED' ? settledRec.as : null,
    refusal: refusedRec && refusedRec.r === 'REFUSED' ? { code: refusedRec.code, detail: refusedRec.detail } : null,
    drift,
    supersedeChainDepth: activeManifest ? activeManifest.supersedeChain.length : 0,
  };
}

// ===========================================================================
// checkInvariants — the violating state is rejected here when it cannot be
// made unconstructible.
// ===========================================================================

export function checkInvariants(f: Frame, j: Journal): readonly InvariantViolation[] {
  const v: InvariantViolation[] = [];
  const seg = currentSegment(j);

  if (f.classification.cleanliness === 'dirty' && f.ambiguities.length === 0) {
    v.push({ rule: 'I43', detail: 'a dirty state with an empty ambiguity set is a silent loss' });
  }
  if (f.classification.terminal && f.notice.length === 0) {
    v.push({ rule: 'I42', detail: `terminal phase ${f.phase} emitted no notice` });
  }
  if (f.phase === 'reverted-with-residue' && f.residue.length === 0) {
    v.push({ rule: 'I25b', detail: 'reverted-with-residue with an empty residue list' });
  }
  if (f.phase === 'reverted-clean' && f.residue.length > 0) {
    v.push({ rule: 'I25b', detail: 'reverted-clean while residue exists' });
  }

  const settledIdx = seg.findIndex((r) => r.r === 'SETTLED');
  const settledExists = settledIdx >= 0;
  if ((f.classification.settlement === 'applied' || f.classification.settlement === 'reverted') !== settledExists) {
    v.push({ rule: 'I44', detail: 'settlement disagrees with the presence of a durable SETTLED record' });
  }

  const perBundle = new Map<string, number>();
  seg.forEach((r, i) => {
    if (r.r !== 'EPOCH_ADVANCED') return;
    perBundle.set(r.bundle, (perBundle.get(r.bundle) ?? 0) + 1);
    const lastOutcome = seg.reduce((acc, x, k) => (x.r === 'OUTCOME' ? k : acc), -1);
    if (i < lastOutcome) {
      v.push({ rule: 'I27', detail: `EPOCH_ADVANCED for ${r.bundle} precedes the last OUTCOME` });
    }
    if (settledExists && i > settledIdx) {
      v.push({ rule: 'I27', detail: `EPOCH_ADVANCED for ${r.bundle} follows SETTLED` });
    }
  });
  for (const [bundle, n] of perBundle) {
    if (n > 1) v.push({ rule: 'I27', detail: `${n} EPOCH_ADVANCED records for bundle ${bundle}` });
  }

  if (seg.some((r) => r.r === 'FAILURE') && settledExists && f.manifest?.revertOf === null) {
    v.push({ rule: 'I28', detail: 'a failed operation appended SETTLED; the token would be spent' });
  }
  if (f.manifest && !f.linkSetComplete) {
    v.push({ rule: 'I15', detail: 'an incomplete inbound-link set is present on an admitted manifest' });
  }
  return v;
}

// ===========================================================================
// Admission predicates — each maps 1:1 to a RefusalCode.
// ===========================================================================

interface Refusal {
  readonly code: RefusalCode;
  readonly detail: readonly string[];
}

const BUNDLE_ROOT = '' as ConceptId;

function planSourceIds(plan: Plan): readonly ConceptId[] {
  if (plan.kind === 'merge') return plan.sources;
  if (plan.kind === 'split') return [plan.source];
  if (plan.kind === 'move') return [plan.from.id];
  return [plan.predecessor.id];
}

export function admissionRefusal(
  approved: ApprovedPlan,
  world: readonly Observed[],
  journal: Journal,
): Refusal | null {
  const m = approved.manifest;
  const plan = m.plan;
  const steps = m.steps;
  const byBundle = new Map(m.bundles.map((b) => [b.bundle, b]));
  const byKey = new Map(world.map((o) => [ks(o.key), o]));

  // A parent operation that actually SETTLED as applied spends its token; a
  // failed or reverted one leaves no spend record (I32).
  for (const rec of journal) {
    if (rec.r === 'SETTLED' && rec.as === 'applied') {
      return { code: 'TOKEN_SPENT', detail: ['this fingerprint already settled as applied'] };
    }
  }

  const badSchema = m.bundles.filter((b) => b.schema !== 'ok');
  if (badSchema.length > 0) {
    return {
      code: 'LEDGER_FAILS_CLOSED',
      detail: badSchema.map((b) => `${b.bundle}: ledger schema ${b.schema}`),
    };
  }

  const unknownMode = m.bundles.filter((b) => b.mode === 'unknown');
  if (unknownMode.length > 0) {
    return { code: 'UNKNOWN_PROJECT_MODE', detail: unknownMode.map((b) => `${b.bundle}: project mode unknown`) };
  }

  if (plan.kind === 'move' && (plan.from.id === BUNDLE_ROOT || plan.to.id === BUNDLE_ROOT)) {
    return {
      code: 'BUNDLE_ROOT_SELF_ORPHANING',
      detail: [
        'moving a bundle root changes the ledgerKey the confirmation is filed under; no Plan variant expresses it as a restructuring',
      ],
    };
  }

  // Only the concepts being merged or split matter here; a link rewrite or an
  // index regeneration in another bundle is ordinary collateral, not a merge.
  if (plan.kind === 'merge') {
    const foreign = steps.filter((s) => (isWrite(s) || isRemoval(s)) && s.bundle !== plan.bundle);
    if (foreign.length > 0) {
      return {
        code: 'CROSS_BUNDLE_MERGE_UNEXPRESSIBLE',
        detail: [
          `MergePlan carries one BundleId (${plan.bundle}); step(s) ${foreign.map((s) => `${s.ordinal}:${ks(s.target)}`).join(', ')} name another bundle`,
          'concepts never merge across bundles, and no decomposition into migrate-then-merge exists as a code path',
        ],
      };
    }
  }
  if (plan.kind === 'split') {
    const foreign = steps.filter((s) => (isWrite(s) || isRemoval(s)) && s.bundle !== plan.bundle);
    if (foreign.length > 0) {
      return {
        code: 'CROSS_BUNDLE_SPLIT_UNEXPRESSIBLE',
        detail: [`SplitPlan carries one BundleId (${plan.bundle}); step(s) name another bundle`],
      };
    }
  }

  const redirect = steps.filter((s) => s.kind === 'REDIRECT_PUBLISH');
  if (redirect.length > 0) {
    return {
      code: 'REDIRECT_BLOCKED_PENDING_SEMANTICS',
      detail: [
        `${redirect.length} REDIRECT_PUBLISH step(s) present; redirect policy authorization is 'blocked-pending-semantics'`,
        'what a redirect IS, and whether it is followable, is not decided by this ticket',
      ],
    };
  }

  if (!m.inboundLinks.complete) {
    return {
      code: 'LINK_SET_INCOMPLETE',
      detail: m.inboundLinks.incompleteness.map((i) => `incompleteness: ${i}`),
    };
  }

  for (const link of m.inboundLinks.links) {
    const fates = m.linkFates.filter((f) => f.link === link.id);
    if (fates.length === 0 || fates.some((f) => f.fate.fate === 'unassigned')) {
      return { code: 'LINK_FATE_UNASSIGNED', detail: [`link ${link.id} from ${ks(link.from)} has no assigned fate`] };
    }
    const rewrites = fates.filter((f) => f.fate.fate === 'rewrite');
    if (rewrites.length > 1) {
      return {
        code: 'ALIAS_CANNOT_FAN_OUT',
        detail: [`link ${link.id} names ${rewrites.length} rewrite destinations; an alias may not fan out`],
      };
    }
    if (rewrites.length === 1 && link.holderWritability !== 'writable') {
      return {
        code: 'DESTINATION_BUNDLE_READ_ONLY',
        detail: [
          `link ${link.id} is held by ${ks(link.from)} in a ${link.holderWritability} bundle; its only legal fate is knowingly-broken-approved`,
        ],
      };
    }
    const broken = fates.find((f) => f.fate.fate === 'knowingly-broken-approved');
    if (broken && !m.approvedBreakage.includes(link.id)) {
      return {
        code: 'LINK_FATE_UNASSIGNED',
        detail: [`link ${link.id} is fated knowingly-broken but is not listed in approvedBreakage`],
      };
    }
  }

  // Write steps must target a writable bundle.
  for (const s of steps) {
    if (s.action === 'KEEP') continue;
    const b = byBundle.get(s.bundle);
    if (b && b.writability !== 'writable') {
      return {
        code: 'DESTINATION_BUNDLE_READ_ONLY',
        detail: [`step ${s.ordinal} writes ${ks(s.target)} in bundle ${s.bundle} (${b.writability})`],
      };
    }
  }

  // Occupancy: a write target that already exists is occupied, including this
  // operation's own delete target and a folder-concept prefix.
  const writeTargets = steps.filter(isWrite);
  for (let i = 0; i < writeTargets.length; i++) {
    const s = writeTargets[i];
    const occupant = byKey.get(ks(s.target));
    // A step that expected absence and found exactly its own sealed post-image
    // is looking at this operation's aborted write. Refusing here would hide it;
    // I29 wants the retry to reach the recheck and EXPIRE with named drift.
    const ourOwnAbortedWrite = s.beforeHash === null && occupant?.observedHash === s.afterHash;
    if (occupant && occupant.exists && !ourOwnAbortedWrite) {
      return {
        code: 'DESTINATION_OCCUPIED',
        detail: [`${ks(s.target)} is already occupied; ordering cannot rescue it (I40 forbids a reorder)`],
      };
    }
    for (const other of world) {
      if (other.exists && other.key.bundle === s.target.bundle && other.key.id.startsWith(`${s.target.id}/`)) {
        return {
          code: 'DESTINATION_OCCUPIED',
          detail: [`${ks(s.target)} collides with the folder-concept prefix of ${ks(other.key)}`],
        };
      }
    }
    for (let k = i + 1; k < writeTargets.length; k++) {
      if (sameKey(writeTargets[k].target, s.target)) {
        return { code: 'DESTINATION_OCCUPIED', detail: [`two outputs claim ${ks(s.target)}`] };
      }
    }
  }

  // Merge/split: every source needs an enumerated terminal fate.
  if (plan.kind === 'merge' || plan.kind === 'split') {
    const unenumerated = planSourceIds(plan).filter(
      (id) => !steps.some((s) => isRemoval(s) && s.target.id === id),
    );
    if (unenumerated.length > 0) {
      return {
        code: 'SOURCE_FATE_UNENUMERATED',
        detail: unenumerated.map((id) => `source ${id} has no terminal step; the preview shows only the output`),
      };
    }
  }

  // Reanimation of a retired identity. Only merge and split can reanimate: a
  // supersede that deprecates an already-deprecated predecessor retires nothing.
  for (const id of plan.kind === 'merge' || plan.kind === 'split' ? planSourceIds(plan) : []) {
    const bundle = plan.kind === 'merge' || plan.kind === 'split' ? plan.bundle : plan.kind === 'move' ? plan.from.bundle : plan.predecessor.bundle;
    const o = byKey.get(ks({ bundle, id }));
    if (o && o.exists && o.status === 'deprecated') {
      const revival = steps.some(
        (s) => s.kind === 'STATUS_TRANSITION' && s.target.id === id && s.rationale.includes('deprecated -> stable'),
      );
      // As with occupancy: if the deprecation is exactly this operation's own
      // sealed post-image, this is a retry over a partial mutation. I29 routes
      // that to the recheck, which EXPIREs with named drift.
      const ourOwnAbortedWrite = steps.some(
        (s) => isRemoval(s) && s.target.id === id && s.afterHash === o.observedHash && s.beforeHash !== o.observedHash,
      );
      if (!revival && !ourOwnAbortedWrite) {
        return {
          code: 'REANIMATES_RETIRED_IDENTITY',
          detail: [`${id} is already deprecated; merging it back in silently reanimates a retired identity`],
        };
      }
    }
  }

  // Deletion rule.
  for (const s of steps) {
    if (s.kind !== 'DELETE_CONCEPT') continue;
    const b = byBundle.get(s.bundle);
    if (b && b.mode === 'knowledge-only') {
      return {
        code: 'KNOWLEDGE_ONLY_DELETE_BLOCKED',
        detail: [`step ${s.ordinal} deletes ${ks(s.target)} in a knowledge-only bundle; no rewrite to STATUS_TRANSITION exists`],
      };
    }
    if (s.deletionProof && s.deletionProof.holdsUniqueDurableContext) {
      return {
        code: 'UNIQUE_DURABLE_CONTEXT',
        detail: [`${ks(s.target)} holds unique durable context; deletion is blocked in both project modes`],
      };
    }
    if (!s.deletionProof || (s.deletionProof.supersededBy === null && s.deletionProof.redundantWith === null)) {
      return {
        code: 'DELETION_UNPROVEN',
        detail: [`${ks(s.target)} has no proof of supersession or redundancy`],
      };
    }
    if (plan.kind === 'supersede' && s.approvalScope !== 'approved') {
      return {
        code: 'DELETION_FOLDED_INTO_SUPERSEDE',
        detail: [`${ks(s.target)} is deleted inside a supersede composite without its own gate`],
      };
    }
  }

  // Output draft facts.
  for (const s of steps) {
    if (s.kind !== 'CREATE_OUTPUT' || s.outputDraft === null) continue;
    if (s.outputDraft.empty) {
      return { code: 'EMPTY_OUTPUT', detail: [`output ${ks(s.target)} has an empty body`] };
    }
    if (s.outputDraft.byteIdenticalToSource && plan.kind === 'split') {
      return {
        code: 'NOT_A_SPLIT_RECLASSIFY_AS_MOVE',
        detail: [`output ${ks(s.target)} is byte-identical to the source; the correct operation is 'move'`],
      };
    }
    if (!s.outputDraft.statusExplicit || !s.outputDraft.verificationEmpty) {
      return {
        code: 'OUTPUT_NOT_EXPLICIT_DRAFT',
        detail: [`output ${ks(s.target)} must be written as an explicit status: draft with an empty verification list`],
      };
    }
  }

  // Provenance.
  if (plan.kind === 'merge' || plan.kind === 'split') {
    const outputs = steps.filter((s) => s.kind === 'CREATE_OUTPUT').map((s) => ks(s.target));
    const missing = outputs.filter((o) => !m.provenance.some((p) => p.output === o));
    if (missing.length > 0) {
      return {
        code: 'PROVENANCE_UNASSIGNED',
        detail: missing.map((o) => `no sources[] entry is assigned to output ${o}`),
      };
    }
  }

  // Review-dependency breakage must be listed, and never repaired inline.
  for (const dep of m.reviewImpact) {
    // Only a pre-existing, baselined third-party dependency can be repaired.
    // A no-baseline mapping proposed for an output of this very operation is not
    // a repair target, so editing that output is an ordinary planned edit.
    if (!dep.hasBaseline) continue;
    if (steps.some((s) => s.kind === 'CONTENT_EDIT' && sameKey(s.target, dep.owner))) {
      return {
        code: 'REVIEW_REPAIR_PERFORMED_INLINE',
        detail: [`a step edits ${ks(dep.owner)} to repair its review dependency; repairs are separate reviewed operations`],
      };
    }
  }
  for (const s of steps) {
    if (!isRemoval(s) || !s.rationale.includes('has-review-dependents')) continue;
    const dependents = m.reviewImpact.filter((d) => d.locator === s.target.id);
    const listed =
      dependents.length > 0 &&
      dependents.every((d) => d.finding.kind === 'unavailable' || d.finding.kind === 'unobservable') &&
      dependents.every((d) => m.scheduledRepairs.some((r) => r.oldLocator === d.locator));
    if (!listed) {
      return {
        code: 'DEPENDENCY_BREAKAGE_UNLISTED',
        detail: [`${ks(s.target)} is a third party's review-dependency target; the breakage is not recorded in reviewImpact with a scheduled repair`],
      };
    }
  }

  // Approval scope.
  for (const s of steps) {
    if (s.approvalScope !== 'inherited') continue;
    const okIndex = s.kind === 'INDEX_REGEN' && s.indexScope === 'directly-affected';
    const okLink =
      s.kind === 'LINK_REWRITE' && !s.classification.claimAffecting;
    if (!okIndex && !okLink) {
      return {
        code: 'BROAD_REBUILD_NEEDS_OWN_GATE',
        detail: [`step ${s.ordinal} (${s.kind}${s.indexScope ? `/${s.indexScope}` : ''}) cannot inherit the parent approval`],
      };
    }
  }

  // Move and edit must be separate steps.
  for (const s of steps) {
    if (s.kind === 'MOVE_PATH' && s.classification.claimAffecting) {
      return {
        code: 'MOVE_AND_EDIT_NOT_SEPARATED',
        detail: [`step ${s.ordinal} claims both a path change and a content change; they need separate steps and separate trust consequences`],
      };
    }
  }

  // Ordinal invariants (I40).
  const writeOrdinals = steps.filter(isWrite).map((s) => s.ordinal);
  const removalOrdinals = steps.filter(isRemoval).map((s) => s.ordinal);
  const rewriteOrdinals = steps.filter((s) => s.kind === 'LINK_REWRITE').map((s) => s.ordinal);
  if (writeOrdinals.length > 0 && removalOrdinals.length > 0) {
    if (Math.max(...writeOrdinals) > Math.min(...removalOrdinals)) {
      return {
        code: 'ORDERING_WOULD_UNMOOR_KNOWLEDGE',
        detail: ['a source is retired before every output exists; knowledge would be live in zero places'],
      };
    }
  }
  const moveOrdinals = steps.filter((s) => s.kind === 'MOVE_PATH').map((s) => s.ordinal);
  if (moveOrdinals.length > 0 && rewriteOrdinals.length > 0) {
    if (Math.max(...moveOrdinals) > Math.min(...rewriteOrdinals)) {
      return {
        code: 'ORDERING_WOULD_UNMOOR_KNOWLEDGE',
        detail: ['inbound links are rewritten to a destination that does not exist yet'],
      };
    }
  }

  // Supersede chain.
  if (plan.kind === 'supersede') {
    if (m.supersedeChain.some((k) => sameKey(k, plan.successor))) {
      return {
        code: 'SUPERSEDE_CYCLE',
        detail: [`${ks(plan.successor)} already appears in ${ks(plan.predecessor)}'s supersede chain (depth ${m.supersedeChain.length})`],
      };
    }
  }

  // Lineage must be recorded for every identity change.
  const identityChanging = steps.filter((s) => s.kind === 'MOVE_PATH' || (s.kind === 'CREATE_OUTPUT' && (plan.kind === 'merge' || plan.kind === 'split')));
  if (identityChanging.length > 0 && m.lineage.length === 0) {
    return {
      code: 'LINEAGE_RECORD_MISSING',
      detail: ['the plan changes identity but records no lineage; the old-ID to new-ID mapping would exist nowhere'],
    };
  }

  return null;
}

// ===========================================================================
// The inverse manifest.
// ===========================================================================

export function buildInverseManifest(
  parent: OperationManifest,
  parentSeg: readonly JournalRecord[],
): OperationManifest {
  const done = new Set<number>();
  for (const r of parentSeg) if (r.r === 'OUTCOME' && r.ok) done.add(r.ordinal);

  const applicable = parent.rollbackSteps.filter((s) => {
    const forOrdinal = parent.steps.find((p) => sameKey(p.target, s.target));
    return forOrdinal ? done.has(forOrdinal.ordinal) : false;
  });

  const steps = applicable.map((s, i) => ({ ...s, ordinal: i }));
  return {
    ...parent,
    operationId: `${parent.operationId}-revert`,
    revertOf: parent.operationId,
    steps,
    rollbackSteps: [],
    lineage: parent.lineage.map((l) => ({
      retiredIdentity: l.mintedIdentities[0] ?? l.retiredIdentity,
      mintedIdentities: [l.retiredIdentity],
      reason: l.reason,
      continuity: NO_CONTINUITY,
    })),
    manifestHash: `${parent.manifestHash}-inverse`,
  };
}

// ===========================================================================
// reduce
// ===========================================================================

function result(j: Journal, world: readonly Observed[], verdict: Verdict, code: string, drift: readonly string[] = []): Step {
  return { journal: j, frame: derive(j, world), verdict, code, drift };
}

export function reduce(j: Journal, world: readonly Observed[], a: Action): Step {
  const phase = derivePhase(j);
  const seg = currentSegment(j);
  const manifest = findManifest(seg);

  switch (a.kind) {
    // ---- T1 / T2 / T27 --------------------------------------------------
    case 'admit': {
      const cls = classify(phase);
      if (seg.length > 0 && !cls.terminal) {
        return result(j, world, 'REFUSE', 'OPERATION_IN_FLIGHT');
      }
      // T27: the only exit from a settled or human-only terminal is a NEW
      // operation with its own preview, approval and gate.
      const refusal = admissionRefusal(a.approved, world, j);
      if (refusal) {
        const next: Journal = [...j, { r: 'REFUSED', code: refusal.code, detail: refusal.detail }];
        return result(next, world, 'REFUSE', refusal.code);
      }
      const next: Journal = [...j, { r: 'ADMITTED', approved: a.approved, world }];
      return result(next, world, 'ALLOW', 'ADMITTED');
    }

    // ---- T3 / T4 --------------------------------------------------------
    case 'gate': {
      if (phase !== 'admitting' || !manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      const failed = failedConjuncts(a.evidence);
      const ok = failed.length === 0;
      const next: Journal = [...j, { r: 'GATE', evidence: a.evidence, ok }];
      return ok
        ? result(next, world, 'ALLOW', 'GATE_OK')
        : result(next, world, 'BLOCK', 'RECOVERY_EVIDENCE_INCOMPLETE', failed);
    }

    // ---- T5 -------------------------------------------------------------
    case 'lock': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      if (!seg.some((r) => r.r === 'GATE' && r.ok)) return result(j, world, 'BLOCK', 'GATE_REQUIRED');
      const ordered = [...manifest.bundles].sort((x, y) => (x.ledgerKey < y.ledgerKey ? -1 : 1));
      const next: Journal = [...j, { r: 'LOCKED', bundles: ordered.map((b) => b.bundle) }];
      return result(next, world, 'RECORDED', 'LOCKED');
    }

    // ---- T6 / T7 --------------------------------------------------------
    case 'recheck': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      if (!has(seg, 'LOCKED')) return result(j, world, 'BLOCK', 'LOCK_REQUIRED');
      const approved = findApproved(seg)!;
      const drift = computeDrift(approved, a.observed, a.bundles);
      if (drift.length > 0) {
        const next: Journal = [...j, { r: 'RECHECK', ok: false, drift }];
        return result(next, world, 'EXPIRE', 'SCOPE_MOVED', drift);
      }
      const next: Journal = [...j, { r: 'RECHECK', ok: true, drift: [] }];
      return result(next, world, 'ALLOW', 'RECHECK_OK');
    }

    // ---- T8 / T9 --------------------------------------------------------
    case 'sealManifest': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      if (!seg.some((r) => r.r === 'RECHECK' && r.ok)) return result(j, world, 'BLOCK', 'RECHECK_REQUIRED');
      if (!a.ok) {
        const next: Journal = [
          ...j,
          { r: 'GATE', evidence: brokenEvidence(), ok: false },
          { r: 'FAILURE', ordinal: null, reason: 'MANIFEST_WRITE_FAILED' },
        ];
        return result(next, world, 'BLOCK', 'MANIFEST_WRITE_FAILED');
      }
      const next: Journal = [...j, { r: 'MANIFEST_DURABLE', manifestHash: manifest.manifestHash }];
      return result(next, world, 'ALLOW', 'MANIFEST_DURABLE');
    }

    // ---- T10 .. T14, T24 .. T26 -----------------------------------------
    case 'runStep': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      const rolling = manifest.revertOf !== null;
      if (!rolling && !has(seg, 'MANIFEST_DURABLE')) {
        return result(j, world, 'BLOCK', 'MANIFEST_NOT_DURABLE');
      }
      const step = manifest.steps.find((s) => s.ordinal === a.ordinal);
      if (!step) return result(j, world, 'REFUSE', 'STEP_NOT_IN_APPROVED_MANIFEST');

      const obs = stepObservations(j);
      const lowestPending = obs.find(([, o]) => o.state === 'not-started');
      if (!lowestPending || lowestPending[0] !== a.ordinal) {
        return result(j, world, 'REFUSE', 'OUT_OF_ORDER_OR_ALREADY_RUN');
      }

      const intent: JournalRecord = { r: 'INTENT', ordinal: a.ordinal, undo: a.undo };

      if (a.outcome === 'io-failure') {
        const next: Journal = [
          ...j,
          intent,
          { r: 'OUTCOME', ordinal: a.ordinal, ok: false, observedAfter: null, note: 'IO_FAILURE' },
          { r: 'FAILURE', ordinal: a.ordinal, reason: `IO_FAILURE at step ${a.ordinal}` },
        ];
        return result(next, world, 'RECORDED', 'IO_FAILURE');
      }
      if (a.outcome === 'concurrent-change-detected') {
        const next: Journal = [
          ...j,
          intent,
          { r: 'OUTCOME', ordinal: a.ordinal, ok: false, observedAfter: null, note: 'CONCURRENT_CHANGE' },
          { r: 'FAILURE', ordinal: a.ordinal, reason: `CONCURRENT_CHANGE at step ${a.ordinal}` },
        ];
        return result(next, world, 'RECORDED', 'CONCURRENT_CHANGE');
      }

      if (a.observedAfter !== step.afterHash) {
        const note = rolling ? 'RESTORE_NOT_BYTE_IDENTICAL' : 'PLAN_DEVIATION';
        const next: Journal = [
          ...j,
          intent,
          { r: 'OUTCOME', ordinal: a.ordinal, ok: false, observedAfter: a.observedAfter, note },
          { r: 'FAILURE', ordinal: a.ordinal, reason: `${note} at step ${a.ordinal}` },
        ];
        return result(next, world, 'RECORDED', note);
      }

      const appended: JournalRecord[] = [
        intent,
        { r: 'OUTCOME', ordinal: a.ordinal, ok: true, observedAfter: a.observedAfter, note: '' },
      ];
      if (step.classification.claimAffecting && step.beforeHash !== null) {
        appended.push({ r: 'INVALIDATION', ordinal: a.ordinal, concept: step.target });
      }

      let next: Journal = [...j, ...appended];

      // A rollback has no verification phase: when the last inverse step lands,
      // the revert settles on the spot (T24 / T25).
      if (rolling) {
        const remaining = manifest.steps.filter(
          (s) => s.ordinal !== a.ordinal && observationFor(next, s.ordinal).state === 'not-started',
        );
        if (remaining.length === 0) {
          next = [...next, { r: 'SETTLED', as: 'reverted' }];
          return result(next, world, 'ALLOW', 'REVERTED');
        }
      }
      return result(next, world, 'RECORDED', 'STEP_OK');
    }

    // ---- T15 .. T18 -----------------------------------------------------
    case 'verify': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      const obs = stepObservations(j);
      if (!obs.every(([, o]) => o.state === 'done')) {
        return result(j, world, 'BLOCK', 'STEPS_INCOMPLETE');
      }
      const unexpected = a.checks.linkResolutions.filter(([, r]) => r.state === 'unexpectedly-broken');
      const brokenApproved = a.checks.linkResolutions.filter(([, r]) => r.state === 'knowingly-broken-approved');
      const structural = a.checks.structuralInvalidity.length > 0;
      const bad =
        !a.verdict.okfValid ||
        a.checks.identityChecks === 'fail' ||
        a.checks.linkChecks === 'fail' ||
        a.checks.dependencyChecks === 'fail' ||
        unexpected.length > 0 ||
        structural;

      if (bad) {
        const next: Journal = [
          ...j,
          { r: 'VERIFY', verdict: a.verdict, checks: a.checks },
          { r: 'FAILURE', ordinal: null, reason: 'POST_OPERATION_VERIFICATION_FAILED' },
        ];
        return result(next, world, 'RECORDED', 'VERIFICATION_FAILED');
      }

      const allApproved = brokenApproved.every(([id]) => manifest.approvedBreakage.includes(id));
      if (!allApproved) {
        const next: Journal = [
          ...j,
          { r: 'VERIFY', verdict: a.verdict, checks: a.checks },
          { r: 'FAILURE', ordinal: null, reason: 'BREAKAGE_NOT_IN_APPROVED_SET' },
        ];
        return result(next, world, 'RECORDED', 'VERIFICATION_FAILED');
      }

      const epochs: JournalRecord[] = manifest.bundles.map((b) => ({
        r: 'EPOCH_ADVANCED' as const,
        bundle: b.bundle,
        from: b.epoch,
        to: b.epoch + 1,
      }));
      const next: Journal = [
        ...j,
        { r: 'VERIFY', verdict: a.verdict, checks: a.checks },
        ...epochs,
        { r: 'SETTLED', as: 'applied' },
      ];
      return result(next, world, 'ALLOW', brokenApproved.length > 0 ? 'APPLIED_WITH_KNOWN_BREAKAGE' : 'APPLIED');
    }

    // ---- T19 ------------------------------------------------------------
    case 'crash': {
      if (!has(seg, 'MANIFEST_DURABLE')) return result(j, world, 'REFUSE', 'NOTHING_IN_FLIGHT');
      if (has(seg, 'SETTLED')) return result(j, world, 'REFUSE', 'ALREADY_SETTLED');
      const pending: JournalRecord[] = a.duringStep
        ? [{ r: 'INTENT', ordinal: a.duringStep.ordinal, undo: a.duringStep.undo }]
        : [];
      const next: Journal = [...j, ...pending, { r: 'INTERRUPTED' }];
      return result(next, world, 'RECORDED', 'INTERRUPTED');
    }

    // ---- T20 ------------------------------------------------------------
    case 'reconcile': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      const steps = reconcileSteps(j, world);
      const next: Journal = [...j, { r: 'RECONCILED', steps }];
      return result(next, world, 'RECORDED', 'RECONCILED');
    }

    // ---- T21 ------------------------------------------------------------
    case 'recoverInterrupted': {
      if (phase !== 'unknown-interrupted' || !manifest) {
        return result(j, world, 'REFUSE', 'NOT_INTERRUPTED');
      }
      const epochs: JournalRecord[] = manifest.bundles.map((b) => ({
        r: 'EPOCH_ADVANCED' as const,
        bundle: b.bundle,
        from: b.epoch,
        to: b.epoch + 1,
      }));
      const next: Journal = [
        ...j,
        { r: 'RECOVERY_REPORT', operationId: manifest.operationId, outcome: 'unknown' },
        ...epochs,
      ];
      return result(next, world, 'RECORDED', 'RECOVERY_REPORT_UNKNOWN');
    }

    // ---- T22 / T23 ------------------------------------------------------
    case 'beginRollback': {
      if (!manifest) return result(j, world, 'REFUSE', 'NOT_ADMITTED');
      // Unconditional and checked first: rollback never rides a spent token.
      if (j.some((r) => r.r === 'EPOCH_ADVANCED') && a.freshApproval === null) {
        return result(j, world, 'BLOCK', 'EPOCH_ADVANCED_NEEDS_FRESH_APPROVAL', [
          'the epoch advanced; rollback never rides a spent token, whatever rollbackAuthorization says',
        ]);
      }
      if (phase !== 'failed-dirty' && phase !== 'failed-clean') {
        return result(j, world, 'BLOCK', 'NOT_A_FAILED_OPERATION');
      }
      const failed = failedConjuncts(a.preRollbackEvidence);
      if (failed.length > 0) {
        return result(j, world, 'BLOCK', 'PRE_ROLLBACK_EVIDENCE_INCOMPLETE', failed);
      }
      if (
        manifest.policies.rollbackAuthorization.value === 'requires-fresh-approval' &&
        a.freshApproval === null
      ) {
        return result(j, world, 'BLOCK', 'ROLLBACK_NEEDS_FRESH_APPROVAL', [
          `policy ${manifest.policies.rollbackAuthorization.value} owned by ${manifest.policies.rollbackAuthorization.ownedBy}`,
        ]);
      }

      const inverse = buildInverseManifest(manifest, seg);

      // Every inverse step that needs its own gate (e.g. deprecated -> stable)
      // must already be in the approved rollback steps.
      const doneSet = new Set<number>();
      for (const r of seg) if (r.r === 'OUTCOME' && r.ok) doneSet.add(r.ordinal);
      const gatedMissing = manifest.steps.filter(
        (s) =>
          doneSet.has(s.ordinal) &&
          s.kind === 'STATUS_TRANSITION' &&
          !manifest.rollbackSteps.some((rb) => sameKey(rb.target, s.target)),
      );
      if (gatedMissing.length > 0) {
        return result(j, world, 'BLOCK', 'INVERSE_STEP_NOT_APPROVED', [
          `no approved inverse step for ${gatedMissing.map((s) => ks(s.target)).join(', ')} (deprecated -> stable needs its own gate)`,
        ]);
      }

      // Redirect retirement must precede the restore of the identity it occupies.
      for (const rb of inverse.steps) {
        if (rb.kind !== 'REDIRECT_RETIRE') continue;
        const restore = inverse.steps.find(
          (x) => x.kind !== 'REDIRECT_RETIRE' && sameKey(x.target, rb.target),
        );
        if (restore && restore.ordinal < rb.ordinal) {
          return result(j, world, 'BLOCK', 'REDIRECT_RETIRE_ORDERING', [
            `REDIRECT_RETIRE for ${ks(rb.target)} must precede the restore of the identity it occupies`,
          ]);
        }
      }

      const parentApproved = findApproved(seg)!;
      const inverseApproved: ApprovedPlan = {
        ...(a.freshApproval ?? parentApproved),
        manifest: inverse,
        items: inverse.steps.map((s) => ({
          path: ks(s.target),
          contentHash: s.beforeHash ?? '(absent)',
          verificationHash: `v:${s.beforeHash ?? 'absent'}`,
          action: s.action,
          risk: s.risk,
        })),
      };
      const next: Journal = [
        ...j,
        { r: 'ADMITTED', approved: inverseApproved, world },
        { r: 'GATE', evidence: a.preRollbackEvidence, ok: true },
      ];
      return result(next, world, 'ALLOW', 'ROLLING_BACK');
    }

    // ---- T28 ------------------------------------------------------------
    case 'observe': {
      const next: Journal = [...j, { r: 'OBSERVATION', ordinal: a.ordinal, kind: a.what, detail: a.detail }];
      return result(next, world, 'RECORDED', 'OBSERVED');
    }

    // ---- T29 ------------------------------------------------------------
    case 'acknowledge': {
      const next: Journal = [...j, { r: 'ACKNOWLEDGED', kind: a.ambiguity }];
      return result(next, world, 'RECORDED', 'ACKNOWLEDGED');
    }
  }
}

function brokenEvidence(): RecoveryEvidence {
  return {
    previewComplete: true,
    snapshot: null,
    snapshotOutsideMutationTarget: false,
    restoredIntoDisposableLocation: false,
    restoredContentHashVerified: false,
    rollbackProcedureDocumented: false,
    boundToApprovedPreview: false,
    stale: true,
    evidenceHash: 'manifest-write-failed',
  };
}

// ===========================================================================
// Drift, in the guard's vocabulary.
// ===========================================================================

function computeDrift(
  plan: ApprovedPlan,
  observed: readonly FingerprintItem[],
  bundles: readonly BundleFacts[],
): readonly string[] {
  const manifest = plan.manifest;
  const drift: string[] = [];
  const approved = new Map(plan.items.map((i) => [i.path, i]));
  const now = new Map(observed.map((i) => [i.path, i]));

  for (const [path, item] of approved) {
    const o = now.get(path);
    if (!o) {
      drift.push(`removed from scope: ${path}`);
      continue;
    }
    if (o.contentHash !== item.contentHash) drift.push(`content changed: ${path}`);
    if (o.verificationHash !== item.verificationHash) drift.push(`verification changed: ${path}`);
    if (o.action !== item.action) drift.push(`planned action changed: ${path}: ${item.action} -> ${o.action}`);
    if (o.risk !== item.risk) drift.push(`risk class changed: ${path}: ${item.risk} -> ${o.risk}`);
  }
  for (const [path] of now) {
    if (!approved.has(path)) drift.push(`added to scope: ${path}`);
  }
  for (const b of bundles) {
    const before = manifest.bundles.find((x) => x.ledgerKey === b.ledgerKey);
    if (!before) continue;
    if (before.epoch !== b.epoch) drift.push(`ledger epoch moved: ${b.ledgerKey}: ${before.epoch} -> ${b.epoch}`);
    if (before.generation !== b.generation) {
      drift.push(`ledger generation moved: ${b.ledgerKey}: ${before.generation} -> ${b.generation}`);
    }
  }
  return drift;
}
