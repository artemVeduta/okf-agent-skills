---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/13
status: draft
type: Decision
---
# Design agent retrieval model within context window constraints

Status: This decision is closed.

## Question

Given an operation-specific token budget supplied by the active harness and model, how should the skill suite select and load relevant OKF concepts while reserving space for instructions, tools, code, reasoning, and output?

The research in [`docs/research/lightweight-durable-context.md`](https://github.com/artemVeduta/okf-agent-skills/blob/main/docs/research/lightweight-durable-context.md) identifies retrieval as a priority decision. It does not establish a universal 100K–200K window or universal concept-count thresholds.

**Must resolve:**

- How is the available retrieval budget obtained or conservatively estimated?
- What is the default retrieval breadth, and how does progressive disclosure consume the budget?
- Should concepts carry an `importance` or `priority` field?
- Which retrieval modes are in scope: exact link/path, index and tag filtering, keyword search, or semantic retrieval?
- How should `index.md` and map-of-content grouping guide retrieval?
- Should retrieval be a standalone skill or a shared runtime capability?
- Which fixture corpora and measurements determine candidate breadth, result-count, and hierarchy defaults?

## Comment by artemVeduta

Sharpened by [Prototype budget-aware concept selection behavior](https://github.com/artemVeduta/okf-agent-skills/issues/28). Carrying the concrete inputs across so the grilling session does not re-derive them.

## Settled by the prototype — treat as inputs, not open questions

1. **The unit of a budgeted retrieval decision is a (concept, tier) pair**, not a concept and not a result count. `LINE → CARD → SECTION → FULL`, tiers atomic. Twelve titles and one full body cost the same and answer different questions, so "the N most relevant concepts within a budget" cannot be specified as N.
2. **Discovery is priced, and the price is paid before ranking is possible.** `paths` (free-ish, always bought) → `index` (bulk title+description) → `scan` (the only source of `tags`/`type`/`status`) → `probe` (grep, the only source of body-only words). Buying an index pre-pays LINE for everything it lists; a scan pre-pays CARD.
3. **The reserve is carved before selection, never checked after.** Post-hoc checking is not reserving.
4. **The omission report is a budget line item.** "Never silently overrun" makes it part of the selection; clipped concepts are named, missed ones only counted, and the notice collapses to counts when naming would cost more than the share cap allows or than the room left.
5. **Five outcome classes with five different fixes**: `CLIPPED`, `MISS`, `UNDISCOVERED` (could not afford to look), `UNSEARCHED` (discovery stopped because the query was already explained), `FILTERED`. The last two are the pair most easily collapsed and must not be.
6. **Exact references are demands.** Honored before ranking, degraded down the ladder rather than dropped, and refused loudly when they do not fit at LINE. A changed source file resolves through whatever traceability field #12 settles on (the prototype uses an injected `sourceRefs`, deliberately not named after any candidate), and that join is what makes code-backed retrieval cheap.
7. **A token estimate must be an upper bound, per document rather than on average.** No harness gives a skill a tokenizer, so a token figure is characters ÷ a divisor, and a divisor is a ceiling only while it sits at or below the densest content in the corpus. Across 4,000 randomised runs each on the prototype's fixtures: ÷2.9 violated nothing, ÷3.2 under-estimated in 2% of runs, ÷4.0 in 95%. Aggregate slack hides per-document deficits, so the check belongs on each ledger line.
8. **A retrieval floor exists**: below the path list plus the smallest omission notice, no honest answer is possible and the selector should refuse.

## Still yours, now sharper

1. **Where the budget number comes from.** #28 took it as given. The prototype models the source three-valued — `explicit` proceeds, `estimated` keeps the supplied number but reports degraded, `unknown` falls back to a floor and reports degraded — which is #29's attestation pattern reused. Whether that floor is a constant, a fraction of a declared window, or per-harness is yours, and so is what counts as `estimated`.
2. **Which divisor is safe.** The prototype's are fixture-calibrated, not measured. Nothing in the corpus measures a real OKF document, so the safe divisor is a benchmark #7 owes before any budget arithmetic can be trusted.
3. **The adopted defaults.** Reserve fractions per task kind, ranking weights, score→tier thresholds, the notice share cap, the unknown-budget floor. All are dials in the prototype precisely so none reads as adopted; #7 forbids adopting any of them without fixture benchmarks.
4. **Default discovery breadth: satisfice or exhaustive?** Escalation that stops when every query term is explained is cheap and demonstrably not optimal — "explained" means something matched, not that the best thing was found. The prototype shows both and prices the difference.
5. **Whether an `importance`/`priority` field is justified.** The prototype ranks without one. If you want one, #21 must rule on the extension first.
6. **Whether the non-semantic mode set is sufficient.** #28 produced evidence about exact-link, path, index, tag and keyword ranking only. It did not close the semantic question.
7. **Retrieval as a standalone skill or a shared runtime capability** (with #5). The prototype's file layout answers nothing here.
8. **Which fixture corpora and measurements set the defaults.** #28's three fixtures are illustrative, not the benchmark corpus.

One boundary worth noting for #14: hiding deprecated concepts from default retrieval is **conditional on paying for a frontmatter scan**. On an index-only budget `status` is invisible, the filter cannot fire, and the honest behavior is to report how many concepts were ranked without their status read.

## Comment by artemVeduta

Correction from [Prototype budget-aware concept selection behavior](https://github.com/artemVeduta/okf-agent-skills/issues/28): a bare index reveals title only and pre-pays no allocation tier; only a descriptive index reveals title plus description and pre-pays `LINE`. Budget admission must use observable conservative upper bounds rather than post-result sizes: `PROBE` uses its capped-output bound and `NOTICE` uses finite renderer-template bounds. Observed sizes are audit-only, and exceeding a bound invalidates the result. Production safety remains conditional on calibration against representative OKF documents, each target tokenizer, actual grep serialization, and the notice renderer. This ticket must also decide ownership and attestation of those bounds, cross-turn retrieval state and invalidation, tokenizer ownership, and behavior when a bound is violated.

## Comment by artemVeduta

Additional precise retrieval decisions surfaced by the corrected prototype and retained here: minimum query-term and stopword policy; behavior when a concept has no usable sections; and whether stemming, synonyms, or aliases participate in non-semantic matching. These are product decisions, not fixture defaults.

## Comment by artemVeduta

## Resolution

Adopt a stateless shared retrieval runtime that performs deterministic discovery, ranking, tier allocation, materialization, and verification behind one interface. Skills and harness integrations are thin adapters; whether the runtime ships as a CLI, script, or library remains with [Choose the skill bundle, runtime, and distribution architecture](https://github.com/artemVeduta/okf-agent-skills/issues/5).

Conceptually:

```text
retrieve(scope snapshot, query, exact references, task kind,
         budget attestation, breadth and filters)
  -> bounded materialized context package + omissions + receipt
```

### Budget and accounting

- The injected number is an **operation context allowance**, not a model's advertised window and not a retrieval-only amount.
- The runtime selects a versioned task profile and carves a context reserve before selection. A declared output or tool requirement may increase that reserve but cannot reduce the profile minimum. Unknown tasks use the most conservative validated profile.
- `operation context allowance - context reserve = spendable retrieval allowance`.
- Budget provenance is `explicit`, `estimated`, or `unknown`, with its source/profile preserved in the receipt.
- An unknown budget uses a versioned, calibrated deployment fallback when one exists and returns a degraded result. Without such a profile, retrieval returns `insufficient`. The fallback is distinct from the honest retrieval floor.
- The honest retrieval floor is the minimum spendable allowance needed for the smallest truthful result envelope. Any allowance below it is insufficient regardless of provenance.

Use two ledgers:

1. The **context ledger** charges only bytes/tokens crossing the runtime interface: materialized concept tiers, the bounded omission notice, and the receipt.
2. The **discovery-work ledger** bounds internal work with a versioned multi-dimensional envelope: concepts/files inspected, bytes read or parsed, probe output, and an optional safety timeout.

The prototype correctly priced discovery when `glob`, `read`, and `grep` output was model-visible. Internal shared-runtime reads do not consume model context, so they belong to the work ledger instead. Any harness fallback that exposes discovery output to the model must charge that output to the context ledger.

Reaching a work cap is a normal degraded result. Bytes, files, probes, and time do not collapse into a speculative universal work unit. No limit or default is expressed as a number of returned concepts.

### Discovery and matching

- Exact concept, path, and resolved source references are demands. Resolve them before ranking, degrade `FULL -> SECTION -> CARD -> LINE`, and refuse them explicitly when their minimum cannot fit. Never silently drop a demand.
- Ordinary positive lookups default to `satisfice`. Explicit completeness or absence claims, audits, migrations, validation, and corpus-wide reviews use `exhaustive` discovery.
- Exhaustive completion may be claimed only when every required scope and channel completed inside the work envelope.
- Satisficing stops only when a calibrated evidence rule finds that one candidate or a coherent linked evidence set covers every retained query clause. Terms appearing in unrelated concepts do not establish sufficiency. Numeric confidence and margin thresholds remain benchmark outputs.
- `v0.1.0` requires deterministic exact reference, source/path, index, frontmatter, and lexical body retrieval. Semantic retrieval is deferred.
- Preserve the original query. Normalize searchable text with Unicode NFC and case folding. Retain one-character terms, digits, quoted phrases, paths, and identifiers; add identifier subterms without replacing the original. Do not ship a hard stopword deletion rule or global minimum term length.
- Match normalized whole tokens, phrases, paths, and identifier subterms. Do not use accidental substring stems, implicit stemming, or generated synonyms.
- Explicit project-authored discoverability aliases may expand a query only if [Choose the OKF conformance baseline, compatibility, and extension policy](https://github.com/artemVeduta/okf-agent-skills/issues/21) approves their representation. Report every alias expansion.
- Filesystem inventory establishes what exists. Bare and descriptive indexes are structural accelerators. Curated maps, grouping, order, annotations, and links are non-binding ranking and evidence-coherence hints; they neither hide unlisted concepts nor force linked concepts into context.
- Do not add an `importance` or `priority` field for `v0.1.0`. Reconsider only if representative fixtures show a stable failure that query evidence, exact demands, and curated navigation cannot solve.

### Progressive disclosure

The atomic allocation unit remains a `(concept, tier)` pair:

- `LINE`: stable concept locator plus authored title and description when present.
- `CARD`: `LINE` plus complete authored frontmatter in canonical serialized form.
- `SECTION`: `CARD` plus one or more complete heading-delimited body sections selected for the query.
- `FULL`: the complete concept; this asserts that nothing in it remains unread even when its incremental cost is zero.

Missing optional metadata remains visibly absent and is never synthesized as authored content. When a body has no usable heading-delimited section, `SECTION` is unavailable and allocation moves from `CARD` to `FULL`; paragraph and semantic chunking are not hidden inside this tier.

### Filters, omissions, and outcomes

Filtering is evidence-bound:

- Classify a concept as `FILTERED` only after observing the relevant field and applying an active predicate.
- Unobserved filter evidence remains incomplete discovery; never assume it passed or failed.
- Ordinary retrieval may return other material as degraded. Exhaustive or filter-completeness claims fail unless every in-scope candidate was evaluated.
- Exact demands bypass ranked-result filters with an explicit warning.
- [Design archive lifecycle and discoverability](https://github.com/artemVeduta/okf-agent-skills/issues/14) owns default archive and status predicates.

Use these evidence requirements:

- `CLIPPED`: a relevant discovered candidate's selected tier did not fit the context allowance.
- `MISS`: every enabled and applicable channel required by the selected mode was examined for that candidate without a sufficient match.
- `UNDISCOVERED`: the work envelope ended before a planned channel or scope could be examined.
- `UNSEARCHED`: satisficing intentionally stopped before that channel or scope was needed.
- `FILTERED`: observed metadata caused an active predicate to reject the candidate.

The complete model-facing data structure is bounded, not only a rendered notice block. Selected concepts and unresolved exact demands are named. `CLIPPED` and `FILTERED` names are capped before collapsing to counts; `MISS` is count-only; `UNDISCOVERED` and `UNSEARCHED` summarize affected scopes and channels. A full diagnostic trace may live outside model context and be referenced by a bounded pointer.

Retrieval results distinguish `ok`, `degraded`, `insufficient`, and `invalid`.

### Tokenization, bounds, and state

- The harness adapter identifies the deployment and attests available budget evidence.
- The runtime owns final serialization and admission.
- A cost-model adapter uses exact target tokenization when available. Otherwise it uses a versioned conservative profile calibrated for the exact tokenizer family and serializer. No valid tokenizer or profile means `insufficient`; there is no universal character divisor.
- Every receipt records the scope snapshot, budget provenance, task/reserve profile, breadth, stop reason, selected tiers, context spend, discovery-work spend, tokenizer/cost profile, serializer version, policy version, and omission form.
- A falsified conservative upper bound produces `invalid`, not degraded. Discard content when detected before emission, return an independently bounded invalid envelope, quarantine the profile, and require recalibration. If model-visible output already escaped, stop further retrieval and record the unplanned spend.
- Every call has a fresh allowance and immutable scope snapshot. It assumes nothing returned earlier remains in model context after compaction or source changes.
- A discovery cache may improve performance but cannot preserve model memory, authority, admission, or spend. Cache lifecycle remains with [Define what a discovery result caches, and what invalidates it](https://github.com/artemVeduta/okf-agent-skills/issues/32).

### Validation contract

The existing prototype fixtures remain deterministic regression fixtures, not calibration evidence. Numeric defaults require:

- pinned real code-backed and knowledge-only projects, official samples for syntax coverage, and synthetic adversarial transformations;
- project-level separation between calibration and held-out acceptance data;
- sparse metadata, missing or stale indexes, flat and nested topology, sectionless bodies, lifecycle states, multilingual text, code/data-heavy bodies, links/maps, exact/source references, and corpus scales up to a declared support ceiling;
- independently reviewed query cases with must-have concepts, minimum sufficient tiers/sections, supporting and misleading concepts, task kind, scope, and budget feasibility;
- tier-adjusted recall, precision, discovery work, exact serialized context use, stop regret against exhaustive search, omission honesty, bound violations, latency, determinism, and end-task evidence quality;
- separate calibration for every supported tokenizer and actual serializer, with failures reported per corpus stratum and ledger line rather than hidden in aggregates.

[Define validation, growth, compaction, and approval contracts](https://github.com/artemVeduta/okf-agent-skills/issues/7) owns human tolerances, numeric thresholds, reserve/work profiles, ranking weights, stop thresholds, notice caps, fallback allowances, calibration execution, and the selected non-dominated operating points.

This resolution incorporates the corrected findings from [Prototype budget-aware concept selection behavior](https://github.com/artemVeduta/okf-agent-skills/issues/28) while explicitly adapting their accounting to the selected shared-runtime seam.

## Comment by artemVeduta

## Correction to the resolution

The resolution above was written, not run. [Prototype and verify the adopted retrieval runtime contract](https://github.com/artemVeduta/okf-agent-skills/issues/33) ran it — 102 cases and a 136,080-run sweep, captured on [`prototype/retrieval-runtime`](https://github.com/artemVeduta/okf-agent-skills/tree/prototype/retrieval-runtime/prototypes/retrieval-runtime) — and the contract largely holds. Six things do not. This comment corrects the closed record; the ticket stays closed.

The full argument, the reproductions and the two independent reviews are in #33 and the branch README. What follows is what changes in **this** resolution's text.

### One rule is stated for the notice and not for the receipt, and that lets a faithful implementation overrun

"Budget and accounting" puts three things on the context ledger — "materialized concept tiers, the bounded omission notice, and the receipt" — and only the notice carries a reservation discipline. An implementation that reserves for the notice alone overruns: **~1,200 worlds from the missing reservation, ~119 more** from the receipt's size depending on the selection it reports. Add two sentences: reserve for the receipt, and apply the same *largest-reachable* rule to it.

Also unhandled: `allowance − reserve` composed with a profile minimum that a declared requirement "cannot reduce" permits a spendable of **zero or below**. Below the cost of the smallest refusal there is no truthful output at all — the runtime must overspend to say *no*. The invariant is therefore not *never overrun*; it is **never overrun silently**, and "record the unplanned spend" needs to escape the falsified-bound path it is currently scoped to.

### "Internal shared-runtime reads do not consume model context" is a deployment property, not a design constant

This resolution asserts it six lines after deferring the decision that determines it: *"whether the runtime ships as a CLI, script, or library remains with [#5](https://github.com/artemVeduta/okf-agent-skills/issues/5)."* A CLI's stdout is a tool result. In that world the escape clause — "any harness fallback that exposes discovery output to the model must charge that output to the context ledger" — is not a fallback, it is the main path, and the two-ledger design collapses back into #28's one.

**Make the seam an attested property of the adapter.** The context ledger then has one rule — it charges bytes entering model context — and the fallback clause stops contradicting the general one. Both seams are executable, and the difference is measurable: corpora identical in every selected concept and differing 10× in unselected bytes cost **161 / 161** in context and **20,328 / 182,328** in work.

Two consequences this resolution does not draw:

- Under the out-of-context seam an index pre-pays nothing in context, so **#28's index economics do not transfer as stated** and the honest retrieval floor loses the path-list term that was its dominant component. This resolution says it "incorporates the corrected findings from #28"; on that seam it reverses their accounting.
- **"Resolve them before ranking" is one phase too late.** Discovery precedes ranking and, on the in-context seam, spends the same ledger — so one extra token of allowance can buy a scan that then starves a demand and refuses the run. That is #28's `spxt-` non-monotonicity, reintroduced by the ordering rule. A demand's minimum must be reserved before **discovery**.

### `SECTION` is the only tier whose loss is invisible from inside context

`LINE`, `CARD` and `FULL` are self-announcing. A `SECTION` payload — title, description, complete frontmatter, some headed prose — looks exactly like a short, complete concept, and **none of the five omission codes covers intra-concept residue**; all five classify a *candidate*. The receipt says `SECTION`; the model's context says `FULL`.

"Paragraph and semantic chunking are not hidden inside this tier" shows the concern was live and the wrong lever was pulled: restricting the cut to heading boundaries makes `SECTION` deterministic, not honest. `SECTION` needs a disclosure rule. A complete section manifest and a bounded `sectionsOmitted: n` both close it; choosing between them is this ticket's call.

### "Evidence-bound filtering" has no observable

*"Unobserved filter evidence remains incomplete discovery; never assume it passed or failed."* But **inclusion is the pass action**, and the enumerated model-facing structure — selected concepts, unresolved demands, capped `CLIPPED`/`FILTERED` names, count-only `MISS`, scope summaries — has no slot for "n candidates were ranked without their predicate field observed". The receipt's twelve fields carry nothing about predicate coverage either. [#28](https://github.com/artemVeduta/okf-agent-skills/issues/28) built that carrier and had to fix it for being an oracle; this resolution kept the slogan and dropped both halves. Add a per-predicate, **tier-derived** count — count-only, and priced like everything else the structure names.

### The falsification backstop cannot fire where the profile is the only number there is

Detecting that a bound was exceeded requires ground truth *other than the bound*. In the profile branch — the only branch relying on a conservative upper bound — the runtime has one number per string, and this resolution names no second source. #28 supplied one by fixture injection and said so.

**Make it an attested capability**: a deployment declares whether it can supply an exact post-emission token count; if it cannot it is **audit-blind**, `invalid` is unreachable, and the receipt says so instead of implying a backstop. Executed, the same uncalibrated profile is caught on an audit-capable deployment and **completely undetected** on an audit-blind one, with admission and charging byte-identical across the pair. As written, this section reads as defence in depth and has one layer.

Two further problems: the **invalid envelope is circular** (bounded by the quarantined profile, or by the universal constant the same bullet bans — the only coherent option names nothing, which collides with "never silently drop a demand"); and **quarantine is cross-call state in a runtime declared stateless**, with nowhere in `retrieve`'s signature to live.

### "Coherent" is undefined, and its extremes are the two rules this ticket was choosing between

At `single`, satisfice degenerates into exhaustive-bounded-by-the-work-cap. At `component`, it is #28's union rule renamed. And on every fixture tested, **`linked` and `component` are byte-identical**, because §8 index files link every concept in a directory — so "a coherent **linked** evidence set" *is* the permissive extreme on any indexed bundle. The question is renamed, not decided, and the operating point falls to whoever writes the first implementation.

Separately, the rule has no notion of clause **informativeness** while this resolution bans every cheap discriminator by name, so `the` and `a` discharge coverage as fully as `retention`. Document frequency is offered as a **proposal** in #33, not a finding — it is corpus-derived and carries its own uncalibrated constant.

### Smaller corrections

- The **honest retrieval floor is a function of the request**, not of the runtime: "never silently drop a demand" makes the smallest truthful envelope grow with the number of demands.
- **`UNDISCOVERED` needs a cause field** — work envelope or context allowance, two opposite fixes under one name.
- **`MISS` is unreachable under `satisfice` as written**: "every enabled and applicable channel required by the selected mode was examined" is false whenever satisficing stops early.
- **`FILTERED` must take precedence over `CLIPPED`**; both can hold on one candidate and no precedence is given, so a policy-rejected concept can be advised to "raise the allowance", which can never surface it.
- **The scope summaries are uncapped.** `CLIPPED` and `FILTERED` names are capped; `UNDISCOVERED`/`UNSEARCHED` "summarize affected scopes and channels" without one, and scopes grow with the bundle — so the structure this resolution calls bounded is not.
- **`{summary, detail, nextAction}` cannot be a guarantee.** A remedy cannot be verified without spending the work whose absence it reports. The attainable invariant is that the advice moves the run and never names a knob already at its limit.
- **Unknown budget without a fallback returns `insufficient`**, inverting #28's validated behavior on assertion rather than evidence — and since no calibrated profile exists in this repo yet, *every* unknown-provenance call refuses today, which also turns [#11](https://github.com/artemVeduta/okf-agent-skills/issues/11)'s unconditionally-allowed read into one gated on an artifact nobody has built.

### What the run confirms

Reserve carved before selection and moving with the task kind; a declared requirement raising but never lowering the profile minimum; **unknown tasks taking the most conservative profile evaluated at this allowance** (the profiles are not totally ordered, so "most conservative" is not a fixed profile — worth stating); demands degraded rather than dropped; atomic `(concept, tier)` allocation; `SECTION` unavailable on a sectionless body with allocation moving `CARD → FULL`; per-ledger-line ceilings; work-cap-reached as a normal `degraded`; no scalar work unit; no limit expressed as a number of concepts; statelessness. **The query-normalization rules survive completely and are the cleanest part of this resolution.**

### What this does not settle

Nothing about the numbers. Every density, bound, cap, fraction and weight in the prototype is invented; there is no tokenizer, serializer, grep, renderer, filesystem or clock. **"Never silently overruns the supplied limit" remains unanswered** — the mechanism is settled, the calibration is not, and it is owed by [#7](https://github.com/artemVeduta/okf-agent-skills/issues/7) against a corpus that does not exist yet. Alias expansion, the escaped-output half of the invalid path, any discovery cache, `FULL` at zero incremental cost, and the exact-vs-profile tokenizer branch were **not exercised**, and are named in #33 rather than assumed covered.

Live human validation of the prototype remains pending.

## Comment by artemVeduta

## Correction: discoverability aliases are declined for `v0.1.0`

This ticket's resolution permitted "only explicitly authored discoverability aliases, contingent on [#21](https://github.com/artemVeduta/okf-agent-skills/issues/21) approving their representation and extension semantics."

[#21 has now resolved, and approves no representation](https://github.com/artemVeduta/okf-agent-skills/issues/21#issuecomment-5109173391). The contingency resolves negatively: `v0.1.0` ships no alias mechanism.

Two reasons. [#33](https://github.com/artemVeduta/okf-agent-skills/issues/33) did not exercise alias expansion, so there is no validated mechanism to ship. And the body-section representation #21 had originally specified contradicted its own no-product-extensions rule: a non-suite OKF consumer renders such a section as ordinary prose while the suite reads it as index input, leaving two consumers disagreeing about what the document means.

**Consequence for retrieval.** Query normalization in this ticket applies no stemming and no stopword rule, so a query sharing no tokens with a concept's title, description, or body will not reach it. That gap is now accepted for `v0.1.0` rather than closed.

**Upgrade path, if the gap proves real.** A frontmatter key, not a body section. §4.1 explicitly blesses it — "Producers MAY include any additional keys… Consumers SHOULD preserve unknown keys… and MUST NOT reject documents with unrecognized fields" — so it is purely additive and breaks no existing bundle. Nothing decided here forecloses it.

## Comment by artemVeduta

## Cache-accounting clarification

[Define what a discovery result caches, and what invalidates it](https://github.com/artemVeduta/okf-agent-skills/issues/32) resolves the cache dependency left by this ticket and sharpens the phrase "discovery-work ledger."

Use two distinct measures:

- A versioned conservative **notional cold-work charge** determines the semantic work frontier as though every pure-derivation cache lookup missed. A cache hit can never buy examination of an additional scope or concept.
- **Observed execution work** records actual reads, parses, cache hits/misses, elapsed work, and hard resource protection. It may stop execution for a resource-limit failure but never widens the notional frontier.

The persistent cache contains only immutable, content-addressed syntax parses. Admission, authority, filesystem observations, and semantic spend remain fresh. This clarification does not reopen the context ledger or any retrieval-selection decision in this ticket.
