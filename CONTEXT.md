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
project work. This behavior reaches the wrapper as an explicit invocation,
never an automatic invocation: the agent, not an adapter or hook, sends the
request.
_Avoid_: Automatic full sync, automatic invocation

**Explicit invocation**:
A deliberate wrapper process request, carried as `invocation: "explicit"` on
the request. It is the value an agent sends for lifecycle synchronization it
selects during an established user task, whether narrow (incremental) or
requested by name (reconciliation). Model or parent-skill routing does not
change it to an automatic invocation. It does not attest that a human
directly approved the mutation.
_Avoid_: Invocation class, invocation attestation, human approval

**Automatic invocation**:
A wrapper request an adapter or hook emits on its own, carried as
`invocation: "automatic"`. It stays read-only: an automatic `okf-lifecycle`
`sync` request returns `AUTOMATIC_MUTATION_BLOCKED`, even when its evidence
and scope are otherwise valid.
_Avoid_: Invocation class, invocation attestation, model-invoked

**Project mode**:
The explicit authority model of an affected bundle: code-backed or
knowledge-only. It identifies which source is authoritative for durable
knowledge and does not grant trust, access, write ownership, approval, or
permission. An unknown mode permits reading and validation but blocks
mutation.
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
grant trust, authority, access, write ownership, approval, or permission. A
cross-repository operation requires valid markers in both affected worktrees.
_Avoid_: Authorization marker, permission flag, automatic setup

**Harness adapter**:
The harness-specific integration layer that invokes and presents the shared
skills and runtime through native plugins, hooks, or session seams. It does
not redefine shared authority, trust, or mutation rules.
_Avoid_: Separate runtime, harness-specific semantics

**Skill wrapper script**:
The thin per-skill process entry under `scripts/` that imports shared modules,
accepts one JSON request on standard input, and emits one canonical response on
standard output. It does not define authority, approval, or mutation policy.
_Avoid_: CLI, router, independent runtime

**Invocation class**:
The classification of how a request may reach its owning skill: `Model-invoked`,
`User-invoked`, `Model-or-user-invoked`, `Inherited from parent`, or `Not
invocable`. It does not grant permission, authority, approval, trust, or access.
_Avoid_: Permission level, execution preference, task kind

**Reach clause**:
Routing metadata in a skill description that states when another skill must
invoke that skill. A router dispatch counts as skill-to-skill invocation. It is
not a permission, scope declaration, admission gate, or authority grant.
_Avoid_: Bundle REACH gate, permission clause, trigger guarantee

**Wrapper response**:
The one canonical JSON object emitted by a skill wrapper. It carries the
protocol, skill, operation, result, scope, evidence limits, operation data,
findings, and next action. A valid refusal is a response, not a process error.
_Avoid_: Tool result, approval record, observation journal

**Wrapper exit code**:
The process transport result of a wrapper: `0` for any valid response, `64` for
invalid input, and `70` for an internal failure that also emits a complete
`failed/incomplete` response. It does not encode an OKF result or approval.
_Avoid_: OKF status, finding code, permission result

**Wrapper error stream**:
The wrapper's diagnostic-only `stderr` channel for invalid input and internal
failure. It is empty for valid domain responses and does not carry results,
findings, approval, authority, or operation-success claims.
_Avoid_: Semantic result channel, audit log, approval channel

**Semantic parity**:
Agreement across harnesses on shared runtime decisions and safety outcomes
while allowing different native triggers, configuration, and presentation.
_Avoid_: Identical harness behavior, feature parity

**Delegation**:
The explicit choice by a main session to assign bounded work to a separate agent
under a delegation brief. It changes execution placement, not project mode,
admission, trust, access, authority, approval, recovery, or guard state.
_Avoid_: Authority transfer, automatic sub-agent execution

**Delegation brief**:
The immutable bounded instruction set passed from a main session to a delegated
agent. It names the task kind, operation class, target identities, allowed and
forbidden effects, observed evidence, required gates, effective settings, and
expected result. It does not grant authority or approval.
_Avoid_: Prompt fragment, permission grant, approval token

**Agent definition**:
The shipped role contract for a delegated agent. It states the required skill,
tool allowlist, forbidden effects, delegation-brief rules, and result contract.
It is inert until explicit use and does not grant authority.
_Avoid_: Permission grant, active worker, harness policy

**Reader agent**:
A delegated agent restricted to admitted read and search work. It returns
observed evidence and cannot mutate OKF content.
_Avoid_: Retrieval backend, writer agent

**Writer agent**:
A delegated leaf agent that may read admitted evidence and execute bounded OKF
writes through the shared runtime and guard under an explicit delegation brief.
It cannot create agents, broaden authority, mutate from automatic hooks, or
execute broad manual operations under this role.
_Avoid_: Automatic writer, authority holder, unrestricted sub-agent

**Execution preference**:
A user setting that chooses `inline` or `delegated` placement for eligible reads
or bounded writes. It does not change safety or authority and remains below the
shared rules. Retained design for a later release; see the #91 narrowing in
`docs/spec/okf-agent-skills-v0.1.0-completion.md`. (#91)
_Avoid_: Permission setting, policy override

**Delegation receipt**:
The structured result returned by a delegated operation. It records status,
operation and target identity, requested and actual effects, observed evidence,
validation, residue, and the next action. It is not approval, an operation
manifest, or an observation journal.
_Avoid_: Completion claim, audit log

**Orientation context**:
A fixed-schema, bounded, read-only summary emitted at a supported session-entry
seam after activation and admission checks. It provides navigation and status
only; it contains no full index or concept body, does not infer task intent,
perform task-specific retrieval, or mutate OKF content. Each child context gets
a fresh orientation rather than inheriting a parent result.
_Avoid_: Session-start synchronization, automatic context sync

**Orientation occurrence**:
A logical re-entry for which a harness adapter may make at most one orientation
attempt. It is distinct from a native harness event, a prompt, and a
manual-operation occurrence. Its identity does not grant authority or approval.
_Avoid_: Session event, prompt event, operation occurrence

**Orientation result**:
The reported outcome of an orientation attempt or automatic no-op. It can show
that the project is not configured, the required scope is invalid or
unavailable, the seam is degraded or the attempt failed, or the orientation is
clean. A non-clean result never asserts clean evidence or permits mutation.
_Avoid_: Concept status, operation result, approval result

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
identity and ownership. Federation does not merge concepts or grant foreign-
write authority by itself. An explicit target-side grant may enable a manual,
approved, recovery-gated cross-repository operation under suite policy.
_Avoid_: Workspace merge, shared write scope

**Foreign-write authority**:
The target-side, uncommitted grant that permits one exact source repository
instance to perform a bounded operation against one exact foreign bundle. It
is separate from reach, presence, trust, filesystem access, federation,
`.okf-active`, project mode, approval, and the guard ledger. It is scoped to
allowed effects, can be revoked by an authorized target owner, and never
permits automatic mutation. The specification's target-owner consent is the
same grant named for the act of issuing it, not a second concept.
_Avoid_: Trust grant, filesystem permission, workspace declaration, approval,
target-owner consent

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
already admitted. It may use index navigation, exact paths, or native search.
It cannot widen bundle admission, and it does not grant trust, access, write
ownership, approval, or permission.
_Avoid_: Discovery, admission, bundle admission

**LLM-guided native navigation**:
Task-specific reading in which an agent uses harness-native file and search
tools to navigate admitted bundles. The model chooses navigation steps and
interprets tool results; it does not treat model memory as bundle content. The
suite supplies scope and safety rules, not a custom retrieval backend, matcher,
ranking service, tokenizer, embedding store, retrieval cache, cost model, or
ledger.
_Avoid_: Pure LLM retrieval, custom retrieval backend, semantic retrieval

**Provenance source**:
An authored OKF `sources` entry identifying evidence that supports a concept.
It does not by itself assert that a change to the source makes the concept
semantically stale.
_Avoid_: Freshness dependency, watched file

**Observed evidence**:
A file, path, or tool result actually read during a resolution. It supports an
answer only to the extent observed; it is not authored provenance, a review
baseline, or a freshness claim.
_Avoid_: Provenance source, source-of-truth claim, review dependency

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

**WRITE_AUTHORITY**:
The distinct bundle-admission gate a foreign write must pass after `REACH ->
PRESENCE -> {TRUST, ACCESS}`, testing whether the target holds foreign-write
authority for the exact source instance, target instance, target bundle, and
effects. A refusal at this gate is reported as a write-authority finding,
never as `INVALID` or `ACCESS_DENIED`.
_Avoid_: Foreign-write authority, TRUST gate, ACCESS gate

**WRITE_NOT_AUTHORIZED**:
An example write-authority finding code for a refused `WRITE_AUTHORITY` gate.
The specification gives it only as an example; the final finding-code
vocabulary for a refused foreign write is an open item.
_Avoid_: The settled write-authority finding code, `ACCESS_DENIED`, `INVALID`

**Authority generation**:
The generation counter that foreign-write authority carries at the target,
incremented so a stale grant cannot be replayed after reissue or revocation.
_Avoid_: Grant generation, bundle epoch, ledger generation

**Grant generation**:
The value of the authority generation that a cross-repository approval record
captures at approval time, so a later change to the underlying foreign-write
authority can be detected as drift.
_Avoid_: Authority generation, ledger generation, policy hash

**Target project-mode configuration**:
The requirement that a cross-repository write read its project mode from the
target repository's own configuration rather than from the source side. A
missing or unknown target project mode blocks mutation.
_Avoid_: Project mode, source-side configuration

**Target native adapter**:
The harness adapter installed in the target repository of a cross-repository
operation. It can be absent; only the invoking source-side adapter and a
compatible shared runtime must be present.
_Avoid_: Harness adapter, invoking harness adapter

**Allowed effects**:
The explicit, closed set of effects that a delegation brief or a
foreign-write authority grant authorizes for one operation. It never widens
by itself and is stated alongside, and is distinct from, forbidden effects.
_Avoid_: Tool allowlist, granted permission, effect-matrix outcome

**Target collision**:
The case in which a migration or cross-repository move names a destination
path that an existing concept already occupies. It blocks rather than
triggering an implicit merge.
_Avoid_: Merge conflict, overwrite

**Transformed output**:
Content produced by converting source material into OKF form for migration
or a cross-repository move. It starts as `draft` and unverified, carries only
the provenance its own body supports, and is written to a separate staging
area before acceptance.
_Avoid_: Migration residue, final concept content

**Bootstrap exception**:
The undefined condition, if any, under which the first write that creates a
bundle root would be permitted without a pre-existing `okf_version: "0.2"`
declaration. No such exception exists in `v0.1.0`; its exact condition and
atomicity requirement are an open item.
_Avoid_: Write gate, adoption operation

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

**Skill binding**:
The mapping from an invocation route to the skill it dispatches to. Every
harness exposes the same skill bindings as part of semantic parity; a
harness-native configuration scope, such as a Codex hook's trusted-project or
plugin scope, is not itself a skill binding.
_Avoid_: Reach clause, hook scope, router dispatch protocol

**Tool allowlist**:
The explicit, closed set of tools an agent definition declares itself
permitted to use. It carries no raw file-write, Git-history, network, or
nested-agent authority beyond what it names.
_Avoid_: Allowed effects, agent definition

**Native wrapper**:
A thin, harness-specific surface through which an adapter can expose a
shipped agent definition (`okf-reader`, `okf-writer`) for delegation. It is
distinct from a skill wrapper script, the shared cross-harness process entry
under `scripts/`.
_Avoid_: Skill wrapper script, harness adapter

**Router**:
The `okf` router skill that dispatches each request to exactly one of the
four owning sub-skills (`okf-read`, `okf-write`, `okf-lifecycle`,
`okf-review`) using a sealed operation table, and owns the user-invoked
confirmation sequence. It implements no second authorization rule of its own.
_Avoid_: Harness adapter, skill wrapper script, guard skill

**Session override**:
The highest-precedence layer in the settings chain — `adapter defaults <
user/global settings < project/worktree settings < current-session override`
— that expires at session end. Retained design for a later release; see the
#91 narrowing in `docs/spec/okf-agent-skills-v0.1.0-completion.md`. (#91)
_Avoid_: Effective settings, local override, project mode

**Effective settings**:
The fully resolved settings value produced by applying the
settings-precedence chain, including any session override. The main session
resolves it and carries it into a delegation brief. Retained design for a
later release; see the #91 narrowing in
`docs/spec/okf-agent-skills-v0.1.0-completion.md`. (#91)
_Avoid_: Session override, execution preference

**Supported entry seam**:
One of the specific, per-harness native hooks or events — such as Claude
Code's and Codex's `SessionStart`, or OpenCode's
`experimental.chat.system.transform` — that a harness adapter is permitted to
treat as an automatic-orientation injection point. An adjacent seam that
never re-emits, such as `PreCompact` or an ordinary prompt, is not a
supported entry seam.
_Avoid_: Orientation occurrence, adjacent seam, explicit entry path

**Logical cause**:
The categorized-reason component of an orientation occurrence key — alongside
the harness, the repository instance, and the context ID — identifying why a
session-entry event fired, for example startup, resume, clear, compact, or
fork.
_Avoid_: Native event ID, orientation occurrence, task kind

**Native event ID**:
The harness-native identifier of the specific triggering event, carried in
the occurrence key when one exists. A later native event with a new native
event ID can form a new occurrence and emit another orientation.
_Avoid_: Logical cause, occurrence key, adapter generation

**Adapter generation**:
A counter the OpenCode adapter creates from a lifecycle signal
(`session.created` or `session.compacted`) and that the next eligible system
transform claims, coordinating at-most-once orientation delivery on a harness
with no native session-start hook. A failed transform leaves that generation
`degraded` without automatic retry.
_Avoid_: Bundle epoch, ledger generation, native event ID

**Concept ID**:
The bundle-relative file path of a concept without its `.md` extension. A
fully qualified concept key is bundle identity plus Concept ID; moving or
renaming a concept changes its identity.
_Avoid_: Concept identity, UUID, fully qualified concept key

**Workspace link scheme (`okf-workspace://`)**:
The `okf-workspace://<bundle-alias>/<concept-id>` URI form required for every
authored cross-bundle link. The active workspace manifest is its only
resolver, and one alias never resolves to more than one target.
_Avoid_: Workspace manifest, inbound link, federation

**Result labels**:
The fixed, closed set of navigation result values: `ok`, `degraded`,
`not-configured`, `unavailable`. A navigation result uses only these labels.
_Avoid_: Lifecycle result, orientation result, match labels

**Match labels**:
The fixed, closed set of navigation match values: `found` and `no match in
searched scope`. A complete no-match claim is limited to its declared scope
and search channel.
_Avoid_: Result labels, finding labels, link resolution

**Finding labels**:
The fixed, closed set of navigation finding values: `missing`, `unreadable`,
`unobservable`, `invalid`. `invalid` is reserved for a verified native-tool
or safety-contract violation.
_Avoid_: Result labels, parse finding, write-authority finding

**Coverage labels**:
The fixed navigation coverage vocabulary: complete for a named scope and
channel, or `non-exhaustive`. Completeness is never claimed beyond the named
scope and channel.
_Avoid_: Support ceiling, match labels

**Verified EOF**:
The evidence a complete-concept claim requires: confirmation that a body was
read to its actual end of file. Without it, the result carries the
`unobservable` finding and is `degraded`; the observable criterion for
verifying it with native tools is an open item.
_Avoid_: Complete read, parse finding

**Parse finding**:
The finding returned when readable bytes carry malformed frontmatter. It
blocks status inference and never triggers repair during a read.
_Avoid_: Finding labels, invalid finding, validation verdict
