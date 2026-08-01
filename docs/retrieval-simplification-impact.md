# Impact analysis: the proposed retrieval scope reduction

Date: 2026-08-01. Analysis only. No decision is adopted here, no ticket is changed,
no other repository file is modified.

## The proposal under analysis

> "I have very big doubts about the budget-aware runtime, the cost model, and the
> tokenizer — let's skip this. Retrieval will be only an injected document bundle
> plus a matcher."

Read as three deletions and one replacement:

| Deleted | Named in |
|---|---|
| Budget-aware runtime — allowances, reserves, ledgers, allocation, omission accounting | #13, #28, #33 |
| Cost model — conservative upper bounds, profiles, calibration, quarantine, audit | #7, #13, #28, #33 |
| Tokenizer — exact tokenization, divisors, per-ledger-line checks | #7, #13, #28 |
| **Replaced by** — an injected document bundle plus a matcher | not yet specified anywhere |

Method: for each adopted decision, separate the rules whose *only* reason to exist is
budget accounting from the rules that stand on their own. The second set is the
project's real retrieval asset and it is larger than it looks.

---

## 1. What dies

### #13 — Design agent retrieval model within context window constraints

The ticket's title is the premise being deleted. Dying rules, by name:

- **The `retrieve()` interface as adopted.** The `budget attestation` input and the
  "bounded materialized context package" output both lose their meaning. The
  signature must be rewritten, not amended.
- **"The injected number is an operation context allowance"** — the whole paragraph,
  including the identity `operation context allowance − context reserve = spendable
  retrieval allowance`.
- **Budget provenance `explicit` / `estimated` / `unknown`**, and its receipt field.
- **"Reserve context before selection, never check after."** With it: versioned task
  reserve profiles, "a declared output requirement may increase the reserve but never
  lower the profile minimum", and "unknown tasks use the most conservative validated
  profile evaluated at this allowance".
- **The honest retrieval floor**, and #33's correction that it is a function of the
  request rather than of the runtime.
- **The unknown-budget rule**: "uses a versioned calibrated deployment fallback when
  one exists and returns degraded; without such a profile, retrieval returns
  `insufficient`." This single sentence is the cause of blocking finding B2.
- **Both ledgers.** The **context ledger** ("charges only bytes/tokens crossing the
  runtime interface: materialized tiers, the bounded omission notice, the receipt")
  and the **discovery-work ledger** ("concepts/files inspected, bytes read or parsed,
  probe output, optional safety timeout"). With them: "reaching a work cap is a normal
  degraded result", "bytes, files, probes and time do not collapse into a universal
  work unit", and "no limit or default is expressed as a number of returned concepts".
- **The cost-model adapter**: "exact target tokenization when available; otherwise a
  versioned conservative profile calibrated for the exact tokenizer family and
  serializer. No valid tokenizer or profile → `insufficient`. There is no universal
  character divisor."
- **The falsified-bound path in full**: the `invalid` outcome, the independently
  bounded invalid envelope, profile quarantine, forced recalibration, and the
  escaped-output branch ("stop further retrieval and record the unplanned spend").
- **Six of the receipt's twelve fields**: budget provenance, task/reserve profile,
  context spend, discovery-work spend, tokenizer/cost-profile identity, serializer
  version. Scope snapshot, breadth, stop reason, selected tiers, policy version and
  omission form survive.
- **`(concept, tier)` as the unit of allocation.** The tier *vocabulary*
  `LINE → CARD → SECTION → FULL` can survive as a rendering choice (see §3), but
  "tiers are atomic" and "selection picks a `(concept, tier)` pair" are allocation
  rules with nothing left to allocate.
- **Demand degradation under pressure** — `FULL → SECTION → CARD → LINE`, and "refuse
  explicitly when the minimum cannot fit at `LINE`". The demand *concept* survives;
  the ladder does not.
- **Three of the five omission classes.** `CLIPPED` ("could not be afforded") and
  `UNDISCOVERED` ("the channel cost more than was left", plus #33's demanded cause
  field) have no referent. `UNSEARCHED` ("satisficing intentionally stopped") dies
  with the stop rule below. `MISS` and `FILTERED` survive — and `MISS` becomes
  reachable for the first time.
- **Satisfice versus exhaustive as retrieval modes**, and the satisficing stop rule
  ("one candidate or a coherent linked evidence set covers every retained query
  clause"). With an injected bundle there is no spending to stop, so the whole mode
  distinction collapses into "evaluate the bundle". This dissolves blocking finding
  B4 as stated — but see §5 for the half of B4 that does not dissolve.
- **The omission notice as a budget line item**, its calibrated caps, and the
  "reservation must be the largest form still reachable" rule.
- **The outcome `insufficient`.** Under the proposal nothing can be insufficient in
  the budget sense. `invalid` dies with the bound it was defined against.

### #28 — Prototype budget-aware concept selection behavior

The ticket's headline finding — **"discovery is not free, so a budgeted selector must
first pay for the right to rank"** — is the thesis being deleted. Dying:

- **The phase order `BUDGET → PIN → DISCOVER → RANK → ALLOCATE → NOTICE → VERIFY`.**
  `BUDGET`, `ALLOCATE` and `NOTICE`-as-a-priced-phase go; `PIN`, `DISCOVER`, `RANK`
  survive in altered form.
- **The channel price table in full**: a bare index "reveals title only and pre-pays
  nothing", a descriptive index "pre-pays `LINE` for everything it lists", a
  frontmatter scan "pre-pays `CARD`", the probe is "a budget line item priced at its
  cap, not at its result count". The *signal* half of the same table — that `tags`,
  `type` and `status` are available nowhere but a frontmatter read, and body-only
  words nowhere but a grep — survives as a fact about where information lives, and
  is answered trivially once the bundle is already in hand.
- **The divisor measurement**: ÷2.9 → 0% violations, ÷3.2 → 2%, ÷4.0 → 95%; "an
  estimate must be an upper bound, per document, not on average"; "aggregate slack
  hides per-document deficits, so the invariant is checked per ledger line". This is
  the project's single most rigorous empirical result and it becomes inapplicable.
  It should be preserved as evidence — see §5, it is the argument for stating any
  future ceiling in bytes rather than tokens.
- **Three of the four replay bugs**: "the notice can be the line that overruns the
  budget it exists to prevent", "there is a floor below which no honest answer
  exists", "a pin was reading sections nobody had paid to grep". Also the
  `spxt-` non-monotonicity correction and the `Math.max(pinBudget, 0)` fix.
- **"Hiding deprecated concepts is not free"** and the "ranked without status read"
  count. Under an injected bundle frontmatter is always present, so status filtering
  is always affordable. This is a genuine simplification: it removes the conditionality
  #14 inherited.

Surviving from #28: the staleness-penalty **floor of 1** ("a demotion ranks last,
still named") is a ranking rule with no price attached.

### #33 — Prototype and verify the adopted retrieval runtime contract

#33 exists to verify the budgeted contract, so most of it is moot. Correction by
correction:

| #33 correction | Fate |
|---|---|
| 1. Receipt has no reservation rule; "never overrun *silently*"; unplanned spend | **Dies** |
| 2. Seam is an attested adapter property; 161/372 divergence; demand minimum reserved before discovery | **Dies** |
| 3. `SECTION` intra-concept loss is invisible from inside context | **Partly survives** — see below |
| 4. Evidence-bound filtering has no observable; per-predicate coverage count | **Dies** — the predicate is always observable in an injected bundle |
| 5. Audit as an attested capability; audit-blind; `unverified`; the circular invalid envelope; **quarantine is cross-call state in a stateless runtime** | **Dies entirely** |
| 6. "Coherent" is undefined; `linked` and `component` are byte-identical | **Dies as a stop rule**; its informativeness half survives as a relevance problem (§5) |

Correction 5 is the largest single simplification in the whole proposal. Quarantine
was the one piece of durable cross-call state contradicting #13's declared
statelessness, and the review's B3 named it as "a contradiction, not an omission".
Deleting the cost model deletes the contradiction rather than resolving it.

**Correction 3 survives conditionally.** If the matcher returns whole documents, the
finding dies. If it returns sections — and a matcher over a large bundle will be
tempted to — then the finding returns unchanged and unpriced: a `SECTION` payload
"looks exactly like a short complete concept", and no omission code covers
intra-concept residue. The replacement must state which it returns.

Smaller #33 corrections that die: `FILTERED` must dominate `CLIPPED` (no `CLIPPED`);
`UNDISCOVERED` needs a cause field; the uncapped scope summaries; the
`{summary, detail, nextAction}` attainable-invariant restatement. `MISS is unreachable
under satisfice as written` dies by making `MISS` reachable — a small win.

### #7 — Define validation, growth, compaction, and approval contracts

#7 is the numbers ticket. The proposal cuts roughly its numeric half and leaves its
safety half intact. This is close to the split the architecture review already
recommended under B1.

**Dies — the entire "Retrieval, notices, and budgets" subsection:**

- "With an unknown budget and no calibrated fallback: materialized retrieval returns
  `insufficient`. No universal fallback number is invented." (the B2 cause, again)
- "A retrieval adapter must attest budget provenance, the model-visible discovery
  seam, tokenizer or cost-profile identity, serializer version, and exact
  post-emission audit capability."
- "Reserve context before discovery. Versioned profiles per task kind. Reserve the
  largest reachable notice and receipt."
- "Use the target tokenizer when available; otherwise a versioned conservative bound…
  checked on each ledger line. An observed violation returns `invalid` and quarantines
  the profile. An audit-blind deployment reports the bound as unverified."
- "`SECTION` reports a bounded, priced `sectionsOmitted` count."
- Omission causes "`context`" and "`work`"; "notices, omissions and receipts use
  calibrated caps".

**Dies — most of "Calibration and release evidence":**

- The calibration corpus strata *as a safety instrument*, the calibration/held-out
  separation, "select from the non-dominated Pareto frontier by task kind and
  deployment seam", "do not publish one universal numeric profile", "recalibrate
  after parser, tokenizer, serializer, renderer, cost-model… changes".
- Two of the seven zero-tolerance entries: **silent context overrun** and
  **detected conservative-bound violation**. The other five — data loss,
  nondeterminism, false-clean status, unreported omission, invalid recovery — stand,
  and "unreported omission" becomes load-bearing (§5).
- The measured support ceiling loses its *tokenizer*, *serializer* and *adapter seam*
  dimensions. Its *corpus scale, files, bytes and depth* dimensions survive and become
  the cheapest available answer to the oversize-bundle question (§3, §5).

**Survives untouched:** authority and evidence, conformance and warnings, growth and
compaction, approval and recovery, the operation manifest rules, `rollback-failed` as
a loud terminal, the recovery-evidence conjunction, the eight open recovery contracts
in `docs/research/issue-7-unresolved-recovery-contracts.md`. Note that #7's normative
growth inputs still list "observed work" — that phrase needs re-grounding once the
work ledger is gone.

### #11 — Design operational trust tier matrix for skill operations

**Nothing in #11 dies.** The matrix, the outcome contract, the atomic-effect
expansion, the automatic-lifecycle ceiling, the trust-transition workflow, the PR
approval fingerprint, the recovery gate and the twelve-step evaluation contain no
budget term. Direct inspection of the resolution confirms zero budget coupling.

What #11 loses is a **dependency, not a rule**. Its base-matrix row one — read,
validate and read-only analysis at `A/A/A` in every cell of both project modes — was
contradicted in practice by #13's `insufficient` rule, because no calibrated profile
exists. Under the proposal that row becomes true as written. This is the proposal's
largest single win and it is recorded below as the dissolution of B2.

### #6 — Specify the OKF knowledge model and automatic developer lifecycle

Two narrow items fall:

- **The context pointer itself**: "#13 now makes retrieval stateless per call and
  selects **task-profiled context reserves and discovery-work envelopes**; this ticket
  owns the task taxonomy and lifecycle moments that **select those profiles**." The
  profile-selection duty disappears. The task taxonomy does not.
- **Two of the four retrieval outcomes in the lifecycle-moments section**:
  "`insufficient` and `invalid` do not permit mutation". Both outcomes lose their
  budget definitions and must be re-grounded or deleted from #6's text. `ok` and
  `degraded` survive; so does "`unavailable`, `unobservable`, missing baseline and
  not-configured findings are never reported as clean or unchanged".

Everything else in #6 — the authority boundary, create/revise/abstain, the task
contract table, the three synchronization modes, index and log rules, the handoff
list, the canonical lifecycle results — is independent of budgets and stands.

### #35 — Specify the harness plugin architecture and `.okf-active` opt-in contract

**No rule in #35 dies.** But #35 is where the replacement lands, and one of its words
now carries the entire load that budget-awareness used to carry:

> "Each supported startup, resume, clear/compact, fork, or prompt-time re-entry
> rechecks the marker and emits **at most one bounded, read-only orientation result**."

`bounded` was underwritten by #13's accounting. #35 never defines it independently.
Under the proposal, "injected document bundle" and "bounded orientation result" are
the same object arriving through the same seam — the marker-gated `SessionStart` hook
on Claude Code and Codex, and the marker-gated prompt-time transformation on OpenCode.

Two #35 rules become constraints on the replacement rather than casualties:

- **"Orientation does not infer a task, perform lifecycle maintenance, initialize
  state, or mutate concepts."** If the injected bundle is the entire corpus, the
  injection is no longer "navigation and status only" — it is full content, which
  exceeds the orientation contract #35 wrote for it.
- **"At most one per re-entry"** fixes the injection cadence and, combined with
  #13's surviving statelessness rule, means the bundle must be re-injected at every
  re-entry moment and must never be assumed to have survived a compaction.

---

## 2. What survives

These are independent of budget accounting and must be carried into any replacement.
Several of them are the replacement's specification, already written.

**#13 query normalization — survives completely, and #33 verified it.**

> Preserve the original query; normalize searchable text with Unicode NFC and case
> folding; retain one-character terms, digits, quoted phrases, paths and identifiers;
> add identifier subterms without replacing the original. No hard stopword deletion
> rule, no global minimum term length. Match normalized whole tokens, phrases, paths
> and identifier subterms — no accidental substring stems, no implicit stemming, no
> generated synonyms.

#33 called this "the cleanest part of the resolution". It is the matcher's tokenizer
and match-surface contract and it needs no calibration. It is also the direct cause of
the failure scenario in §5, so it survives *and* needs one addition.

**Retrieval scope decisions from #13:** deterministic exact-reference, source/path,
index, frontmatter and lexical body retrieval only; **semantic retrieval deferred**;
**no `importance` or `priority` field for `v0.1.0`**; indexes are structural
accelerators and curated maps are "non-binding ranking and evidence-coherence hints"
that "neither hide unlisted concepts nor force linked concepts into context".

**Exact references are demands** — resolved before ranking, never silently dropped,
refused loudly with a quantified shortfall. The degradation ladder dies; the
never-drop rule survives and is cheap to keep.

**#21's declined discoverability aliases**, with its recorded accepted consequence:
"with no stemming and no stopword rule, a query sharing no tokens with a concept's
title, description or body will not reach it — accepted for `v0.1.0`", and its upgrade
path (a frontmatter key, never a body section).

**Deprecated-concept exclusion, from #14** — and it gets *cheaper*. "Ordinary ranked
retrieval excludes observed deprecated concepts by default"; "exact path or
concept-identity retrieval remains available with a warning"; "keep deprecated
concepts in indexes"; "retain deprecated concepts indefinitely by default"; no
`superseded_by` / `deprecation_reason` / `retain_until`; the visible Markdown
successor notice. The "if status was not observed" branch becomes unreachable when
the injected bundle carries frontmatter, which removes a conditional rather than
adding one.

**Provenance and freshness, #12 in full.** `sources` as the only authored provenance;
explicitly selected review dependencies; review baselines and their atomic acceptance
record; the four non-collapsible observations `unchanged` / `changed` / `unavailable` /
`unobservable`; "a source change is unreviewed change evidence, not proof of semantic
staleness"; `not configured` is neither clean nor stale. Zero budget content anywhere
in #12.

**#32's content-addressed parse cache.** The persistent key
(`cache-format/parser version + artifact kind + cryptographic digest of exact source
bytes`), the persisted/not-persisted split, placement in the suite-owned per-user OS
cache directory, immutability and atomic publication, reader verification of envelope
/ key / digest / schema / version, everything-wrong-is-a-miss, no TTL and no
correctness-sensitive GC, "cache failure alone never admits or rejects a bundle", and
the freshness list that reruns `REACH → PRESENCE → {TRUST, ACCESS}` on every
resolution. This survives intact **and becomes more important**: injecting a bundle
per session means re-parsing everything per session.

**#22 identity and routing in full** — path identity, no cross-bundle merging, the
resolution precedence order, "broad search examines every admitted bundle; routing
order is a tie-breaker, not permission to discard relevant results",
`okf-workspace://` links, the manifest schema, and "federated results must state they
are non-exhaustive". The matcher still needs an answer to "which bundles are in
scope", and #22 is that answer unchanged.

**#27 admission gates, #29 and #31 guard, #30 restructuring, #19 migration, #21
conformance, #26 authoring contract, #4 harness facts** — all untouched.

**#13 statelessness and the no-memory rule:** "Every call has a fresh allowance and
immutable scope snapshot. It assumes nothing returned earlier remains in model context
after compaction or source changes." Strip "allowance" and this is the most important
surviving sentence in the retrieval decision set, because it is the only place the
spec anticipates a harness silently removing injected content.

**The receipt as an artifact**, minus its six budget fields.

**Omission honesty as a principle**, via #7's surviving zero-tolerance entry
"unreported omission". After the deletion this entry has almost no machinery behind
it (§5).

---

## 3. What the replacement must still specify

"Injected document bundle plus a matcher" is two nouns. Every question below is
currently unanswered in any adopted ticket.

### 3.1 What gets injected

- **Which bundles?** The nearest admitted bundle only, every admitted bundle, or
  federated peers too? #22 says broad search examines every admitted bundle. If the
  injection is narrower than that, #22's rule is being weakened and that must be said.
- **How much of each concept?** Whole bodies, or frontmatter plus index only? If the
  latter, the `LINE`/`CARD` distinction has been reinvented under a new name and
  #28's finding stands: body-only words are reachable only by reading bodies.
- **Is it materialized in model context, or loaded in the runtime?** These are
  different products; see 3.3.
- **What is excluded, and is the exclusion disclosed?** Deprecated concepts (#14),
  an inactive required federation member (#22), an unreadable or unparseable file.

### 3.2 When injection happens

- **Session entry, per query, or both?** #35 already adopted session entry as the
  seam ("at most one bounded read-only orientation result" per re-entry moment).
- **Re-injection on `clear` / `compact` / `fork`.** #35 lists these as re-entry
  moments and #13's surviving statelessness rule requires re-injection. What happens
  when a harness compacts *mid-session* with no re-entry event? Claude Code compaction
  is documented in #29 as something skill content survives — an injected bundle does
  not have that property, and nothing currently records the difference.
- **Per-query behavior with no re-injection.** If the bundle is injected once and the
  matcher then runs per query, the matcher is running over text already in context.

### 3.3 What the matcher matches on — and where it runs

- **Fields searched:** title, description, tags, type, status, path, body, `sources`?
- **Boolean filter or ranked result?** If ranked, by what — and see §5.
- **Deterministic order and tie-breaking.** #26's governing objective is
  predictability and #5's release gate is deterministic fixture contract tests.
- **How many results?** #13's "no limit or default is expressed as a number of
  returned concepts" was confirmed intact by #33. Does it survive? If it does, what
  bounds the output? If it does not, that is a reversal and must be recorded as one.
- **Whole documents or sections?** If sections, #33's correction 3 returns in full.
- **Load-bearing: is the matcher code or prose?** If it is a function in
  `scripts/lib/`, then #13's statelessness, #32's cache and #9's fixture tests all
  apply, and the "injected bundle" is really a corpus loaded by the runtime. If the
  matcher is an instruction to the model over already-injected text, then none of
  those apply, the behavior is not deterministic across harnesses or models, and #5's
  release gate has nothing left to assert. These two readings have opposite
  consequences for every other ticket and the proposal does not distinguish them.

### 3.4 The bundle that does not fit — the question budget-awareness existed to answer

This is the crux. The proposal must answer it, because the limit is real whether or
not the specification models it. The options, and what each costs:

1. **Refuse above a threshold.** Honest, but a threshold is a number, and a number
   needs justification — B1 returns in miniature.
2. **Inject a summary tier and read bodies on demand.** This is #28's channel model
   with the prices removed. Workable, and it is progressive disclosure without a
   budget — but then 3.1 becomes a tier decision and #33's `SECTION` finding returns.
3. **Truncate to a byte or character cap.** #28 measured exactly this failure:
   characters ÷ a divisor under-estimates in 2% of runs at ÷3.2 and 95% at ÷4.0, and
   "two percent matters because the failure is silent". **Deleting the tokenizer does
   not delete the need for a bound — it deletes the ability to state the bound in the
   units the harness actually enforces.**
4. **Declare that bundles are small enough, normatively.** #7 already has the
   instrument: a **measured support ceiling** in corpus scale, files, bytes and depth,
   with "outside it, no completeness or calibration is claimed". This needs no
   tokenizer, no cost model and no calibration corpus. It is the cheapest honest
   answer available and it reuses an adopted rule.
5. **Say nothing.** This relocates the problem to the human — and does it in the worst
   possible form, because the human is not told. The harness truncates or compacts
   silently; there is no error, no receipt line, and no adopted rule that fires.

Option 5 is what the proposal currently is. Options 1 and 4 are both defensible and
cheap. What is not defensible is leaving it unstated, because the failure mode is
silent and #7's "unreported omission" zero-tolerance entry is still in force.

### 3.5 Interaction with `.okf-active` and #35

- **Ordering.** Does injection happen before or after admission (#27's four gates) and
  routing (#22) resolve? It cannot happen before, or it would bypass `TRUST` and
  `ACCESS`.
- **`.okf-active` absent** → #35 says silent no-op, explicit reads report
  `not-configured`. Unchanged and fine.
- **Degraded workspace health** → #22 requires federated results to state they are
  non-exhaustive. The injection must carry that disclosure; there is currently no
  carrier for it in an injected document bundle.
- **Orientation contract collision** → #35's orientation is explicitly "navigation and
  status only" and must not infer a task. A full-corpus injection is not that. Either
  #35's orientation and the retrieval injection are two different artifacts through
  one seam, or #35's bound is being redefined. Say which.
- **Adapter parity** → #35's "cross-harness consistency means equal shared-runtime
  decisions and safety outcomes". If the matcher runs in-model over injected text,
  equal decisions across three harnesses cannot be claimed, and #35's parity statement
  weakens for the same reason #19's did under C3.

### 3.6 Outcome and disclosure vocabulary

- **What replaces `insufficient` and `invalid`?** #6 hard-codes both into the
  lifecycle: "`insufficient` and `invalid` do not permit mutation."
- **What grounds `degraded` now?** Candidates: unreadable file, unparseable
  frontmatter, inactive required federation member, failed injection, marker present
  but bundle missing.
- **What omission vocabulary remains?** `MISS` and `FILTERED` survive. Is there
  anything left that tells the model "the corpus you can see is not the whole corpus"?
  If not, that capability has been deleted, not simplified.

---

## 4. Which architecture-review findings evaporate

| # | Finding | Fate under the proposal |
|---|---|---|
| B1 | No numeric value is set and no ticket builds the calibration corpus | **Largely dissolved** |
| B2 | Uncalibrated deployment refuses every read | **Fully dissolved** |
| B3 | `retrieve()` signature never folded in #33's six corrections | **Mostly dissolved; shrinks to a writing task** |
| B4 | "Coherent" evidence set undefined, stop rule untestable | **Dissolved as stated; its relevance half survives and worsens** |
| C1 | Library-only delivery decides the ledger seam | **Fully dissolved** |
| C2 | No operation-to-skill map; sync and confirmation misplaced | **Survives unchanged** |
| C3 | #19 blocks where #29 degrades on an unattested harness | **Survives unchanged** |
| C4 | Four artifacts called manifest | **Survives unchanged** |
| C5 | Operation store has no path; bundle move orphans ledger | **Survives unchanged — now the largest remaining gap** |
| C6 | Two modules both called discovery share one accounting vocabulary | **Half dissolves, half survives** |
| C7 | Write gate has no bootstrap case | **Survives unchanged** |
| D1 | Superseded research presented as evidence | **Survives and is made materially WORSE** |
| D2 | Map entries omit a carried correction | **Survives and grows** |

### Detail on the four that move

**B1 — largely dissolved.** #7 owned ten families of number: human tolerances, reserve
and work profiles, ranking weights, evidence-sufficiency thresholds, notice caps,
fallback allowances, divisors, per-tokenizer separation, held-out metrics, and the
selected operating points. Every one except *ranking weights* is budget-derived and
dies. The calibration corpus shrinks from a per-tokenizer, per-seam Pareto-frontier
safety instrument to an ordinary retrieval-quality evaluation. The review's own
correction — "open one calibration ticket, make it block #9 not #8" — is largely
overtaken. **Not fully dissolved:** if the replacement adopts any support ceiling or
result cap (3.4), a small B1 returns, and ranking weights remain uncalibrated with
nothing measuring them.

**B2 — fully dissolved.** The finding is a direct consequence of one deleted sentence.
#11's `A/A/A` read row and #35's bounded orientation result become consistent with
retrieval for the first time. Notably, the review's *preferred* correction for B2 was
"define an orientation path that spends no token estimate" — the proposal is that
correction generalized from orientation to all retrieval, which is a point in its
favour and should be recorded as such.

**B3 — mostly dissolved.** Of the six signature-changing corrections in the review's
table: seam attestation, audit capability plus `unverified`, quarantine ownership,
per-predicate coverage, and the `UNDISCOVERED` cause field all die. The two decisions
the review said "must be made, not carried" both evaporate — the `sectionsOmitted`
versus section-manifest choice becomes conditional on 3.3, and quarantine has no
subject. What remains is not a contradiction but an unwritten interface: #8 must still
publish one normative signature, it is now short.

**B4 — dissolved as stated, worse in substance.** The satisficing stop rule dies with
satisficing, and `MISS` becomes reachable and testable. But B4's second paragraph is
not about budgets at all: *"The rule also has no notion of clause informativeness while
#13 bans every cheap discriminator by name, so `the` discharges coverage as fully as
`retention`."* That sentence describes the matcher the proposal is adopting. Removing
the budget removes the stop rule; it does not supply an informativeness notion, and it
removes the four-channel escalation that partly compensated for the lack of one. See
§5.

**C1 — fully dissolved.** The finding is that #5's library-only delivery put all three
adapters on the in-context seam, which mattered because a ledger charged bytes there
and because #33 measured a 161/372 divergence between seams. With no ledger, whether
stdout is a tool result is a cosmetic question. #1's map entry still needs correcting
for accuracy, but the decision it forced no longer exists.

**C6 — half and half.** The *accounting* half dissolves: #32's notional cold-work
charge, its observed execution work, and the sentence "this resolves the accounting
dependency left by #13" all lose their subject. The *naming* half survives: bundle
admission and in-bundle concept discovery are still two different modules and
`CONTEXT.md` still glosses both under one word. The fix is cheaper than before but
still owed.

### The two made worse

**D1 — materially worse.** Today D1 names four research notes carrying reversed
candidate policy. The proposal adds to that pile the two most detailed and most
rigorously validated documents in the repository: #28's prototype findings (45 named
cases, 4,312-run sweep, 30,000-run fuzz) and #33's (102 cases, 136,080-run sweep, two
independent reviews), plus most of #13's resolution and #7's numeric half. #8's author
will read precise, executable, internally consistent, *superseded* retrieval policy —
which is exactly the D1 pattern, at several times the scale. The mitigation is the same
one D1 already prescribes and it must be applied deliberately: a superseded banner
naming this decision, on #13, #28, #33 and #7's retrieval sections, with the notes left
intact because the evidence stays useful.

**D2 — grows.** #1 must now carry a scope-reduction clause on #13, #28, #32, #33, #7
and #6. C1's prescribed edit changes from "name the adopted seam" to "delete the seam
economics".

### One consequence the review does not cover

**#9's test surface shrinks and gets harder.** #5's release gate is `node --test` with
deterministic fixture contract tests, and the budgeted selector was the most testable
object in the entire specification: "never exceeds the allowance" is an assertion a
fixture can check, and #28 and #33 checked it 170,000 times. A matcher's correctness
criterion is "did it return the right concept", which is a judgement. The proposal
removes the part of the product that was mechanically verifiable and keeps the part
that is not. That is a real cost even though it is not a review finding.

---

## 5. The honest risk

### What the product loses

1. **Its only mechanically verifiable retrieval property.** The recovery, guard and
   authorization decisions remain provable and untouched. Retrieval stops being so.
2. **Honest omission reporting.** `CLIPPED`, `UNDISCOVERED` and `UNSEARCHED` each told
   the model *why* something was absent, and #28's finding was that each has a
   different fix. An injected bundle tells the model nothing about absence, because
   the design assumes there is none. When that assumption fails — a file the runtime
   could not read, an inactive required federation member, a harness that truncated
   the injection — the failure is silent, and "unreported omission" remains on #7's
   zero-tolerance list with nothing left to enforce it.
3. **Knowing where the wall is.** The context window is a hard limit regardless of
   whether the spec models it. Budget-awareness meant the runtime hit the wall
   knowingly and said so. Without it the harness hits the wall, and harnesses truncate
   or compact rather than refuse. #29 records that Claude Code *skill content* survives
   compaction — which is why the guard's design leans on it. An injected document
   bundle does not have that property, and no adopted rule currently notices its
   disappearance.

### A concrete failure of an uncalibrated simple matcher

Knowledge-only bundle, mature project, roughly 400 concepts. Injected in full. The
user asks:

> "what is our retention policy for deprecated concepts?"

#13's surviving normalization rules are explicit and were verified intact by #33:
**no stopword deletion, no minimum term length, no stemming, no synonyms.** The query
tokens are therefore `what`, `is`, `our`, `retention`, `policy`, `for`, `deprecated`,
`concepts`. In a bundle about knowledge management, `for`, `is`, `our`, `policy`,
`concepts` and `deprecated` appear in nearly every document.

- A **boolean matcher** returns essentially the whole bundle. The user has retrieval
  that returns the corpus.
- A **ranked matcher with unweighted term frequency** ranks a long unrelated concept
  that says `is` forty times above the two-paragraph concept that says `retention`
  twice. #33 stated this outcome in exactly these terms — *"`the` discharges coverage
  as fully as `retention`"* — and offered document frequency as **"a proposal, not a
  finding, corpus-derived, carrying its own uncalibrated constant."**

So the ranking fix is itself a calibration, of the kind the proposal is deleting.

**Does the current spec catch it? No, and this is the sharp point.**

- #7's zero-tolerance list has no entry for *returned the wrong thing*. Its seven
  entries are about overrun, loss, nondeterminism, false-clean, unreported omission,
  invalid recovery and bound violation.
- The retrieval-quality metrics that *would* catch it — tier-adjusted recall,
  precision, stop regret versus exhaustive search, end-task evidence quality — exist
  only inside #13's validation contract and #7's calibration program, which is the
  machinery being deleted.
- #6's outcome vocabulary is `ok` / `degraded` / `insufficient` / `invalid`. A
  confidently wrong ranking returns **`ok`**.
- #21's declined aliases and #13's ban on stemming and synonyms compound it in the
  other direction: the recorded accepted consequence is that a query sharing no tokens
  with a concept will not reach it. That was accepted when the selector had four
  discovery channels and an omission report carrying a `nextAction`. With a bare
  matcher and no omission vocabulary, the same miss returns silence.

### A second scenario: the silent overflow

400 concepts at roughly 2 KB each is about 800 KB injected at `SessionStart`. Every
harness handles that differently and #4's finding is that these are adapter concerns
with no verified parity. The user sees a session that answers well at turn 1 and
answers from nothing at turn 30. No receipt records that the bundle left context.
#13's statelessness rule — *"assumes nothing returned earlier remains in model context
after compaction"* — was written for precisely this and is the one budget-era rule the
replacement must keep even after deleting the accounting that motivated it.

### What the spec already has, that costs nothing to reuse

The replacement can be honest cheaply, but only by adopting these explicitly, because
deleting the budget machinery deletes the only place the specification currently says
"this result is not everything":

- **#7's measured support ceiling** in corpus scale, files, bytes and depth, plus
  "outside it, no completeness or calibration is claimed" — no tokenizer required.
- **#14's degraded-unfiltered-result rule** — the existing template for an honest
  partial retrieval.
- **#22's "federated results must state they are non-exhaustive"** — the existing
  template for honest partial coverage.
- **#13's statelessness and no-memory-across-compaction rule.**
- **#28's divisor measurement**, preserved as evidence rather than policy: it is the
  argument for stating any future ceiling in **bytes**, which are observable, rather
  than tokens, which are not.

### Net assessment

The reduction is defensible and probably correct. It dissolves two blocking findings
outright, shrinks a third to a writing task, resolves the statelessness contradiction
by deletion rather than by design, and — the strongest argument in its favour — #28
established that **no harness gives a skill a tokenizer**, which means every token
figure in the design was always characters divided by an invented constant. Building
a safety system on an invented constant is worse than not claiming the guarantee.

The price is three specific things, and each has a cheap remedy already present in the
adopted decision set:

1. **An unstated answer to the oversize bundle.** Remedy: adopt #7's support ceiling
   in bytes and files, and state the behavior above it loudly.
2. **No vocabulary for partial coverage.** Remedy: reuse #14's degraded-unfiltered
   rule and #22's non-exhaustive disclosure.
3. **No relevance calibration and no way to detect its absence.** Remedy: either
   accept a documented ceiling on retrieval quality for `v0.1.0` and say so, or keep
   a minimal held-out query set as the only surviving calibration artifact — which is
   an ordinary evaluation, not the safety program being deleted.

The failure this analysis most wants on record: **budget-awareness was the only
mechanism in the specification that made "you are not seeing everything" observable.**
Deleting it is fine. Deleting it without a replacement disclosure rule is the one move
that makes the product quietly worse rather than simply smaller.
