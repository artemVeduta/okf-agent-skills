# Unresolved Contracts for Issue #7

**Date:** 2026-08-01  
**Source:** [Issue #7](https://github.com/artemVeduta/okf-agent-skills/issues/7), with issues [#24](https://github.com/artemVeduta/okf-agent-skills/issues/24), [#29](https://github.com/artemVeduta/okf-agent-skills/issues/29), [#30](https://github.com/artemVeduta/okf-agent-skills/issues/30), and [#31](https://github.com/artemVeduta/okf-agent-skills/issues/31)  
**Method:** Read-only review of issue bodies, resolution comments, and the two throwaway prototypes  
**Evidence status:** Project issue resolutions are evidence of current design constraints. The defaults below are analyst recommendations only. They are not adopted decisions.

## Scope

This note isolates the open contracts that the evidence assigns to #7. It does not reopen decisions already made by the four inspected issues.

The guard contract is fixed by [#29's correction](https://github.com/artemVeduta/okf-agent-skills/issues/29#issuecomment-5088276054): a matching explicit request, a complete preview, a content-bound single-use token, and a fresh execute-time check are required. The persistence and session protocol is fixed by [#31's resolution](https://github.com/artemVeduta/okf-agent-skills/issues/31#issuecomment-5140954862): the guard ledger is local, uncommitted, separate from the bundle and harness session storage, and execution holds an exclusive lock.

The restructuring mechanics are also fixed, but their external contracts are not. [#30's resolution](https://github.com/artemVeduta/okf-agent-skills/issues/30#issuecomment-5145251842) fixes durable lineage before mutation, `INTENT`/`OUTCOME` ordering, per-step observed-hash checks, inverse construction from what landed, and loud interrupted or rollback-failed terminals. [#24's resolution](https://github.com/artemVeduta/okf-agent-skills/issues/24#issuecomment-5148451276) fixes no redirects, no cross-bundle merge or split, total inbound-link fates, footnote-derived provenance, and the source-collision rules.

## Open Contracts

### 1. Operation-manifest storage and publication

**Open question.** What durable store and serialization protocol holds the sealed operation manifest and its observation journal? The manifest must be outside every mutation target, outside the #31 guard ledger, durable after the writing process exits, and atomically published. The behavior for a torn or newer manifest is still unspecified.

**Evidence:** [#7's carried gap](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), [#30's owner table in `DESIGN.md`](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md), [#30's resolution](https://github.com/artemVeduta/okf-agent-skills/issues/30#issuecomment-5145251842).

**Recommended default, proposal only.** Use a suite-owned durable operation store keyed by repository instance and bundle identity, separate from both the mutation targets and the guard ledger. It must survive process and host restart; if host loss is in scope, #7 must explicitly choose replication or export. Publish a complete versioned manifest with a temporary file, flush, atomic replace, and parent-directory flush; record `MANIFEST_DURABLE` only after that point. Keep observations in a separate append-only journal. Treat missing, torn, corrupt, or newer-schema data as `indeterminate` and fail closed; never recover from a valid-looking prefix.

### 2. Snapshot, restore, and content identity

**Open question.** What exact bytes and paths belong in a recovery snapshot? Which content-addressing and restore mechanism is authoritative? How is snapshot completeness proved, and when may the snapshot be discarded?

**Evidence:** [#11's recovery floor](https://github.com/artemVeduta/okf-agent-skills/issues/11#issuecomment-5095805413), [#7's snapshot gap](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), and the bytes-only `SnapshotEntry`/`restoreFrom` model in [the #30 prototype](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md).

**Recommended default, proposal only.** For broad, destructive, or identity-changing work, create an immutable cryptographically content-addressed snapshot outside the mutation targets and guard ledger. Enumerate every affected path, including relevant untracked or uniquely stored knowledge, and retain exact bytes and existence state. Restore into a disposable location before approval, compare exact content hashes, bind the snapshot handle and evidence hash to the approved manifest, and retain the snapshot until settlement and the recovery window are closed. Do not use Git history, reflogs, or reserialization as the snapshot.

### 3. Validation verdict and post-operation checks

**Open question.** Which checks make up `ValidationVerdict` and `PostOpChecks`, and what is a passing result? The prototype exposes `okfValid`, identity checks, link checks, dependency checks, and findings, but deliberately leaves their semantics to #7.

**Evidence:** [#7's validation gap](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), the opaque types and transition rules in [the #30 prototype](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md), [#24's link and provenance decisions](https://github.com/artemVeduta/okf-agent-skills/issues/24#issuecomment-5148451276), and [#12's review-dependency findings](https://github.com/artemVeduta/okf-agent-skills/issues/12#issuecomment-5125579589).

**Recommended default, proposal only.** Make the verdict a typed, manifest-bound result with separate OKF conformance, suite-policy, identity/lineage, inbound-link, provenance/conflict, review-dependency, snapshot/restore, and residue checks. Require every applicable hard check to pass. Treat incomplete or unobservable required evidence, unexpected broken links, foreign mutations, non-byte-identical restore, and unclassified loss as blocking or indeterminate. Keep approved breakage as a separate named terminal and keep optional warnings separate from conformance failures. Link resolution should continue to use file existence only, as #24 decided; validation must not claim semantic equivalence that its checks cannot prove.

### 4. Crash recovery and reconciliation

**Open question.** What does the next process do for each crash point, especially a missing or torn manifest, an `INTENT` without `OUTCOME`, a partially landed inverse, or a valid manifest with ambiguous filesystem state? Which recovery actions only clear safety state, and which are corpus mutations?

**Evidence:** [#30's crash and reconciliation transitions](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md), [#7's torn-manifest and recovery questions](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), and [#31's interrupted-execution rule](https://github.com/artemVeduta/okf-agent-skills/issues/31#issuecomment-5140954862).

**Recommended default, proposal only.** On restart, accept only a valid durable manifest and journal. Reconcile each step against its before and after hashes and report `not-started`, `done`, `indeterminate`, or `foreign`; do not treat reconciliation as a permanent journal override. A missing or malformed record, an `INTENT` without a trustworthy outcome, or a foreign state produces `unknown-interrupted`/`indeterminate`, blocks corpus mutation, clears or invalidates outstanding approvals, and requires a fresh operation. State-only recovery may record the unknown outcome and advance the epoch, but must not assume success or perform rollback.

### 5. Rollback authorization and inverse execution

**Open question.** Does a documented rollback inherit the parent approval, or does it require a new approval? What snapshot, validation, and policy checks apply before and after rollback?

**Evidence:** [#7's `rollbackAuthorization` gap](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), [#30's inverse and rollback transitions](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md), and [#29's explicit boundary](https://github.com/artemVeduta/okf-agent-skills/issues/29#issuecomment-5085168068).

**Recommended default, proposal only.** Require a fresh explicit request, complete preview, approval, current-state snapshot, restore test, and recovery gate for every rollback. Build the inverse from what actually landed, not from the original plan, and verify exact restored bytes. Never reuse a spent token; after an epoch advance, fresh approval is mandatory. A rollback with no landed effects should refuse as a no-op rather than create a new rollback segment.

### 6. Repair after `rollback-failed`

**Open question.** Is repair of a half-restored corpus an operation kind? If yes, what preview does it show, how does it prove scope, and what approval and recovery evidence does it require? The prototype rejects silently re-running the failed inverse step.

**Evidence:** [#7's repair-authorization question](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), [#30's `rollback-failed` transition](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md), and [#31's fail-closed interrupted state](https://github.com/artemVeduta/okf-agent-skills/issues/31#issuecomment-5140954862).

**Recommended default, proposal only.** Do not add an automatic repair or inverse-retry path. Keep `rollback-failed` loud and terminal. If repair is supported, model it as a new manual operation with a complete plan of the current divergent paths, a fresh snapshot, fresh approval, fresh recovery evidence, and no authority from the old token or manifest. Otherwise provide read-only recovery instructions and require an operator to start a normal new operation.

### 7. Conflict and concurrent-edit verdicts

**Open question.** The mechanics identify conflicts, but #7 must define their validation and notice surface: which findings are `EXPIRE`, `BLOCK`, failed-dirty, known breakage, or indeterminate, and whether an identical-byte concurrent write is reported as success or degraded evidence.

**Evidence:** [#29's content-bound drift rules](https://github.com/artemVeduta/okf-agent-skills/issues/29#issuecomment-5085168068), [#30's second observed-hash check and accepted authorship ambiguity](https://github.com/artemVeduta/okf-agent-skills/issues/30#issuecomment-5145251842), [#31's exclusive execution lock](https://github.com/artemVeduta/okf-agent-skills/issues/31#issuecomment-5140954862), and [#24's source-conflict rules](https://github.com/artemVeduta/okf-agent-skills/issues/24#issuecomment-5148451276).

**Recommended default, proposal only.** Preserve the prototype behavior: drift before the first effect expires the confirmation and requires a fresh preview; content or verification drift at an effect aborts the whole operation and records `foreign-mutation-in-scope`; never drop the changed item, auto-merge, or retry in place. Treat a same-byte foreign write as hash-complete but report that authorship was not proven. Keep #24's `same-id-different-resource` block, `same-resource-different-id` notice, and cross-bundle merge prohibition unchanged.

### 8. Review-dependency mappings for restructuring outputs

**Open question.** May a merge or split preview propose review-dependency mappings for its outputs? If so, can the operation accept a baseline or repair a mapping inline?

**Evidence:** [#7's carried review-mapping gap](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5145259542), [#30's `ScheduledRepair` model](https://github.com/artemVeduta/okf-agent-skills/blob/prototype/concept-restructuring/prototypes/concept-restructuring/DESIGN.md), and [#12's baseline rules](https://github.com/artemVeduta/okf-agent-skills/issues/12#issuecomment-5125579589).

**Recommended default, proposal only.** Allow a mapping proposal only as visible, manifest-bound preview data. Never transfer or accept a review baseline during restructuring, and never perform a mapping repair inline. The output starts with no baseline and remains review-needed until a separate evidence-backed review accepts the mapping.

## Not Covered

Issue #7 still owns the numeric tolerances, work/reserve profiles, evidence-sufficiency thresholds, notice caps, fallback allowances, calibration execution, and selected retrieval defaults carried from [#13](https://github.com/artemVeduta/okf-agent-skills/issues/7#issuecomment-5096880366). This note does not infer values for them from the four inspected issues.
