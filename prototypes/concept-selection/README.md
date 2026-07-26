# Prototype — budget-aware concept selection

**Throwaway.** Lives on `prototype/concept-selection`, never on `main`. It exists to answer one
question from wayfinder ticket [#28](https://github.com/artemVeduta/okf-agent-skills/issues/28);
the validated decision is what graduates, not this code.

## The question

Given a query, a task context, an **explicit** token budget and an OKF bundle, which exact-link,
path, index, tag, keyword-ranking and progressive-disclosure behavior returns a relevant concept
set such that:

1. the budget for the **rest of the agent operation** is visibly reserved *before* anything is
   selected, not checked afterwards; and
2. the supplied limit is **never silently overrun** — where "silently" is the load-bearing word:
   an agent that does not know what it failed to load concludes the bundle has nothing.

Out of the question's scope, deliberately:

- concept identity, deterministic lookup, cross-bundle precedence and dedup — [#22](https://github.com/artemVeduta/okf-agent-skills/issues/22): an exact reference resolves against a concept id or an artefact the concept declares, and nothing else — resolving a bare basename against any directory would be a lookup rule, which is #22's to write
- which frontmatter field carries source traceability — [#12](https://github.com/artemVeduta/okf-agent-skills/issues/12): the fixtures use an injected `sourceRefs`, deliberately not named after `sources`, `source_files`, `derived_from` or any extension
- redirects, tombstones, inbound-link rewriting — [#24](https://github.com/artemVeduta/okf-agent-skills/issues/24)
- what may be cached and what invalidates it — [#32](https://github.com/artemVeduta/okf-agent-skills/issues/32)
- how freshness is computed (`stale` is an injected flag) — [#12](https://github.com/artemVeduta/okf-agent-skills/issues/12)
- whether deprecated concepts are hidden by default — [#14](https://github.com/artemVeduta/okf-agent-skills/issues/14)
- where the budget number comes from, and which defaults get adopted — [#13](https://github.com/artemVeduta/okf-agent-skills/issues/13) / [#7](https://github.com/artemVeduta/okf-agent-skills/issues/7)
- semantic / vector retrieval — excluded by the ticket

## Run it

```bash
node prototypes/concept-selection/tui.ts          # drive it by hand
node prototypes/concept-selection/walkthrough.ts  # replay the 42 hard cases + the sweep
```

Node 22.6+ (native TypeScript type stripping). No dependencies, no package manager, nothing
written to disk.

## Files

| File | What it is | Keep? |
| --- | --- | --- |
| `selection.ts` | The pure selector. No I/O, no clock, no randomness, no tokenizer, no cache. | **yes** |
| `corpus.ts` | Three fake bundles with made-up character counts and ground-truth token counts. | no |
| `driver.ts` | `step(world, key)` — the one keystroke path the TUI and the walkthrough share. | no |
| `tui.ts` | Terminal shell; re-renders the whole budget and selection after every key. | no |
| `walkthrough.ts` | 42 cases plus a 4,312-run sweep, replayed through those same keys. | no |

## The model

```
BUDGET → PIN → DISCOVER → RANK → ALLOCATE → NOTICE → VERIFY
```

**The reserve is carved out first.** Checking a total after ranking is not reserving: by then the
ranker has decided how to spend money it never had. `spendable = total − reserve(task)`.

**Discovery is not free, so the selector must pay for the right to rank.** Four channels, priced
independently and bought in escalating order, only while query terms remain unexplained:

| Channel | Buys | Reveals |
| --- | --- | --- |
| `paths` | the `glob` listing | ids and path segments — bought unconditionally |
| `index` | a directory's `index.md` | title + description for everything it lists, in bulk |
| `scan` | that directory's frontmatter | `tags`, `type`, `status` — available nowhere else |
| `probe` | a grep across bodies, capped like `grep -m` | words the frontmatter never mentions |

The probe is priced at its **cap**, not at its result count: a real grep hands back its output
before anything can count it, so pricing from the number of matches would be an oracle. The
affordability test uses the bound, the ledger charges what came back, and matches beyond the cap
are reported as unread.

Buying an index **pre-pays the LINE tier** for every concept it lists; a scan pre-pays CARD. That
makes the index/scan choice an investment made *before* you know what you want, not a lookup.

**Progressive disclosure is the unit of allocation, not a navigation sequence.** Selection picks a
(concept, tier) pair from `LINE → CARD → SECTION → FULL`. Tiers are atomic: a half-read concept is
indistinguishable in context from a whole one, which is worse than not having it.

**Exact references are demands, not candidates.** They are resolved before ranking and honored
before anything is ranked; under pressure they degrade down the ladder and are never dropped. If
they do not fit even at LINE, the whole selection refuses and says by how much.

**Five ways out, because five different things fix them.**

```
CLIPPED       matched, could not be afforded              → raise the budget / pin it
MISS          looked at, nothing matched                  → change the query
UNDISCOVERED  never looked at: the channel that would     → raise the budget
              have read it cost more than was left
UNSEARCHED    never looked at: discovery stopped because  → broaden the query, or
              every term was already explained            switch to exhaustive
FILTERED      excluded by a status policy                 → change the policy
```

`UNDISCOVERED` and `UNSEARCHED` look identical from outside — an unread directory — and mean
opposite things. One is poverty; the other is a satisficing rule doing its job.

**Clipped concepts are named; missed concepts are counted.** Naming everything you did not pick
costs roughly what picking it would have cost, so the asymmetry is forced, not stylistic. The
notice is part of the selection and is paid for out of the same budget.

## What the prototype changed about the proposal

- **Three-tier lazy loading (§7.1 of `workspace-topology-and-routing.md`) is a navigation
  sequence, and this is not navigation.** "Root index → subdirectory index → full body" assumes a
  turn per level. One budgeted call has one turn, so the tiers become an allocation and the
  interesting question moves to *which discovery channel to buy*, which §7.1 never asks.
- **`context build` "returns the N most relevant concepts within a token budget" has the wrong
  unit.** N concepts at unspecified depth is not a budget decision; (concept, tier) pairs are.
  Twelve titles and one full body cost the same and answer different questions.
- **The index is not always the cheap option.** It is cheaper *per concept* than a scan, but it
  cannot answer a tag, type or status query at all — so the choice is not price, it is which
  signals the query needs. §8 of the spec ("navigate one level at a time") is silent on this.
- **Hiding deprecated concepts is not free.** `status` lives in frontmatter, so a budget that only
  bought an index cannot filter on it — a deprecated concept then ranks and is selected. The
  prototype reports the count of concepts ranked without their status read rather than pretending
  the filter applied. This makes [#14](https://github.com/artemVeduta/okf-agent-skills/issues/14)'s
  question conditional on a purchase, which its wording does not anticipate.
- **A token estimate must be an upper bound, and the bound is per document.** No harness gives a
  skill a tokenizer, so a token figure is always characters ÷ a divisor. A divisor is a ceiling
  only if it sits at or below the densest content in the corpus — there is no universally safe
  constant. Across 4,000 randomised runs each: ÷2.9 violated nothing, ÷3.2 under-estimated in
  **2%** of runs, ÷4.0 in **95%**. Two percent is not a rounding error, because the failure is
  silent: every internal number says the selection fits.
- **Aggregate slack hides per-document deficits.** At ÷3.2 the code-dense export under-estimates
  itself while the run total still fits, because prose over-estimates elsewhere and pays for it.
  It stops paying the moment a query selects mostly dense documents, which is exactly when the
  budget matters. So the invariant is checked per ledger line, not on the total.

## Found by replaying, not by reasoning

Bugs in the model that surfaced as walkthrough mismatches, or under an adversarial review of the
finished prototype:

- **The notice can be the line that overruns the budget it exists to prevent.** Reserving the
  notice as it currently stands is wrong twice over: one more clipped concept can flip it from
  named to counted (making it *smaller*, so the reservation is not monotone), and every remaining
  candidate might yet be clipped. The reservation has to be the largest notice still *reachable*,
  and it must never fall below the collapsed form, which is always reachable because running out
  of room collapses the notice too.
- **A staleness penalty can delete the only match.** Score 15, penalty 20, and a stale concept
  becomes indistinguishable from one that matched nothing — the human is told the bundle has no
  answer when it has an old one. A demotion has a floor of 1: ranked last, still named.
- **There is a floor below which no honest answer exists** — the path list plus the smallest
  possible omission notice. Below it the selector refuses before spending a token, rather than
  spending down to an answer that cannot say what it left out.
- **A pin that costs nothing refused the whole selection.** Reserving the *ranked fill's*
  worst-case notice before honoring the pins meant a pin whose LINE tier an index had already
  pre-paid could be refused with tokens to spare — and the refusal was non-monotone in the budget:
  fine at 700, refused at 900, fine again at 4,000, because a larger budget bought more discovery,
  scored more candidates, and pushed the reservation up. Pins are measured against what pins owe;
  the ranked loop reserves for its own pending clips as it goes.
- **A pin was reading sections nobody had paid to grep,** and the "how many concepts were ranked
  without their status read" count was itself computed by reading `status`. Both are fixture
  oracles: a real implementation cannot know either thing.
- **The `withDescriptions` flag was dead, which made the worse index strictly better.** Both index
  kinds unlocked title *and* description scoring, so a bare link list bought identical retrieval
  34% cheaper. A bare list now buys a title only, and does not pre-pay the LINE tier.
- **The notice printed three things it did not price.** Unsearched directory names grow with the
  bundle and are the commonest omission under satisficing; charging for them was the whole point
  of the convergence argument.

## Validation

`walkthrough.ts` replays **42/42** named cases plus a **4,312-run sweep** (every fixture × query ×
exact-reference set × budget × task under the ceiling estimator) with no invariant violated, and a
separate randomised-dial fuzz — 30,000 runs under the ceiling, 4,000 per estimator — produced the
percentages above and no budget violation under the ceiling.

Validated in-session against the scripted catalogue; **not yet driven live at the keyboard**, and
the fixtures are illustrative, not the benchmark corpus
[#7](https://github.com/artemVeduta/okf-agent-skills/issues/7) and
[#13](https://github.com/artemVeduta/okf-agent-skills/issues/13) will need. Any case that behaves
wrong under hand-driving overturns the corresponding rule above.

**What the fixtures do not prove.** The densities in `corpus.ts` are invented, so "÷2.9 is a
ceiling" is a property of these numbers and not of real bundles — the divisor that is actually
safe is a measurement #7 owes. Two ledger lines also price their own ground truth: the notice and
the probe charge what the dials say they cost, so the one line item that exists to prevent a
silent overrun is the one the overrun check cannot see.

## Surfaced, not resolved

- Every number in `DEFAULT_DIALS` is a candidate, including the reserve fractions, the ranking
  weights and the notice pricing. They are dials on the TUI so that none of them reads as adopted.
  That the reserve varies *per task kind at all* is itself an assertion, not a finding.
- Two numbers are not dials and should be: the three-character minimum term length (`v2`, `P0`,
  `id` and `AI` are real queries — the selector now reports what it dropped rather than dropping
  it in silence) and the hardcoded English stopword list.
- Whether concepts should carry a producer-side `importance`/`priority` field
  ([#13](https://github.com/artemVeduta/okf-agent-skills/issues/13), gated on
  [#21](https://github.com/artemVeduta/okf-agent-skills/issues/21)). Every score here is derived
  from the query; the prototype ranks without one and does not argue that it should.
- The SECTION tier assumes bodies are sectioned. OKF only *recommends* structural markdown, and
  names just three conventional headings — `policies/unfiled-note` in the first fixture carries a
  single unsectioned body to keep that visible.
- Satisficing discovery is not optimal: "the query is explained" means *something* matched, not
  that the best concept was found. The exhaustive dial shows the price of the alternative.
- No stemming, no synonyms, no alias resolution — nothing in the OKF ecosystem has any, and the
  selector reports terms that no channel explained rather than papering over it.
- How selection state survives across turns within one operation, and who tokenizes: not decided
  here.
