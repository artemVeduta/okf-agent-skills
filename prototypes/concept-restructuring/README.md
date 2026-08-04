# Prototype — concept restructuring and rollback

**Throwaway.** This checkout lives in `prototypes/concept-restructuring`; it is never a production
implementation and never belongs on `main`. It exists to make one
candidate model drivable for wayfinder ticket
[Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30);
the validated decision is what graduates, not this code. The adopted model is
`prototypes/concept-restructuring/DESIGN.md` — read that first; this README only records how the
code realises it and where it deliberately does not.

## The question

When a user drives merge, split, move, and supersede operations through preview, apply, partial
failure, concurrent edit, verification, and rollback, which state, operation-manifest, redirect, and
inbound-link transitions preserve identity, provenance, trust, source relationships, and
recoverability **without permitting an ambiguous or silently lossy state**?

The machine starts **at apply**. The explicit request, the complete preview, the confirmation
binding, and the fresh recheck are already-satisfied inputs consumed from the guard prototyped under
[Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29).
They are never re-derived here.

## Out of the question's scope, deliberately

Nothing below is decided by this prototype. Each enters the machine as an `Injected<T>` carrying its
owning ticket and its open question, and is rendered verbatim at every use site.

| Not decided here | Owner |
| --- | --- |
| What a redirect *is* and whether it is followable; which split output inherits which inbound link; how `sources[]` unions and partitions; whether sources are deprecated or deleted; the inbound-link discovery contract | [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24) |
| Archive representation, archive metadata, retention, whether deprecated concepts are hidden from retrieval | [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) |
| Manifest serialization and storage, the validation check set, every numeric threshold, the snapshot mechanism, the rollback-authorization policy value | [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) |
| Everything before apply: request matching, preview completeness, confirmation binding | [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29) |

Binding inputs it consumes without re-litigating: the authorization matrix, approval fingerprint,
recovery gate and the claim-affecting-edit rule from
[Design operational trust tier matrix for skill operations](https://github.com/artemVeduta/okf-agent-skills/issues/11);
identity, routing and precedence from
[Define concept identity, cross-bundle routing, precedence, and workspace trust](https://github.com/artemVeduta/okf-agent-skills/issues/22);
provenance and freshness from
[Design concept-source traceability and freshness detection](https://github.com/artemVeduta/okf-agent-skills/issues/12);
ledger, locking and epoch from
[Decide where manual-operation guard state persists and how concurrent sessions coordinate](https://github.com/artemVeduta/okf-agent-skills/issues/31).

## Run it

```bash
node prototypes/concept-restructuring/tui.ts          # drive it by hand
node prototypes/concept-restructuring/walkthrough.ts  # replay the computed hard-case catalogue
```

Node 22.6+ is required for Node's built-in TypeScript type stripping; there are no dependencies, no
package manager, no build step, no test framework, and nothing is written to disk.

In the TUI, `[` and `]` cycle 15 fixtures. Every frame collection is rendered after every keystroke,
not only its count: concept occupancy, the operation manifest and per-step observations, the
inbound-link graph with redirects, trust, review dependencies, recovery evidence, ambiguities,
residue, human action, open questions, epoch advances, and the notice. Every state row is rendered;
only an individual long line can be truncated to the visible width, which has a minimum of 80 columns.

The driver uses a begin/completion pair for each effect. The begin action records `INTENT` with its
undo snapshot before mutating; the completion action records `OUTCOME` with the observed post-image
after mutating. `completeStep` carries both `observedAfter` and `observedAfterKnown`, so an unknown
post-image is not treated as an absent file. A mid-effect crash has no action payload and leaves the
effect unresolved. Recovery is human-directed: `reconcile` records read-only evidence by comparing
the observed world with the sealed images and does not repair the corpus automatically.

Move source and destination pre-images are checked immediately before their respective writes under
the lock. Partial I/O is classified from observed bytes against the sealed before- and after-images,
not assumed to be clean. In the fake corpus, `bytesRef` encodes `key`, `status`, `statusExplicit`,
`body`, `verification`, and `sources`; it does not model unknown real-file syntax. Rollback restores
from the matching `SnapshotEntry`, not from the parsed `pre` corpus or a parsed view, and does not
reserialize content. `rollbackAuthorization` remains an injected, open policy value owned by issue
#7 and is rendered, but this branch always requires fresh approval bound to the exact inverse
manifest. Manifest storage and serialization remain open under issue #7.

Cross-bundle in-bundle Markdown links are not rewritten to foreign targets. They remain local to their
bundle and do not silently fall through to another bundle. Admission requires approved breakage or
refuses the plan, and link resolution uses observed target file existence, not concept status.

## Files

| File               | Keep?                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| `restructure.ts`   | **yes** — the pure reducer; zero imports, zero I/O, no terminal coupling |
| `DESIGN.md`        | **yes** — the adopted model this code realises                          |
| `corpus.ts`        | no — fake multi-bundle corpus, crude planner                              |
| `driver.ts`        | no — keystroke glue shared by the two shells                            |
| `tui.ts`           | no — terminal shell                                                     |
| `walkthrough.ts`   | no — scripted replay of the hard-case catalogue                         |

## The model, in one screen

**The journal is the truth.** `Phase` and `Classification` are derived from it by `derive` and
`classify` and are never stored, so the phase can never disagree with the record. `settled` means
exactly "a durable `SETTLED` record exists". The journal is segmented on `ADMITTED`; a rollback
appends a second `ADMITTED` carrying an inverse manifest whose `revertOf` names its parent, so the
parent's escapes and observations stay readable while the rollback runs.

**Terminals are settlement × cleanliness**, not a single success/failure axis:

```
admitting → refused | gate-blocked | expired          (clean, nothing moved)
          → manifest-durable → mutating → verifying → applied-clean
                                                    → applied-with-known-breakage
                                        ↘ failed-clean   (handled, zero bytes moved)
                                        ↘ failed-dirty   (ambiguity set REQUIRED non-empty)
                                         ↘ unknown-interrupted (failed; human-only)
failed-* → rolling-back → reverted-clean | reverted-with-residue (dirty) | rollback-failed
```

**Silence is a reducer-invariant violation, not a policy.** A dirty terminal must carry an ambiguity
or residue notice; `unclassified-loss` exists so an unanticipated loss becomes a loud, named finding
rather than a clean report. The walkthrough computes its catalogue size and asserts
`checkInvariants` is silent for every row.

**The phase table is the guard.** `PHASE_ALLOWS` (DESIGN.md §3.0) is the transition table's `From`
column as data, consulted before any `reduce` case runs. Three adversarial passes found six holes
that were all the same shape — a guard spelled out inside the one case that needed it and omitted
from the others, leaving a phase that was terminal only in the render. Catalogue section `A-*` is one
row per hole; each failed before its fix.

**Two orderings carry the design.** The manifest, its lineage and its inverse steps are durable
*before* the first byte moves; the token spend and the epoch advance sit only between the last
`OUTCOME` and `SETTLED`, so a verification failure leaves the token unspent and a rollback can never
ride a spent token.

**Trust cannot see identity.** `trustFate(before, EditClassification)` has no parameter that could
carry a key, a lineage record, another concept's tier, or a count — and neither does `classifyEdit`,
which sees only an effect kind and two byte-level facts. A move's write half reads the verification
of the bytes it moved, never a continuity rule.

**Illegal operations are unconstructible where the type system can carry it.** `MergePlan` and
`SplitPlan` hold one `BundleId`; there is no bundle-root plan variant; `ScheduledRepair` is not an
`EffectStep`, so no `beginStep`/`completeStep` pair can execute a dependency repair; `restoreFrom`
accepts only a `SnapshotEntry` of bytes, so nothing can restore from the parsed `pre` corpus. Where the type system
cannot, admission refuses by name from a closed 29-member `RefusalCode` enum.

## Divergences from `DESIGN.md`

Everything below was implemented differently because the design was underspecified or wrong there.
Nothing else differs.

1. **`crash` appends an `INTERRUPTED` record but carries no payload.** T19 records no `OUTCOME`.
   Liveness — "the lock holder is gone" — is not a journal fact, but I44 requires the phase to be
   derivable from the journal alone. `INTERRUPTED` stands for the *next* process's observation that
   the journal is in-flight, has no `SETTLED`, and has no live holder. Mid-effect recovery remains
   human-directed: `reconcile` records evidence and does not repair automatically.
2. **`acknowledge` appends an `ACKNOWLEDGED` record.** The design gave it an action but no record;
   an acknowledgement that is not durable is not an acknowledgement.
3. **`ADMITTED` carries the whole `ApprovedPlan`, not just its manifest, plus a snapshot of the
   observed world.** The recheck must compare against the items the human actually saw, and
   `identityDiff` needs a "before". Both are facts of the admission, so both belong on its record.
4. **`Observed` carries `status` beside the render-only `view`.** Two admission guards genuinely need
   status (`REANIMATES_RETIRED_IDENTITY`, and planned-action drift `MODIFY -> KEEP`). Splitting it
   out keeps I23 mechanical: no guard in `restructure.ts` reads `view`, only `derive` does.
5. **`EffectStep` gained `outputDraft` and `movedFrom`.** The design asserts I1, `EMPTY_OUTPUT` and
   `NOT_A_SPLIT_RECLASSIFY_AS_MOVE` without giving the step any field those refusals could read;
   `movedFrom` is what lets a move's write half be a path move rather than a fresh authoring, which
   is what makes V-V-01 (identity changes, `verified` survives) true without a continuity field.
6. **`NonClaimAllowlist` gained `index-regeneration` and `byte-identical-restore`.** Regenerating an
   index and restoring bytes must not clear `verified`, and the three-member allowlist had no member
   that honestly covered either.
7. **`OperationManifest` gained `supersedeChain`.** P-P-04 requires a cycle refusal and a rendered
   chain depth; neither is derivable from the fields the design listed.
8. **The parent specification classifies `reverted-with-residue` as dirty.** Its bytes are restored,
    but an irreversible external effect remains.
9. **A retry over this operation's own partial write reaches the recheck instead of being refused.**
   An occupant whose bytes are exactly a step's sealed post-image (for a step that expected absence),
   and a source whose deprecation is exactly this operation's own sealed post-image, are not
   `DESTINATION_OCCUPIED` / `REANIMATES_RETIRED_IDENTITY`; they route to `expired` with named drift.
   This is what I29 already says should happen, and refusing at admission would have hidden it.
10. **The cross-bundle merge/split check reads only write and removal steps.** A link rewrite or an
    index regeneration in another bundle is ordinary collateral, not a cross-bundle merge.
11. **`REVIEW_REPAIR_PERFORMED_INLINE` only fires for baselined third-party dependencies.** A
    no-baseline mapping proposed for an output of this very operation is not a repair target, so
    editing that output is an ordinary planned edit (this is what makes "move plus content edit"
    admissible at all).
12. **The inverse of a relocation is `UNDO_CREATE` + `RESTORE_BYTES`, not a `MOVE_PATH`.** P-R-03
    calls it "a reverse move", which it is; expressing it as two bytes-only inverse steps is what
    keeps I9's "restore sees only bytes" guarantee intact.

## Things the machine names rather than closes

DESIGN.md §6 now hands back eight gaps. Three of them came out of the adversarial passes and belong
to open tickets rather than to this prototype:

- **A `rollback-failed` corpus has no repair operation** (§6 gap 5). Whether "repair a half-restored
  corpus" is an approvable operation kind of its own is
  [Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7)'s
  call. The machine refuses to invent one — the alternative, re-running the rejected inverse step,
  turns the loudest terminal into the quietest with one keystroke.
- **`rolling-back` is a clean, non-terminal window with the corpus at its most inconsistent** (§6
  gap 6). Both anti-silence devices are off for its duration. The exit for an abandoned rollback is
  `crash`, which reaches the dirty, loud `unknown-interrupted`.
- **A link whose old and new identity are both live has no `LinkResolution` value** (§6 gap 7). The
  machine resolves against the forward manifest and hands the "which carrier does a reader follow"
  question to
  [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24)
  via the `links-split-across-old-and-new` ambiguity.

Driving the code also surfaced one more worth putting in
front of [Design concept merge, split, redirect, and inbound-link semantics](https://github.com/artemVeduta/okf-agent-skills/issues/24):
**link resolution uses target-file existence**, so an unrewritten inbound link to a deprecated concept
still resolves while the old file exists. Status is not used as a link-resolution input.
