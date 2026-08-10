---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/31
status: draft
type: Decision
---
# Decide where manual-operation guard state persists and how concurrent sessions coordinate

Status: closed.

## Question

The guard state machine validated in [#29](https://github.com/artemVeduta/okf-agent-skills/issues/29) holds three pieces of state that must survive between the preview turn and the execute turn: the outstanding preview token (fingerprint, plan, attestation), the bundle **epoch** that obsoletes sibling confirmations after any completed manual operation, and the list of **spent** fingerprints that makes a confirmation single-use. The prototype kept all three in memory, which no real invocation can do.

Where does that state physically live, and what coordinates two sessions that hold confirmations for the same bundle at once?

**Must resolve:**

- Which store: a file inside the OKF bundle, a sibling state file, a temp/cache location outside the bundle (the migration research puts the dry-run manifest in a temp location, deliberately *not* inside the bundle), or the harness's own session storage where one exists.
- Whether guard state is committed, ignored, or never written to the repository at all — and what that implies for a fresh clone, a CI checkout, and a worktree.
- How a second session discovers an outstanding or in-flight confirmation: a lock, an epoch read, or nothing at all (the prototype's epoch check catches a *completed* rival run, but not two sessions armed simultaneously).
- Whether the spent-fingerprint list is pruned, and by what rule, given that a fingerprint is content-derived and can legitimately recur after a rollback.
- What the guard does when its own state file is missing, unreadable, or written by a newer version — fail closed (refuse and require a fresh preview) is the presumed answer, but it needs to be stated.

Does not reopen the state machine itself, which #29 settled.

## Comment by artemVeduta

## Resolution

Use a **manual-operation guard ledger**: local, uncommitted, bundle-scoped safety state outside both the OKF bundle and harness session storage. Harness storage may cache it but is never authoritative.

### Persistence boundary

- In a Git repository, store one ledger directory per canonical bundle identity at `<git-common-dir>/okf-agent-skills/guard/<bundle-key>/`. Linked worktrees therefore coordinate for the same logical bundle and conservatively invalidate one another even when their checked-out content differs.
- In a non-repository workspace, use `<workspace-root>/.okf-agent-skills/guard/<bundle-key>/` as a local sidecar.
- The state is never committed. A fresh clone, replacement repository instance, or CI checkout has no inherited confirmations, epoch, or replay history. Its first preview initializes a new ledger generation; it cannot execute a token issued elsewhere.
- `<bundle-key>` derives from the canonical bundle identity settled in [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22), not from a display name.

The schema-versioned ledger stores its generation, bundle epoch, outstanding occurrence-bound preview tokens and their plans/attestations, current or interrupted execution state, and bounded spent records. It may store paths, actions, risk classes, and content hashes, but never source content. The lock lives beside it. Ledger files use owner-only permissions where supported and write-temp, flush, atomic-replace discipline. If the runtime cannot create, secure, lock, or atomically replace the ledger, confirmation and execution fail closed.

### Concurrency protocol

Several sessions may hold outstanding previews at the same epoch. Short ledger updates take the per-bundle lock; execution takes an exclusive lock for its full duration:

1. Acquire the lock, reread the authoritative ledger, and reject a mismatched generation, obsolete epoch, absent or spent token, or operation/selector mismatch.
2. Recompute and validate the complete current plan under the lock using the content-binding rules from [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29).
3. Atomically record `in-flight` before beginning mutation.
4. On success, atomically spend the occurrence-bound token, advance the epoch, invalidate all sibling confirmations, clear `in-flight`, and release the lock.

A waiting session then acquires the lock, observes the new epoch, and must preview again. Epoch checking without this lock is insufficient because it cannot stop two already-armed sessions from beginning together.

A handled operation failure atomically replaces `in-flight` with `failed` before releasing the lock. It neither spends the token nor advances the epoch, preserving the prototype retry contract; every retry and sibling execution still replans under the lock, so partial mutation expires a mismatched confirmation.

If the process disappears while the OS lock is released but `in-flight` remains, the outcome is unknown. Confirmation and execution stay blocked. Explicit recovery reports the recorded operation, token, fingerprint, and start time, then advances the epoch, clears all outstanding confirmations, and records the interrupted token with `outcome: unknown`. Recovery neither assumes success nor performs rollback; the next attempt requires a fresh preview against current content.

### Replay retention

A spent record is `{token occurrence ID, fingerprint, execution epoch}`, not a permanent blacklist of a raw content fingerprint. On a successful epoch advance, retain the record just spent in the immediately preceding epoch and prune older spent records. Immediate replay still receives `TOKEN_SPENT`; older tokens remain unauthorized because they are no longer outstanding and carry obsolete generations or epochs. A fresh preview may therefore authorize byte-identical content that legitimately recurs after rollback.

### Missing and incompatible state

- Missing during preview: initialize a new random ledger generation at epoch zero and issue only a fresh token.
- Missing during execute: refuse with `STATE_MISSING`; never reconstruct authorization from caller-supplied token data.
- Unreadable, corrupt, insecure, or newer-schema state: refuse confirmation and execution without rewriting it.
- Recovery is to restore access, use a compatible runtime, or explicitly reset the ledger. Reset creates a new random generation and invalidates every prior confirmation; it never imports authorization presented by the caller.
- Unknown fields may be preserved within a supported schema, but an unsupported schema version fails closed.

This persistence and coordination contract completes the cross-invocation part of the guard without reopening which operations are manual-only or the state-machine verdicts already settled by the prototype.
