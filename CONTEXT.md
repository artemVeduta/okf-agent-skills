# OKF Agent Skills

This context defines the language used to design lifecycle-aware agent skills
for Open Knowledge Format documentation.

## Language

**Code-backed project**:
A project in which executable behavior is represented by code. Code is
authoritative for that behavior, while OKF records durable context that cannot
be recovered adequately from the code.
_Avoid_: Code project

**Knowledge-only project**:
A project whose durable knowledge is represented entirely by documents rather
than executable code. Its OKF bundle is the complete source of truth.
_Avoid_: Obsidian project, docs-only repository

**Durable context**:
Knowledge that should remain available across agent sessions because it
clarifies domain language, intent, rationale, constraints, invariants, or
workflows without duplicating implementation.
_Avoid_: Documentation of the code, prose mirror

**Automatic lifecycle**:
The recurring behavior through which an agent consults relevant OKF knowledge
and maintains small, evidence-backed documentation changes while doing normal
project work.
_Avoid_: Automatic full sync

**Project mode**:
The explicit authority model of an affected bundle: code-backed or
knowledge-only. It identifies which source is authoritative for durable
knowledge and does not grant trust, access, write ownership, approval, or
permission.
_Avoid_: Repository-wide assumption, trust tier, permission level

**Task kind**:
The primary user intent that selects lifecycle context and behavior: feature
work, fix, debugging, exploration, research, review, or pre-PR synchronization.
It is not inferred from file events; a phase transition can change it.
_Avoid_: File-event category, lifecycle state, command type

**Lifecycle moment**:
A point in a work episode at which automatic lifecycle behavior consults
context, evaluates evidence, validates a mutation, or reports an outcome. It
is not a concept status or a synchronization run.
_Avoid_: Session-start synchronization, concept lifecycle state

**Evidence-backed update**:
A bounded change to durable context supported by authoritative or explicitly
adopted evidence, clear ownership, and post-write validation. It does not
automatically alter trust, status, freshness, or review baselines.
_Avoid_: Source change, automatic repair, documentation mirror

**Scoped synchronization**:
Reconciliation of authoritative evidence and durable context within an
explicit scope. Incremental, diff-scoped, and full-project synchronization
have different safeguards; synchronization is not mirroring.
_Avoid_: Automatic full sync, bidirectional replication

**Trust tier**:
An advisory classification of the verification evidence recorded for a
concept. A trust tier does not grant authority to mutate the concept; operation
risk and project mode determine the required safeguards.
_Avoid_: Permission level, operator trust

**OKF specification version**:
The upstream Open Knowledge Format version, such as v0.2, that defines format
semantics. It is independent of the suite release version.
_Avoid_: Format release, suite version

**Suite release version**:
The version of `okf-agent-skills`, such as v0.1.0. It records which reviewed OKF
specification revision the product implements but does not name the format.
_Avoid_: OKF version, specification version

**Bundle conformance**:
Satisfaction of the structural tests defined by an identified OKF
specification version. Product policy and migration fidelity are separate.
_Avoid_: Overall validity, suite compatibility

**Producer obligation**:
An OKF requirement governing authored content or producer behavior that is not
necessarily a bundle-conformance test.
_Avoid_: Conformance test, product rule

**Consumer tolerance**:
Required or recommended behavior when reading optional, unknown, legacy, or
broken OKF content without treating that content as a mutation target.
_Avoid_: Automatic repair, conformance waiver

**Suite profile**:
The two rules `okf-agent-skills` imposes beyond OKF conformance: mutation
requires an exact `okf_version: "0.2"` bundle-root declaration, and a rewrite
must reproduce the frontmatter's parsed semantics through the suite's own
writer. Reported with origin `suite`, never as an OKF conformance error.
_Avoid_: OKF conformance, product extension

**Activation marker**:
The explicit project-local `.okf-active` marker at a Git worktree root that
selects whether harness adapters provide automatic OKF behavior. It does not
grant trust, authority, access, write ownership, approval, or permission.
_Avoid_: Authorization marker, permission flag, automatic setup

**Harness adapter**:
The harness-specific integration layer that invokes and presents the shared
skills and runtime through native plugins, hooks, or session seams. It does
not redefine shared authority, trust, or mutation rules.
_Avoid_: Separate runtime, harness-specific semantics

**Semantic parity**:
Agreement across harnesses on shared runtime decisions and safety outcomes
while allowing different native triggers, configuration, and presentation.
_Avoid_: Identical harness behavior, feature parity

**Orientation context**:
A bounded, read-only summary emitted at a supported session-entry seam after
activation checks. It provides navigation and status only; it does not infer
task intent, perform task-specific retrieval, or mutate OKF content.
_Avoid_: Session-start synchronization, automatic context sync

**Semantic preservation**:
Retention of YAML key names, scalar types and values, sequence order, and
mapping structure without promising preservation of comments or formatting.
_Avoid_: Lexical preservation, byte-for-byte round trip

**Repository instance identity**:
The local identity of one repository or non-repository workspace instance to
which trust attaches. Moving an instance preserves trust; a fresh clone or
replacement is a different instance.
_Avoid_: Trusted path, repository lineage

**Repository lineage identity**:
The routing identity shared by clones of one logical VCS repository. It does
not grant trust, and an independently owned fork has a different lineage.
_Avoid_: Repository instance identity, permission

**Bundle identity**:
The identity of a knowledge bundle formed from its owner identity and its
bundle-root path. Moving the bundle root changes its identity.
_Avoid_: Bundle name, filesystem path alone

**Federation**:
Read-time composition of explicitly admitted bundles that retain independent
identity and ownership. Federation does not merge concepts or grant write
authority across repositories.
_Avoid_: Workspace merge, shared write scope

**Workspace manifest**:
The user-authored `.okf-workspace.json` federation declaration whose containing
directory is the workspace root, and of which exactly one is active. It names
which bundles may be read and under which aliases; it does not grant trust,
filesystem access, discovery authority, or write ownership, and it records no
operation.
_Avoid_: Operation manifest, trust store, permission file

**Bundle admission**:
The bundle-level decision on whether a candidate bundle may be read, taken in
the fixed order of reach, presence, then trust and access. It classifies
candidates and does not locate, rank, or read concepts.
_Avoid_: Discovery, workspace discovery, access grant

**Concept discovery**:
The location of candidate concepts inside a bundle that bundle admission
already admitted. It cannot widen bundle admission, and it does not grant
trust, access, write ownership, approval, or permission.
_Avoid_: Discovery, admission, bundle admission

**Notional cold-work charge**:
A versioned conservative measure of the bundle-admission work a resolution
would perform without cache hits. It determines the work frontier so cache
state cannot change which scopes are examined, and it does not govern concept
discovery, which never shares its budget. Pending supersession by the adopted
index-navigation retrieval model.
_Avoid_: Actual work, cache-adjusted budget

**Observed execution work**:
The resources actually consumed while resolving a bundle admission, including
cache hits and misses. It supports telemetry and hard resource protection but
never widens the frontier set by the notional cold-work charge. Pending
supersession by the adopted index-navigation retrieval model.
_Avoid_: Discovery allowance, notional work

**Provenance source**:
An authored OKF `sources` entry identifying evidence that supports a concept.
It does not by itself assert that a change to the source makes the concept
semantically stale.
_Avoid_: Freshness dependency, watched file

**Review dependency**:
An operationally tracked artifact or scope whose change is evidence that a
concept may need review. It is distinct from authored provenance and does not
make a semantic-freshness claim.
_Avoid_: Provenance source, proof of staleness

**Review baseline**:
The accepted content identity of a concept's review dependencies at the time of
an evidence-backed review. Later observations are compared with this baseline;
repository history and file timestamps do not define it.
_Avoid_: Git baseline, last concept edit

**Migration**:
A manual conversion of explicitly selected source material into an OKF bundle.
It is not automatic lifecycle synchronization and does not silently discard or
invent meaning.
_Avoid_: Automatic import, full synchronization

**Migration residue**:
Source material that cannot be safely represented as OKF semantics. It remains
visible and inert with an operational report; it is not active concept meaning.
_Avoid_: Lost content, active extension

**Semantic fidelity**:
Evidence that migrated content retains the intended user-authored meaning.
Structural conformance and successful file conversion do not establish it.
_Avoid_: Conformance, migration success

**Manual-operation guard ledger**:
Local, uncommitted, bundle-scoped safety state that binds preview confirmations
to a ledger generation and bundle epoch, prevents token replay, and coordinates
manual operation execution. It is neither OKF content nor harness session state.
_Avoid_: Bundle metadata, confirmation cache

**Inbound link**:
A parsed, resolvable path reference to a concept, carried by a Markdown link, a
path-valued frontmatter field, an index entry, or a workspace link. A path
written in prose or inside code is not an inbound link.
_Avoid_: Backlink, reference, mention

**Link resolution**:
The verdict on whether an inbound link reaches its target, decided only by
whether the target file exists. Concept status is not an input, so the verdict
is independent of what a retrieval budget observed.
_Avoid_: Link validation, link health

**Source disposition**:
The terminal fate of a concept that a merge or split consumed. It is determined
by project mode rather than chosen per operation.
_Avoid_: Cleanup policy, source handling

**Provenance assignment**:
The record of which provenance sources each restructuring output carries. It is
derived from the footnote attribution key of the retained body, and a source
that no output cites is assigned explicitly rather than inferred.
_Avoid_: Source inheritance, provenance merge

**In-place deprecation**:
An archive operation that retains a concept at its current path and marks it
deprecated. It preserves bundle-relative identity and path-based link
resolution.
_Avoid_: Relocation, deletion

**Relocation**:
An archive operation that moves a concept to a different path. It changes the
bundle-relative identity; references to the old path need explicit handling.
_Avoid_: In-place deprecation, redirect

**Successor notice**:
Visible Markdown in a deprecated concept that links readers to a known
replacement. It is navigation, not a redirect, identity continuity, or a
machine-parsed relationship.
_Avoid_: Supersede edge, redirect, index-only metadata

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
The measured boundary of corpus, syntax, tokenizer, serializer, renderer, and
adapter conditions for which a profile may claim calibrated behavior. Work
outside it may be inspected, but it cannot claim completeness or calibration.
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
