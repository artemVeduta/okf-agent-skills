# Adopted model — concept restructuring and rollback

**Throwaway prototype design.** Lives on `prototypes/concept-restructuring`, never on `main`. It
exists to make one candidate drivable for
[Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30);
the validated decision is what graduates, not this code.

Lens adopted: **reconciled journal** — the failure-and-recovery spine (settlement × cleanliness
terminals, mandatory ambiguity records, per-step reconciliation, escape classes declared before
approval) with the journal-as-truth rule grafted on (`settled ⇔ a durable SETTLED record exists`;
phase is derived, never stored), identity-lens plan types that make illegal operations
unconstructible, and a trust function whose signature cannot see identity.

The two judges split — one ranked the journal lens first on invariant correctness, one ranked the
failure lens first on drivability and anti-silence. **Decision: failure-and-recovery is the spine
and the journal is its durability mechanism**, because the failure lens already gets the two
orderings the journal lens also gets right (token spend after verification; lineage before first
mutation) *and* is the only one that makes silence a reducer invariant violation rather than a
policy — which is literally what this ticket asks for — while the journal's unique wins
(`settled ⇔ record`, per-effect INTENT/OUTCOME durability, plan-deviation detection, reconciliation
determinacy) graft in as mechanisms without importing its unrenderable eighty-record frame.

---

## 1. The question, and what is out of its scope

### The question

When a user drives merge, split, move, and supersede operations through preview, apply, partial
failure, concurrent edit, verification, and rollback, which state, operation-manifest, redirect, and
inbound-link transitions preserve identity, provenance, trust, source relationships, and
recoverability **without permitting an ambiguous or silently lossy state**?

This machine starts **at apply**. The explicit request, the complete preview, the confirmation
binding, and the fresh recheck are already-satisfied inputs consumed from the guard prototyped under
[Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29).
They are never re-derived here.

### Deliberately out of scope

| Not decided here | Owner |
| --- | --- |
| Whether a redirect is a concept file, a frontmatter field, an index entry, or a manifest-only record; whether it is followable | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) |
| Which split output inherits which inbound link; whether an alias may fan out | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) |
| How `sources[]` unions on merge and partitions on split; the dedup rule | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) |
| The inbound-link discovery algorithm and its completeness contract | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24), freshness from [Define cache invalidation and freshness semantics for workspace discovery](https://github.com/artemVeduta/okf-agent-skills/issues/32) |
| Whether sources are deprecated or deleted by default; what a supersede edge is represented as | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) and [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) |
| Archive representation (in-place deprecation vs physical relocation), archive metadata fields, retention, restoration | [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) |
| Whether indexes and default retrieval hide deprecated or superseded concepts | [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) |
| The operation-manifest serialization format and where it durably lives | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| The exact validation check set and post-operation verification contract | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| All numeric thresholds — breadth, truncation limits, observation bounds, supersede-chain depth | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| The snapshot mechanism and content-addressing implementation | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| Whether a restructuring preview may propose review-dependency **mappings** for outputs at all | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| Guard phases before apply: request matching, preview completeness, confirmation binding | [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29) |

Everything in that table enters the machine as an `Injected<T>` value carrying its owning ticket and
its open question, rendered verbatim at every use site. The machine consumes them; it never settles
them.

`rollbackAuthorization` remains an injected, open policy value because the prototype renders it.
The adopted branch behavior is fixed: every rollback requires fresh approval bound to the exact
inverse manifest. The parent operation's approval is context only. Issue #7 still owns the policy
contract and the operation-store serialization and storage decisions.

---

## 2. State shape

```ts
/**
 * PROTOTYPE — concept restructuring and rollback, FROM APPLY ONWARD.
 * Pure reducer: no I/O, no clock, no console, no ANSI, nothing written to disk.
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
  /** Rendered as an open policy value; this branch still requires fresh inverse approval. */
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
// 2. Observation vs restoration. These are two different types on purpose:
//    a snapshot entry carries the complete opaque bytes for this model. The
//    fake corpus covers only its listed fields; real-file syntax is not modeled.
// ---------------------------------------------------------------------------

/**
 * Opaque bytes reference. In the fake corpus, it encodes the complete fake
 * fields `key`, `status`, `statusExplicit`, `body`, `verification`, and
 * `sources`; it does not model unknown real-file syntax.
 */
export type BytesRef = string & { readonly __bytes: unique symbol };

export interface Observed {
  readonly key: ConceptKey;
  readonly exists: boolean;
  readonly contentHash: string;
  /** Hash over the verification event list alone. */
  readonly verificationHash: string;
  /** H(contentHash, verificationHash) — THE fingerprint/recheck unit. */
  readonly observedHash: string;
}

/** The only input `restoreFrom` accepts: the matching `SnapshotEntry`, not a parsed `pre` view. */
export interface SnapshotEntry {
  readonly key: ConceptKey;
  readonly existedBefore: boolean;
  /** The fake corpus bytes for this exact key; `null` means the concept was absent. */
  readonly bytesRef: BytesRef | null;
  readonly observedHash: string;
}

export interface Snapshot {
  readonly id: string;
  readonly entries: readonly SnapshotEntry[];
}

export declare function restoreFrom(entry: SnapshotEntry): { readonly restoredHash: string | null };

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

// ---------------------------------------------------------------------------
// 4. Trust. `trustFate` structurally cannot see identity, lineage, an input
//    concept, or a count — and neither can the classifier that feeds it.
// ---------------------------------------------------------------------------

export type NonClaimAllowlist =
  | 'byte-identical-path-move'
  | 'manifest-bound-link-substitution'
  | 'status-transition';

export type EditClassification =
  | { readonly claimAffecting: false; readonly allowlist: NonClaimAllowlist }
  | { readonly claimAffecting: true; readonly reason: string };

/** Inputs: effect kind and two byte-level facts. No key, no lineage, no tier. */
export declare function classifyEdit(
  kind: EffectKind,
  bytesUnchangedApartFromPath: boolean,
  substitutionConfinedToManifestTarget: boolean,
): EditClassification;

/** Signature cannot receive identity. That is the whole guarantee. */
export declare function trustFate(before: Verification, c: EditClassification): Verification;

export interface TrustOutcome {
  readonly key: ConceptKey;
  readonly before: TrustTier;
  readonly after: TrustTier;
  readonly invalidationReported: boolean;
}

// ---------------------------------------------------------------------------
// 5. Links and review dependencies — three- and four-valued, never collapsed.
// ---------------------------------------------------------------------------

export type LinkId = string & { readonly __link: unique symbol };

export type LinkForm =
  | { readonly form: 'in-bundle-markdown' } // cannot be rewritten to a foreign bundle
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
  | { readonly fate: 'rewrite'; readonly to: ConceptKey } // only within the holder's bundle for in-bundle Markdown
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

/** An in-bundle Markdown link cannot target another bundle. Admission must assign explicit
 * `knowingly-broken-approved` breakage, listed in `approvedBreakage`, or refuse the plan through
 * the applicable link-fate admission path. */

/** Three states. Resolution checks observed target existence only; status is not an input. */
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
// `beginStep`/`completeStep` pair can execute one. That is the mechanism, not a
// marker field.

// ---------------------------------------------------------------------------
// 6. Plans. Illegal operations are UNCONSTRUCTIBLE, not merely refused.
//    Merge/split carry ONE BundleId, so cross-bundle merge cannot be built.
//    There is no bundle-root variant, so a bundle-root relocation is not a
//    restructuring plan at all.
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
  | 'RESTORE_BYTES' // inverse of everything else, from the matching SnapshotEntry only
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
  readonly holdsUniqueDurableContext: boolean; // true ⇒ blocked in both modes
  readonly evidence: string;
}

export interface EffectStep {
  readonly ordinal: number; // total order AND identity
  readonly kind: EffectKind;
  readonly bundle: BundleId;
  readonly target: ConceptKey;
  /** Source identity for the write half of a move; it does not assert continuity. */
  readonly movedFrom: ConceptKey | null;
  readonly action: PlannedAction;
  readonly risk: RiskClass;
  readonly escape: EscapeClass;
  readonly approvalScope: 'approved' | 'inherited';
  /** Expected destination pre-state; `null` ⇒ target must not exist. */
  readonly beforeHash: string | null;
  /** Expected `movedFrom` source pre-state; `null` for other steps. */
  readonly sourceBeforeHash: string | null;
  /** Expected post-state, known at seal; `null` ⇒ target must not exist. */
  readonly afterHash: string | null;
  readonly classification: EditClassification;
  readonly deletionProof: DeletionProof | null;
  readonly link: InboundLink | null;
  readonly indexScope: 'directly-affected' | 'broad-rebuild' | null;
  readonly rationale: string;
}

/** Derived only from journal records plus observation. Never assumed. */
export type StepObservation =
  | { readonly state: 'not-started' } // observed === beforeHash
  | { readonly state: 'done' } // observed === afterHash
  | { readonly state: 'indeterminate' } // INTENT logged, no OUTCOME
  | { readonly state: 'foreign'; readonly observedHash: string }; // matches neither

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
  readonly policies: InjectedPolicies;
  readonly manifestHash: string; // inside the approval fingerprint
}

/** The operation-store serialization and durable path remain an `Injected<T>` question owned by
 * issue #7; this prototype specifies neither. */

export interface ProvenanceAssignmentEntry {
  readonly output: ConceptKeyString;
  readonly entry: SourceEntry;
}
export interface ProvenanceCollision {
  readonly kind: 'same-id-different-resource' | 'same-resource-different-id';
  readonly entries: readonly SourceEntry[];
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
  /** For rollback, this is the exact inverse manifest approved by this plan. */
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

export type JournalRecord =
  | { readonly r: 'ADMITTED'; readonly manifest: OperationManifest }
  | { readonly r: 'REFUSED'; readonly code: RefusalCode; readonly detail: readonly string[] }
  | { readonly r: 'GATE'; readonly evidence: RecoveryEvidence; readonly ok: boolean }
  | { readonly r: 'LOCKED'; readonly bundles: readonly BundleId[] }
  | { readonly r: 'RECHECK'; readonly ok: boolean; readonly drift: readonly string[] }
  | { readonly r: 'MANIFEST_DURABLE'; readonly manifestHash: string }
   /** Durable before mutation; no OUTCOME means the step is in flight. */
   | { readonly r: 'INTENT'; readonly ordinal: number; readonly undo: SnapshotEntry }
  | {
      readonly r: 'OUTCOME';
      readonly ordinal: number;
      readonly ok: boolean;
      readonly observedAfter: string | null;
      readonly observedAfterKnown: boolean;
      readonly note: string;
    }
  | { readonly r: 'INVALIDATION'; readonly ordinal: number; readonly concept: ConceptKey }
  | { readonly r: 'VERIFY'; readonly verdict: ValidationVerdict; readonly checks: PostOpChecks }
  | { readonly r: 'EPOCH_ADVANCED'; readonly bundle: BundleId; readonly from: number; readonly to: number }
  | { readonly r: 'SETTLED'; readonly as: 'applied' | 'reverted' } // the commit record
  | { readonly r: 'FAILURE'; readonly ordinal: number | null; readonly reason: string }
  | { readonly r: 'RECONCILED'; readonly steps: readonly (readonly [number, StepObservation])[] }
  | { readonly r: 'RECOVERY_REPORT'; readonly operationId: string; readonly outcome: 'unknown' }
  /** Implementation marker for the next process; it is not a crash payload. */
  | { readonly r: 'INTERRUPTED' }
  /** Append-only observation log. NEVER amends the sealed manifest. */
  | { readonly r: 'OBSERVATION'; readonly ordinal: number; readonly kind: ObservationKind; readonly detail: string };

export type Journal = readonly JournalRecord[];

export interface PostOpChecks {
  readonly identityChecks: 'pass' | 'fail';
  readonly linkChecks: 'pass' | 'fail';
  readonly dependencyChecks: 'pass' | 'fail';
  readonly linkResolutions: readonly (readonly [LinkId, LinkResolution])[];
  readonly findings: readonly string[];
  readonly contentCoverage: { readonly checkableByValidation: false; readonly diff: string };
}

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
  | 'reverted-with-residue' // reverted, but dirty because residue remains
  | 'rollback-failed'
  | 'unknown-interrupted';

export type Settlement = 'none' | 'applied' | 'reverted' | 'failed';
export type Cleanliness = 'clean' | 'dirty';

export interface Classification {
  readonly settlement: Settlement;
  readonly cleanliness: Cleanliness;
  readonly terminal: boolean;
}

/** Pure function of Phase. NEVER stored beside it. */
export declare function classify(p: Phase): Classification;

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
  | 'REVIEW_REPAIR_PERFORMED_INLINE';

// ---------------------------------------------------------------------------
// 13. The frame — everything rendered after every action. Derived, not stored.
// ---------------------------------------------------------------------------

export interface Frame {
  readonly phase: Phase;
  readonly classification: Classification;
  readonly manifest: OperationManifest | null;
  readonly manifestDurable: boolean;
  readonly steps: readonly (readonly [number, StepObservation])[];
  /** Occupancy diff: what sat at each Concept ID before and what sits there now. */
  readonly identityDiff: readonly {
    readonly key: ConceptKey;
    readonly before: ConceptView | null;
    readonly after: ConceptView | null;
  }[];
  readonly lineage: readonly LineageRecord[];
  readonly links: readonly (readonly [LinkId, LinkResolution])[];
  readonly reviewDependencies: readonly ReviewDependency[];
  readonly trust: readonly TrustOutcome[];
  readonly ambiguities: readonly AmbiguityFinding[];
  readonly residue: readonly Residue[];
  readonly recovery: RecoveryEvidence | null;
  readonly validation: ValidationVerdict | null;
  readonly notice: readonly string[]; // the notice contract
  readonly humanActionRequired: readonly string[];
  readonly openQuestions: readonly string[]; // from every Injected<T> touched
}

/** The TUI renders complete state arrays: every row in `steps`, `identityDiff`, `lineage`, `links`,
 * `reviewDependencies`, `trust`, `ambiguities`, `residue`, `notice`, `humanActionRequired`, and
 * `openQuestions` is rendered. Only an individual display line may be truncated to the visible
 * width; the TUI uses a minimum width of 80 columns. */

export declare function derive(j: Journal, world: readonly Observed[]): Frame;

export interface InvariantViolation {
  readonly rule: string;
  readonly detail: string;
}
export declare function checkInvariants(f: Frame): readonly InvariantViolation[];

// ---------------------------------------------------------------------------
// 14. Actions and the reducer.
// ---------------------------------------------------------------------------

export type Verdict = 'ALLOW' | 'REFUSE' | 'EXPIRE' | 'BLOCK' | 'RECORDED';

/** Execution has two explicit reducer actions. Durable `beginStep` rechecks the target pre-image
 * and, for a move write, the `movedFrom` source pre-image, then records `INTENT` before mutation.
 * `completeStep` records `OUTCOME` after mutation. A crash between them leaves an in-flight
 * `INTENT` with no `OUTCOME`. */

export type Action =
  | { readonly kind: 'admit'; readonly approved: ApprovedPlan }
  | { readonly kind: 'gate'; readonly evidence: RecoveryEvidence }
  | { readonly kind: 'lock' }
  | {
      readonly kind: 'recheck';
      readonly observed: readonly FingerprintItem[];
      readonly bundles: readonly BundleFacts[];
    }
  | { readonly kind: 'sealManifest'; readonly ok: boolean }
  | {
      readonly kind: 'beginStep';
      readonly ordinal: number;
      /** Re-observed destination pre-image under the lock immediately before INTENT. */
      readonly observedBefore: string | null;
      /** Re-observed source pre-image for a move write; `null` for other steps. */
      readonly sourceObservedBefore: string | null;
      readonly undo: SnapshotEntry;
    }
  | {
      readonly kind: 'completeStep';
      readonly ordinal: number;
      readonly outcome: 'ok' | 'io-failure' | 'concurrent-change-detected';
      /** The target post-image hash, when present. */
      readonly observedAfter: string | null;
      /** `false` means the external result did not establish the post-image. */
      readonly observedAfterKnown: boolean;
    }
  | { readonly kind: 'verify'; readonly verdict: ValidationVerdict; readonly checks: PostOpChecks }
  | { readonly kind: 'crash' } // no payload; the reducer supplies the observed world separately
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

export declare function reduce(j: Journal, world: readonly Observed[], a: Action): Step;
```

---

## 3. Transition table

Phase names below are the *derived* phase of the journal after the action. `world` is the freshly
observed corpus supplied to `reduce`, not a field on the action; the reducer never reads a filesystem.

### 3.0 The table is data, and it is checked first

`PHASE_ALLOWS` in `restructure.ts` is this table's `From` column, as a `Record<Phase, ActionKind[]>`,
and `reduce` consults it before any case runs. An action outside its phase's row is
`REFUSE PHASE_FORBIDS_ACTION`, whatever the individual case would have said.

This exists because the earlier design spelled each guard out inside the case that needed it, and
every case that forgot one became a hole with the same shape: a phase that was terminal only in the
render, with the reducer still accepting the actions that move past it. Adversarial runs walked
through six of them — `recheck` from `expired`, `verify` from `unknown-interrupted`, `failed-dirty`
and `rolling-back`, `beginStep` from `failed-dirty`, `reconcile` from `mutating`. Each was one
keystroke, each returned an ALLOW-class verdict, and each ended in a phase whose own notice denied
what the corpus showed.

`observe` and `acknowledge` are legal from every phase: they record what a human saw and advance
nothing. Every other action is legal only where the table says so.

| Phase | Actions it accepts |
| --- | --- |
| `admitting` | `admit` `gate` `lock` `recheck` `sealManifest` `crash` |
| `manifest-durable` | `beginStep` `crash` |
| `mutating` | `beginStep` `completeStep` `verify` `crash` |
| `verifying` | `crash` |
| `rolling-back` | `beginStep` `completeStep` `crash` |
| `refused` `gate-blocked` `expired` `applied-*` `reverted-*` | `admit` |
| `failed-clean` | `admit` `beginRollback` |
| `failed-dirty` | `admit` `beginRollback` `reconcile` |
| `rollback-failed` | `admit` `reconcile` |
| `unknown-interrupted` | `admit` `reconcile` `recoverInterrupted` `beginRollback`\* |

\* admissible only to be answered in T22/T23's own words (spent token, then "not a failed
operation"). It has no accepting path: a crash is unresolvable by the machine (I30), so no rollback
may be built out of a state the machine cannot describe.

| # | Action | From | To | Guard | Effect |
| --- | --- | --- | --- | --- | --- |
| T1 | `admit` | — | `admitting` | An `ApprovedPlan` with a manifest and fingerprint is present | Runs the admission predicates (each mapped 1:1 to a `RefusalCode`) |
| T2 | `admit` | `admitting` | `refused` | Any admission predicate fails | Appends `REFUSED{code}`. Verdict **REFUSE**. No manifest is durable, no byte can have moved |
| T3 | `gate` | `admitting` | `admitting` | Every `RecoveryEvidence` conjunct true, `stale === false`, `boundToApprovedPreview`, `evidenceHash` equals `approved.recoveryEvidenceHash` | Appends `GATE{ok:true}` |
| T4 | `gate` | `admitting` | `gate-blocked` | Any conjunct false or evidence stale or unbound | Appends `GATE{ok:false}`. Verdict **BLOCK**. Neither applied nor rolled back; no override by approval or tier |
| T5 | `lock` | `admitting` (gated) | `admitting` | Exclusive per-bundle lock acquired for every bundle in canonical `ledgerKey` order; every `schema === 'ok'` | Appends `LOCKED`. Locks held for the whole execution |
| T6 | `recheck` | `admitting` (locked) | `expired` | Observed items differ from `approved.items` on any of contentHash, verificationHash, action, risk, path membership; or any bundle epoch/generation moved | Appends `RECHECK{ok:false, drift}`. Verdict **EXPIRE** with named drift. Whole operation; no per-item continuation exists |
| T7 | `recheck` | `admitting` (locked) | `admitting` | Fingerprint matches the freshly observed plan | Appends `RECHECK{ok:true}` |
| T8 | `sealManifest` | `admitting` (rechecked) | `manifest-durable` | Manifest (lineage, ordered steps, before/after hashes, rollback steps) written durably outside every mutation target | Appends `MANIFEST_DURABLE`. `in-flight` recorded. From here the operation is reconstructible from manifest + snapshot alone |
| T9 | `sealManifest{ok:false}` | `admitting` | `gate-blocked` | The manifest write failed | Clean terminal; no mutation occurred, so no lineage is at risk |
| T10 | `beginStep` | `manifest-durable` \| `mutating` | `mutating` | `manifestDurable`; `ordinal` is the lowest `not-started`; `observedBefore === step.beforeHash` — the destination re-read under the lock immediately before `INTENT`; for a move write, `sourceObservedBefore` also matches `sourceBeforeHash` for `movedFrom`; ordinal invariants hold | Durably appends `INTENT{undo}` after both pre-image checks and before mutation. No `OUTCOME` is recorded yet; `completeStep` follows after mutation |
| T11 | `completeStep{outcome:'ok'}` with `observedAfter !== step.afterHash` | `mutating` | `failed-dirty` | A matching `INTENT` exists and produced bytes differ from the sealed post-image (a rewrite that also reflowed or normalized) | Appends `OUTCOME{ok:false, note:'PLAN_DEVIATION'}` + `FAILURE`. The step left the manifest-bound substitution and is rejected, not reclassified |
| T12 | `completeStep{outcome:'io-failure'}` | `mutating` | `failed-clean` | A matching `INTENT` exists and no step has a `done` observation | Appends `OUTCOME` + `FAILURE`. Token unspent, epoch unadvanced, zero bytes moved. `ambiguities` legitimately empty |
| T13 | `completeStep{outcome:'io-failure'}` | `mutating` | `failed-dirty` | A matching `INTENT` exists and at least one step is `done` | Appends `OUTCOME` + `FAILURE`. Token unspent, epoch unadvanced. Ambiguity set computed and **required non-empty** |
| T14 | `beginStep` with a pre-image mismatch, or `completeStep` with `outcome:'concurrent-change-detected'` | `manifest-durable` \| `mutating` | `failed-clean` \| `failed-dirty` | The destination or, for a move write, its `movedFrom` source no longer holds the image the plan was sealed against. `beginStep` checks before recording `INTENT`; the explicit complete outcome is a second, redundant route after mutation | A failed `beginStep` appends `FAILURE` without `INTENT`; a failed `completeStep` appends `OUTCOME` + `FAILURE`. `foreign-mutation-in-scope` ambiguity. Never abort-in-place once bytes have moved |
| T15 | `verify` | `mutating` (all `done`) | `verifying` | Phase is `mutating` **and** every step `done`. Both halves are load-bearing: step-completeness alone is vacuously true over an empty step list and true again over a crashed or already-failed operation, which is how `verify` became an edge out of `unknown-interrupted`, `failed-dirty` and `rolling-back` | Appends nothing yet; runs OKF validation plus identity, link, and dependency checks |
| T16 | `verify` | `verifying` | `applied-clean` | `okfValid` and all three check groups pass and every link `resolves` | Appends `EPOCH_ADVANCED` (exactly one per bundle) then `SETTLED{as:'applied'}`. Token spent, sibling confirmations invalidated, `in-flight` cleared, locks released. Emits the notice contract |
| T17 | `verify` | `verifying` | `applied-with-known-breakage` | As T16 but every non-resolving link is `knowingly-broken-approved` and listed in `approvedBreakage` | Same commit sequence, plus a standing report of permanently broken links and every dependency now `unavailable` |
| T18 | `verify` | `verifying` | `failed-dirty` | Validation fails, or any link is `unexpectedly-broken`, or a structural dependency invalidity or cycle was created | Appends `FAILURE`. **No `EPOCH_ADVANCED`, no `SETTLED`** — the token is still unspent |
| T19 | `crash` | `manifest-durable` \| `mutating` \| `verifying` \| `rolling-back` | `unknown-interrupted` | Process death with something in flight. A rollback segment records `MANIFEST_DURABLE` after its inverse manifest is admitted and before any inverse write. A crash between `beginStep` and `completeStep` therefore leaves a durable `INTENT` without `OUTCOME`, while `derivePhase` still checks `INTERRUPTED` before the rollback branch because the corpus may be half-restored under two live identities | Appends no `OUTCOME`; the implementation appends the payload-free `INTERRUPTED` marker. The journal retains the in-flight `INTENT` or a complete apply with no `SETTLED`. Recovery is human-directed and does not repair automatically |
| T20 | `reconcile` | `unknown-interrupted` \| `failed-dirty` \| `rollback-failed` | unchanged | The phase table enforces the scope; read-only and human-directed | Appends `RECONCILED` classifying every step `not-started` / `done` / `indeterminate` / `foreign` by comparing the reducer's observed `world` against the journal's before/after hashes. It records evidence only and does not repair. It is a **snapshot of one moment**, not an override: `INTENT`/`OUTCOME` records appended after it win, and it supplies a baseline only for steps the journal has said nothing about since. Treating it as a permanent override froze the step table mid-flight and made a `mutating` operation unfinishable, unrollbackable and silent |
| T21 | `recoverInterrupted` | `unknown-interrupted` | `unknown-interrupted` | Explicit human invocation, and no `RECOVERY_REPORT` already in the segment (`ALREADY_RECOVERED`). T21's self-loop otherwise permitted a second invocation, appending a second `EPOCH_ADVANCED` with the same `from` — a state `checkInvariants` itself rejects under I27 | Appends `RECOVERY_REPORT{outcome:'unknown'}` and `EPOCH_ADVANCED`; clears outstanding confirmations. Recovery is human-directed, never assumes success, never repairs, and never rolls back. No edge to applied/failed/reverted exists |
| T22 | `beginRollback` | `failed-dirty` \| `failed-clean` | `rolling-back` | Pre-rollback snapshot of the CURRENT state taken and hash-verified; restore lands in a disposable location; fresh approval is bound to the exact inverse manifest (see T23) | Opens the inverse manifest with `revertOf` set, its own journal, `UNDO_CREATE` for creates and `RESTORE_BYTES` for everything else, and `REDIRECT_RETIRE` ordinals below the restore of the identity they occupy. It records `MANIFEST_DURABLE` after `ADMITTED` and the successful `GATE`, before any inverse write. The inverse is built from **what landed**, not from `OUTCOME.ok`: a step whose bytes deviated or whose write was interrupted moved the target too, and filtering those out left the mutation applied under a `reverted-clean` terminal. Each inverse step's `beforeHash` is corrected from the sealed full-apply projection to what the partially-applied world actually holds, and there is one restore per target, not one per parent step |
| T23 | `beginRollback` | `failed-*` | unchanged | Pre-rollback snapshot or restore verification failed, **or** `freshApproval` is absent or does not bind the exact inverse manifest, **or** an inverse step's gate (for example `deprecated -> stable`) is not in the approved rollback steps, **or** the inverse manifest is empty (`NOTHING_TO_ROLL_BACK`: nothing landed, so the pre-operation state is already in place and the exit is a fresh preview, not a rollback) | Verdict **BLOCK**; adds "neither applied nor rolled back" to `humanActionRequired`. The parent approval is context only; rollback never rides it or a spent token |
| T24 | `beginStep`/`completeStep` (inverse) | `rolling-back` | `reverted-clean` | Every inverse step is complete, every restored hash equals the matching `INTENT.undo.observedHash`, and no completed parent step had `escape !== 'contained'` | Appends `SETTLED{as:'reverted'}`. Each inverse effect restores only from its matching `SnapshotEntry`; snapshot verification state returns with the bytes, and no re-verification runs. No spent record is created for the parent, so a fresh preview may re-authorize the identical operation |
| T25 | `beginStep`/`completeStep` (inverse) | `rolling-back` | `reverted-with-residue` | Bytes fully restored but some completed parent step was `observable-local` or `escaped`, or an `OBSERVATION` exists for one; the terminal is `settlement='reverted'`, `cleanliness='dirty'` | Appends `SETTLED{as:'reverted'}` plus permanent `Residue` entries naming what cannot be un-said |
| T26 | `beginStep`/`completeStep` (inverse) | `rolling-back` | `rollback-failed` | An inverse step failed, or a restored hash differs from its matching snapshot entry | Appends `FAILURE`. Ambiguities `rollback-partially-applied` + `restore-not-byte-identical` naming every concept whose `verified` a non-identical restore would drop. Refuses to accept the restore, and the terminal holds: the rejected step observes as `foreign` (bytes provably moved and match neither sealed image), so it is not the lowest `not-started` ordinal and cannot be re-run into `reverted-clean`; neither inverse action is in `rollback-failed`'s row of the phase table |
| T27 | `admit` (new operation) | any terminal phase | `admitting` (new segment) | Always available. `REFUSED` opens its own segment exactly as `ADMITTED` does, so a later attempt's refusal cannot overwrite the settled outcome of the operation before it | The only exit from a settled or human-only terminal is a NEW operation with its own fresh preview, approval, and recovery gate. Rollback nesting is therefore bounded at one level by construction, not by fiat |
| T28 | `observe` | any | unchanged | An injected external signal arrives | Appends `OBSERVATION` to the append-only log. Never amends the sealed manifest. Marks outputs human-consumed so their deletion during rollback is flagged as evidence destruction |
| T29 | `acknowledge` | `failed-dirty` \| `reverted-with-residue` \| `rollback-failed` | unchanged | A human names a specific ambiguity | Sets `acknowledgedByHuman`. Changes neither settlement nor cleanliness and authorizes nothing — acknowledgement is not approval |

---

## 4. Invariants and the mechanism that makes violation impossible

"Mechanism" means: the violating state cannot be constructed, or `checkInvariants` rejects it, or
the only code path that could produce it does not exist in the action union.

| # | Invariant | Mechanism |
| --- | --- | --- |
| I1 | Merge/split outputs are always explicit `status: draft`, never verified | `CREATE_OUTPUT` admission requires `statusExplicit === true` and an empty `Verification`; `OUTPUT_NOT_EXPLICIT_DRAFT` otherwise. No function maps an input's verification into a created concept |
| I2 | Trust is never aggregated, inherited, or majority-derived | `trustFate(before, EditClassification)` has no parameter that could carry another concept's tier, and `classifyEdit` has none either. The one call site that follows a lineage pointer — a move's write half reading `movedFrom`'s verification — is admissible only after admission has proved the move byte-identical **against the observed source** (`MOVE_AND_EDIT_NOT_SEPARATED`). Taking the planner's `byte-identical-path-move` classification on trust let a forged plan mint a new Concept ID carrying `human-reviewed` over changed content |
| I3 | Identity continuity and trust continuity are independent axes | Identity lives in `ConceptKey` + `LineageRecord`; trust changes only via `trustFate`, whose signature cannot receive a key or a lineage record |
| I4 | Moving or renaming changes identity; nothing claims continuity | There is no continuity field to set: `LineageRecord.continuity` is a single string literal, and `ConceptKey` has no stable-id component |
| I5 | Any concurrent **content or verification** change aborts the entire operation | `Observed.observedHash = H(contentHash, verificationHash)` is the only unit compared, at the recheck (T6) and again at every `beginStep` (T10) against the destination's `observedBefore`; a move write also compares `sourceObservedBefore` with the `movedFrom` source's `sourceBeforeHash`. Both comparisons are reducer guards, not conventions the caller may decline: without them, every step whose post-image is fully determined by the plan (`CREATE_OUTPUT`, `INDEX_REGEN`, `RESTORE_BYTES`, a move's create half) overwrote a concurrent session's work and still settled `applied-clean`, because the `afterHash` check cannot see a destroyed pre-state |
| I6 | No partial continuation; no drop-the-changed-item-and-proceed | `recheck` has exactly two outgoing edges and neither takes a subset of the plan. There is no resume-from-ordinal action in the union |
| I7 | Manifest-bound link substitution preserves the linking concept's `verified` | `LINK_REWRITE` classifies non-claim-affecting **only** while `observedAfter === afterHash`; a deviation is T11, a rejected step, not a reclassified one |
| I8 | A claim-affecting edit clears `verified` and reports the invalidation as part of the edit | `CONTENT_EDIT` classifies claim-affecting and `completeStep` appends `INVALIDATION` with the outcome. No action exists for standalone verification removal, so the approval path meant for disputing evidence is unreachable from here |
| I9 | Byte-identical restoration preserves snapshot verification state | `restoreFrom(SnapshotEntry)` accepts only the matching entry's opaque bytes; in the fake corpus they encode the complete listed fake fields. Acceptance requires `restoredHash === undo.observedHash`, and parsed views are render-only. The rollback path contains no verification step |
| I10 | A non-byte-identical restore is never silently accepted | T26 — mismatch is `rollback-failed`, a distinct terminal naming every concept whose `verified` would drop |
| I11 | Status transitions require approval and preserve verification | `STATUS_TRANSITION` is on the non-claim allowlist and can only execute from `manifest.steps`; the reducer has no action that introduces a step during `mutating` |
| I12 | Concepts never merge across bundles | `MergePlan`/`SplitPlan` carry one `BundleId` and `ConceptId[]`. A cross-bundle merge is unconstructible; the entry function refuses with `CROSS_BUNDLE_MERGE_UNEXPRESSIBLE`, and no decomposition into migrate-then-merge exists as a code path |
| I13 | Cross-bundle moves are migrations: write-new-then-swap, delete routed to the owning bundle | `MOVE_PATH` expands into create-at-destination then remove-at-owner, in that ordinal order; a step writing a concept through a non-owning bundle is inadmissible |
| I14 | Read-only bundles' inbound links and foreign in-bundle Markdown targets are never rewritten | A `rewrite` fate on a link whose `holderWritability !== 'writable'` is inadmissible; its only legal fate is `knowingly-broken-approved`, which must appear in `approvedBreakage` before approval. An `in-bundle-markdown` link with a foreign target is likewise either explicitly approved breakage or refused by link-fate admission |
| I15 | An incomplete inbound-link set can never be presented as complete | `InboundLinkSet.complete === false` is inadmissible (`LINK_SET_INCOMPLETE`); no render path prints a link list without the completeness flag beside it |
| I16 | Composite operations inherit the strictest outcome | Admission folds every step's gate; one `blocked` leaf refuses the whole plan. There is no rewrite from `DELETE_CONCEPT` to `STATUS_TRANSITION` anywhere in the reducer |
| I17 | Recovery evidence is an authorization input, not cleanup | `RecoveryEvidence` is a conjunction evaluated at T3/T4 before any mutating action is reachable; `sealManifest` requires a `GATE{ok:true}` record |
| I18 | Rollback snapshots the current state before restoring | `beginRollback` takes `preRollbackEvidence` as a required argument; without a verified one the edge is T23 (BLOCK) |
| I19 | Redirects are blocked until their semantics exist | Every non-`off` `RedirectPolicy` carries `authorization: 'blocked-pending-semantics'` and any plan containing `REDIRECT_PUBLISH` is inadmissible (`REDIRECT_BLOCKED_PENDING_SEMANTICS`). The kinds exist only so a candidate plan can be rendered and refused by name |
| I20 | Knowledge-only deletion is blocked; code-backed deletion is conditional; unique durable knowledge is never purged | `DELETE_CONCEPT` admission reads the per-bundle `ProjectMode` and requires a `DeletionProof` with `holdsUniqueDurableContext === false` |
| I21 | Rollback of a create is not a policy delete | `UNDO_CREATE` is a distinct `EffectKind`; only `DELETE_CONCEPT` consults the deletion rule |
| I22 | Project mode is per bundle; `unknown` blocks mutation | `BundleFacts.mode` is per bundle and composed strictly at admission; `UNKNOWN_PROJECT_MODE` refuses |
| I23 | Trust is evidence, never authority | No reducer guard reads `ConceptView.verification` or `.tier`; they exist only on the render view |
| I24 | Approval binds the manifest hash and the recovery-evidence hash; amending either expires it | `manifestHash` and `recoveryEvidenceHash` are inside `ApprovedPlan`; rollback additionally requires fresh approval for the exact inverse manifest, while the parent approval is context only. The manifest is immutable after `MANIFEST_DURABLE` and observations append to a separate log record (T28) |
| I25 | The guard fingerprint is not weakened; new effect kinds enter as planned actions | `FingerprintItem` keeps `{path, contentHash, action, risk}` and adds `verificationHash`; every `EffectStep` carries a `PlannedAction` from the guard's closed set |
| I26 | REFUSE and EXPIRE stay distinct downstream of apply | Two phases (`refused`, `expired`) with two verdicts and two record kinds; `refused` always carries a closed `RefusalCode` |
| I27 | One execution, one lock set, one epoch advance | `EPOCH_ADVANCED` is legal only between the last `OUTCOME` and `SETTLED`; a second record for the same bundle is a `checkInvariants` violation. Its two producers are guarded at source: `verify` runs only from `mutating`, and `recoverInterrupted` refuses once a `RECOVERY_REPORT` exists |
| I28 | A handled failure spends no token and advances no epoch | T12/T13/T14/T18 append `FAILURE` and no `EPOCH_ADVANCED`; `SETTLED` is the only record the spend hangs off |
| I29 | There is no resume-from-step-N | No action carries a resume, and `beginStep`/`completeStep` appear in no failed or interrupted phase's row of the phase table; a retry is a new `admit` whose recheck sees the partial mutation and EXPIREs. `stepObservations` reads the **last** `OUTCOME` per ordinal, so a step that did run is never rendered as `not-started` — reading only the first made a recorded mutation invisible and its ordinal permanently re-runnable |
| I30 | A crash yields a distinct, unresolvable-by-machine terminal | `unknown-interrupted` is derived from "`in-flight` with no `SETTLED`", including mid-rollback; `reconcile` is read-only and `recoverInterrupted` has no edge to any settled phase. `verify` was that edge until the phase table closed it — it read only step-completeness, which a crash leaves untouched, and would launder an indeterminate, dirty state into `applied-clean` with the ambiguity set discarded |
| I31 | Rollback authorization never rests on a ledger | Rollback requires fresh approval bound to the exact inverse manifest and reads `manifest.rollbackSteps` plus the matching snapshot entries — both durable before the first mutation — and the parent segment's step observations to decide which inverse steps apply and what each one's before-image now is. Parent approval is context only. The ledger is read only for epoch and lock |
| I32 | The spent record is epoch-scoped, not a fingerprint blacklist | A failed or reverted operation never appends `SETTLED{applied}`, so no spend record exists; a fresh preview re-authorizes the byte-identical plan. `admissionRefusal` scans **per segment** and refuses only when the segment that settled carries this same fingerprint — scanning every `SETTLED` in the journal turned the machine into a blacklist that refused every later operation, including the corrective one T27 names as the only exit |
| I33 | `sources[]` is the only authored provenance; lineage lives only in the manifest | `ConceptView` has no derivation field; `LineageRecord` exists only inside `OperationManifest` |
| I34 | New or retargeted review dependencies have no baseline and preview observations are never accepted | Constructed with `hasBaseline: false` and `finding: {kind:'no-baseline'}`; `capturedObservation.accepted` is the literal `false` and no action promotes it |
| I35 | Dependency repairs are separate reviewed operations and never clear findings | `ScheduledRepair` is not an `EffectStep`; `openFindings` is copied forward untouched and `REVIEW_REPAIR_PERFORMED_INLINE` refuses a plan that tries |
| I36 | `unchanged` / `changed` / `unavailable` / `unobservable` never collapse | Four `ReviewFinding` variants with different payloads; no function maps one to another |
| I37 | Self-scoped or cyclic review dependencies are caught after the operation, not at first observation | `structuralInvalidity` is populated only by the `verify` action |
| I38 | Review evidence is reported separately from trust | `Frame.reviewDependencies` and `Frame.trust` are distinct fields rendered in distinct sections, and no review finding moves a tier: a tier changes only when `classifyEdit` returns `claimAffecting` |
| I39 | Index regeneration and mechanical link repair inherit the parent approval; a broad rebuild does not | `approvalScope: 'inherited'` is admissible only for `INDEX_REGEN{indexScope:'directly-affected'}` and confined `LINK_REWRITE`; `BROAD_REBUILD_NEEDS_OWN_GATE` otherwise |
| I40 | Knowledge is never live in zero places | Ordinal invariant checked at admission: every `CREATE_OUTPUT` ordinal is below every source `STATUS_TRANSITION`/`DELETE_CONCEPT`/`MOVE_PATH` removal ordinal, and every `MOVE_PATH` ordinal is below every `LINK_REWRITE` ordinal. `ORDERING_WOULD_UNMOOR_KNOWLEDGE` refuses |
| I41 | Moving a bundle root is not a restructuring operation | `Plan` has no bundle-root variant; a request refuses with `BUNDLE_ROOT_SELF_ORPHANING` because it would change the `ledgerKey` its own confirmation is filed under |
| I46 | The frame reports outcomes, never predictions dressed as outcomes | `TrustOutcome` carries the `ordinal` it belongs to and `observed`/`stepState` from the same `stepObservations` the step table renders. One Concept ID touched by two steps yields two rows that can be told apart, and a row whose step has not landed renders as *predicted*. Without this a `failed-clean` operation — zero bytes moved — reported a lost human review, and a rejected restore reported byte-identical success |
| I47 | Inbound links are resolved against the manifest that owns them | `linkResolutions` uses the **forward** manifest even while the current segment holds the inverse, and treats a forward effect as in force until the inverse step for that target has itself completed. The resolution verdict checks target file existence only. Resolving against the inverse made every `unexpectedly-broken` link render `resolves` the instant a rollback was admitted and no byte had moved — the panel asserting a healthy link graph over a half-applied corpus, directly above the ambiguity list contradicting it |
| I48 | Residue belongs to the operation that produced it | `residueOf` scans the rollback segment and its parent, never the whole journal. Scanning the journal attributed an already-reverted operation's escaped effects to the next, unrelated one and pointed its `ordinal` at a step in a different manifest |
| I42 | Every completed operation emits the notice contract | `Frame.notice` is derived from the journal and `checkInvariants` rejects a terminal phase with an empty notice |
| I43 | **A dirty state can never be silent** | `checkInvariants` rejects any frame whose `classification.cleanliness === 'dirty'` and whose `ambiguities` and `residue` are both empty. `unclassified-loss` exists so an unanticipated loss becomes a loud, named finding rather than a clean report |
| I44 | The phase can never disagree with the journal | `Phase` and `Classification` are both derived (`derive`, `classify`); neither is a stored field, and `settled ⇔ a durable SETTLED record exists` |
| I45 | The machine has no automatic entry point | The only entry is `admit` with an `ApprovedPlan` produced by the guard; nothing in the union constructs one |

---

## 5. Hard-case catalogue

The catalogue is defined by the scenario arrays in `walkthrough.ts`. The runner computes
`SCENARIOS.length` and checks every row as a claim about resulting state. `code` means the
`REFUSED` record's `RefusalCode`.

### 5.1 Merge

#### Preview / admission (11)

| ID | Hard case | Expected state after `admit` |
| --- | --- | --- |
| M-P-01 | Sources in different bundles | Unconstructible in `MergePlan`; `phase='refused'`, `code=CROSS_BUNDLE_MERGE_UNEXPRESSIBLE`, journal has no `ADMITTED` record |
| M-P-02 | Preview shows only the output | `phase='refused'`, `code=SOURCE_FATE_UNENUMERATED`; every source lacking a terminal step is named in `detail` |
| M-P-03 | Knowledge-only bundle, plan emits DELETE | `phase='refused'`, `code=KNOWLEDGE_ONLY_DELETE_BLOCKED`; no step was rewritten to `STATUS_TRANSITION` |
| M-P-04 | Code-backed delete without proof | `phase='refused'`, `code=DELETION_UNPROVEN`; with `holdsUniqueDurableContext` → `code=UNIQUE_DURABLE_CONTEXT` |
| M-P-05 | Mixed trust across sources | Admitted; `frame.trust` shows output `after='unverified'` and each deprecated source `before===after` |
| M-P-06 | Duplicate `sources[].id` with different resources | Admitted; `manifest.provenanceCollisions` non-empty; `frame.openQuestions` names the merge/split/redirect ticket; no dedup was applied |
| M-P-07 | A source is already `deprecated` | `phase='refused'`, `code=REANIMATES_RETIRED_IDENTITY` unless an explicit `deprecated -> stable` step is in the plan |
| M-P-08 | Output ID collides with an existing concept (incl. this op's delete target) | `phase='refused'`, `code=DESTINATION_OCCUPIED`; ordinal invariant I40 prevents a reorder rescue |
| M-P-09 | A source is a third party's review-dependency target | Admitted only if every such mapping is in `manifest.reviewImpact` as `unavailable` and in `scheduledRepairs`; else `code=DEPENDENCY_BREAKAGE_UNLISTED` |
| M-P-10 | Inbound links in a read-only bundle | Admitted with those links in `approvedBreakage`, fate `knowingly-broken-approved`; a `rewrite` fate on them is inadmissible |
| M-P-11 | Inbound-link-bearing federation member inactive | `phase='refused'`, `code=LINK_SET_INCOMPLETE`, `incompleteness` contains `inactive-required-member` |

#### Apply (6)

| ID | Hard case | Expected state |
| --- | --- | --- |
| M-A-01 | Output must exist and validate before any source is deprecated | Admission enforces I40; the ordinal of every source `STATUS_TRANSITION` exceeds every `CREATE_OUTPUT` ordinal; a violating plan is `refused` with `ORDERING_WOULD_UNMOOR_KNOWLEDGE` |
| M-A-02 | One guard execution, one lock, one epoch advance | Journal has exactly one `LOCKED`, and `EPOCH_ADVANCED` count per bundle is exactly 1 and only between the last `OUTCOME` and `SETTLED` |
| M-A-03 | Index regen and link repair inherit approval; wider edits do not | `INDEX_REGEN{directly-affected}` and confined `LINK_REWRITE` carry `approvalScope='inherited'`; a broad rebuild is `refused` with `BROAD_REBUILD_NEEDS_OWN_GATE` |
| M-A-04 | Output written as explicit `status: draft` | Output step has `statusExplicit=true`; a plan relying on the absent-status default is `refused` with `OUTPUT_NOT_EXPLICIT_DRAFT` |
| M-A-05 | Source deprecation must already be in the approved preview | `beginStep` only accepts an `ordinal` present in `manifest.steps`; no action adds a step in `mutating` |
| M-A-06 | Manifest records old-ID → new-ID lineage | `MANIFEST_DURABLE` strictly precedes the first `INTENT`; `manifest.lineage` non-empty before any mutation |

#### Partial failure (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| M-F-01 | Output written, second deprecation fails | `phase='failed-dirty'`, ambiguity `two-live-carriers-no-authority` naming the live sources and the output; `notice` reports failure, never success |
| M-F-02 | Failure before the manifest is durable | Unreachable: `beginStep` is guarded on `manifestDurable`; a manifest write failure is `phase='gate-blocked'` with zero `INTENT` records |
| M-F-03 | Token unspent, epoch unadvanced, retry EXPIREs | Journal has no `EPOCH_ADVANCED` and no `SETTLED`; a retry's `recheck` yields `phase='expired'` with drift naming the changed paths |
| M-F-04 | Rollback must delete the just-created output | Inverse step kind is `UNDO_CREATE`; the knowledge-only deletion rule is not consulted and rollback proceeds |
| M-F-05 | Failure after index regen, before source deprecation | `phase='failed-dirty'`, ambiguity `index-advertises-unsettled-outcome`; the `INDEX_REGEN` step's `escape='observable-local'` |

#### Concurrent edit (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| M-C-01 | Any source content or verification change | `phase='expired'`, drift names the source; no partial-continuation edge exists |
| M-C-02 | A source gains `human:` verification, content unchanged | `phase='expired'`; the differing field is `verificationHash` while `contentHash` is equal |
| M-C-03 | Sibling holds a confirmed split of one of our sources | On our success, `EPOCH_ADVANCED` is appended before `SETTLED`; the sibling's confirmation is invalid at its own recheck, not at its write |
| M-C-04 | An unrelated inbound-link holder is edited | `phase='expired'`; drift states the path and that it was in scope because it holds a `LINK_REWRITE` step |
| M-C-05 | Concurrent change detected during apply | `phase='failed-dirty'` with `foreign-mutation-in-scope`; `expired` is unreachable once any step is `done` |

#### Verification (6)

| ID | Hard case | Expected state |
| --- | --- | --- |
| M-V-01 | All sources human-verified | Output `tier='unverified'`, `status='draft'`; `frame.trust` shows no inheritance edge |
| M-V-02 | Deprecated but content-unchanged source | `TrustOutcome.before === after`, `invalidationReported=false`, classification `status-transition` |
| M-V-03 | Source content-edited to remove merged material | `TrustOutcome.after='unverified'`, `invalidationReported=true`, and an `INVALIDATION` record shares the step's ordinal |
| M-V-04 | OKF-valid but dangling `okf-workspace://` alias | `phase='failed-dirty'`; `verdict.okfValid=true` while `checks.linkChecks='fail'` |
| M-V-05 | Review baselines cannot transfer to the output | Every output dependency has `hasBaseline=false`, `finding.kind='no-baseline'`; `capturedObservation.accepted===false` |
| M-V-06 | Output's inherited scope contains itself or closes a cycle | `checks.dependencyChecks='fail'` with `structuralInvalidity` non-empty, produced by `verify` and not by any earlier action |

#### Rollback (7)

| ID | Hard case | Expected state |
| --- | --- | --- |
| M-R-01 | Byte-identical restore of sources | `phase='reverted-clean'`; each restored key's `restoredHash === undo.observedHash` and its `verification` equals the snapshot's; no verification action ran |
| M-R-02 | A published redirect was already followed | `phase='reverted-with-residue'`, `settlement='reverted'`, `cleanliness='dirty'`, residue kind `redirect-followed`; distinct from `reverted-clean` |
| M-R-03 | Rollback must snapshot the current state first | Without `preRollbackEvidence` the verdict is `BLOCK` and phase stays `failed-dirty` |
| M-R-04 | Restore into a disposable location, hash-verified, else blocked | Any false conjunct → verdict `BLOCK`; `humanActionRequired` contains "neither applied nor rolled back" |
| M-R-05 | Byte-identical merge re-attempted after rollback | No `SETTLED{applied}` exists for the parent, so no spend record; a fresh `admit` with the same fingerprint reaches `manifest-durable` |
| M-R-06 | Crash with `in-flight` recorded | `phase='unknown-interrupted'`, `settlement='failed'`; `recoverInterrupted` appends `RECOVERY_REPORT{outcome:'unknown'}` and `EPOCH_ADVANCED` and no settled record |
| M-R-07 | Rollback authorization cannot rest on another machine's ledger | With an empty ledger (fresh clone), `beginRollback` still reaches `rolling-back` using only `manifest.rollbackSteps`, `INTENT.undo`, and the snapshot |

### 5.2 Split

#### Preview / admission (7)

| ID | Hard case | Expected state |
| --- | --- | --- |
| S-P-01 | Which output inherits which inbound link | Any link whose injected fate is `unassigned` → `refused`, `code=LINK_FATE_UNASSIGNED`; no inference function exists |
| S-P-02 | How `sources[]` partitions across outputs | An entry with no `ProvenanceAssignmentEntry` → `refused`, `code=PROVENANCE_UNASSIGNED`; duplication across outputs appears only if injected, and is flagged |
| S-P-03 | Output body empty, or output byte-identical to the source (really a rename) | Empty → `refused`, `code=EMPTY_OUTPUT`; byte-identical → `refused`, `code=NOT_A_SPLIT_RECLASSIFY_AS_MOVE` naming `move` as the correct operation |
| S-P-04 | Output IDs collide with each other, an existing concept, or a folder-concept prefix | `refused`, `code=DESTINATION_OCCUPIED` with the colliding ID in `detail` |
| S-P-05 | Neither output inherits a review baseline | Admitted; both outputs' dependencies `no-baseline`; no render path shows them clean |
| S-P-06 | Source is the target of an `okf-workspace://` alias | Fate table naming more than one destination for that link → `refused`, `code=ALIAS_CANNOT_FAN_OUT` |
| S-P-07 | Splitting across bundles | Unconstructible; `code=CROSS_BUNDLE_SPLIT_UNEXPRESSIBLE` |

#### Apply (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| S-A-01 | All outputs written and validated before the source is retired | I40 ordinal check; violating plan `refused` with `ORDERING_WOULD_UNMOOR_KNOWLEDGE` |
| S-A-02 | Every output explicitly draft and unverified regardless of source tier | Each `CREATE_OUTPUT` has `statusExplicit=true` and empty verification; the source's tier appears nowhere in their construction |
| S-A-03 | Link rewrites fan out to different targets per link | Each `LINK_REWRITE` step carries its own `link` and target; there is no bulk substitution step kind |
| S-A-04 | One execution for N writes + M rewrites + retirement | One `LOCKED`, one `EPOCH_ADVANCED` per bundle, one `SETTLED` |

#### Partial failure (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| S-F-01 | Output A writes, output B fails | `phase='failed-dirty'`; ambiguities `orphan-output-exists` (A listed by path) and `two-live-carriers-no-authority` |
| S-F-02 | Outputs written, source not retired | Ambiguity `two-live-carriers-no-authority`; `humanActionRequired` states the duplicates are independently editable until the retry |
| S-F-03 | Half the inbound links rewritten to A | Ambiguity `links-split-across-old-and-new`; `frame.links` shows the unrewritten half `unexpectedly-broken` |
| S-F-04 | Retry replans under the lock | `phase='expired'`; drift lines use the guard vocabulary — added to scope / content changed / planned action changed |
| S-F-05 | Rollback must restore every rewritten link byte-identically | Any `restoredHash` mismatch → `phase='rollback-failed'` with `restore-not-byte-identical` naming each linking concept |

#### Concurrent edit (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| S-C-01 | Source edited between preview and recheck | `phase='expired'`; the machine holds no pre-edit bytes, only hashes, so splitting the old content is unrepresentable |
| S-C-02 | A concurrent session creates a concept at a planned output ID | `phase='expired'` with `added to scope` drift, before any write is attempted |
| S-C-03 | Verification-only event on the source | `phase='expired'`; the abort has no conditional on whether outputs would be unverified anyway |
| S-C-04 | Our split invalidates a sibling's confirmed merge | `EPOCH_ADVANCED` before `SETTLED`; the sibling's confirmation dies at its own recheck |

#### Verification (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| S-V-01 | Source verified, both outputs draft/unverified | Both outputs `tier='unverified'`; no subset or containment rule exists |
| S-V-02 | Retained-and-edited source vs deprecated-unchanged source | `CONTENT_EDIT` → `after='unverified'` + `invalidationReported=true`; `STATUS_TRANSITION` → `before===after` |
| S-V-03 | Post-op identity/link check | In-bundle duplicate ID → `identityChecks='fail'`; cross-bundle same ID → advisory string in `findings`, checks still pass |
| S-V-04 | Output dependency mappings are separate reviewed operations | `scheduledRepairs` records old and new locators plus evidence; every source `openFindings` array is unchanged after the operation |
| S-V-05 | Sum-preservation is not checkable by validation | `checks.contentCoverage.checkableByValidation === false` and its diff appears in `humanActionRequired`; `okfValid` never stands in for coverage |

#### Rollback (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| S-R-01 | Failure partway through rollback | `phase='rollback-failed'` (not `failed-dirty`) with `rollback-partially-applied` plus the per-step reconciliation table; the only exit is a new operation (T27) |
| S-R-02 | An output was linked to or human-verified before rollback | An `OBSERVATION{output-human-verified}` exists; `beginRollback` adds the evidence-destruction acknowledgement to `humanActionRequired` and the terminal is `reverted-with-residue` with `cleanliness='dirty'` |
| S-R-03 | Redirects published from the source to both outputs | `REDIRECT_RETIRE` ordinals are below the restore of the old identity; with `redirects.mode='off'` no such step exists and the plan is shorter |
| S-R-04 | Byte-identical restoration preserves the source's trust | `reverted-clean` requires hash equality for every entry; reserialization yields `rollback-failed` |

### 5.3 Move

#### Preview / admission (8)

| ID | Hard case | Expected state |
| --- | --- | --- |
| V-P-01 | Identity change is the headline | `manifest.lineage` has a record with the old and new keys and the `continuity` literal; `frame.identityDiff` shows the old key with `after=null` |
| V-P-02 | Three inbound-link classes with different fates | Each link's fate derives from `linkForm` + `holderWritability`; class-3 links appear in `approvedBreakage` before approval |
| V-P-03 | Required federation member inactive | `refused`, `code=LINK_SET_INCOMPLETE` |
| V-P-04 | Cross-bundle move is a migration | Steps are create-at-destination then remove-at-owner; a read-only destination → `code=DESTINATION_BUNDLE_READ_ONLY`; `unknown` mode either side → `UNKNOWN_PROJECT_MODE` |
| V-P-05 | Moving the bundle root | `refused`, `code=BUNDLE_ROOT_SELF_ORPHANING`; no `Plan` variant expresses it |
| V-P-06 | Destination occupied, possibly by a redirect artifact | `refused`, `code=DESTINATION_OCCUPIED`; a redirect artifact counts as an occupant |
| V-P-07 | A third concept's review dependency names the old path | In `reviewImpact` as `unavailable` and in `scheduledRepairs`; an inline repair step → `code=REVIEW_REPAIR_PERFORMED_INLINE` |
| V-P-08 | Move plus content edit in one command | Two steps: `MOVE_PATH` (non-claim) and `CONTENT_EDIT` (claim-affecting); a single step claiming both → `code=MOVE_AND_EDIT_NOT_SEPARATED` |

#### Apply (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| V-A-01 | Write-new-then-swap, never mutate in place | Create-at-new ordinal precedes remove-at-old; after a crash between them, `reconcile` reports the removal `not-started` and the old path present |
| V-A-02 | Two ledgers, two locks | One `LOCKED` listing both bundles in canonical `ledgerKey` order; both `EPOCH_ADVANCED` records sit between the last `OUTCOME` and `SETTLED`; `frame.humanActionRequired` names the residual cross-bundle atomicity gap |
| V-A-03 | Link rewrite must stay a manifest-bound substitution | A rewrite producing bytes ≠ `afterHash` → T11 `PLAN_DEVIATION`, `failed-dirty`; it is never reclassified as claim-affecting and applied |
| V-A-04 | Index regeneration in both bundles | Two `INDEX_REGEN{directly-affected}` steps with `approvalScope='inherited'`; a broad rebuild is inadmissible |

#### Partial failure (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| V-F-01 | File moved, half the links rewritten | `failed-dirty` with `links-split-across-old-and-new`; the statement records that in-bundle Markdown links never fall through |
| V-F-02 | Links rewritten first, move fails | Unreachable: I40's ordinal rule makes the plan inadmissible |
| V-F-03 | Cross-bundle create succeeded, source delete failed | `failed-dirty` with `duplicate-identity-across-bundles` naming both fully-qualified keys and stating detection is advisory only |
| V-F-04 | Retry after a completed move | `phase='expired'`; drift contains `removed from scope: <old>` and `added to scope: <new>`; verdict is EXPIRE, not REFUSE |

#### Concurrent edit (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| V-C-01 | Inbound-link holder edited for unrelated reasons | `expired`, drift names the holder and its scope reason |
| V-C-02 | Destination directory created/moved/occupied concurrently | `expired` with `added to scope` drift at the destination path |
| V-C-03 | Moved concept gains or loses a verification event | `expired` on `verificationHash` alone |
| V-C-04 | Another session moved the concept first | `expired` with `removed from scope`; `phase !== 'refused'` |
| V-C-05 | Another worktree of the same repository | `expired` because `BundleFacts.ledgerKey` is shared by canonical identity, even though the worktree's content differs |

#### Verification (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| V-V-01 | Byte-identical move changes identity but preserves `verified` | `frame.lineage` records the identity change **and** `TrustOutcome.before === after` for the moved concept |
| V-V-02 | Each rewritten linking concept keeps `verified` | Every `LINK_REWRITE` target's `TrustOutcome.before === after`; a 40-link move produces zero invalidations |
| V-V-03 | Three link states | `frame.links` contains at least one of each of `resolves`, `knowingly-broken-approved`, `unexpectedly-broken` in the mixed fixture; only the last drives `failed-dirty` |
| V-V-04 | `unavailable` vs `unobservable` | Old-path dependency → `unavailable{oldLocator}`; inactive-member dependency → `unobservable{reason}`; the two never share a variant |
| V-V-05 | Operational review evidence separate from trust | `frame.reviewDependencies` and `frame.trust` are separate fields; the notice renders them in separate sections |

#### Rollback (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| V-R-01 | Redirect artifact occupies the old ID | Rollback ordinals place `REDIRECT_RETIRE` before the restore; with `redirects.mode='off'` the same rollback runs with that step absent |
| V-R-02 | Inbound links already committed and pushed elsewhere | That step's `escape='escaped'` (declared at admission); successful byte restore → `reverted-with-residue` with `cleanliness='dirty'`, never `reverted-clean` |
| V-R-03 | Rolling back a cross-bundle move | The inverse manifest contains its own `LineageRecord`s and requires its own `GATE`; without `freshApproval` the verdict is BLOCK |
| V-R-04 | Non-byte-identical restore | `rollback-failed` naming the moved concept and every linking concept whose `verified` would drop |
| V-R-05 | Rollback after the epoch advanced | `EPOCH_ADVANCED` present and `freshApproval === null` → BLOCK; the fresh approval must bind the exact inverse manifest, and the parent approval remains context only |

### 5.4 Supersede

#### Preview / admission (7)

| ID | Hard case | Expected state |
| --- | --- | --- |
| P-P-01 | Where the predecessor goes | With `archive.value.kind='deprecate-in-place'` the plan contains a `STATUS_TRANSITION`; with `relocate` it contains `MOVE_PATH` + lineage + the full gate. Both render the policy name and its owning ticket |
| P-P-02 | `superseded_by` / `deprecation_reason` / `retain_until` | With `supersedeEdge='none'` the machine completes with no such field written; `ConceptView` has no field to hold one |
| P-P-03 | Successor does not exist yet | Composite of `CREATE_OUTPUT` + `STATUS_TRANSITION`; successor `tier='unverified'`, `status='draft'`; the notice states it does not carry the predecessor's trust |
| P-P-04 | Chains and cycles | A closed cycle → `refused`, `code=SUPERSEDE_CYCLE`; chain depth is rendered as a number with no threshold applied |
| P-P-05 | Stable, human-verified predecessor superseded by a draft | Admitted; `manifest.visibilityIntents` records the retrieval consequence and the trust delta is rendered before approval |
| P-P-06 | Cross-bundle supersede | Successor referenced only through a `workspace-alias` link; the predecessor's step's `bundle` equals its owning bundle |
| P-P-07 | Deletion folded into supersede | The `DELETE_CONCEPT` step is rendered separately; in a knowledge-only bundle → `code=KNOWLEDGE_ONLY_DELETE_BLOCKED`, otherwise `code=DELETION_FOLDED_INTO_SUPERSEDE` unless separately gated |

#### Apply (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| P-A-01 | Successor first, then predecessor deprecation | I40 ordinal rule; the reverse ordering is inadmissible |
| P-A-02 | `stable -> deprecated` must sit inside the approved composite | The step exists in `manifest.steps`; no interactive channel exists during `mutating` |
| P-A-03 | Relocating archive policy makes the apply a move | Under `relocate` the journal contains `MOVE_PATH` and a `LineageRecord`, and the move's lock/epoch discipline applies |
| P-A-04 | Index and retrieval visibility changes | Recorded in `visibilityIntents` with `escape='observable-local'` on the `INDEX_REGEN` step; the policy is not decided |

#### Partial failure (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| P-F-01 | Predecessor deprecated, successor write failed | Not producible forward (I40), but representable: `reconcile` after a crash can yield `knowledge-live-nowhere` in `ambiguities` |
| P-F-02 | Successor written, predecessor deprecation failed | `failed-dirty` with `two-live-carriers-no-authority`; statement records that no marker says which supersedes which |
| P-F-03 | Inbound link recorded but archive relocation failed | `manifest.lineage` is reported as authoritative; the injected edge representation is flagged stale in `findings`, and lineage is unaffected |
| P-F-04 | Retry after the predecessor's status already changed | `expired` with drift `planned action changed: MODIFY -> KEEP`, not a content-hash drift |

#### Concurrent edit (4)

| ID | Hard case | Expected state |
| --- | --- | --- |
| P-C-01 | Predecessor gains human verification, content untouched | `expired` on `verificationHash` |
| P-C-02 | Another session deprecates the predecessor first | `expired` with `planned action changed` drift |
| P-C-03 | Two sessions supersede with different successors | Both admit; the lock serializes them; the winner's `EPOCH_ADVANCED` invalidates the loser's confirmation before it can write a second successor |
| P-C-04 | Successor edited by the session that authored it | `expired`; no authorship exemption exists in the recheck |

#### Verification (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| P-V-01 | Deprecation preserves the predecessor's verification | `TrustOutcome.before === after`, `invalidationReported=false` |
| P-V-02 | Successor authored verbatim from a verified predecessor | Successor `tier='unverified'`; no edge transports trust along a supersede relation |
| P-V-03 | Review baselines do not transfer | Successor dependencies `no-baseline`; preview observations remain `accepted:false` |
| P-V-04 | Supersede edge consistent and closes no cycle | With `supersedeEdge='none'`, `identityChecks` verifies that no edge artifact was written; a cycle → `identityChecks='fail'` |
| P-V-05 | Later trust promotion cannot retroactively authorize | No reducer guard reads verification; a fixture that promotes the successor changes no verdict |

#### Rollback (5)

| ID | Hard case | Expected state |
| --- | --- | --- |
| P-R-01 | Undoing a deprecation is `deprecated -> stable` | That step must be in `manifest.rollbackSteps` and the exact inverse manifest must have fresh approval; otherwise `beginRollback` → BLOCK and the phase stays `failed-dirty` |
| P-R-02 | Successor consumed in the interim | `OBSERVATION{output-human-verified \| output-superseded-in-turn}` present → `reverted-with-residue` with `cleanliness='dirty'` and the destroyed evidence enumerated in the notice |
| P-R-03 | Relocated predecessor means a reverse move | The inverse contains `MOVE_PATH` with its own lineage and its own `GATE` |
| P-R-04 | Retrieval already served the successor | `OBSERVATION{retrieval-served}` with `escape='observable-local'` → `reverted-with-residue` with `cleanliness='dirty'` |
| P-R-05 | Successor deletion recorded so a re-attempt is not a first attempt | The inverse manifest's `revertOf` names the parent `operationId` and its `UNDO_CREATE` step is journaled |

---

### 5.5 Adversarial regressions

One row per defect three adversarial passes found by *running* the machine. Each failed before its
fix. They are stated as the property that was violated, so a re-broken guard fails loudly rather
than passing a keystroke path that happens to have moved.

| ID | Property | Was |
| --- | --- | --- |
| A-01 | An expired approval cannot be re-rechecked, sealed and applied | `expired` was terminal only in the render; the stale token survived its own expiry and the operation applied in full under a phase reading `settlement=none, clean` |
| A-02 | A crashed operation cannot be verified into `applied` | `verify` read only step-completeness, which a crash leaves untouched — an edge out of the terminal I30 calls unresolvable-by-machine |
| A-03 | A concurrent write at a step target is caught by the second `observedHash` comparison | The comparison did not exist; a human-verified concept created at a planned output ID was overwritten and the operation settled `applied-clean` with an empty ambiguity set |
| A-04 | A failure in which nothing landed has nothing to roll back | The empty inverse manifest made `rolling-back` a dead end whose only accepting action was `verify`, which settled a zero-byte failure as APPLIED and spent the token the retry needs |
| A-05 | A byte-identical move is checked against the observed source, not asserted by the plan | A forged `afterHash` on a `byte-identical-path-move` minted a new Concept ID carrying `human-reviewed` over changed content |
| A-06 | A failed verification cannot be re-run until it passes | `verify` was re-entrant from `failed-dirty`; the `FAILURE` stayed in the journal and the operation settled as applied |
| A-07 | One interruption, one recovery report, one epoch advance | T21's self-loop let `recoverInterrupted` append a second `EPOCH_ADVANCED` with the same `from`, a state `checkInvariants` rejects |
| A-08 | A step whose bytes deviated is still inverted by the rollback | The inverse was built from `OUTCOME.ok` alone, so a landed-but-deviating write was dropped from the rollback and left applied under `reverted-clean` |
| A-09 | A rejected restore cannot be re-run into `reverted-clean` | A failed restore observed as `not-started`, so one keystroke converted `rollback-failed` into the cleanest terminal and emptied the ambiguity set |
| A-10 | A process that dies mid-rollback reaches the interrupted terminal | Rollback records `MANIFEST_DURABLE` before inverse writes; a crash during rollback appends `INTERRUPTED` after that record and reaches `unknown-interrupted` |
| A-11 | A settled operation is not overwritten by a later admission attempt | `REFUSED` folded into the settled segment, so the frame reported a refusal for an operation that had mutated the corpus |
| A-12 | There is no resume-from-step-N | `beginStep`/`completeStep` had no terminal guard, and only the first `OUTCOME` per ordinal was read: the effect landed, the journal recorded it, and `derive` denied it |
| A-13 | `reconcile` is scoped to the phases that can use it | Accepted from `mutating`, where it froze the step table permanently |
| A-14 | A reconcile snapshot does not freeze later journal evidence | `RECONCILED` overrode every subsequent record instead of supplying a baseline |
| A-15 | Inbound links are resolved against the forward manifest during a rollback | Every `unexpectedly-broken` link flipped to `resolves` the instant a rollback was admitted, before a byte moved |
| A-16 | Trust rows are predictions until their step lands | A `failed-clean` operation reported a lost human review, and one Concept ID touched by two steps printed two irreconcilable `after` tiers naming neither step |
| A-17 | An earlier operation's residue is not attributed to a later one | `residueOf` scanned the whole journal, relabelling a later operation `reverted-with-residue` on the strength of an already-reverted one's observation |

---

## 6. Injected inputs and open questions handed back

Every value below is an `Injected<T>` whose `ownedBy` and `openQuestion` are rendered next to each
use, so no default can be read as a decision. The machine's default run is: redirects `off`,
archive `deprecate-in-place`, and supersede edge `none`. Fresh rollback approval is a fixed safety
gate even though `rollbackAuthorization` remains an injected, open policy value for rendering.

| Injected input | Shape | Owner | Question handed back |
| --- | --- | --- | --- |
| `redirects` | `RedirectPolicy`, `off` by default; every candidate mode carries `authorization: 'blocked-pending-semantics'` | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) | Is a redirect a file, a field, an index entry, or a manifest-only record — and is it followable? Evidence this prototype adds: with redirects off, a vacated Concept ID is indistinguishable to any consumer from an ID that never existed, and all continuity lives in a manifest no corpus reader will open. The machine renders that consequence as a first-class exhibit |
| `inboundLinkFates` | table `LinkId → LinkFate` | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) | Which split output inherits which inbound link; may an `okf-workspace://` alias fan out? The machine refuses to infer, and refuses fan-out |
| `provenanceAssignment` | table `output → SourceEntry` | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) | How does `sources[]` union on merge and partition on split; what is the dedup rule for the same evidence under different locators? The machine renders the raw union plus `provenanceCollisions` |
| `InboundLinkSet` | link list + completeness flag + reasons | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24), freshness from [Define cache invalidation and freshness semantics for workspace discovery](https://github.com/artemVeduta/okf-agent-skills/issues/32) | What counts as an inbound link, how far does discovery reach, how is incompleteness declared? |
| `sourceDisposition` | `deprecate \| delete \| leave` | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) | Are merge/split sources deprecated or deleted by default? |
| `archive` | `deprecate-in-place \| relocate` | [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) | The same user intent expands into a metadata edit or a full identity-changing move. Which? |
| `supersedeEdge` | `none \| superseded_by-field \| index-entry` | [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) | What represents a supersede edge, and what archive metadata exists at all? The machine runs with none |
| `rollbackAuthorization` | `inherited-from-parent-approval \| requires-fresh-approval` | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) | May a documented rollback inherit parent approval? This branch always requires fresh approval bound to the exact inverse manifest; the policy value remains open and rendered |
| `deprecatedHiddenFromIndex` | boolean | [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) | Does deprecation have a retrieval side effect rollback cannot reverse? The machine records the intent and its escape class without deciding |
| `RecoveryEvidence` | pass/fail conjunction + snapshot handle | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) | What is the snapshot mechanism and content-addressing implementation? |
| `ValidationVerdict` + `PostOpChecks` | opaque verdict + three check groups | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) | Which identity and link checks run, and what is a passing result? |
| `OperationManifest` storage | `Injected<abstract record with a hash>` | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) | **Load-bearing gap.** The serialization and durable path remain open. The manifest must live outside every mutation target and outside the uncommitted guard ledger, and must outlive the machine that wrote it. If it lands inside the repository, ordering and recoverability weaken and this design needs revisiting. It must also be written atomically: a torn manifest with a valid-looking prefix is currently unhandled and reconciles as `indeterminate` |
| review-dependency mappings for outputs | proposed vs re-declared | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) | No baseline transfers (settled); may the mapping be proposed at all? |
| all numeric thresholds | breadth label, truncation flag | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) | Taken as injected booleans and labels, never computed numbers |

### Gaps this machine names rather than closes

1. **Cross-bundle atomicity.** Two locks and one all-or-none epoch advance still leave a window in
   which a crash leaves one bundle's ledger describing a world the other's does not. The window is
   rendered; recovery routes through the manifest rather than either ledger. No two-phase commit is
   claimed.
2. **Reconciliation cannot distinguish authorship.** A step whose observed hash equals `afterHash`
   reads as `done` whether this operation wrote it or a concurrent session produced identical bytes.
   Reconciliation records that evidence only; recovery remains human-directed and does not repair
   the corpus automatically.
3. **Escape classes are a claim about the modelled world.** A reader nobody modelled — a tailing
   agent, CI, a search index — can observe anything, so `contained` means "as far as this model
   knows". `reverted-clean` should be read accordingly.
4. **Ambiguity taxonomy completeness.** No design can prove its taxonomy exhaustive; this one
   degrades loudly instead of quietly, via `unclassified-loss` plus invariant I43.
5. **A `rollback-failed` corpus has no repair operation.** The terminal is loud, named, and
   correct — and there is nothing the machine can do next except `admit` a brand-new operation with
   its own preview and gate. Whether "repair a half-restored corpus" is an approvable operation kind
   of its own, and what preview it would show, belongs to
   [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7).
   This prototype refuses to invent one: the alternative it rejected — letting the rejected inverse
   step simply be re-run — converts the loudest terminal into the quietest with one keystroke.
6. **`rolling-back` is a clean, non-terminal window in which the corpus is at its most inconsistent.**
   Both anti-silence devices (I42's terminal-implies-notice, I43's dirty-implies-ambiguity) are off
   for its duration, and the same knowledge can be live under two fully-qualified identities inside
   it. The exit for an abandoned rollback is `crash` (T19), which reaches the dirty, loud
   `unknown-interrupted`. Whether the in-flight window itself should report, and in what vocabulary,
   is not settled here.
7. **A link whose old and new identity are both live has no resolution value.** `LinkResolution` is
   three-valued (`resolves` / `unexpectedly-broken` / `knowingly-broken-approved`), and mid-rollback
   a rewritten link can point at a new identity that is about to be retired while the old one is
   already restored. The machine resolves against the forward manifest (I47), which is honest about
   what the *operation* did, and says nothing about which of two live carriers a reader should
   follow — that is
   [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24)'s
   decision, and the `links-split-across-old-and-new` ambiguity exists to hand it back rather than
   settle it.
8. **Byte-identity is brittle.** Any tool that normalizes line endings or reserializes frontmatter
   turns an ordinary rollback into `rollback-failed`. That is correct and inconvenient, and it is a
   real cost of I9 that the graduating decision should weigh.
