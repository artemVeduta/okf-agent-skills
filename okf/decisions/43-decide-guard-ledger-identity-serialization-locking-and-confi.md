---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/43
status: draft
type: Decision
---
# Decide guard ledger identity, serialization, locking, and confirmation expiry defaults

Status: closed.

## Parent

Part of #41 — [Spec: okf-agent-skills v0.1.0](https://github.com/artemVeduta/okf-agent-skills/issues/41).

## Question

Where does a per-bundle guard ledger live, what is its schema version and record format, what is the lock artifact beside it, how is `<bundle-key>` derived from bundle identity, what content-addressing algorithm produces content hashes and the confirmation fingerprint, and what are the default confirmation time-to-live and session-binding behaviors?

## Why this is a decision, not a build

The manual-operation guard is the safety spine of the product and cannot be built without these. It gates #12 onward — every manual operation, every preview, every approval.

Every row below is a declared open item in the specification. Section 11 states that an implementation agent MUST raise each one rather than choose a value — *“a plausible invented path or schema is the failure this specification exists to prevent.”* This ticket carries `wayfinder:grilling` for that reason: it is resolved by a human decision, not by an AFK agent picking defaults.

## Open items this closes

- [ ] The exact `bundle-key` encoding derived from canonical bundle identity — needed by manual-operation guard ledger directory naming and cross-worktree coordination — (#31)
- [ ] The supported manual-operation guard ledger schema version — needed by the newer-schema fail-closed check — (#31)
- [ ] The exact manual-operation guard ledger filenames, serialization format, and field schema — needed by ledger read, atomic replace, and cross-implementation parity — (#31)
- [ ] The exact lock filename and locking mechanism used beside the ledger — needed by exclusive per-bundle execution locking — (#31)
- [ ] The default confirmation time-to-live value and the default session-binding behavior for the optional expiry adapters — needed by `CONFIRMATION_AGED_OUT` and `SESSION_BOUNDARY` expiry — (#29)
- [ ] The exact content-addressing algorithm for snapshots and content hashes — needed by `observedHash`, fingerprint hashing, and restored-content equality — (#7)

## Definition of done

- [ ] Every row above has an adopted value or an explicit deferral with its consequence stated.
- [ ] The decision is recorded so the tickets it unblocks can cite it rather than re-deriving it.
- [ ] No row is closed by observing that an implementation already chose a value.

## Blocked by

- None — can start immediately.

## Comment by artemVeduta

## Resolution

The accepted `v0.1.0` boundary removes the manual-operation guard from this release. The suite does not create or maintain a guard ledger or a guard lock.

### Bounded writes retained

- `okf-write` may create one small evidence-backed draft concept.
- `okf-write` may make one small evidence-backed concept update, non-claim metadata or formatting update, or one relationship update.
- Claim updates clear `verified` as part of the update.
- Incremental synchronization may use the same bounded effects.
- Inline and delegated writes use the same bounded writer runtime and immutable delegation brief.
- Admission, project mode, ownership, evidence, scope, exact `okf_version: "0.2"`, semantic preservation, and post-write validation remain required.
- Directly affected index and log files may be published as derivative effects after the primary concept.

### Explicit deferrals

All open items in this ticket are deferred for `v0.1.0`: `<bundle-key>`, ledger schema, ledger filenames and serialization, lock artifact and mechanism, confirmation TTL, session binding, and guard approval-fingerprint content addressing. No value is adopted for these items.

The release also has no manual guard state machine, preview token, approval record, epoch, spent record, operation store, recovery snapshot, rollback protocol, or crash reconciliation.

### Safety limit

Bounded publication uses per-file temporary write and atomic rename, followed by validation. It does not provide concurrent-writer serialization or crash-recovery guarantees. A partial derivative update returns `failed/incomplete` with residue. Broad, destructive, identity-changing, and cross-repository writes remain deferred rather than being executed without the guard.

This closes the decision with explicit deferral. It does not claim that the deferred guard behavior is implemented.
