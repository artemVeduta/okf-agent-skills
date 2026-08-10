---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/14
status: draft
type: Decision
---
# Design archive lifecycle and discoverability

Status: This decision is closed.

## Question

What should the archive convention and lifecycle be for OKF concepts—directory structure, metadata, retention policy, discoverability, and restoration—and how should it differ between code-backed and knowledge-only projects?

The research in [`docs/research/lightweight-durable-context.md`](https://github.com/artemVeduta/okf-agent-skills/blob/main/docs/research/lightweight-durable-context.md) identifies archival as a priority decision. Physical relocation must not be chosen until stable identity, redirects, inbound links, and merge/split semantics are resolved.

**Must resolve:**

- Should deprecated concepts stay in place, move to `archive/`, or use another representation?
- Which metadata is needed, such as `deprecation_reason`, `superseded_by`, or `retain_until`?
- Should indexes and default retrieval hide deprecated concepts while retaining explicit discoverability?
- What evidence can trigger an archive recommendation? Time-based or inbound-link thresholds are configurable candidates, not established facts.
- Which trust tiers permit recommendation, preview, approval, execution, and restoration?
- What independent snapshot/backup, dry-run manifest, rollback, and post-restore verification are required?

## Comment by artemVeduta

Boundary sharpened by [Prototype budget-aware concept selection behavior](https://github.com/artemVeduta/okf-agent-skills/issues/28): default deprecated-concept filtering is possible only after paying for a frontmatter scan, because status is otherwise unread. The decision must cover scan-paid filtering, honest index-only behavior that reports status was not read, and explicit retrieval of deprecated concepts.

## Comment by artemVeduta

Context pointer: [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) fixes evidence-bound filtering: only observed metadata can produce `FILTERED`, exact demands bypass ranked filters with a warning, and incomplete filter observation cannot support a completeness claim. This ticket still owns the default archive/status predicates.

## Comment by artemVeduta

## Carried across from [Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30)

The prototype on [`prototype/concept-restructuring`](https://github.com/artemVeduta/okf-agent-skills/tree/prototype/concept-restructuring/prototypes/concept-restructuring) runs archive as an injected input with defaults `archive: deprecate-in-place`, `supersedeEdge: none`, `deprecatedHiddenFromIndex: false`. Three questions came out sharper than they went in:

1. **The same user intent expands into two structurally different operations.** `deprecate-in-place` is a metadata edit; `relocate` is a full identity-changing move that rewrites links and changes the concept's identity per [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22). One is small, the other trips [Design operational trust tier matrix for skill operations](https://github.com/artemVeduta/okf-agent-skills/issues/11)'s broad/identity-affecting recovery gate. "Archive this" cannot be one operation kind until this is decided.
2. **Does deprecation have a retrieval side effect that rollback cannot reverse?** If a deprecated concept is hidden from the index, then between the deprecation and its rollback a retrieval consumer saw a corpus without it — an effect no byte restoration undoes. The machine records the intent and its escape class without deciding, but it is the clearest case in the prototype of a *non-file* effect inside a supposedly reversible operation.
3. **What represents a supersede edge, and is there archive metadata at all?** (`none` / `superseded_by` field / index entry.) The machine runs with `none` and refuses supersede cycles with a rendered chain depth, so a decision here has a concrete place to land.

Note for whichever way (2) goes: the prototype's inverse of an archive *relocation* is `UNDO_CREATE` + `RESTORE_BYTES`, not a reverse `MOVE_PATH`, so that the bytes-only restore guarantee survives. If archive metadata is added, its inverse must be expressible the same way.

## Comment by artemVeduta

## Carried across from [#24](https://github.com/artemVeduta/okf-agent-skills/issues/24)

[#24](https://github.com/artemVeduta/okf-agent-skills/issues/24) is closed. Two of its decisions land on this ticket.

**The orphan, which this ticket must close.** [#24](https://github.com/artemVeduta/okf-agent-skills/issues/24) sets source disposition by project mode: `delete` in code-backed projects on [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11)'s eligibility proof, `deprecate` in knowledge-only projects because [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) blocks deletion where the bundle is authoritative.

So every knowledge-only merge or split leaves a deprecated source that retains its **full original text**, has **zero inbound links** (rewriting is total), and carries **no supersede edge** — `supersedeEdge` is still `none` and is owned here. A reader who retrieves it gets a complete, plausible, orphaned account of superseded knowledge with nothing saying where it went. It also ranks in retrieval and costs a paid frontmatter scan to filter, per [#28](https://github.com/artemVeduta/okf-agent-skills/issues/28).

[#24](https://github.com/artemVeduta/okf-agent-skills/issues/24) declined to close this itself: a successor pointer is exactly the product frontmatter or machine-parsed body section that [#21](https://github.com/artemVeduta/okf-agent-skills/issues/21) forbids, so it needs the archive decision, not a redirect decision. The permitted carriers remain standard OKF fields, visible Markdown conventions, or non-concept operational state.

**Two constraints this ticket now inherits.**

- **There is no redirect.** `redirects` resolves to `off` for `v0.1.0` and [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11)'s row is blocked-decided, not blocked-pending. Physical relocation under `archive: relocate` therefore vacates the old path outright — no stub, no indirection. Its safety rests entirely on total inbound-link rewriting.
- **Deprecation is not retirement for link purposes.** A link resolves if and only if its target file exists; `status` is never a resolution input. An inbound link to a deprecated concept **resolves**, matching the spec's own gloss, *"kept for links and history"*. This corrects the assumption [#30](https://github.com/artemVeduta/okf-agent-skills/issues/30) flagged. The reason is binding on this ticket too: `status` costs a paid frontmatter scan, so any verdict reading it becomes budget-dependent and non-deterministic.

The non-reversible hiding problem raised earlier remains this ticket's, and the second constraint narrows it: hiding a deprecated concept from retrieval cannot be justified as making its inbound links broken, because they are not.

## Comment by artemVeduta

## Resolution

Human-confirmed archive lifecycle for `v0.1.0`.

### Operations

- Normal `archive` means `in-place deprecation` in both project modes: retain the current path and set standard `status: deprecated`.
- `relocation` is a separate explicit operation with a required destination inside the same bundle. Do not infer `archive/`, overwrite a collision, or auto-suffix a path.
- Relocation changes path-based identity. The decisions in [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22) and [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) remain binding: no redirect ships in `v0.1.0`, complete inbound-link rewriting is required, and incomplete link discovery blocks relocation.
- Code-backed deletion is separate and proof-gated. Knowledge-only authoritative content is not automatically deleted. Merge/split source disposition remains governed by the prior project-mode decision.

### Content And Retention

- Use only standard `status: deprecated` as authored lifecycle metadata. Do not add `superseded_by`, `deprecation_reason`, or `retain_until` in `v0.1.0`.
- When a successor is known, add a visible ordinary Markdown [successor notice](https://github.com/artemVeduta/okf-agent-skills/blob/main/CONTEXT.md) with one or more links. It is navigation, not a redirect or machine-parsed relationship.
- Retain deprecated concepts indefinitely by default. Age, `stale_after`, and inbound-link counts do not trigger automatic purge.

### Discoverability

- Keep deprecated concepts in indexes. An index may label a concept deprecated only after observing its status.
- Ordinary ranked retrieval excludes observed deprecated concepts by default. Exact path or concept-identity retrieval remains available with a warning.
- If status was not observed, return a degraded unfiltered result and disclose the unevaluated archive predicate. Do not claim `FILTERED`; keep incomplete observation distinct from `UNSEARCHED`, `UNDISCOVERED`, and `UNRESOLVED`.

### Recommendations And Safety

- Archive recommendations are read-only. `stale_after`, changed review dependencies, complete orphan evidence, and configured policy may prompt review but never mutate content.
- Trust tiers remain advisory. Every in-place deprecation needs an explicit request, complete preview, approval, fresh recheck, sealed manifest, and exact before-image.
- Relocation additionally needs independent snapshot and disposable restore verification, complete link evidence, link/index validation, and recovery evidence.
- Rollback restores controlled bytes and future behavior. It reports retrieval, external-index, or external-link observations that escaped before rollback as non-reversible residue.

This closes [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14). Implementation sequencing and validation detail remain with their owning decisions.
