# Specification architecture review

Date: 2026-08-01. Reviewer: architecture pass over the wayfinder decision set.

## Scope and method

The project has no source code. The artifact under review is the **state of the
specification**: 30 closed wayfinder tickets, the 48-term vocabulary in `CONTEXT.md`, and
43 research notes in `docs/research/`.

This review applies the deep-module method to that artifact. A ticket is a **module**. Its
adopted decision is the **interface** it presents to the next ticket. A ticket is **deep**
when a short interface hides much work. A ticket is **shallow** when the interface is as
complex as the work behind it, or when the interface says "unset". A **seam** is the point
where one ticket hands a value to another. The **deletion test** asks whether removal of a
module concentrates complexity or only moves it.

**Question answered:** is the specification sound enough for #8 to produce an
implementation-ready specification without invention of product behavior?

**Answer: no, not yet.** Four findings block #8. Six more force invention or a bad
implementation shape. Two are cleanup. The corrections are small. Most are decisions that
exist in a closed ticket comment but are not carried into any normative artifact.

---

## Blocking findings

### B1. No number in the whole specification is set, and no ticket makes one

**Tickets:** #7, #13, #28, #33, #9.

**What is wrong.** #7 owns every numeric value: human tolerances, reserve and work
profiles, ranking weights, evidence-sufficiency thresholds, notice caps, fallback
allowances, and the selected operating points. #7's adopted decision says these values
"remain unset until the required deterministic calibration record exists". #33 says the
same: "every density, bound, cap, fraction and weight is invented; calibration is owed by
#7 against a corpus that does not exist yet".

The calibration corpus is the missing module. #7 lists its required strata, its
calibration/held-out separation, its metrics, and its per-tokenizer separation. **No
wayfinder ticket builds it.** #8 is blocked by #7, #9 is blocked by #8, and #9 must ship
deterministic fixture tests. A fixture test of a budgeted selector needs a divisor, a
reserve fraction, and a cap. #8 therefore cannot write a normative specification, and #9
cannot write a test, without invention of the numbers #7 forbids.

**Why the shape is bad.** #7 is a shallow module. Its interface enumerates ten families of
value; its implementation supplies none. It also holds validation, growth, compaction,
approval, recovery, manifest storage, and calibration execution. Understanding one crash
path needs all of it.

**Correction.**
1. Open one ticket: **build and pin the calibration corpus and the calibration harness**.
   Make it a `v0.1.0` release deliverable and a blocker of #9, not of #8.
2. Split #7. Move the eight open recovery contracts (see
   `docs/research/issue-7-unresolved-recovery-contracts.md`) into a recovery-contract
   ticket, and the numeric program into the calibration ticket. What is left of #7 —
   validation scope, growth policy, compaction policy, approval gates — is already decided
   and can unblock #8 immediately.
3. State in #8 that the specification declares **named profiles with unset values plus one
   disclosed safe fallback per gate**, and that the values arrive from the calibration
   ticket. That keeps #8 honest instead of blocked.

### B2. An uncalibrated deployment returns `insufficient` for every read, so the product is inert

**Tickets:** #11, #13, #33, #35, #7.

**What is wrong.** #11's base matrix row one gives read, validate, and read-only analysis
`A/A/A` in every cell of both project modes. #35 states that every supported session seam
emits a bounded read-only orientation result. But #13 says that an unknown budget with no
calibrated fallback returns `insufficient`, and #7 repeats it: "with an unknown budget and
no calibrated fallback, materialized retrieval returns `insufficient`". By B1 no
calibrated profile exists. #33 states the consequence directly: *every* unknown-provenance
call refuses today, which turns #11's unconditionally allowed read into a read gated on an
artifact nobody has built.

The map (#1) records this as a "tension" in its notes. A tension in a note is not a
decision. #8 must resolve it or invent the resolution.

**Correction.** Choose one, and write it into #8 as normative:
- **Preferred:** define an **orientation path that spends no token estimate**. Orientation
  per #35 is navigation and status only. A path listing plus concept counts plus a
  bounded fixed-size status line needs no tokenizer and no divisor, so it can be honest
  with no calibration. Materialized retrieval keeps the `insufficient` rule.
- Or: ship exactly one conservative fallback profile as part of the calibration ticket,
  and make it a release gate.

The first option is the deeper module: it removes the dependency of a read on an unbuilt
artifact instead of moving it.

### B3. `retrieve()` has no settled signature

**Tickets:** #13, #33, #5.

**What is wrong.** #13 adopts one interface for the whole retrieval runtime:

```
retrieve(scope snapshot, query, exact references, task kind,
         budget attestation, breadth and filters)
  -> bounded materialized context package + omissions + receipt
```

#5 then makes this the central `scripts/lib/` module that all four skills call. It is the
load-bearing seam of the product. #33's six corrections each change that signature, and
#13 is closed with the corrections recorded only as amending text:

| #33 correction | Change to the interface | Status |
|---|---|---|
| 2. seam is attested, not constant | new required input: adapter seam attestation | not in the signature |
| 5. audit is attested | new required input: audit capability; new receipt value `unverified` | not in the signature |
| 5. quarantine is cross-call state | needs an owner; a stateless function has nowhere to put it | unresolved |
| 3. `SECTION` hides intra-concept loss | new output: section manifest **or** `sectionsOmitted: n` | **choice never made** |
| 4. evidence-bound filtering has no observable | new output: per-predicate coverage count | not in the signature |
| 7. `UNDISCOVERED` has two causes | new field on the omission entry | not in the signature |

Correction 3 is the sharpest gap: #13's own text says "the remedy is #13's to choose", and
#13 never chose. Correction 5 is a contradiction, not an omission: quarantine is cross-call
state inside a runtime that #13 declares stateless and that #33 confirms is stateless.

**Correction.** #8 must publish **one normative `retrieve` interface** that folds in all
six corrections, plus the smaller ones (`FILTERED` dominates `CLIPPED`; `MISS` is
unreachable under satisfice as worded; scope summaries must be capped; the honest floor is
a function of the request, not of the runtime). Two decisions must be made, not carried:
- pick `sectionsOmitted: n` over the section manifest — it is O(1), it is priced, and the
  manifest can exceed the sections it discloses;
- give quarantine to the **adapter**, as an injected input plus an output verdict. The
  runtime stays stateless and the adapter owns the durable registry. That preserves #13's
  statelessness instead of quietly abandoning it.

### B4. "Coherent" is still undefined, so the satisficing stop rule cannot be implemented

**Tickets:** #13, #33, #7.

**What is wrong.** #13 says satisficing stops when one candidate or a "coherent linked
evidence set" covers every retained query clause. #33 proved that the term has no content:
at one extreme the rule degenerates into exhaustive search bounded by the work cap; at the
other it is #28's union rule renamed; and on every fixture `linked` and `component` are
byte-identical, because index files link every concept in a directory. The rule also has
no notion of clause informativeness while #13 bans every cheap discriminator by name, so
`the` discharges coverage as fully as `retention`. Document frequency is offered as a
proposal, not a finding.

#7 owns the *thresholds*, not the *definition*. So no ticket owns the definition, and the
default retrieval mode of the product depends on it.

**Correction.** #8 must define the stop rule as a named, testable predicate. The lazy
correct option is to drop the "coherent set" language and stop at **one candidate that
covers every retained clause, or the work cap, whichever comes first**, with the union
rule declined for `v0.1.0` and recorded as declined. That is implementable, deterministic,
and removes a term nobody can test.

---

## Findings that force invention or a bad shape

### C1. #5's library-only delivery decides the ledger seam, and the map still headlines the reversed economics

**Tickets:** #5, #13, #28, #33, #35.

**What is wrong.** #33's second correction says the "internal reads do not consume model
context" claim is a deployment property, and that a CLI's stdout **is** a tool result.
#5 then chose library-only delivery: pure modules in `scripts/lib/`, thin wrapper scripts
per skill, and "harness adapters exec the wrapper scripts and read stdout". Reading stdout
of an exec'd script is a tool result. So all three shipping adapters are on the
**in-context seam** by #33's own argument.

Two consequences the specification does not draw:
1. #1's decision entry for #28 still headlines the index economics — bare index pre-pays
   nothing, descriptive index pre-pays `LINE` — and adds that they do not hold on the
   out-of-context seam. On the seam #5 actually chose, they **do** hold. The entry is
   ambiguous exactly where it must be exact.
2. If every shipping adapter is in-context, the attested seam has one implementation. One
   adapter is a hypothetical seam, not a real one. The two-ledger split then carries
   configurability nobody uses, and #33's measured 161/372 divergence is unreachable.

**Correction.** #8 must state the seam of each of the three adapters. If all three are
in-context, keep **one context ledger** as the model-facing rule and demote the
discovery-work ledger to an internal resource limit with no attestation input. Delete the
seam attestation field. Re-introduce it when a second seam exists. Also correct #1's #28
entry to name the adopted seam.

### C2. There is no map from operations to skills, and two placements are already wrong

**Tickets:** #5, #6, #11, #29, #35.

**What is wrong.** #5 gives four skills — `okf-read`, `okf-write`, `okf-lifecycle`,
`okf-review` — plus an `okf` router, with the retrieval runtime and guard state machine as
`scripts/lib/` modules. #11 gives a catalogue of atomic effects. **Nothing joins them.**
Two placements contradict adopted decisions:

- **Incremental synchronization.** #6 makes incremental sync automatic, narrow maintenance
  during ordinary work. #5 places `sync` inside `okf-lifecycle` and describes that skill as
  "init, sync, migrate, compact (manual-gated)". An automatic behavior cannot live behind a
  manual gate. Either incremental maintenance belongs to `okf-write`, or `okf-lifecycle`
  hosts two invocation classes, which #26's boundary rule discourages.
- **Guard confirmation.** #5 gives `okf-review` "trust tiers, baselines, guard
  confirmation". #29 requires request, preview, confirmation, and execution to be one
  occurrence-bound sequence with content binding rechecked at execute. #11 states that
  review must not mutate the reviewed subject as a side effect. Placing confirmation in a
  read-oriented skill splits an atomic authorization flow across two skills' invocation
  surfaces, and it puts the one mutating step of the product inside the skill defined as
  non-mutating.

**Correction.** #8 must contain one **operation table**: every atomic effect from #11 ×
owning skill × runtime module × invocation class (model-invoked or user-invoked). Move
guard confirmation into the executing skill. Keep `okf-review` read-only, which is what
#11 already says. Decide where incremental maintenance lives and say so once.

### C3. #19 and #29 disagree on what an unattested harness does

**Tickets:** #17, #19, #29, #35.

**What is wrong.** #17 established that OpenCode has no explicit-invocation control. #29
resolved that case: attestation is three-valued, and `unknown` "proceeds through an echoed
token and is recorded as degraded, not blocked — refusing it would make the operations
unreachable on OpenCode". #19 then states the opposite for migration: "a harness that
cannot attest a complete preview or explicit confirmation blocks the operation rather than
weakening it".

Migration is exactly the operation class in dispute. As written, migration is unreachable
on OpenCode, and #35's semantic-parity claim fails for one of the three target harnesses.

**Correction.** Adopt #29's reading and make the wording precise in #8: "cannot attest"
means the **runtime** cannot obtain a complete preview or a confirmation echo. It does not
mean the harness lacks a native explicit-invocation control. Record OpenCode migration as
`degraded` with the reason in the receipt.

### C4. Four different things are called a manifest, and two of them are merged by mistake

**Tickets:** #7, #11, #19, #22, #30.

**What is wrong.** The specification uses "manifest" for four distinct artifacts:

| Artifact | Owner | Lifetime |
|---|---|---|
| Operation manifest — sealed, immutable, inside the approval fingerprint | #30, #7 | one operation |
| Observation journal — append-only | #30 | one operation |
| Workspace manifest `.okf-workspace.json` — user-authored federation declaration | #22 | project |
| Dry-run preview / plan shown to the human | #11, #19 | until confirmation expires |

#19's adopted text then says "an operation manifest outside the bundle and guard ledger
records checkpoints, content identities and recovery state, and an unchanged plan may
resume after interruption". #30 says the manifest is **sealed at `MANIFEST_DURABLE` and
immutable thereafter**, and that later observations append an `OBSERVATION` record. A
record that holds a moving checkpoint cursor and a record that is immutable cannot be the
same file. Migration resume therefore has no defined carrier.

`CONTEXT.md` defines only **operation manifest**. The other three have no term, so drift
is unopposed.

**Correction.** Name the four separately in #8 and in `CONTEXT.md`. Split #19's
requirement: the sealed **operation manifest** carries the plan and its identity; the
**observation journal** carries checkpoints and resume state. State that resume reads the
journal, never the manifest.

### C5. The durable operation store has no location, while the guard ledger has an exact one

**Tickets:** #7, #19, #30, #31, #32, #22.

**What is wrong.** #31 fixes the guard ledger at
`<git-common-dir>/okf-agent-skills/guard/<bundle-key>/`, or a workspace sidecar. #32 fixes
the parse cache in the per-user OS cache directory. The **operation store** — the one
record crash recovery depends on — has only constraints: outside every mutation target,
outside the guard ledger, surviving the writing machine, atomically published. #30 marks
this as its single load-bearing gap and says that if it lands inside the repository, the
design needs revisiting. #7's carried-in text repeats the constraints and supplies no path.

An implementation must therefore invent a path, a schema, and a retention rule for the
recovery-critical store.

A second gap sits under it. #31 keys the ledger by the canonical bundle identity from #22,
and #22 states that moving a bundle root **changes** its identity. So a bundle move during
an in-flight operation orphans both the ledger and the manifest. No ticket says what the
next session observes.

**Correction.** #8 must fix the operation store path, its schema version, its atomic
publication protocol, and its retention window, in the same style #31 used. It must also
state the bundle-move behavior: an orphaned ledger or manifest is `indeterminate`, blocks
mutation, and requires an explicit reset. Consider one **operation store** module owning
manifest and journal together, leaving #31's ledger to hold only tokens, epoch, and lock —
that concentrates three durable records into two coherent modules and improves locality
for crash analysis.

### C6. Two different modules are both called discovery, and their work accounting is merged

**Tickets:** #13, #27, #28, #32, `CONTEXT.md`.

**What is wrong.** "Discovery" names two unrelated modules:
- **Bundle admission** — #27's `REACH → PRESENCE → {TRUST, ACCESS}` gates, #22's routing,
  #32's cache. Its cost unit is the notional cold-work charge.
- **Concept discovery inside a bundle** — #28's and #13's `paths / index / scan / probe`
  channels. Its cost unit is the discovery-work ledger.

#32 resolves "the accounting dependency left by #13" by defining the notional cold-work
charge and the observed execution work. `CONTEXT.md` glosses both terms with no statement
of which module they apply to. An implementer reading the vocabulary will build **one**
work ledger for **two** modules with different frontiers, different invalidation rules,
and different failure modes.

**Correction.** Rename in #8 and in `CONTEXT.md`: **admission** for the bundle-level
module, **retrieval discovery** for the in-bundle module. State that the notional cold-work
charge governs admission and the discovery-work ledger governs retrieval discovery, and
that the two never share a budget.

### C7. The write gate has no bootstrap case

**Tickets:** #21, #19, #35.

**What is wrong.** #21 makes `okf_version` a write gate: the suite writes only where the
bundle-root `index.md` carries the string `"0.2"`, and "flags and project configuration
cannot override this". Adopting an undeclared bundle is a separate explicit previewed
operation whose only effect is writing the declaration. But #19's migration publishes a
**new** bundle by atomic write-new-then-swap, and #35 lets `okf init` initialize an
admitted bundle through its guarded flow. A bundle that does not exist yet has no root
declaration to gate on, and the adoption operation cannot run against a nonexistent root.

As written, `init` and migration are both unreachable on a new bundle.

**Correction.** State in #8 that the write gate applies to a **pre-existing** bundle root.
Creation of a new bundle root, with its `okf_version: "0.2"` declaration written in the
same atomic publication, is the single bootstrap exception. Name it explicitly so an
implementer does not weaken the gate to make `init` work.

---

## Cleanup findings

### D1. Superseded research is still presented as evidence

**Tickets:** #23, #3, #20, #34, #22, #11.

**What is wrong.** #8's author will read `docs/research/`. Several notes carry candidate
policy that a later ticket reversed, with no superseded marker:

- `knowledge-corpus-migration.md` and `migration-sections/05` recommend **UUID v7 in
  frontmatter** as the concept identity, and call identity "the single most impactful
  decision". #22 fixed path identity and rejected any suite UUID or frontmatter extension
  for concepts. #1's decision entry for #23 does not say this.
- `workspace-topology-and-routing.md` and `lightweight-durable-context.md` both carry a
  trust-tier × operation matrix as candidate policy. #11's adopted matrix contradicts them
  — for example the research matrix blocks `deprecate` at the unverified tier, while #11
  makes every status transition `P/P/P` independent of tier, because trust is not
  authority. Two matrices, one vocabulary, opposite semantics.
- `workspace-topology-and-routing.md` proposes CUE-style subsumption and merge routing.
  #22 forbids concept merging across bundles outright.
- #34 audited **one** of 43 notes and found systemic normative drift, then flagged that
  the rest are unaudited "for whoever picks up #8".

**Correction.** Two cheap actions before #8 starts:
1. Add one precedence line to `CONTEXT.md` or the README: **an adopted ticket resolution
   always supersedes a research note**; research notes are evidence, never policy.
2. Add a superseded banner to the four notes above, naming the ticket that superseded each
   claim. Do not rewrite the notes — the evidence stays useful.

An audit of the remaining 42 notes for the #34 drift pattern is worth one ticket, but only
for the notes #8 actually cites.

### D2. Map entries that omit a carried correction

**Ticket:** #1.

**What is wrong.** #1 does good work carrying corrections — the #13, #21, #28 and #33
entries all name their corrections. Three entries do not:
- **#11** does not carry #29's occurrence-bound-request correction, which changed the
  authorization precondition.
- **#5** does not carry the seam consequence in C1.
- **#23** does not carry the identity reversal in D1.

**Correction.** Add one clause to each of the three entries. This is the map's stated job,
and the pattern already exists in the other entries.

---

## Summary table

| # | Finding | Tickets | Effect on #8 |
|---|---|---|---|
| B1 | No numeric value is set and no ticket builds the calibration corpus | #7 #13 #28 #33 #9 | Blocks |
| B2 | Uncalibrated deployment refuses every read, contradicting #11 and #35 | #11 #13 #33 #35 #7 | Blocks |
| B3 | `retrieve()` signature never folded in #33's six corrections; one choice unmade | #13 #33 #5 | Blocks |
| B4 | "Coherent" evidence set is undefined, so the stop rule is untestable | #13 #33 #7 | Blocks |
| C1 | Library-only delivery decides the seam; map still headlines reversed economics | #5 #13 #28 #33 | Invention |
| C2 | No operation-to-skill map; sync and guard confirmation are placed wrongly | #5 #6 #11 #29 | Bad shape |
| C3 | #19 blocks where #29 degrades on an unattested harness | #17 #19 #29 #35 | Contradiction |
| C4 | Four artifacts called manifest; #19 merges the sealed one with the checkpoint | #7 #11 #19 #22 #30 | Contradiction |
| C5 | Operation store has no path; bundle move orphans ledger and manifest | #7 #19 #30 #31 #22 | Invention |
| C6 | Two modules both called discovery share one accounting vocabulary | #13 #27 #28 #32 | Bad shape |
| C7 | Write gate has no bootstrap case, so `init` and migration are unreachable | #21 #19 #35 | Contradiction |
| D1 | Superseded research notes carry candidate policy with no marker | #23 #3 #20 #34 | Invention risk |
| D2 | Three map entries omit a carried correction | #1 | Invention risk |

## Recommended order

1. **D1 and D2** — one hour of edits, and they stop #8 from reading reversed policy as
   evidence.
2. **C4, C6, C7** — vocabulary and one bootstrap sentence. These are pure clarifications
   and need no new decision.
3. **B3 and B4** — two decisions inside #13's own scope. Both are named in #33 and both
   have an obvious lazy answer.
4. **C1, C2, C3** — three decisions #8 must carry anyway. Each has one recommended value
   above.
5. **B2** — the orientation-without-estimate option unblocks the release without waiting
   for calibration.
6. **B1** — split #7, open the calibration ticket, and make it block #9 instead of #8.

With steps 1 to 5 done, #8 can write an implementation-ready specification with one
declared hole: the numeric profile table, filled by the calibration ticket before #9
closes.
