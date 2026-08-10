---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/6
status: draft
type: Decision
---
# Specify the OKF knowledge model and automatic developer lifecycle

Status: closed.

## Question

What exact data belongs in OKF for code-backed versus knowledge-only projects, and when should agents read, create, update, index, log, validate, synchronize, or decline to write during feature development, fixes, exploration, debugging, research, review, and pre-PR work?

The decision must preserve this boundary:

- In code-backed projects, code is authoritative for executable behavior. OKF stores compact durable context that cannot be recovered adequately from code: domain language, rationale and rejected alternatives, operational meaning, ownership, navigation, and other non-duplicative knowledge.
- In knowledge-only projects, the OKF bundle may contain the complete project knowledge.
- Research recommendations and numeric values remain candidates until this ticket explicitly adopts them or delegates them to a benchmark-backed policy ticket.
- Sync mode belongs here: define incremental, diff-scoped, and manually invoked full-project synchronization, including when no write is warranted.

## Comment by artemVeduta

Context pointer: [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) now makes retrieval stateless per call and selects task-profiled context reserves and discovery-work envelopes. This ticket owns the task taxonomy and lifecycle moments that select those profiles and invoke retrieval.

## Comment by artemVeduta

## Resolution

The automatic lifecycle is a task-intent-driven, per-bundle reconciliation process. It preserves the distinction between code-backed projects, knowledge-only projects, durable context, trust evidence, review findings, authorization, and operational state.

### Knowledge boundary and authority

- In a code-backed project, code, configuration, and tests remain authoritative for executable behavior. OKF stores durable context that is not mechanically recoverable: domain language, rationale, rejected alternatives, constraints, invariants, ownership, navigation, and reusable operational workflows.
- In a knowledge-only project, the OKF bundle may own the complete substantive project knowledge. Temporary execution state does not become concept content: guard ledgers, receipts, caches, recovery manifests, and temporary plans stay separate.
- Authority is explicit per affected bundle and owner. A mixed repository may contain different bundle modes. Federated reads do not grant write authority.
- Unknown or conflicting authority permits reading, validation, and analysis, but blocks all mutation, including index and log maintenance. Mixed-scope work is partitioned per bundle.

### Create, revise, or abstain

- Abstain or return no-op when information is recoverable from authoritative artifacts, transient, speculative, duplicated, semantically unchanged, outside the owner scope, or unsupported by sufficient evidence.
- Originate a concept only when durable reusable knowledge is missing, ownership is known, and evidence supports a bounded concept. Agent-originated concepts begin as `draft` and unverified.
- Revise a concept only when its meaning or provenance-bearing metadata materially changes, the concept is owned, and evidence supports the revision.
- Automatic updates require task intent, authoritative or explicitly adopted evidence, a clear concept mapping, no unresolved conflict or unavailable dependency, bounded scope, and post-write validation. Small means structurally bounded, not a numeric threshold.
- Automatic lifecycle work does not change `status`, `verified`, trust tier, `stale_after`, review baselines, or concept identity. Source changes create review evidence, not automatic semantic staleness. Standard OKF `sources` and separate review dependencies remain the only provenance mechanisms.
- The exact OKF write gate, semantic preservation, consumer tolerance, and absence of product-specific frontmatter or body extensions remain those established by [Choose the OKF conformance baseline, compatibility, and extension policy](https://github.com/artemVeduta/okf-agent-skills/issues/21).

### Task contract

| Task kind | Lifecycle behavior |
| --- | --- |
| Feature work | Consult relevant context at entry and phase transitions. After a meaningful result, a bounded evidence-backed create or revise is allowed, followed by validation. |
| Fix | Consult relevant troubleshooting and domain context. After the defect and correction are verified, a bounded reusable operational update is allowed. Hypotheses alone are not written. |
| Debugging | Read and analyze until the cause is established. Transition explicitly to fix or documentation before mutation. |
| Exploration | Read and analyze by default. Require explicit promotion or a phase transition before originating durable context. |
| Research | Read and assess sources. Create or revise a sourced draft only when source and reuse gates pass; preserve uncertainty and keep unadopted numbers as candidates. |
| Review | Read, validate, and report. Do not mutate the reviewed subject as a side effect; an accepted finding starts a separate update transition. |
| Pre-PR synchronization | Inspect the diff and declared knowledge scope, validate, and report or propose. Apply knowledge changes only through an explicit follow-up mutation. |

Task kinds are selected by user intent, not inferred from file events. Ambiguous work remains read-only until clarified. Debugging, fix, and pre-PR work may be explicit phase transitions within one episode.

### Lifecycle moments and results

- At task entry or phase transition, establish scope and consult or retrieve relevant context without mutating.
- At an evidence checkpoint or task completion, choose create, revise, no-op, or abstain.
- Before mutation, check owner, mode, scope, evidence, and authorization.
- After accepted mutation, validate and maintain only directly affected navigation and history derivatives.
- Retrieval outcomes remain explicit: `ok` permits ordinary continuation; `degraded` discloses limitations and forbids claim-affecting updates from omitted context; `insufficient` and `invalid` do not permit mutation. `unavailable`, `unobservable`, missing baseline, and not-configured findings are never reported as clean or unchanged.
- Source `changed` produces review-needed evidence rather than automatic rewriting or status changes.
- Canonical lifecycle results are `applied`, `no-op`, `abstained`, `review needed`, `approval required`, `blocked`, and `failed/incomplete`. Results carry task kind, affected scope, evidence limits, and next action. Harness adapters only render or transport them; they do not change authority or trust.

### Synchronization

- Incremental synchronization is narrow automatic maintenance for directly affected concepts, declared review dependencies, and mechanical derivatives during ordinary work.
- Diff-scoped synchronization is explicit pre-PR reconciliation over the current diff and its declared knowledge scope.
- Full-project synchronization is explicit and manual: inventory, plan, preview, approval, recovery evidence, broad writes, and post-operation validation are required. It may validly produce no writes.
- Synchronization is reconciliation, not mirroring. No mode expands scope for convenience or writes when there is no semantic change, only a source-review signal, incomplete observation, unknown ownership, or an unresolved identity conflict.

### Index, log, and manual handoff

- `index.md` is a progressive-disclosure navigation derivative. Maintain directly affected entries only after an accepted mutation; report a stale or missing index during read-only work instead of silently repairing it.
- `log.md` is human-readable knowledge-change history. Append only for accepted knowledge mutations, not reads, no-ops, declined writes, retrieval receipts, guard state, recovery manifests, or Git history.
- Broad, destructive, identity-affecting, or human-owned work is detected and handed off. This includes initialization, full sync, migration, compaction, archive, merge, split, redirect, move, delete, status changes, human verification, and sanctioned-computation edits. Safe analysis or preview may precede the handoff, but the lifecycle never partially executes it.

### Delegation boundaries

This ticket settles qualitative knowledge and lifecycle behavior. Numeric defaults and calibration remain delegated to [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7). Retrieval mechanics remain with [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13), provenance and review dependencies with [Design concept-source traceability and freshness detection](https://github.com/artemVeduta/okf-agent-skills/issues/12), identity and routing with [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22), and archive, migration, restructuring, and harness transport with their respective open decisions. The resulting lifecycle contract is the semantic input to [Write the implementation-ready product specification](https://github.com/artemVeduta/okf-agent-skills/issues/8).
