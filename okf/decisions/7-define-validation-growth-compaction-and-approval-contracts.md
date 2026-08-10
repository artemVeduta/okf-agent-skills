---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/7
status: draft
type: Decision
---
# Define validation, growth, compaction, and approval contracts

Status: closed.

## Question

What hard conformance checks, soft warnings, link and drift checks, growth metrics, compaction/archive rules, provenance safeguards, approvals, notices, conflict handling, and recovery behavior should every operation enforce?

**Evidence discipline and safety requirements:**

- Do not adopt anecdotal note-count, word-count, age, tag-overlap, result-count, or token thresholds as normative defaults.
- Candidate thresholds must be configurable and justified by deterministic fixture benchmarks that demonstrate a measurable retrieval, navigation, validation, or performance problem.
- Distinguish OKF normative conformance, product policy, and optional soft warnings.
- Destructive or broad operations require a dry-run manifest, explicit approval, independent recoverable snapshot or backup, deterministic rollback instructions, and post-operation verification.
- Git history, reflogs, or `git archive` alone must not be described as sufficient protection for uncommitted, untracked, or uniquely stored knowledge.
- Compaction must preserve identity, provenance, inbound links, trust state, and recoverable source material.

## Comment by artemVeduta

Correction carried from [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29): preview completeness is explicit data, not a sentinel item convention. A manual operation must refuse an incomplete preview before confirmation and freshly verify `complete` at execution alongside the content-bound plan.

## Comment by artemVeduta

Context pointer: [Design agent retrieval model within context window constraints](https://github.com/artemVeduta/okf-agent-skills/issues/13) fixes the retrieval benchmark contract and leaves this ticket the numeric human tolerances, reserve/work profiles, ranking weights, evidence-sufficiency thresholds, notice caps, fallback allowances, calibration execution, and selected non-dominated defaults.

## Comment by artemVeduta

## Carried across from [Prototype concept restructuring and rollback behavior](https://github.com/artemVeduta/okf-agent-skills/issues/30)

The prototype on [`prototype/concept-restructuring`](https://github.com/artemVeduta/okf-agent-skills/tree/prototype/concept-restructuring/prototypes/concept-restructuring) hands back one **load-bearing** gap and four smaller ones.

### Load-bearing: where the operation manifest lives, and how it is written

The manifest is the only durable record from which a crashed restructuring operation can be reconstructed. The prototype's recovery routes through it rather than through either bundle's ledger, which imposes three requirements this ticket must satisfy:

- it must live **outside every mutation target** — otherwise the operation can destroy its own recovery record;
- it must live **outside the uncommitted guard ledger** of [Decide where manual-operation guard state persists and how concurrent sessions coordinate](https://github.com/artemVeduta/okf-agent-skills/issues/31), and **outlive the machine that wrote it**;
- it must be written **atomically**. A torn manifest with a valid-looking prefix is currently unhandled and reconciles as `indeterminate`.

**If the manifest lands inside the repository, ordering and recoverability weaken and the adopted restructuring design needs revisiting.** This is not a detail the implementation can pick later.

### Is "repair a half-restored corpus" an approvable operation kind?

`rollback-failed` is a loud, correct, named terminal with nothing the machine can do next except admit a brand-new operation with its own preview and gate. The prototype **rejected** the obvious alternative — letting the rejected inverse step simply be re-run — because it converts the loudest terminal into the quietest with one keystroke. If a repair operation should exist, this ticket owns what preview it shows and what approval it requires.

### Three smaller ones

- **`rollbackAuthorization`.** May a documented, pre-approved rollback execute without a second approval before the epoch advances? Exposed as a switch (`inherited-from-parent-approval` / `requires-fresh-approval`, defaulting to fresh). After an epoch advance the machine forces fresh approval regardless.
- **Recovery evidence and post-op checks.** `RecoveryEvidence` is a pass/fail conjunction plus a snapshot handle, and `ValidationVerdict` + `PostOpChecks` are opaque. Which identity and link checks actually run, what a passing result is, and what the snapshot mechanism and content-addressing are, all remain here. The recovery floor in [Design operational trust tier matrix for skill operations](https://github.com/artemVeduta/okf-agent-skills/issues/11) is satisfied structurally by the prototype but not implemented.
- **Review-dependency mappings for outputs.** Settled by the prototype: no baseline transfers to a restructuring output. Open: may a mapping be *proposed* at all?

All numeric thresholds stayed injected booleans and labels — the machine never computes a number, so nothing here pre-empts calibration.

### One implementation note worth keeping

Byte-identity is brittle: any tool that normalizes line endings or reserializes frontmatter turns an ordinary rollback into `rollback-failed`. Whatever snapshot and restore mechanism this ticket picks must not itself reserialize.

## Comment by artemVeduta

## Resolution

The human adopted the following contract for `v0.1.0`. Existing decisions remain authoritative; this ticket supplies the validation, growth, compaction, approval, recovery, notice, and calibration integration rules.

### Authority and evidence

- Safety invariants always outrank retrieval utility. A profile is usable only when it prevents silent context or work overruns, data loss, nondeterminism, false-clean results, and unreported omissions. If no profile passes, publish no default and return `degraded` or `insufficient`.
- The release declares a measured support ceiling for corpus scale, files and bytes, depth, frontmatter shapes, tokenizer, serializer, renderer, and adapter seam. Outside that ceiling, the suite does not claim completeness or calibration.
- Missing or unobservable required evidence is reported as `degraded` or `indeterminate` for reads. A dependent mutation is blocked. Safe inspection remains possible when the missing evidence is not required for that operation.
- Validation is scoped to the bundle root, affected concepts, and direct derived artifacts for small local work. Broad, destructive, identity-changing, or completeness-claiming work requires exhaustive validation.

### Conformance, warnings, and review evidence

- Keep the rules from [Choose the OKF conformance baseline, compatibility, and extension policy](https://github.com/artemVeduta/okf-agent-skills/issues/21). Add no new bundle-wide OKF conformance blocker.
- Add operation-specific hard checks for identity, inbound links, provenance, review evidence, approval, recovery, conflicts, and post-operation validation. These are product safety checks, not OKF conformance errors.
- Enable default soft warnings for unresolved internal links and `today >= stale_after`. Report review findings separately. Growth warnings remain opt-in until benchmark evidence supports them.
- Review dependencies may block only when an operation claims current or complete review evidence, or when the dependency is required for the operation safety claim. Provenance alone does not infer semantic staleness. `not configured`, `changed`, `unavailable`, and `unobservable` remain distinct.
- Existing content-bound guard and concurrent-edit rules remain in force: drift before the first effect expires approval; content or verification drift during an effect aborts the operation and records foreign mutation; there is no in-place retry or silent merge.

### Growth and compaction

- Normative growth inputs are observed work, bytes, files, parse failures, link findings, review-dependency findings, index coverage, and held-out retrieval results. Concept count, word count, age, tag overlap, and result count remain descriptive until deterministic fixtures show a causal problem.
- A growth signal may report a condition or recommend manual review or compaction. It never automatically compacts, archives, purges, deletes, or rewrites knowledge.
- `v0.1.0` compaction is manual, recovery-gated, and lossless. It is limited to selected derived artifacts such as indexes and link-maintenance data. Body summarization, semantic merging, deduplication, deletion, and relocation are separate operations.
- Compaction uses one explicit bundle and a finite, fully enumerated selector. Its preview lists every affected artifact. It cannot expand into an implicit workspace-wide or federated write.
- Compaction may preserve trust and accepted review state only after proving semantic no-op behavior. Claim, provenance, source, or identity changes require fresh review. Restructuring outputs start draft and unverified.
- Restructuring may show proposed review-dependency mappings in its preview, but proposals are non-authoritative. Explicit review is required before acceptance, and no review baseline transfers automatically.

### Approval and recovery

- Broad, destructive, or identity-changing work requires a complete preview, explicit approval, an independent recoverable snapshot, deterministic rollback, and post-operation verification. Preview completeness is explicit data and is checked again at execution.
- Rollback always requires fresh approval. Parent approval is context only and never authorizes a later rollback.
- `rollback-failed` is a loud terminal. There is no automatic repair or inverse retry. Repair starts as a new operation with a new preview, approval, snapshot, recovery gate, and post-operation checks.
- The operation manifest lives in a separate durable store outside all mutation targets and outside the guard ledger. It survives repository replacement and the writing machine. It is written completely, flushed, atomically replaced, and content-verified. Missing, torn, corrupt, truncated, or unknown-schema data is `indeterminate` and blocks execution or recovery claims.
- Recovery evidence passes only when an independent content-addressed snapshot exists, a disposable restore succeeds, restored bytes or hashes match, OKF and suite checks pass, operation-specific identity, link, provenance, and trust checks pass, rollback is documented, and post-operation validation is bound to the approved plan.
- Effects that rollback cannot reverse are recorded as residue. The terminal result is `dirty` or `indeterminate`, never `clean`.

### Retrieval, notices, and budgets

- With an unknown budget and no calibrated fallback, safe inspection and validation are allowed, but materialized retrieval returns `insufficient`. No universal fallback number is invented.
- A retrieval adapter must attest budget provenance, the model-visible discovery seam, tokenizer or cost-profile identity, serializer version, and exact post-emission audit capability. Missing capabilities are disclosed as degraded or insufficient.
- Reserve context before discovery. Use versioned profiles per task kind. Reserve the largest reachable notice and receipt. Declared output requirements may increase the reserve but never lower its safety minimum. Unknown tasks use a conservative envelope.
- Use the target tokenizer when available. Otherwise use a versioned conservative bound calibrated for the tokenizer and serializer, and check each ledger line. An observed violation returns `invalid` and quarantines the profile. An audit-blind deployment reports the bound as unverified and does not claim `invalid`.
- Ranking and tier selection use deterministic query evidence, exact demands, and approved navigation hints. New weights or thresholds require stable held-out gains. Semantic retrieval, implicit stemming, generated synonyms, aliases, and producer-authored priority fields remain outside `v0.1.0`.
- Satisficing retrieval stops only when one candidate or a bounded linked evidence set covers every retained query clause with observed evidence. Completeness claims require exhaustive discovery.
- `FULL` means complete body coverage even when cache state makes incremental cost zero. `SECTION` reports a bounded, priced `sectionsOmitted` count and is not used for sectionless bodies. Active filters report observed coverage; `FILTERED` is used only when the predicate was observed.
- Omission outcomes include a bounded cause such as `context`, `work`, or `satisficed-stop`. Notices, omissions, and receipts use calibrated caps, bounded names, and counts. `nextAction` gives available advice without promising success.

### Calibration and release evidence

- Calibration uses pinned code-backed and knowledge-only corpora, official syntax samples, adversarial transformations, stale and sparse metadata, flat and nested layouts, code-heavy and multilingual content, links, exact references, and declared scale strata.
- Calibration data and held-out acceptance data are separate. Held-out failures are evidence for recalibration, not values to tune away.
- Silent context overrun, data loss, nondeterminism, false-clean status, unreported omission, invalid recovery, and detected conservative-bound violation have zero tolerance.
- After safety gates pass, select from the non-dominated Pareto frontier by task kind and deployment seam. Tie-break by safety margin, then observed work cost, then utility. Do not publish one universal numeric profile.
- Recalibrate after parser, tokenizer, serializer, renderer, cost-model, fixture-stratum, or policy changes, and after held-out regression evidence. Time alone does not invalidate a profile.
- Users may tighten budgets, warnings, scope, and approval rules, and select a supported profile. They may not weaken conformance, recovery, identity, authority, omission, or audit guarantees.
- Exact numeric tolerances, reserve and work values, evidence thresholds, notice caps, fallback allowances, ranking weights, and selected defaults remain unset until the required deterministic calibration record exists. Implementation must return the adopted safe fallback rather than guess.
- Closure evidence for this contract is a decision table, versioned profile and calibration manifest, held-out results, bounded report schemas, fixtures for every safety gate, explicit deferred items, and live validation of the relevant prototypes. The next specification ticket must carry these rules without inventing new policy.
