---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/11
status: draft
type: Decision
---
# Design operational trust tier matrix for skill operations

Status: This decision is closed.

## Question

What operations should each OKF skill trust tier (unverified, machine-confirmed, human-reviewed) permit, and what does the tier-transition workflow look like—both for code-backed projects, where code is authoritative and pull-request review may provide an approval layer, and knowledge-only projects, where the knowledge bundle is authoritative?

The research in [`docs/research/lightweight-durable-context.md`](https://github.com/artemVeduta/okf-agent-skills/blob/main/docs/research/lightweight-durable-context.md) identifies this as a priority decision. Research proposals are inputs, not adopted policy.

**Must resolve:**

- Can agents archive, merge, split, deprecate, change `status`, or promote trust tiers automatically?
- Which transitions require notice, preview, explicit approval, or are prohibited?
- Does pull-request review satisfy approval for every code-backed operation, or only specified operations?
- What pre-operation snapshot/backup and restore verification is mandatory for destructive or broad changes?
- Replace the provisional map baseline with a concrete matrix of `operation × trust tier × project mode → allowed | notice | preview/approval | blocked`.

## Comment by artemVeduta

Correction carried from [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29): authorization requires a recorded matching explicit request before preview, bound to the same operation and selector. A preview created from idle cannot inherit attestation and become confirmable. Trust-tier rules should require this occurrence-bound request rather than accepting environment attestation alone.

## Comment by artemVeduta

## Resolution

The policy below is grounded first in the current upstream [OKF v0.2 `SPEC.md`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828c2f23d109c855ee403c3a4c81f3a96/okf/SPEC.md). Requirements attributed to the specification are separated from this suite's operational policy.

### Specification baseline

- A trust tier belongs to a concept and is derived from `verified`: absent is unverified, only non-`human:` actors is machine-confirmed, and any `human:<id>` actor is human-reviewed (§5.2-5.3).
- Trust tiers are advisory signals, not access control. Unverified concepts remain consumable (§5.3, §11).
- `verified` confirms concept content against its `sources` or `resource`; it is independent of `generated.at`, and the specification permits content to change without re-confirmation (§5.2).
- `draft` means not yet reviewed and possibly incomplete, `stable` means ready for consumption, and `deprecated` means retained for links and history but no longer current. Absent `status` means stable (§5.4).
- A concept ID is its file path without `.md`; moving or renaming a file therefore changes its specified identity (§2).
- Git is recommended for history, attribution, diffs, and review, but the specification defines no approval semantics (§3).
- In the Attested Computation workflow, an agent may supply only declared parameter values and must not author or edit the sanctioned computation (§10.3).
- Archive, merge, split, deletion, project modes, automatic/manual invocation, notices, approval, backup, restore, and rollback are not specified by OKF. Their rules below are product policy.

### Governing policy

Trust is evidence only. It never grants mutation authority. Authorization is determined by the normalized operation, project mode, invocation mode, scope, evidence, and recovery requirements. This intentionally produces many identical U/M/H cells.

Commands expand into atomic effects before authorization. Composite commands inherit the strictest atomic outcome, with this precedence:

```text
blocked > preview/approval > notice > allowed
```

The outcome contract is:

| Outcome | Meaning |
|---|---|
| `allowed` | Execute without special interaction and return ordinary results. |
| `notice` | Execute without prior approval, then report the operation, affected concepts, evidence, status/trust effects, validation, and recovery result. |
| `preview/approval` | Require an occurrence-bound explicit request, complete content-bound preview, single-use approval, fresh execution checks, and completion notice. |
| `blocked` | Do not mutate. Approval cannot override the result; read-only explanation remains permitted. |

### Operation catalogue

The core matrix operates on spec-level effects: read, validate, create concept, meaningful content update, non-claim metadata update, add machine verification, record human verification, remove verification, each status-transition direction, set freshness, move/rename, add/rewrite links, regenerate indexes, append logs, delete, and edit a sanctioned computation.

`archive`, `merge`, `split`, `sync`, `migration`, and `compaction` are composite workflows. They must expand into a complete effect plan; a friendly command name cannot conceal deletion, identity changes, or graph rewrites.

### Base operation matrix

Legend: `A` = allowed, `N` = notice, `P` = preview/approval, `R` = verified recovery required, `B` = blocked. U/M/H are the target concept's pre-operation trust tier. Creation has no input tier and always creates an unverified draft.

| Atomic effect | Code-backed U/M/H | Knowledge-only U/M/H |
|---|---:|---:|
| Read, validate, or read-only analysis | `A/A/A` | `A/A/A` |
| Create a small evidence-backed concept | `N/N/N` | `N/N/N` |
| Small evidence-backed claim update | `N/N/N` | `N/N/N` |
| Small non-claim metadata or formatting update | `N/N/N` | `N/N/N` |
| Add qualifying machine verification | `N/N/N` | `N/N/N` |
| Add machine verification without complete qualifying evidence | `B/B/B` | `B/B/B` |
| Record exact human verification | `P/P/P` | `P/P/P` |
| Infer or fabricate human verification | `B/B/B` | `B/B/B` |
| Standalone removal of verification | `A/P/P` | `A/P/P` |
| Derive or display current staleness | `A/A/A` | `A/A/A` |
| Set `stale_after` from explicit evidence | `N/N/N` | `N/N/N` |
| Choose or change `stale_after` by judgment | `P/P/P` | `P/P/P` |
| `draft -> stable` | `P/P/P` | `P/P/P` |
| `stable -> deprecated` | `P/P/P` | `P/P/P` |
| `deprecated -> stable` | `P/P/P` | `P/P/P` |
| Write an unsupported status value | `B/B/B` | `B/B/B` |
| Add/remove one semantic relationship | `N/N/N` | `N/N/N` |
| Move or rename | `P+R/P+R/P+R` | `P+R/P+R/P+R` |
| Broad inbound-link or graph rewrite | `P+R/P+R/P+R` | `P+R/P+R/P+R` |
| Create merge/split outputs | `P+R/P+R/P+R` | `P+R/P+R/P+R` |
| Delete a demonstrably redundant concept | conditional `P+R` | `B/B/B` |
| Purge unique durable knowledge | `B/B/B` | `B/B/B` |
| Introduce redirects/aliases before their semantics are defined | `B/B/B` | `B/B/B` |
| Edit a sanctioned Attested Computation | `B/B/B` | `B/B/B` |

Directly affected index regeneration, log append, and mechanical link repair inherit the parent operation and need no separate approval. A standalone broad rebuild acquires the broad modifier.

Code-backed deletion is eligible only when the preview proves the concept is superseded or redundant, contains no unique durable context, and recovery checks pass. Knowledge-only deletion is blocked because the bundle is authoritative. Purging unique durable knowledge is blocked in both modes.

### Project modes

- Read and validation behave identically in both modes.
- In a code-backed project, code may establish executable facts but cannot establish unstated rationale; OKF must not mirror recoverable implementation.
- In a knowledge-only project, a mutation needs documentary evidence or a direct human statement because the bundle is authoritative.
- Lifecycle, identity, structural, and destructive effects retain strong safeguards in both modes because code-backed OKF also contains non-recoverable context.
- Mode is evaluated per affected bundle. Mixed-bundle operations compose strictly. Unknown mode permits read, validation, and analysis but blocks mutation. Repository presence alone never determines mode.

### Automatic lifecycle ceiling

Automatic execution may read, validate, create a small evidence-backed draft concept, make a small evidence-backed update, add independently reproducible machine verification, maintain directly affected indexes, and append an existing or policy-required log.

Automatic execution may not record human verification, independently remove verification, change status, move/rename, perform broad link rewrites, archive, merge, split, sync, migrate, compact, delete, purge, or edit sanctioned computations. `init`, large/full sync, migration, and compaction remain manual-only.

Manual-only means explicit invocation is necessary, not sufficient: the matrix, preview, approval, and recovery gates still apply.

### Trust transition workflow

- Tiers are always recomputed from events; they are not written or directly promoted.
- Agent-created and synthesized concepts explicitly start `status: draft` with no `verified`. The absent-status default must not silently publish generated content as stable.
- A deterministic or independently reproducible check may add a non-human verification event only when its declared coverage includes the complete current concept. Partial checks remain validation results and do not promote trust.
- A human event may be recorded only after explicit confirmation of the exact current concept against its sources/resource. The identity must come from an authenticated review provider or a project-configured verifier ID. Commit authorship, local Git configuration, merge status, and arbitrary actor strings are insufficient.
- A claim-affecting edit clears `verified` from the resulting concept and reports the invalidation. This mandatory invalidation is part of the edit, not standalone revocation. Git/log history preserves the prior event.
- Standalone removal from unchanged content requires preview/approval because it disputes or erases existing evidence.
- Trust promotion cannot authorize a subsequent operation because trust is not authority.

The closed non-claim allowlist is formatting with parsed semantics unchanged; lifecycle (`status`, `stale_after`) updates; generated/verified event maintenance governed by their own rules; byte-identical path moves; manifest-bound link-target substitution to the same moved target; and index/log maintenance. Changes to body, `type`, `title`, `description`, `resource`, `tags`, `sources`, unregistered extension fields, or synthesis output are claim-affecting.

Multi-concept work has no aggregate or inherited tier. Existing concepts are evaluated from their individual pre-operation state; unchanged concepts retain verification; each claim-changed concept loses it; synthesized outputs are draft and unverified; byte-identical restoration preserves snapshot state. Any concurrent content or verification change aborts the entire operation and requires a fresh preview.

### Lifecycle and composites

Computing `today >= stale_after` is allowed. Setting the date from explicit evidence is notice; choosing it by judgment is preview/approval. All valid status transitions require preview/approval and preserve content verification. Adding explicit `status: stable` where it is absent is unnecessary because the spec already defines the default.

Archive has no single matrix row: in-place deprecation uses the status rule, physical relocation uses the move rule, link rewrites use graph rules, and retrieval hiding remains part of the archive-design decision.

Merge/split outputs are draft and unverified. Source deprecation requires preview/approval. Source deletion additionally applies the project-mode deletion rule. Exact redirect, provenance, inbound-link, and rollback representations remain downstream decisions.

`init` requires preview/approval and must expose bundle, hook, CI, and instruction-file effects separately. Full sync, migration, compaction, identity-affecting archive, and restore require preview/approval plus recovery. Migration uses write-new-then-swap, never mutate-in-place. Restore first snapshots the current state.

### Pull-request approval

PR approval can satisfy preview/approval only for code-backed, repository-contained effects prepared on an isolated non-authoritative branch. It authorizes publication/merge, not unseen external effects, and it never replaces recovery safeguards.

Approval binds this fingerprint:

```text
explicit operation request ID
base commit SHA
head commit SHA
resulting merge-tree SHA
complete operation-manifest hash
applicable policy/configuration hash
required-check result set
recovery-evidence hash when required
```

Any change expires approval. General PR approval authorizes publication only; it creates a human verification event solely when the reviewer explicitly confirms the exact concept against its sources/resource and has a qualifying identity.

### Recovery gate

An operation is broad when it semantically changes multiple concepts, uses an open-ended selector, crosses bundles, or causes cascading graph rewrites. One concept plus mechanically derived index, log, and direct link maintenance remains small.

An operation is destructive when it deletes or overwrites source content, independently removes verification, rewrites history, or causes a non-file side effect that file restoration cannot reverse. Path moves and graph restructuring are identity-affecting and use the same recovery gate.

Broad, destructive, or identity-affecting execution requires:

```text
complete enumerated preview
content-addressed snapshot of affected bundles and relevant untracked files
snapshot outside the mutation target
successful restore into a disposable location
restored-content hash verification
OKF validation and operation-specific identity/link checks
documented rollback procedure
snapshot and restore evidence bound to the approved preview
post-operation validation
```

Failed or stale recovery evidence yields `blocked`. Trust tier, confirmation, Git history, PR approval, reflogs, automatic commits, and `git archive` cannot override or alone satisfy the gate.

### Deterministic evaluation

```text
1. Parse per-bundle project mode and current concept state.
2. Expand the workflow into atomic effects.
3. Enforce direct SPEC.md requirements and prohibitions.
4. Check evidence and verifier-identity prerequisites.
5. Look up each effect in the base matrix.
6. Compose the strictest outcome.
7. Apply the automatic/manual invocation ceiling.
8. Apply broad, destructive, identity, and external-effect modifiers.
9. Enforce preview, approval, and recovery gates.
10. Accept a qualifying PR as the approval channel when applicable.
11. Recheck content, scope, evidence, approval, and recovery immediately before execution.
12. Execute atomically, validate, log when applicable, and report notice or failure/rollback status.
```

### Deliberately delegated semantics

This decision fixes authorization and safety outcomes without inventing representations owned by downstream work:

- Concept identity, bundle ownership, and mode declaration remain with [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22).
- Archive representation, retention, retrieval, and restoration semantics remain with [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14).
- Redirects, provenance reassignment, inbound-link mechanics, and partial-failure behavior remain with [Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30) and [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24).
- Detailed validation and fixture contracts remain with [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7).
- Persistent guard state and concurrent-session coordination remain with [Decide where manual-operation guard state persists and how concurrent sessions coordinate](https://github.com/artemVeduta/okf-agent-skills/issues/31).

These delegations may choose representations and tests, but may not weaken the authorization matrix, approval binding, or recovery floor decided here.
