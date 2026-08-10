---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/24
status: draft
type: Decision
---

# Design concept merge, split, redirect, and inbound-link semantics

Status: Closed.

## Question

How should concepts be merged, split, moved, superseded, or archived without silently breaking identity, provenance, inbound links, retrieval, or rollback?

**Must resolve:**

- preview and approval requirements for merge, split, move, and redirect operations;
- stable identifiers and redirect representation;
- deterministic inbound-link discovery and rewriting;
- provenance and trust-tier reassignment;
- source relationships and freshness state after restructuring;
- conflict handling when concepts differ across bundles;
- archive and successor behavior;
- index and retrieval updates;
- lossless operation manifests, snapshots/backups, rollback, and post-operation verification;
- behavior for partial failure and concurrent edits.

The result must define semantics suitable for deterministic implementation and migration tests.

## Comment by artemVeduta

## Carried across from [Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30)

The prototype on [`prototype/concept-restructuring`](https://github.com/artemVeduta/okf-agent-skills/tree/prototype/concept-restructuring/prototypes/concept-restructuring) deliberately **refuses** to settle this ticket's semantics — every one of them is an `Injected<T>` rendered with its owning ticket next to each use. What it does instead is make the consequences of each candidate drivable, so this grilling can run against evidence rather than intuition.

**Inputs, not open questions — treat these as settled by the prototype:**

- **Mechanics are safe under every candidate semantics.** Ordering, journaling, partial-failure recovery, and rollback are decided and do not constrain your choice. You are choosing meaning, not machinery.
- **Fan-out is refused.** An `okf-workspace://` alias may not resolve to more than one target; the machine will not infer which split output inherits an inbound link. If you want fan-out, you are adding it, not preserving it.
- **Provenance does not auto-merge.** The machine renders the raw union of `sources[]` plus a `provenanceCollisions` list. The dedup rule for the same evidence under different locators does not exist yet.
- **Rollback is bytes-only.** Whatever a redirect *is*, it must be byte-restorable, or rollback cannot reverse it.

**Sharpened questions, in the order the prototype found them biting:**

1. **With redirects `off`, a vacated Concept ID is indistinguishable to any consumer from an ID that never existed.** All continuity lives in an operation manifest that no corpus reader will ever open. The machine renders this as a first-class exhibit rather than a footnote — it is the strongest argument in the prototype for redirects existing at all. So: is a redirect a file, a frontmatter field, an index entry, or a manifest-only record — and is it *followable*?
2. **A link whose old and new identity are both live has no resolution value.** `LinkResolution` is three-valued (`resolves` / `unexpectedly-broken` / `knowingly-broken-approved`), and mid-rollback a rewritten link can point at a new identity about to be retired while the old one is already restored. The machine resolves against the forward manifest — honest about what the *operation* did — and says nothing about which of two live carriers a reader should follow. The `links-split-across-old-and-new` ambiguity exists to hand this back.
3. **Does a deprecated concept still satisfy an inbound link?** The machine currently treats deprecation as retirement for link-resolution purposes, so an unrewritten inbound link to a deprecated concept renders `unexpectedly-broken`. That is an assumption, not a decision.
4. **Are merge/split sources deprecated or deleted by default?** (`sourceDisposition`: `deprecate | delete | leave`.) Note the interaction with [Design operational trust tier matrix for skill operations](https://github.com/artemVeduta/okf-agent-skills/issues/11): deletion additionally applies the project-mode deletion rule, so the default is an authorization choice as much as a semantic one.
5. **What counts as an inbound link, and how far does discovery reach?** `InboundLinkSet` carries a completeness flag and reasons; the machine can run with an incomplete set but must say so. Freshness of that set is [Define what a discovery result caches, and what invalidates it](https://github.com/artemVeduta/okf-agent-skills/issues/32)'s.
6. **How does `sources[]` union on merge and partition on split?**

A constraint worth stating plainly: **identity continuity is not available to you.** [Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22) fixes path identity as the only identity, and the prototype enforces it mechanically — cross-bundle merge/split is unconstructible as a plan type. Whatever a redirect means, it cannot mean "this is still the same concept."

## Comment by artemVeduta

## Resolution

Restructuring semantics are decided as **meaning only**. [#30](https://github.com/artemVeduta/okf-agent-skills/issues/30) settled the machinery and holds it safe under every candidate semantics, so this ticket fills its injected ports and changes no mechanism.

### Scope

This ticket owns five decisions. The remaining bullets in the body are delegated, not re-decided:

| Bullet | Owner |
| --- | --- |
| Preview and approval requirements | [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) (matrix, non-weakenable); `rollbackAuthorization` and repair-operation approval to [#7](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| Stable identifiers | [#22](https://github.com/artemVeduta/okf-agent-skills/issues/22); path identity, no continuity |
| Trust-tier reassignment | [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11); merge/split outputs are draft and unverified |
| Source relationships and freshness after restructuring | [#12](https://github.com/artemVeduta/okf-agent-skills/issues/12); no baseline transfers to an output |
| Conflict when concepts differ across bundles | Dead. [#22](https://github.com/artemVeduta/okf-agent-skills/issues/22) forbids cross-bundle merge and the prototype makes it unconstructible as a plan type. Migration-time duplicate and conflict detection is [#19](https://github.com/artemVeduta/okf-agent-skills/issues/19)'s |
| Archive and successor behavior | [#14](https://github.com/artemVeduta/okf-agent-skills/issues/14) |
| Index and retrieval updates | [#14](https://github.com/artemVeduta/okf-agent-skills/issues/14) predicates, [#6](https://github.com/artemVeduta/okf-agent-skills/issues/6) `index.md` maintenance, [#13](https://github.com/artemVeduta/okf-agent-skills/issues/13) evidence-bound filtering, [#32](https://github.com/artemVeduta/okf-agent-skills/issues/32) cache invalidation by content addressing |
| Manifests, snapshots, rollback, post-operation verification | [#30](https://github.com/artemVeduta/okf-agent-skills/issues/30) mechanics, [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) recovery floor, [#7](https://github.com/artemVeduta/okf-agent-skills/issues/7) manifest location and checks |
| Partial failure and concurrent edits | [#30](https://github.com/artemVeduta/okf-agent-skills/issues/30) and [#31](https://github.com/artemVeduta/okf-agent-skills/issues/31) |

### 1. There is no redirect artifact

`redirects` resolves to `{mode: 'off'}` for `v0.1.0`. A retired concept path vacates and is indistinguishable from an identifier that never existed. `REDIRECT_PUBLISH` remains unconstructible; [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11)'s row moves from *blocked pending semantics* to **blocked, decided**, and `REDIRECT_RETIRE` ordering in `beginRollback` becomes unreachable.

Three facts decide this, not preference:

- In-bundle rewriting is **total by construction**. An incomplete `InboundLinkSet` is inadmissible and every discovered link must carry a fate, so a dangling in-bundle link after a move cannot be built.
- Retrieval has **no follow rule**. [#13](https://github.com/artemVeduta/okf-agent-skills/issues/13)'s five channels contain no redirect resolution, and no alias mechanism ships in `v0.1.0`. A stub would be findable only by its own path tokens and its own text, resolving nothing.
- [#21](https://github.com/artemVeduta/okf-agent-skills/issues/21) declined discoverability aliases on identical grounds, and forbids inventing product frontmatter or a machine-parsed body section. The only permitted carrier would have been an ordinary deprecated concept, which resolves nothing mechanically while permanently adding a ranked concept whose filtering costs a frontmatter scan.

Accepted cost, recorded rather than mitigated: a reference to a retired path from **outside** the bundle — another repository, an external document, human memory — dies silently with no trace of where the concept went. This is consistent with OKF's own normative stance that consumers MUST tolerate broken links.

### 2. An inbound link is a resolvable path reference outside code

Discovery covers, and rewriting is total over:

- Markdown inline links and reference-style link definitions.
- §6.2 path-valued frontmatter fields: `resource`, `sources[].resource`, `computation`, `executor.resource`, `attester.resource`.
- `index.md` list entries, which are link-bearing.
- `okf-workspace://<alias>/<concept-id>` cross-bundle links.

Excluded: bare path mentions in prose, and any occurrence inside a fenced block or an inline code span. A path shown as an example is display text; rewriting it corrupts the documentation that illustrates it.

Every included form is a parsed, resolvable reference carrying a byte offset, which is what makes a substitution provably confined. Bare prose and code occurrences have no such guarantee, and the regex strategy that would catch them is the one the research names as producing false positives on natural-language mentions.

The frontmatter surface is the load-bearing addition. `sources[].resource` is a path reference and, per [#12](https://github.com/artemVeduta/okf-agent-skills/issues/12), `sources` is the only authored provenance representation. A discovery pass seeing only `[label](path)` would report `complete: true`, rewrite every body link, and silently sever the sole provenance edge while settling clean.

A `rewrite` fate on a non-writable holder remains refused with `DESTINATION_BUNDLE_READ_ONLY`, so read-only federated peers already resolve to `knowingly-broken-approved` without a separate rule.

### 3. Provenance assignment is derived from the footnote join key

Each restructuring output is pre-filled with exactly the source entries its **retained body footnotes**, using the specification's own `[^id]` attribution key. One rule covers both directions: on merge the union falls out, on split the partition does.

A source entry that no output footnotes is underivable. It is assigned explicitly by a human or the operation refuses with `PROVENANCE_UNASSIGNED`. The suite never guesses concept-level provenance.

This is chosen against both silent failure modes. Copying every input's full `sources` to every output asserts evidence the output does not cite, and because outputs are `draft`, unverified, and carry no review baseline, nothing downstream ever corrects the inflation. Copying only footnoted entries would drop concept-level provenance without a word.

`provenanceAssignment` remains a table keyed by output, never a function, so the assignment renders in the preview and is bound into the approval fingerprint.

### 4. Identifier collisions block; resource collisions are reported

- **`same-id-different-resource` blocks the operation.** The merged document would carry two meanings for one footnote label, and every citation inherited from either input resolves ambiguously. This is the exact failure the specification's stable-`id` design exists to prevent, and no notice repairs it. The remedy is to re-key one input and re-preview, which the content binding in [#29](https://github.com/artemVeduta/okf-agent-skills/issues/29) requires in any case.
- **`same-resource-different-id` is a notice and both entries are kept.** Deduplicating breaks every footnote citing whichever entry is dropped, so the redundancy is harmless and removing it is the harmful act.

The suite never silently re-attributes a claim, and never rewrites body text to resolve a collision inside an operation approved for something else.

### 5. Source disposition follows project mode

- **Code-backed: `delete`**, on the eligibility proof [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) already requires — the preview proves the concept is superseded or redundant, holds no unique durable context, and recovery checks pass. The path vacates, consistent with decision 1.
- **Knowledge-only: `deprecate`**, because [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) blocks deletion where the bundle is authoritative.
- **`leave` is refused for merge and split sources in both modes.** It is `two-live-carriers-no-authority` by construction: two unmarked concepts asserting the same knowledge with nothing designating either authoritative.

`deprecate` is not the safer default it appears to be. A deprecated source retains its full text, has zero inbound links after rewriting, carries no supersede edge, ranks in retrieval, and costs a paid frontmatter scan to filter. It preserves the bytes and loses the meaning. Rollback restores the source byte-for-byte under either disposition, so `deprecate` buys no recoverability that `delete` lacks.

### 6. Link resolution reads existence, never status

A link resolves **if and only if its target file exists**. `status` is never an input to link resolution. This corrects [#30](https://github.com/artemVeduta/okf-agent-skills/issues/30)'s stated assumption that deprecation is a retirement for link-resolution purposes.

- The specification's only gloss on the value is *"`deprecated` — Kept for links and history; no longer current."* Rendering a link to it `unexpectedly-broken` contradicts that sentence, and §6.1 and §11 both instruct consumers to tolerate genuinely broken links rather than manufacture new ones.
- `status` lives in frontmatter, which is available nowhere else and costs a paid scan. A verdict that depends on it becomes priced and evidence-bound, so the same corpus yields different answers depending on what the budget bought. This ticket's requirement is semantics suitable for deterministic implementation and migration tests. Existence is a `stat`; status is a purchase.

Resolution and honesty stay separate concerns. The `links-split-across-old-and-new` ambiguity still renders whenever old and new carriers are both live, which after these decisions occurs only in the knowledge-only `deprecate` case. Collapsing the predicate into the signal is what produced the original assumption.

### Handed forward

A knowledge-only merge or split leaves a deprecated source with **no supersede edge** — an orphan holding a complete, plausible, superseded account of the knowledge, with nothing saying where it went. Deletion is blocked there by [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) and this ticket declines to invent a pointer that [#21](https://github.com/artemVeduta/okf-agent-skills/issues/21) forbids. [#14](https://github.com/artemVeduta/okf-agent-skills/issues/14) owns `supersedeEdge` and must close this.

### Ports resolved

| Port | Value |
| --- | --- |
| `redirects` | `{mode: 'off'}`, decided rather than pending |
| `inboundLinkFates` | Total over the reach in decision 2; `rewrite` for writable in-bundle holders, `knowingly-broken-approved` elsewhere |
| `provenanceAssignment` | Footnote-derived default; unfootnoted entries assigned explicitly |
| `sourceDisposition` | `delete` code-backed on the [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11) proof, `deprecate` knowledge-only, `leave` refused |
| `InboundLinkSet` | Completeness judged against decision 2's reach; freshness remains [#32](https://github.com/artemVeduta/okf-agent-skills/issues/32)'s |

No numeric threshold is adopted. Nothing here weakens the authorization matrix, the approval binding, or the recovery floor.

Adopted from written analysis with sub-agent evidence gathering. Live human validation of the resulting implementation is not claimed.
