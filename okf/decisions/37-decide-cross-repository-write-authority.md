---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/37
status: draft
type: Decision
---
# Decide cross-repository write authority

Status: closed.

Part of #1

## Question

Under what authority, consent, and failure semantics may an agent working in one repository mutate a federated peer's bundle in another repository?

## Why this is open

[Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22) explicitly excluded cross-repository writes, and [Prototype workspace discovery, trust, and routing state transitions](https://github.com/artemVeduta/okf-agent-skills/issues/27) recorded the reason: "widening read scope can never silently redirect a write." Declaring a peer to fix a glossary lookup must not hand the session mutation rights over a second repository.

The owner requires that a sibling repository (`ui-components` in the monorepo example) be both accessible and writable from `worker-manager`. Two of the three readings of that requirement are already satisfied and need no decision:

- Harness file access to the sibling — Codex `--add-dir` already grants it; #27's correction confirms the grant never widens discovery authority.
- An agent invoked with the sibling as its own current repository — always allowed, own marker, own bundle, own ledger.

Only the third is forbidden today and is what this ticket decides: a write issued from `worker-manager` landing in `ui-components`' bundle.

## What must be settled

- **Write authority as a concept distinct from access.** It needs its own gate in the `REACH -> PRESENCE -> {TRUST, ACCESS}` ladder and its own finding code; folding a refused write into `INVALID` would name a policy decision as a defect.
- **Where the grant is stored.** #22 forbids permissions in the portable manifest, and a manifest living in `worker-manager` would let one repository unilaterally claim authority over another, inherited by every clone. Target-side consent is likely required.
- **Guard ledger location.** [Decide where manual-operation guard state persists](https://github.com/artemVeduta/okf-agent-skills/issues/31) keys state under `<git-common-dir>/okf-agent-skills/guard/<bundle-key>/`. Using the session's common dir gives one logical bundle two ledgers, two lock namespaces, and two epochs — two agents can arm and execute simultaneously, which is what the lock exists to prevent. Using the target's requires writing a preview into another repository's `.git` before any approval, needs two locks with no defined acquisition order, and must advance two epochs where the protocol advances one.
- **Approval fingerprint.** #11 bounds PR approval to "repository-contained effects" and the fingerprint holds one base SHA, one head SHA, one merge-tree. Two repositories need a set-valued fingerprint that expires wholly if any head moves.
- **Partial failure.** There is no two-phase commit across git repositories, and write-new-then-swap is per-repository. A `partially-applied` terminal state that blocks both bundles until reconciled is likely needed instead of an atomicity claim.
- **Foreign project mode.** #11 blocks mutation when mode is unknown, and mode lives in the peer's repository, not in the manifest.
- **Automatic invocation.** Whether cross-repository writes are barred from automatic lifecycle entirely.

## Amends

#22 (peer read-only clause, create-override qualifier, the cross-repository-writes exclusion, vendored read-only, manifest schema), #27 (gate ladder, findings vocabulary, "reads may federate; writes never do"), #11 (repository-contained PR bound, approval fingerprint, automatic ceiling, recovery gate), #31 (ledger location, lock protocol, epoch advance, interrupted-state record), #35 (whether the target's marker and adapters are prerequisites).

## Scope note

This is the only item in the current round that grows `v0.1.0` rather than shrinking it. Deferring it to `v0.2.0` alongside live harness tests was recommended and declined; recorded here so the tradeoff stays visible.

Analysis: `docs/federated-write-impact.md`.

## Comment by artemVeduta

## Resolution

### Scope

- This decision allows a cross-repository move from one source repository to one foreign target repository.
- One operation names one source bundle, one target bundle, and a finite set of source and target paths.
- A target path may differ from its source path. Each content transformation is part of the approved plan.
- A move may change both repositories. It may move selected concepts and documentation, modify the target outputs, deprecate the source outputs, and apply listed derived maintenance.
- One operation cannot fan out to several foreign targets. Cross-repository moves, merges, splits, and unrelated broad rewrites are not implied by this grant.

### Authority

- A foreign write needs a distinct `WRITE_AUTHORITY` gate after `REACH -> PRESENCE -> {TRUST, ACCESS}`.
- A readable and trusted target without authority returns a write-authority finding such as `WRITE_NOT_AUTHORIZED`, not `INVALID` or `ACCESS_DENIED`.
- The target repository must issue explicit consent through an authorized target-owner or administrator workflow. A workspace manifest, filesystem grant, repository trust, or `.okf-active` marker does not grant authority.
- Consent is bound to the exact source repository instance, exact target repository instance, target bundle identity, allowed effects, and an authority generation.
- Consent is stored as uncommitted target-local state under the target Git common directory, separate from the workspace manifest and guard ledger. It remains valid until explicit revocation or identity or policy invalidation; no time-to-live is added in `v0.1.0`.
- The target grant is narrow. It may allow target concept creation, transformed content updates, and directly derived target link or index maintenance. It does not allow unrelated deletion, purge, merge, split, or broad rewrites.
- Both affected worktrees require valid `.okf-active` markers. A target native adapter is optional. The invoking adapter and compatible shared runtime remain required.
- The target project mode must come from target-owned configuration. Missing or unknown mode blocks mutation. Generated and vendored bundles remain read-only.
- Foreign writes are never automatic lifecycle work. They require explicit manual invocation, a complete preview, approval, fresh execution checks, and recovery evidence.

### Move Semantics

- Complete preflight validates both repositories before the first write. Any required path, identity, conformance, link, provenance, mode, or recovery error blocks the whole operation.
- The target is published and validated first. Only then is the source changed. If target publication fails, the source remains unchanged.
- Source concepts are deprecated in place by default and receive a visible successor notice with an explicit workspace link. Source deletion is a separate explicit effect and remains subject to the existing project-mode deletion rules.
- Directly affected parsed inbound links, indexes, and operation logs may be updated only when listed in the operation manifest. Prose and code mentions are not rewritten automatically.
- A target path collision blocks by default. An existing target may change only when the operation names it explicitly and includes the complete transformation and recovery evidence. No implicit merge occurs.
- A transformed target output keeps only provenance explicitly supported by its retained body. It starts as `draft` and unverified; source verification and review state do not transfer.

### Coordination And Recovery

- Each affected bundle uses its own authoritative guard ledger in its Git common directory. Missing, unreadable, insecure, or unlockable target state fails closed.
- All affected bundle locks use one deterministic canonical order. The operation rereads every ledger under lock and holds the locks through fresh validation, mutation, journaling, and settlement.
- One sealed operation manifest and one append-only observation journal cover the complete move. They live in a durable operation store outside both mutation targets and all guard ledgers.
- Approval covers the complete operation and includes an approval record for each affected repository. Each record binds repository identity and revisions, resulting content identity, operation and policy hashes, grant generation, required checks, and recovery evidence. Any relevant change expires the approval.
- Ordinary approval of a source pull request is not enough. A dedicated cross-repository approval is required; pull-request reviews may provide checks or evidence.
- Each repository requires an authorized human or configured verifier. Commit authorship, local Git identity, filesystem access, trust, and model self-approval are not sufficient.
- Recovery evidence covers both repositories and relevant untracked files. It requires independent snapshots, verified disposable restores, content identity checks, applicable conformance and operation checks, rollback instructions, and post-operation validation.
- Git provides no cross-repository atomic commit. A proven partial result is `partially-applied`; an unknown result is `indeterminate`. Both block further mutation on affected bundles until explicit reconciliation. Rollback or repair is a new operation with a fresh request, preview, approval, and recovery gate.

### Acceptance Evidence

Deterministic `v0.1.0` fixtures must cover a valid transformed move, source deprecation and successor notice, provenance reset, link and index maintenance, missing or revoked consent, wrong identity, missing markers, unknown mode, target collision, inaccessible target ledger, stale content, stale grant and approval, lock contention, target-first and source-after-target failures, unknown crash state, recovery, and reconciliation. Live cross-harness process tests remain deferred to `v0.2.0`.

### Retained Decisions

- [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22) remains authoritative for identity, read routing, ownership, manifests, trust, containment, and federation. Its peer-write exclusion is superseded only for the bounded operation defined here; non-repository workspace bundles and generated or vendored bundles remain read-only.
- [Prototype workspace discovery, trust, and routing state transitions](https://github.com/artemVeduta/okf-agent-skills/issues/27) remains authoritative for reach, presence, trust, access, and the separation of access from discovery and write authority.
- [Design operational trust tier matrix for skill operations](https://github.com/artemVeduta/okf-agent-skills/issues/11) remains authoritative for project modes, effect risk, approval, recovery, and automatic-execution limits.
- [Decide where manual-operation guard state persists and how concurrent sessions coordinate](https://github.com/artemVeduta/okf-agent-skills/issues/31) remains authoritative for per-bundle ledgers, generations, epochs, replay protection, locks, and fail-closed state handling.
- [Specify the harness plugin architecture and `.okf-active` opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35) remains authoritative for marker activation, thin adapters, read-only automatic behavior, and non-overridable authority rules.
- [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) remains authoritative for parsed inbound links, workspace link resolution, provenance assignment, and successor notices.

This resolution defines foreign-write authority and cross-repository move safety. Detailed validation and restructuring representations remain with [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) and [Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30).}
