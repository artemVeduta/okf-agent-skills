---
status: draft
type: Glossary
---
# Operation Ledger Glossary

**Operation identity**:
The identifier that binds one operation's preview, approval, and execution
together so a stale or replayed approval cannot attach to a different
operation. A delegation receipt reports it alongside target identity.
_Avoid_: Operation class, target identity, Concept ID

**Operation class**:
The category the runtime assigns to a command or delegated request — such as
a bounded write versus a broad, destructive, or identity-changing operation —
that determines its authorization requirements. A delegated writer rechecks
it before execution and never downgrades a broad effect to a bounded update.
_Avoid_: Task kind, atomic effect, invocation class

**Atomic effect**:
The smallest unit a command or composite operation expands into before
authorization is decided. The runtime looks up each atomic effect's outcome —
`blocked`, `preview/approval`, `notice`, or `allowed` — in the operation
matrix, and a composite operation receives the strictest outcome across its
atomic effects.
_Avoid_: Operation class, command, effect group

**Approval record**:
The per-repository record inside an approval that binds repository identity
and revisions, resulting content identity, the operation hash and policy
hash, the grant generation, the required checks, and recovery evidence. A
cross-repository approval carries one approval record for each affected
repository.
_Avoid_: Approval fingerprint, operation manifest, approval

**Approval fingerprint**:
The value that seals an approval to the exact plan it covers — request,
revisions, sealed manifest, policy, checks, and recovery evidence — so the
sealed operation manifest stays immutable inside it. The exact hash encoding
it takes from the operation manifest is an open item.
_Avoid_: Approval record, confirmation fingerprint, operation hash

**Policy hash**:
The hash an approval record binds alongside the operation hash, capturing the
policy state under which an operation was authorized so a later change to
governing policy invalidates the approval.
_Avoid_: Operation hash, approval fingerprint

**Required checks**:
The specific set of checks — such as approval and guard checks — that an
approval record or delegation brief designates as necessary for its
operation, so no unlisted check can be silently skipped. It is distinct from
post-operation checks, which run after execution rather than gate it.
_Avoid_: Post-operation checks, recovery evidence

**Manual-operation occurrence**:
One logical instance of a manual-operation request-preview-confirm-execute
cycle, distinct from an orientation occurrence, a native harness event, and a
prompt. Guard state binds a distinct occurrence-bound preview token to each
such occurrence, so repeated matching requests receive distinct token IDs.
_Avoid_: Orientation occurrence, native harness event, preview token

**Bundle epoch**:
A per-bundle counter that a completed guarded operation advances, obsoleting
every outstanding sibling confirmation so a second armed session cannot
execute against a changed bundle. Preview, approval, and execution stay bound
to one bundle epoch alongside one operation identity and one guard
generation.
_Avoid_: Ledger generation, schema version, review baseline

**Ledger generation**:
The manual-operation guard ledger's own generation counter, initialized at
random when ledger state is missing. Execution rejects a mismatched
generation, catching staleness that a bundle-epoch check alone would miss.
_Avoid_: Bundle epoch, authority generation, schema version

**Preview token**:
The single-use, occurrence-bound token issued for one manual-operation
request, carrying its plan and attestation in the guard ledger. It authorizes
at most one run and is spent atomically on successful execution.
_Avoid_: Confirmation, approval record, spent record

**Spent record**:
The bounded record a guard ledger retains after a preview token is spent,
containing the token occurrence ID, the fingerprint, and the execution epoch.
The ledger keeps only the record from the immediately preceding epoch and
prunes older ones, rather than keeping a permanent fingerprint blacklist.
_Avoid_: Preview token, permanent fingerprint blacklist

**Invocation attestation**:
The three-valued injected input — `explicit`, `model-initiated`, or
`unknown` — recorded for every manual-operation confirmation, stating what is
actually known about whether a human invoked or confirmed the operation. An
`unknown` attestation proceeds but never claims explicit human action.
_Avoid_: Invocation class, approval, human verification

**Operation store**:
The durable operation store that holds the sealed operation manifest and its
observation journal outside every mutation target and outside every
manual-operation guard ledger. It outlives the process and machine that
created it and survives repository replacement; its exact filesystem
location is an open item.
_Avoid_: Operation manifest, manual-operation guard ledger, workspace
manifest

**Schema version**:
The version field a durable record — the operation store or the
manual-operation guard ledger — carries for its own on-disk format, so a
reader can fail closed on an unsupported version. It is independent of the
OKF specification version, the suite release version, and the `okf_version:
"0.2"` bundle-root declaration; its exact value and accepted set are open
items.
_Avoid_: OKF specification version, suite release version, bundle
conformance

**Retention window**:
How long a settled operation's manifest and journal remain in the operation
store before removal. No ticket states a period or a pruning mechanism; it is
an open item distinct from the guard ledger's spent-record retention rule.
_Avoid_: Recovery window, spent record retention

**Snapshot handle**:
The reference by which a stored independent recovery snapshot is located and
retrieved for a disposable restore. Its storage location and capture
mechanism are open items; only the constraint that it must not reserialize
content is settled.
_Avoid_: Recovery evidence, operation manifest

**Recovery window**:
The span for which a captured recovery snapshot must remain available so an
operation stays recoverable. The event that ends this span — when a snapshot
may be discarded — is an open item.
_Avoid_: Retention window, recovery evidence
