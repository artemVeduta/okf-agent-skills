---
status: draft
type: Glossary
---
# Lifecycle Glossary

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

**OKF-native documentation**:
A project documentation policy in which all durable project documentation
lives as OKF concepts and indexes. It does not change project mode: in a
code-backed project, code, configuration, and tests remain authoritative for
executable behavior.
_Avoid_: Third project mode, code mirror

**Automatic lifecycle**:
The recurring behavior through which an agent consults relevant OKF knowledge
and proposes small, evidence-backed documentation changes while doing normal
project work. A mutation follows acceptance of an OKF change proposal. This
behavior reaches the wrapper as an explicit invocation, never an automatic
invocation: the agent, not an adapter or hook, sends the request.
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

**OKF change proposal**:
A bounded, read-only list of intended concept changes and their evidence,
presented for one user decision before any listed write. Acceptance applies
only to the listed changes, and each concept remains an independently validated
write.
_Avoid_: Draft concept, write approval per concept, automatic mutation

**Lifecycle handoff**:
Session-local input from an external document-producing skill to
`okf-lifecycle`. It names the workspace, bundle, task kind, user goal,
completed work, observed evidence, and candidate durable changes. It does not
approve a write or make observed evidence eligible for a write.
_Avoid_: Wrapper request, delegation brief, approval

**Accepted proposal record**:
The session-local ordered list of exact concept writes that a user accepted in
one OKF change proposal. It permits one attempt for each listed write. A changed
request or an added concept requires a new proposal and acceptance. It is not a
runtime approval record, persistent token, or retry grant.
_Avoid_: Approval record, wrapper receipt, automatic retry

**Domain-from-code proposal**:
An OKF change proposal for a user-selected domain scope, based on existing OKF
knowledge and observed project or external evidence. It contains curated
language, intent, rationale, constraints, invariants, ownership, navigation, or
workflows that code cannot explain adequately; it is not a description of the
implementation.
_Avoid_: Code import, generated API reference, prose mirror

**Scoped synchronization**:
Reconciliation of authoritative evidence and durable context within an
explicit scope. Incremental, diff-scoped, and full-project synchronization
have different safeguards; synchronization is not mirroring.
_Avoid_: Automatic full sync, bidirectional replication

**Whole-workspace synchronization**:
Explicit reconciliation of all admitted bundles in the active workspace. It
collects read-only findings before one complete proposal and keeps each
bundle's authority and validation boundaries during approved writes.
_Avoid_: Scheduled synchronization, automatic workspace write, bundle merge
