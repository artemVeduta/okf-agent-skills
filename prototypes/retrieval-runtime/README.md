# Retrieval runtime — prototype for issue #13

**Throwaway.** Captured on `prototype/retrieval-runtime`, not merged to `main`. It exists to
run the contract that [#13](https://github.com/artemVeduta/okf-agent-skills/issues/13) adopted
in prose, and to record where running it disagrees with the writing.

```bash
node prototypes/retrieval-runtime/tui.ts          # drive it by hand
node prototypes/retrieval-runtime/tui.ts --once "xxS"  # render one frame from a key string
node prototypes/retrieval-runtime/walkthrough.ts  # 93 cases + a 136,080-run sweep
```

Node 22.6+ (native TypeScript type stripping). No dependencies, nothing written to disk.

## The question

#13's resolution was written, not run. It adopts a stateless shared retrieval runtime with two
ledgers, versioned task profiles, evidence-bound omissions, tokenizer-first accounting, and four
result states — and it re-seats the accounting of
[#28](https://github.com/artemVeduta/okf-agent-skills/issues/28), whose prototype charged
discovery to model context. Does the adopted contract survive being driven by hand?

`retrieve.ts` is the portable part: a pure function over an injected corpus, an injected
declaration, an injected cost model and injected output bounds. No I/O, no clock, no randomness,
no tokenizer, no cache. Everything else is disposable shell.

## What the run found

### 1. The receipt is an enumerated context item that #13 never tells anyone to reserve for

#13 puts the receipt on the context ledger — "materialized concept tiers, the bounded omission
notice, and the receipt" — and requires it to carry twelve fields. It then spells out a
reservation discipline for exactly one of those three items. The notice gets *"the reservation
must be the largest form still reachable"* (inherited from #28). The receipt gets nothing.

An implementation that reserves only for the notice overruns. That is not subtle and it is not
rare: it is every run whose free room at emission is smaller than the receipt.

**An earlier revision of this prototype did exactly that, and the sweep caught it.** The honest
decomposition, measured by patching the reservation back out:

| cause | worlds overrunning |
| --- | --- |
| receipt charged but never reserved for | ~1,200 |
| residual, from the receipt's size depending on the selection it reports | ~119, worst case 6 tokens |

So the dominant defect is the missing reservation, and the self-referential part is real but
small. An earlier draft of this README credited the whole thing to self-reference and to #13's
rules; that was wrong, and the correction is owed to a review of the frozen artifact.

Two things follow for #13, and only these two:

- **State the reservation for the receipt, not only the notice.** One sentence.
- **The receipt's size depends on the selection it reports** (`selected tiers`, and per-line spend
  if the receipt is to evidence the per-line ceiling #13 leans on). So the same
  *largest-reachable* rule applies to it, for the same reason.

The fix has a cost that must be stated too: reserving for the largest reachable receipt
over-reserves on most runs, and an over-broad version of it turned a demand that would have fit
into a refusal. The reservation here is seam-aware for that reason — `DISCOVERY` ledger lines
cannot occur on the out-of-context seam, so reserving for them is pure loss.

*Caveat:* the magnitude of the residual is a function of `DEFAULT_OUTPUT`'s invented constants.
The structural claim — an enumerated context item with no reservation rule — does not depend on
them.

### 1b. Below the cost of the smallest refusal, there is no truthful output at all

A refusal is model-visible output and has to be paid for. #13's honest retrieval floor is "the
minimum spendable allowance needed for the smallest truthful result envelope" — but the envelope
that says *no* is never priced, and `allowance − reserve` composed with a profile minimum that a
declared requirement "cannot reduce" permits a spendable of zero or below.

The sweep of 136,080 runs finds overruns only there, and they are unavoidable: the runtime must
overspend to say anything, including "no". So the invariant the sweep asserts is not *never
overrun* — it is **never overrun silently**. Those runs record `UNPLANNED SPEND`, which is #13's
own phrase for it, borrowed from a clause #13 scopes only to the falsified-bound path.

### 2. "Internal reads do not consume model context" is not a design constant

#13 states it as one, then defers the packaging decision that determines it: *"whether the
runtime ships as a CLI, script, or library remains with #5."* A CLI's stdout arrives as a tool
result, which is model context. In that world #13's own escape clause — "any harness fallback
that exposes discovery output to the model must charge that output to the context ledger" — is
not a fallback, it is the main path, and the two-ledger design collapses back into #28's one.

The prototype makes the seam an **attested property of the adapter** (`Seam = 'in-context' |
'out-of-context'`). The context ledger then has one rule — it charges bytes entering model
context — both topologies are expressible, and the fallback clause stops contradicting the
general one.

Both seams are executable, and the difference is the experiment (cases C1–C3). `code` and
`code-heavy` are identical in every concept the query selects and differ 10× in unselected bytes:

| seam | context spend | work spend (bytes) |
| --- | --- | --- |
| out-of-context, light | 161 | 20,328 |
| out-of-context, 10× unselected | **161** | **182,328** |
| in-context, light | 372 | 20,328 |

(Figures read from the run, not computed. An earlier draft of this table carried two numbers I
had estimated rather than measured — 200,328 and 269 — which a review of the frozen artifact
caught. Note also that the comparison needs a work envelope wider than any the `w` key offers:
under the shipped default the 10× corpus exhausts the byte cap, the body channel is never bought,
and the two corpora then *differ*. The result holds where the experiment can run, not everywhere.)

Under the out-of-context seam an index pre-pays nothing in context, so #28's index economics do
not transfer as stated: "a query the paths already explain buys nothing else" stops being a claim
about the *context* budget, and the honest retrieval floor loses the path-list term that was its
dominant component. Whether those results survive in some other form is a calibration question.
What is not a calibration question is that #13 says it "incorporates the corrected findings from
#28" while this seam reverses their accounting, and the map still records the old economics as a
standing decision.

### 3. `SECTION` is the only tier whose loss is invisible from inside context

`LINE`, `CARD` and `FULL` are self-announcing — a title looks like a title, metadata with no body
looks like metadata, a document looks like a document. A `SECTION` payload is a title, a
description, complete frontmatter and two headed prose sections: it looks **exactly** like a
short, complete concept. Nothing in #13's definition requires it to disclose that sections 3
through 7 exist and were not shown, and none of the five omission codes covers intra-concept
residue — all five classify a *candidate*.

So a concept truncated to its `## Schema` section is read as the concept. The receipt says
`SECTION`; the model's context says `FULL`.

The sentence following the ladder — "paragraph and semantic chunking are not hidden inside this
tier" — shows the author was worried about exactly this and reached for the wrong lever.
Restricting the cut to heading boundaries makes `SECTION` deterministic. It does nothing to make
it honest.

**The finding is the gap, not the remedy.** #13 should say how a `SECTION` allocation discloses
what it withheld; it currently says nothing. This prototype implements one remedy — `SECTION` =
`CARD` + the concept's complete section manifest + the selected sections — because a prototype
has to implement *something*, and it makes the allocation self-describing and gives `FULL`
something checkable to assert against. But it is not the only remedy and it is not free: the
manifest is priced here from an invented constant on a fixture whose largest concept has three
sections, and on a real document with forty headings it could exceed the sections it discloses.
A bounded `sectionsOmitted: n` count would close the same gap at O(1). **Choosing between them is
#13's decision, not this prototype's** — the run establishes only that the gap is real.

### 4. "Evidence-bound filtering" has no observable

#13: *"Unobserved filter evidence remains incomplete discovery; never assume it passed or
failed."* But inclusion **is** the pass action, and the enumerated model-facing structure —
selected concepts, unresolved demands, capped `CLIPPED`/`FILTERED` names, count-only `MISS`,
`UNDISCOVERED`/`UNSEARCHED` scope summaries — has no slot for *"n candidates were ranked without
their predicate field observed."* From the model's side, a concept whose status was never read
and which is materialized anyway is indistinguishable from one that passed the filter.

#28 found this, built the carrier, and then had to fix the carrier because it was an oracle:
*"The 'ranked without their status read' count was computed by reading `status`... It now counts
every candidate ranked below the CARD tier, which is all a real implementation could know."*
#13 kept the slogan and dropped both halves. The receipt's twelve fields carry nothing about
predicate coverage either.

**Departure:** a per-predicate, tier-derived `unevaluatedPredicates` count in the bounded
structure. It is count-only, so it costs O(active predicates), not O(N) — and it is priced, along
with every other field the structure names. (An earlier revision added it for free, which is the
same sin as Finding 1; a review of the frozen artifact caught that too.) Case F2 is the oracle
test: hold the observation tiers fixed, flip every hidden `status` value, and the count must not
move.

### 5. The falsification backstop cannot fire where it matters

#13: *"A falsified conservative upper bound produces `invalid`, not degraded."* Detecting that a
bound was exceeded requires ground truth **other than the bound**. In the profile branch — the
only branch where a conservative upper bound is being relied on — the runtime has exactly one
number per string. #13 names no second source. #28 supplied one by fixture injection and said so;
#13 kept the verdict and dropped the provision.

The prototype makes this an attested capability. A deployment declares whether it can supply an
exact post-emission token count; if it cannot it is **audit-blind**, `invalid` is unreachable, and
every receipt says `boundStatus: 'unverified'` instead of implying a backstop that does not exist.

Cases G1–G8: the `OPTIMISTIC` profile (an uncalibrated 0.72 scale) is caught and produces
`invalid` with content discarded on an audit-capable deployment, and is **completely undetected**
on an audit-blind one — same corpus, same query, same admitted set. Admission and charging are
byte-identical across the pair; only the outcome and the receipt differ. That is the honest
statement of the current world: #13 reads as defence in depth and has one layer.

Two further problems the run surfaces:

- **The invalid envelope is circular.** Bounded by the quarantined profile, or by a universal
  content-independent constant — which is the "universal character divisor" the same bullet
  bans. The prototype takes the only coherent option: a fixed, content-free literal measured once
  per deployment. It therefore **names nothing**, which collides with "never silently drop a
  demand".
- **Quarantine is cross-call state in a runtime declared stateless.** Case G13: two identical
  sequential calls behave identically, because there is nowhere for the quarantine to live —
  `retrieve`'s signature has no registry input. Either the runtime is not stateless, or quarantine
  belongs to an adapter that #13 does not give it to.

### 6. The satisficing rule is undecided, not decided

#13 replaces #28's "stop when every query term is explained" with *"one candidate or a coherent
linked evidence set covers every retained query clause."* **"Coherent" appears twice in the
resolution and is defined nowhere.** Its two defensible extremes are exactly the two rules the
resolution was choosing between:

- `single` — one concept must cover everything. Nearly unsatisfiable for multi-clause queries;
  satisfice degenerates into exhaustive-bounded-by-the-work-cap.
- `component` — any connected set. Since index files link every concept in a directory, this is
  #28's union rule under a new name.

The dial (`h` in the TUI) makes the collapse visible. #13 does not decide the question; it renames
it and hands the operating point to whoever writes the first implementation.

And the rule has no notion of clause **informativeness**, while #13 bans every cheap
discriminator by name — no stopword rule, no minimum term length, no stemming, no synonyms, no
`importance` field. So `the` and `a` discharge coverage as fully as `retention`.

The `df-weighted` dial offers document frequency as a candidate discriminator and shows the two
rules disagreeing about what must be covered for the same query (H3). **This is a proposal, not a
finding.** It is corpus-derived and carries its own constant (`dfCeiling`), which #7 would have
to calibrate — the same class of thing #13 deferred. It is offered to #13 as an option, and the
run proves only that bare clause coverage treats filler and discriminating clauses identically.

### 7. Smaller, all executable

- **The honest floor is a function of the request, not a constant** (B14). "Never silently drop a
  demand" makes the smallest truthful envelope grow with the number of demands: a request with 400
  unresolved demands cannot be answered truthfully in the space a one-demand request needs. #13
  states the floor as a runtime property.
- **`UNDISCOVERED` has two causes with opposite fixes** (C7–C8). Under two ledgers it can mean
  "the work envelope ended" or, on the in-context seam, "the context allowance ended." #13's class
  has no cause field, so the caller cannot tell which knob to turn. The prototype carries
  `ledger: 'context' | 'work'` and asserts the `nextAction` names the right one.
- **`MISS` is unreachable under satisfice as written** (F4–F5). "Every enabled and applicable
  channel required by the selected mode was examined" is false whenever satisficing stops early,
  so a zero-scoring concept read only through an index is `UNSEARCHED` evidence wearing a `MISS`
  label. The prototype gates `MISS` on body observation.
- **`FILTERED` must dominate `CLIPPED`** (F8). Both predicates can hold on one candidate and #13
  gives no precedence. Budget-independent exclusions have to win: reporting a policy-rejected
  concept as `CLIPPED` attaches "raise the allowance", which can never surface it. This is #28's
  "advice that would not have helped" invariant, generalized to a precedence rule.
- **The two-ledger split leaves a gap no class covers.** A candidate fully discovered, scored and
  selected, whose *materialization* is stopped by the work ledger, is not `CLIPPED` (the allowance
  had room), not `UNDISCOVERED` (the channel was examined), and not any of the other three.
- **Unknown budget without a fallback now refuses** (B10), inverting #28's validated "unknown
  budget degrades rather than blocks" — on assertion, not evidence. Since no calibrated profile
  exists anywhere in this repo yet, as written *every* unknown-provenance call returns
  `insufficient`.
- **No calibrated cost profile means `insufficient`** (B12), and combined with the above this
  turns #11's unconditionally-allowed read operation into one gated on an artifact nobody has
  built.

## What survived contact intact

Reserve carved before selection and moving with the task kind; a declared output requirement
raising but never lowering the profile minimum; unknown tasks taking the most conservative profile
*evaluated at this allowance* (the profiles are not totally ordered, so "most conservative" is not
a fixed profile); demands resolved before ranking, degraded rather than dropped, refused with a
strictly positive quantified shortfall and **monotone in the allowance** (#28's `spxt-`
regression, case B15); atomic `(concept, tier)` allocation; `SECTION` unavailable on a sectionless body with
allocation moving `CARD → FULL`; the five outcome classes as *names*; per-ledger-line ceilings
rather than aggregate; work-cap-reached as a normal `degraded`; no scalar work unit; no limit
expressed as a number of concepts; statelessness and no dedup against previously returned content;
and every exit path emitting a receipt of the full shape — including the refusal paths where #28
found its checks were dead code, though on those paths three fields are honest placeholders
(`allowanceSource`, `reserveProfile`, `serializerVersion` read `n/a`).

The query-normalization rules survive completely and are the cleanest part of the resolution
(cases A1–A13): one-character terms, digits, quoted phrases, paths and identifiers retained;
identifier subterms added without replacing the original; NFC and case folding; no stopword
deletion, no minimum length, no substring stems, no implicit stemming, no generated synonyms.
There is deliberately no `includes()` call anywhere in `query.ts` — that single call is what made
#28's matcher match `spec` inside `specification`.

## What this prototype does NOT prove

A green run licenses claims about the **decision procedure** only: that it is internally
consistent, order-correct, and free of the self-pricing oracles #28 found by replay.

It licenses **nothing about the numbers.** Every density, bound, cap, fraction and weight in
`corpus.ts` and `DEFAULT_DIALS` is invented. Nothing here shows that any cost profile is
conservative for real OKF documents, and there is no tokenizer, no real serializer, no real grep
serialization, no notice renderer, no filesystem, and no clock. "Never silently overruns the
supplied limit" remains **unanswered** — the mechanism is settled, the calibration is not, and
calibration is owed by #7 against a corpus that does not exist yet.

It also cannot test what the fixture supplies. The oracle register, and the discipline that keeps
each honest:

| Injected fact | Discipline |
| --- | --- |
| per-document token cost | declared `bound` drives admission and charging; `observed` is visible only to an audit that can report a violation and never change a decision |
| notice and receipt sizes | reserved and charged at finite template bounds, never at rendered size |
| which sections match the query | gated on paid body evidence for **every** entry kind, demands included |
| "ranked without the predicate observed" | derived from observation tier, never from the unread field (case F2 is the falsification harness) |
| clause coverage, evidence coherence | only the stopping *algebra* is tested; coverage detection is asserted by the fixture |
| the budget declaration | only the negative branch is honest: a missing declaration yields `unknown`, never a silent `explicit` |
| corpus inventory completeness | the injected corpus *is* the inventory; real enumeration has symlinks, permissions and ignore rules |
| the work envelope's timeout dimension | untested — there is no clock |

### Clauses of #13 this prototype does NOT exercise

Named rather than left to be assumed covered. Alias expansion (`aliasExpansions` is initialized
and never written). The "stop further retrieval when model-visible output already escaped" half
of the invalid path — `UNPLANNED SPEND` is recorded, but there is no emitted/escaped state and no
cross-call stop. Any discovery cache at all: G11/G12 assert determinism of a pure function, which
is a weaker claim than "a cache cannot preserve authority or spend." `FULL` asserting
nothing-unread *at zero incremental cost* — no fixture produces that state. "Curated navigation
neither hides unlisted concepts nor forces linked concepts into context" — the fixture has
unlisted concepts but no assertion about them. And the exact/profile tokenizer branch is a label:
`EXACT` and `CONSERVATIVE` are behaviourally identical here.

Validated in-session against the scripted catalogue (93 cases, 136,080-run sweep). **Not yet
driven live at the keyboard.** Any case that behaves wrong under hand-driving overturns the
corresponding finding above.
