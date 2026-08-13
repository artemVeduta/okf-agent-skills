---
status: draft
type: Glossary
---
# Operation Safety Glossary

**Safety gate**:
An operation-specific hard condition that must pass before an operation can
proceed or claim success. It is separate from OKF bundle conformance and may
cover identity, links, provenance, review evidence, approval, recovery, or
post-operation checks.
_Avoid_: Conformance error, warning, permission

**Calibrated profile**:
A versioned operating profile selected from held-out benchmark evidence for a
task kind and deployment seam. Outside its measured support ceiling it cannot
claim calibrated behavior; absence requires a disclosed safe fallback, not an
invented default.
_Avoid_: Universal default, tuning preset

**Support ceiling**:
The boundary in corpus scale, file count, aggregate bytes, and bundle-relative
nesting depth for which a release may claim complete and calibrated behavior.
Work outside it may be inspected, but it cannot claim completeness or
calibration. It is an inclusive claim boundary, not a hard read limit.
_Avoid_: Maximum repository size, hard repository limit

**Growth signal**:
A measured observation of maintenance or retrieval pressure that may report a
condition or recommend manual review or compaction. It is not permission for
automatic archive, deletion, compaction, or rewrite.
_Avoid_: Compaction trigger, automatic threshold

**Compaction**:
A manual, recovery-gated, lossless operation on selected derived artifacts,
such as indexes or link-maintenance data. It does not summarize, merge,
deduplicate, delete, relocate, or change authored concept meaning.
_Avoid_: Cleanup, summarization, automatic optimization

**Operation manifest**:
The sealed durable record of the approved plan and identity of one broad,
destructive, or identity-changing operation, stored outside mutation targets
and the manual-operation guard ledger and covered by the approval fingerprint.
It is atomically published and immutable thereafter; it carries no checkpoint,
resume state, or later observation, and it is not OKF content, a workspace
manifest, or a confirmation token.
_Avoid_: Observation journal, workspace manifest, guard ledger, temporary plan,
backup

**Observation journal**:
The append-only record of one operation's intents, outcomes, and later
observations, stored beside its operation manifest. Recovery, resume, and
derived phase and terminal classification read the journal; it never amends the
sealed plan and is not OKF content.
_Avoid_: Operation manifest, checkpoint file, activity log

**Dry-run preview**:
The complete enumerated statement of an operation's intended effects presented
for human confirmation, whose completeness is explicit data rather than an
inferred property. It lasts only until its confirmation expires; it does not
grant approval, and it is neither the sealed operation manifest nor the
observation journal.
_Avoid_: Operation manifest, plan record, confirmation token

**Recovery evidence**:
The conjunction of an independent snapshot, a verified disposable restore,
content identity checks, applicable conformance and operation checks,
rollback instructions, and post-operation validation. A backup that exists
but cannot be restored and verified is not recovery evidence.
_Avoid_: Backup, Git history, rollback assumption

**Rollback residue**:
A non-reversible external effect that remains after rollback. Its presence
makes the operation result dirty or indeterminate, never clean.
_Avoid_: Successful rollback, clean recovery

**Review-dependency proposal**:
A non-authoritative mapping suggested for a restructuring output. It requires
explicit review before acceptance and never transfers a review baseline.
_Avoid_: Automatic review inheritance, baseline transfer

**Validation verdict**:
The pass or fail outcome of one individual check run during lifecycle,
post-operation, or post-write validation. A verdict is never itself the
lifecycle result: the runtime aggregates every reachable verdict into the
write's lifecycle result and its `data.validation` aggregate state. Its
exact schema is an open item; only the constraint that each check carries
an observable pass or fail outcome is settled.
_Avoid_: Lifecycle result, post-operation checks, post-write validation
checks, orientation result

**Post-operation checks**:
The enumerated checks — OKF conformance, suite checks, identity, link,
provenance, trust, and validation bound to the approved plan — that run
after an operation to support a claim that it succeeded. Each carries an
observable pass and fail condition; their exact schema is an open item.
_Avoid_: Recovery evidence, validation verdict, required checks, post-write
validation checks

**Post-write validation checks**:
The boundary `validation.postWrite` runs against the primary saved concept
immediately after a bounded write publishes it. It is narrower than
post-operation checks because it validates the primary concept only.
_Avoid_: Post-operation checks, validation verdict, pre-write gate

**Settlement**:
One of the two independent axes of terminal classification, with the values
`applied`, `reverted`, or `failed`. It is crossed with cleanliness to produce
the full terminal result.
_Avoid_: Cleanliness, lifecycle result

**Cleanliness**:
The other axis of terminal classification, with the values `clean` or
`dirty`. A dirty terminal carries an ambiguity or residue notice; rollback
residue always forces a dirty or indeterminate result, never clean.
_Avoid_: Settlement, rollback residue

**Residue classification**:
The taxonomy that names the kind of ambiguity or residue a dirty terminal
carries, so that even a loss the taxonomy does not otherwise recognize is
still classified — as `unclassified-loss` — rather than omitted.
_Avoid_: Rollback residue, cleanliness

**Bundle-move orphan state**:
The undecided status of an in-flight operation whose target bundle identity
changes because its bundle root moved mid-operation. Whether such an
operation is reconciled, orphaned and blocked, or discarded is an open item;
the case is declared open rather than resolved by guesswork.
_Avoid_: Bundle identity, source disposition

**Canonical lock order**:
The deterministic order in which a cross-repository operation must acquire
the guard-ledger lock for each affected bundle, so two repositories cannot
deadlock or execute simultaneously. Its exact ordering algorithm and key are
an open item.
_Avoid_: Ledger concurrency, exclusive per-bundle lock
