---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/44
status: draft
type: Decision
---
# Decide the durable operation store, recovery artefacts, and crash reconciliation

Status: closed.

## Parent

Part of #41 — [Spec: okf-agent-skills v0.1.0](https://github.com/artemVeduta/okf-agent-skills/issues/41).

## Question

Where does the durable operation store live for the repository and non-repository cases, what are the operation-manifest and observation-journal filenames, schemas and publication mechanism, what is the snapshot format and restore mechanism, what are the pass criteria for post-operation checks, and how is a torn or corrupt manifest reconciled beyond classifying it `indeterminate`?

## Why this is a decision, not a build

Every `P+R` effect in the operation map requires verified recovery evidence before its first mutation. Without these, relocation, merge, split, migration, broad synchronization and the cross-repository move cannot run at all — the specification's largest remaining gap, and the one it deliberately refused to invent.

Every row below is a declared open item in the specification. Section 11 states that an implementation agent MUST raise each one rather than choose a value — *“a plausible invented path or schema is the failure this specification exists to prevent.”* This ticket carries `wayfinder:grilling` for that reason: it is resolved by a human decision, not by an AFK agent picking defaults.

## Open items this closes

- [ ] The exact durable operation-store path for the repository and non-repository cases — needed by operation-manifest and observation-journal placement outside mutation targets and ledgers — (#7, #30)
- [ ] The exact operation-manifest and observation-journal filenames and publication mechanism — needed by atomic publication, content verification, and crash reconciliation — (#7, #30)
- [ ] The exact durable location, schema version, and record format of the operation manifest and the observation journal — needed by restructuring recovery, resume, and rollback — (#7)
- [ ] The exact reconciliation procedure for a torn, truncated, or corrupt operation manifest beyond classifying it `indeterminate` — needed by crash recovery of a broad operation — (#7, #30)
- [ ] The exact snapshot format and restore mechanism for the independent recoverable snapshot — needed by the disposable-restore step of recovery evidence — (#7)
- [ ] The exact pass criteria for post-operation identity, inbound-link, provenance, and trust checks — needed by the recovery-evidence conjunction and post-operation validation — (#7)
- [ ] The exact operation-manifest hash encoding used in the approval fingerprint — needed by approval binding and expiry detection — (#11)
- [ ] The exact schemas for validation verdicts and post-operation checks — needed by lifecycle validation and post-operation verification — (#7)
- [ ] The preview manifest schema — needed by complete preview enumeration and confirmation binding — (#19)
- [ ] The operation receipt schema — needed by migration reporting and post-operation audit — (#19)

## Definition of done

- [ ] Every row above has an adopted value or an explicit deferral with its consequence stated.
- [ ] The decision is recorded so the tickets it unblocks can cite it rather than re-deriving it.
- [ ] No row is closed by observing that an implementation already chose a value.

## Blocked by

- None — can start immediately.

## Comment by artemVeduta

## Out of scope for `v0.1.0`

The accepted #43 resolution removes broad and recovery-dependent writes from this release. No durable operation store, observation journal, recovery snapshot, rollback protocol, or crash reconciliation is shipped. This decision remains future work for a guarded-operation release.
