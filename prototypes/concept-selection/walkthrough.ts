/**
 * PROTOTYPE — replays the hard cases through the same keystroke path a human drives.
 *
 *   node prototypes/concept-selection/walkthrough.ts
 *
 * This is not a test suite. A mismatch means the *idea* needs a decision, not that the code has a
 * bug: each case names the invariant it defends, and a case that behaves differently under hand
 * driving overturns the rule, not the other way round.
 */

import { drive, run } from './driver.ts';
import { BUDGETS, EXACT_SETS, FIXTURES, QUERIES } from './corpus.ts';
import {
  select,
  CEILING,
  DEFAULT_DIALS,
  DEFAULT_OUTPUT_PRICING,
  TASKS,
  type Corpus,
  type Plan,
  type Tier,
  type Verdict,
} from './selection.ts';

interface Case {
  name: string;
  keys: string;
  why: string;
  check: (p: Plan) => string | null;
  /** Cases that deliberately drive the selector into a violation. */
  violationsExpected?: RegExp;
}

const verdict = (p: Plan, id: string): Verdict | undefined => p.entries.find((e) => e.id === id)?.verdict;
const tier = (p: Plan, id: string): Tier | undefined => p.entries.find((e) => e.id === id)?.tier;
const cost = (p: Plan, id: string): number => p.entries.find((e) => e.id === id)?.cost ?? -1;
const lineKinds = (p: Plan) => p.lines.map((l) => `${l.kind}:${l.label}`);
const spentOf = (keys: string) => run(drive(keys)).plan.budget.spent;
const ok = (cond: boolean, msg: string) => (cond ? null : msg);
const all = (...checks: (string | null)[]) => checks.find((c) => c !== null) ?? null;

const CASES: Case[] = [
  // --- the reserve --------------------------------------------------------
  {
    name: 'the reserve is carved out before anything is bought',
    keys: '',
    why: 'checking a total after ranking is not reserving: the ranker has already spent money it never had',
    check: (p) =>
      all(
        ok(p.lines[0].kind === 'RESERVE', 'the first ledger line is not the reserve'),
        ok(p.budget.spent + p.budget.reserve <= p.budget.total, 'the reserve was not respected'),
        ok(p.budget.reserve === Math.ceil(4000 * 0.35), `feature reserve should be 35%, got ${p.budget.reserve}`),
      ),
  },
  {
    name: 'the task kind moves the reserve, not the ranking',
    keys: 'tt',
    why: 'debugging leaves more room for tool output than feature work; the concepts chosen do not change, only how many fit',
    check: (p) => ok(p.budget.reserve === Math.ceil(4000 * 0.45), `debugging reserve should be 45%, got ${p.budget.reserve}`),
  },
  {
    name: 'a smaller budget degrades tiers before it drops concepts',
    keys: '--',
    why: 'the ladder is the unit of allocation: half an answer about the right concept beats a whole answer about the wrong one',
    check: (p) =>
      all(
        ok(verdict(p, 'metrics/revenue') === 'SELECTED', 'the top hit was dropped instead of degraded'),
        ok(tier(p, 'metrics/revenue') !== 'FULL', 'the top hit was not degraded at all'),
      ),
  },
  {
    name: 'a budget far larger than the query needs changes nothing',
    keys: '++',
    why: 'selection is driven by the query, not by the money available — a big budget must not pull in noise',
    check: () => ok(spentOf('++') === spentOf(''), 'a larger budget changed the spend'),
  },
  {
    name: 'an unknown budget degrades, it never blocks',
    keys: 'u',
    why: '#29: OpenCode reports nothing; refusing to retrieve there would make the skill unreachable on a whole harness',
    check: (p) =>
      all(
        ok(p.outcome === 'degraded', `outcome should be degraded, got ${p.outcome}`),
        ok(p.entries.some((e) => e.verdict === 'SELECTED'), 'a degraded run selected nothing'),
        ok(p.budget.total === DEFAULT_DIALS.unknownBudgetFloor, 'the floor was not used'),
      ),
  },

  // --- the estimator ------------------------------------------------------
  {
    name: 'the ceiling estimator holds per document, not merely on average',
    keys: '',
    why: 'which documents a query selects is not known in advance, so slack on prose must not pay for a deficit on a schema',
    check: (p) =>
      all(
        ok(p.budget.actualSpent <= p.budget.spent, `real ${p.budget.actualSpent} > estimated ${p.budget.spent}`),
        ok(p.lines.every((l) => l.actual <= l.cost), 'a single ledger line under-estimated its own document'),
      ),
  },
  {
    name: 'a divisor above the densest content is not a ceiling — and the total hides it',
    keys: 'eqqqqqq',
    why: 'chars ÷ 3.2 under-estimates the code-dense export while the run total still fits: aggregate slack conceals a per-document deficit until a query selects mostly dense documents',
    check: (p) =>
      all(
        ok(p.budget.actualSpent <= p.budget.spent, 'the aggregate did not stay within the estimate, so the case shows nothing about hiding'),
        ok(p.lines.some((l) => l.actual > l.cost), 'no line under-estimated at chars ÷ 3.2'),
      ),
    violationsExpected: /UNDER-ESTIMATED/,
  },
  {
    name: 'a mean estimator is not a ceiling anywhere',
    keys: 'ee--',
    why: 'chars ÷ 4.0 is right on average and wrong on every table, schema and generated block — the documents most worth loading',
    check: (p) => ok(p.budget.actualSpent > p.budget.spent, 'the mean estimator did not underestimate anything'),
    violationsExpected: /NOT A CEILING|UNDER-ESTIMATED/,
  },
  {
    name: 'a mean estimator silently overruns a tight budget',
    keys: 'ee---',
    why: 'this is the failure the ticket names: every internal number says the selection fits, and it does not',
    check: (p) => ok(p.budget.actualSpent + p.budget.reserve > p.budget.total, 'no overrun was produced'),
    violationsExpected: /SILENT OVERRUN|NOT A CEILING|UNDER-ESTIMATED/,
  },

  // --- exact references ---------------------------------------------------
  {
    name: 'an exact reference is honored at FULL before anything is ranked',
    keys: 'x',
    why: 'a named concept is a demand, not a candidate — it never competes on score',
    check: (p) =>
      all(
        ok(verdict(p, 'metrics/revenue') === 'PINNED', 'the named concept was not pinned'),
        ok(tier(p, 'metrics/revenue') === 'FULL', 'the pin was degraded with budget to spare'),
        ok(p.lines.findIndex((l) => l.kind === 'PIN') < p.lines.findIndex((l) => l.kind === 'RANKED'), 'pins were charged after ranked concepts'),
      ),
  },
  {
    name: 'a changed source file resolves through `resource`',
    keys: 'xx',
    why: 'the code-backed join: a task that touched src/billing/revenue.ts is an exact reference, not a search',
    check: (p) => ok(verdict(p, 'metrics/revenue') === 'PINNED', 'the source path did not resolve to its concept'),
  },
  {
    name: 'a reference that resolves to nothing is reported, not thrown',
    keys: 'xxx',
    why: '§spec §6 makes broken links legal — they may be knowledge not written yet, which is a fact worth surfacing',
    check: (p) =>
      all(
        ok(verdict(p, 'metrics/mrr') === 'UNRESOLVED', 'a dangling reference was not reported'),
        ok(p.outcome === 'ok', 'a dangling reference broke the whole selection'),
      ),
  },
  {
    name: 'three pins degrade down the ladder rather than one being dropped',
    keys: 'xxxx',
    why: 'dropping what the human named is the silent failure; a title is still an answer, an absence is not',
    check: (p) =>
      all(
        ok(['metrics/revenue', 'tables/orders', 'policies/revenue-recognition'].every((id) => verdict(p, id) === 'PINNED'), 'a pin was dropped'),
        ok(['metrics/revenue', 'tables/orders', 'policies/revenue-recognition'].some((id) => tier(p, id) !== 'FULL'), 'nothing degraded — the case is not tight enough to prove anything'),
      ),
  },
  {
    name: 'pins that do not fit even at LINE refuse the whole selection',
    keys: 'xxxx---',
    why: 'a partial answer that quietly omits a named concept is the silent overrun in a different costume',
    check: (p) =>
      all(
        ok(p.outcome === 'insufficient', `outcome should be insufficient, got ${p.outcome}`),
        ok(p.reasons.some((r) => r.includes('short by')), 'the shortfall was not quantified'),
      ),
  },
  {
    name: 'a pin lifts its neighbours without pulling them in wholesale',
    keys: 'x',
    why: 'links are untyped (§spec §6) — an edge cannot tell "you need this" from "see also", so it may only be a hint',
    check: (p) =>
      all(
        ok(verdict(p, 'tables/orders') === 'SELECTED', 'a linked neighbour did not rank at all'),
        ok(tier(p, 'tables/orders') === 'LINE', 'a linked neighbour was pulled in at more than a line'),
      ),
  },

  // --- discovery economics ------------------------------------------------
  {
    name: 'the path list is bought first and unconditionally',
    keys: '',
    why: 'ids are the cheapest signal there is; nothing can be ranked before something is known to exist',
    check: (p) => ok(lineKinds(p)[1].startsWith('DISCOVERY:paths'), `second line should be the path list, got ${lineKinds(p)[1]}`),
  },
  {
    name: 'a query the paths already explain buys no further channel',
    keys: 'ffq',
    why: 'the cheapest possible answer: "policy" is in ten paths, so no index, no scan and no grep are worth paying for',
    check: (p) =>
      all(
        ok(!lineKinds(p).some((l) => l.startsWith('DISCOVERY:index') || l.startsWith('DISCOVERY:scan')), 'a channel was bought for a query the paths answered'),
        ok(p.entries.filter((e) => e.verdict === 'SELECTED').length === 10, 'the path-only answer did not find the ten policy concepts'),
      ),
  },
  {
    name: 'discovery escalates while terms stay unexplained',
    keys: 'q',
    why: '"schema" appears in no path, title, description or tag — only a grep can explain it, so the escalation reaches the probe',
    check: (p) =>
      all(
        ok(lineKinds(p).some((l) => l.startsWith('DISCOVERY:probe')), 'the probe was never reached'),
        ok(p.unexplained.length === 0, `terms left unexplained: ${p.unexplained.join(',')}`),
      ),
  },
  {
    name: 'satisficing leaves directories unopened, and says so',
    keys: '',
    why: 'stopping when the query is explained is not the same as having looked everywhere; the human must be able to tell',
    check: (p) =>
      all(
        ok(p.notice.unsearched.length > 0, 'nothing was reported as unsearched'),
        ok(p.notice.undiscovered.length === 0, 'unread-for-lack-of-money was reported on a 4,000-token budget'),
      ),
  },
  {
    name: 'exhaustive discovery reads everything and costs more for it',
    keys: 's',
    why: 'the satisfice/exhaustive dial is the whole "how broad is retrieval" question, made visible as money',
    check: (p) =>
      all(
        ok(spentOf('s') > spentOf(''), 'exhaustive discovery cost no more than satisficing'),
        ok(p.notice.unsearched.length === 0, 'exhaustive discovery still left directories unopened'),
      ),
  },
  {
    name: 'the probe is skipped when it would leave nothing for the pins and the notice',
    keys: '---',
    why: 'the search that finds candidates is itself a budget line item; on a small budget it is the first thing to go',
    check: (p) => ok(p.reasons.some((r) => r.startsWith('probe skipped')), 'the probe was not skipped on a 300-token budget'),
  },
  {
    name: 'buying a descriptive index reveals title + description and pre-pays LINE',
    keys: 's',
    why: 'descriptive entries are a bulk LINE purchase, unlike cheaper bare title links',
    check: (p) =>
      all(
        ok(lineKinds(p).some((l) => l.startsWith('DISCOVERY:index')), 'no index was bought'),
        ok(verdict(p, 'overview') === 'SELECTED' && cost(p, 'overview') === 0, 'a LINE-tier selection was charged twice'),
      ),
  },
  {
    name: 'buying a bare index reveals only title and pre-pays no tier',
    keys: '',
    why: 'a bare link must not unlock description scoring or make a later LINE allocation free',
    check: () => {
      const source = FIXTURES[0];
      const original = source.concepts.find((c) => c.id === 'policies/revenue-recognition')!;
      const concept = { ...original, title: 'Needle title', description: 'description must stay hidden' };
      const corpus: Corpus = {
        ...source,
        concepts: [concept],
        indexes: [{ dir: 'policies', entries: [concept.id], withDescriptions: false, chars: 50, actual: 14 }],
        pathListChars: concept.id.length + 4,
        pathListActual: 9,
      };
      const plan = select(corpus, {
        query: 'needle',
        task: 'feature',
        exact: [],
        budget: { total: 300, source: 'explicit' },
        estimator: CEILING,
        dials: { ...DEFAULT_DIALS, allowProbe: false },
        outputPricing: DEFAULT_OUTPUT_PRICING,
      });
      const entry = plan.entries.find((e) => e.id === concept.id)!;
      return all(
        ok(entry.seen === 'title', `bare index exposed ${entry.seen}, not title`),
        ok(entry.signals.some((s) => s.startsWith('title:')), 'title did not rank'),
        ok(!entry.signals.some((s) => s.startsWith('desc:')), 'description leaked from a bare index'),
        ok(entry.cost > 0, 'bare index silently pre-paid LINE'),
      );
    },
  },

  // --- status is not free -------------------------------------------------
  {
    name: 'an index-only purchase hides `status`, and a deprecated concept ranks',
    keys: 'qq',
    why: 'the sharpest finding here: hiding deprecated concepts (#14) is not free — it costs a frontmatter scan',
    check: (p) =>
      all(
        ok(verdict(p, 'playbooks/legacy-close') === 'SELECTED', 'the deprecated concept was filtered on data nobody paid for'),
        ok(p.notice.unstatused > 0, 'the notice did not admit that statuses were unread'),
      ),
  },
  {
    name: 'toggling "hide deprecated" changes nothing when status was never read',
    keys: 'qqd',
    why: 'a policy you cannot afford to evaluate is not a policy; the dial has to be honest about that',
    check: () => ok(spentOf('qq') === spentOf('qqd'), 'the deprecated dial changed a run in which status was invisible'),
  },
  {
    name: 'exhaustive discovery pays for status, and the filter then bites',
    keys: 's',
    why: 'same corpus, same query, different money: the difference is entirely what was read',
    check: (p) => ok(verdict(p, 'playbooks/legacy-close') === 'FILTERED', 'the deprecated concept was not filtered after its status was read'),
  },
  {
    name: 'drafts are included by default and excluded on demand',
    keys: 'sr',
    why: '#14 owns the default; the prototype only proves the switch is reachable and costs a scan',
    check: (p) => ok(verdict(p, 'playbooks/incident-billing') === 'FILTERED', 'the draft was not filtered with the dial off'),
  },

  // --- ranking ------------------------------------------------------------
  {
    name: 'a body-only term is found by the probe and nothing else',
    keys: 'qqq+',
    why: '"proration" and "ledger" live in a Computation section; no frontmatter channel can see them',
    check: (p) =>
      all(
        ok(verdict(p, 'metrics/revenue') === 'SELECTED', 'the body match was not found'),
        ok(tier(p, 'metrics/revenue') === 'SECTION', `a body match should load the matching sections, got ${tier(p, 'metrics/revenue')}`),
      ),
  },
  {
    name: 'a stale concept is demoted, never deleted',
    keys: 'qqqq',
    why: 'a penalty that reaches zero makes "old answer" indistinguishable from "no answer" — found by replaying, not by reasoning',
    check: (p) =>
      all(
        ok(verdict(p, 'metrics/churn') === 'SELECTED', 'the only match was deleted by its own staleness penalty'),
        ok(p.entries.find((e) => e.id === 'metrics/churn')!.signals.some((s) => s.startsWith('stale')), 'the demotion was not recorded'),
      ),
  },
  {
    name: 'a term nothing explains is reported as such',
    keys: 'fqqqq',
    why: 'there is no stemming, no synonym table and no alias field anywhere in OKF; pretending otherwise would hide it',
    check: (p) =>
      all(
        ok(p.unexplained.includes('embeddings'), 'an unexplainable term was not reported'),
        ok(!p.entries.some((e) => e.verdict === 'SELECTED'), 'something was selected for a query nothing matched'),
      ),
  },
  {
    name: 'a knowledge-only bundle with no tags still ranks',
    keys: 'f',
    why: '`tags` are only RECOMMENDED (§spec §5); a selector that needs them is broken on half the corpora in the world',
    check: (p) => ok(p.entries.some((e) => e.verdict === 'SELECTED'), 'an untagged bundle produced nothing'),
  },

  // --- the notice ---------------------------------------------------------
  {
    name: 'clipped concepts are named, missed concepts are counted',
    keys: 'sq---',
    why: 'naming everything you did not pick costs what picking it would have cost — the asymmetry is the point',
    check: (p) =>
      all(
        ok(p.notice.clipped.length > 0, 'nothing was clipped, so the case proves nothing'),
        ok(p.entries.filter((e) => e.verdict === 'CLIPPED').length === p.notice.clipped.length, 'a clipped concept was not named'),
        ok(p.notice.missed >= 0 && !p.notice.clipped.some((id) => id.includes('MISS')), 'misses leaked into the named list'),
      ),
  },
  {
    name: 'the notice collapses to counts when naming would cost too much',
    keys: 'sq---',
    why: 'a per-item notice does not converge: the more you omit the bigger it gets, and the less you can include',
    check: (p) => ok(p.notice.form === 'counted', `notice should have collapsed, got ${p.notice.form}`),
  },
  {
    name: 'the notice never overruns the budget it reports on',
    keys: 'sq---',
    why: 'the reservation must bound both notice forms — reserving the named form let the collapse itself overrun',
    check: (p) => ok(p.budget.spent <= p.budget.spendable, `spent ${p.budget.spent} > spendable ${p.budget.spendable}`),
  },
  {
    name: 'an underreported probe result cannot silently overrun',
    keys: '',
    why: 'admission uses the injected cap; a bad cap must be exposed by the per-line audit, never hidden by result-count pricing',
    check: () => {
      const { req } = run(drive('q'));
      const baseline = select(FIXTURES[0], req);
      const plan = select(FIXTURES[0], {
        ...req,
        outputPricing: {
          ...req.outputPricing,
          observed: { ...req.outputPricing.observed, probeHit: 10_000 },
        },
      });
      const probe = plan.lines.find((line) => line.label.startsWith('probe'))!;
      return all(
        ok(probe.cost === DEFAULT_OUTPUT_PRICING.bounds.probeBase + DEFAULT_DIALS.probeMaxHits * DEFAULT_OUTPUT_PRICING.bounds.probeHit, 'probe was not charged at its pre-result cap'),
        ok(probe.actual > probe.cost, 'the fixture no longer underreports the observed probe size'),
        ok(plan.budget.spent === baseline.budget.spent, 'post-result probe size changed admission or ledger charging'),
        ok(plan.violations.some((v) => v.startsWith('LINE UNDER-ESTIMATED: probe')), 'the bad probe bound escaped the per-line check'),
        ok(plan.violations.some((v) => v.startsWith('SILENT OVERRUN:')), 'the probe overrun was not reported'),
      );
    },
  },
  {
    name: 'an underreported notice result cannot silently overrun',
    keys: '',
    why: 'notice admission and reservation use injected bounds; observed rendering size only audits their conservatism',
    check: () => {
      const { req } = run(drive('sq---'));
      const baseline = select(FIXTURES[0], req);
      const plan = select(FIXTURES[0], {
        ...req,
        outputPricing: {
          ...req.outputPricing,
          observed: { ...req.outputPricing.observed, noticeCounted: 10_000, noticeNamed: 10_000 },
        },
      });
      const notice = plan.lines.find((line) => line.kind === 'NOTICE')!;
      return all(
        ok(notice.actual > notice.cost, 'the fixture no longer underreports the observed notice size'),
        ok(plan.budget.spent === baseline.budget.spent, 'post-result notice size changed admission or ledger charging'),
        ok(plan.violations.some((v) => v.startsWith('LINE UNDER-ESTIMATED: notice')), 'the bad notice bound escaped the per-line check'),
        ok(plan.violations.some((v) => v.startsWith('SILENT OVERRUN:')), 'the notice overrun was not reported'),
      );
    },
  },
  {
    name: 'the collapse has two triggers: the share cap, and having no room left',
    keys: 'sq---n',
    why: 'raising the cap does not buy a longer notice — it reserves more, so fewer concepts are selected and the notice collapses anyway',
    check: (p) =>
      all(
        ok(p.notice.form === 'counted', `notice should be counted, got ${p.notice.form}`),
        ok(
          p.entries.filter((e) => e.verdict === 'SELECTED').length <
            run(drive('sq---')).plan.entries.filter((e) => e.verdict === 'SELECTED').length,
          'raising the notice cap did not cost any concepts',
        ),
      ),
  },
  {
    name: 'a budget too small for the path list and a notice is refused before anything is spent',
    keys: '-----',
    why: 'the floor of honest retrieval: the cheapest discovery there is, plus the right to say what was left out',
    check: (p) =>
      all(
        ok(p.outcome === 'insufficient', `outcome should be insufficient, got ${p.outcome}`),
        ok(p.budget.spent === 0, `nothing should have been spent, got ${p.budget.spent}`),
        ok(p.reasons.some((r) => r.includes('cannot cover')), 'the floor was not explained'),
      ),
  },

  // --- found by the adversarial review, kept as regressions ---------------
  {
    name: 'a pin whose tier is already paid for never refuses the selection',
    keys: 'spxt-',
    why: 'reserving the ranked fill\'s worst-case notice at pin time made a *free* pin refuse the whole run with tokens to spare',
    check: (p) =>
      all(
        ok(p.outcome !== 'insufficient', `outcome should not be insufficient, got ${p.outcome} with ${p.budget.free} free`),
        ok(p.entries.some((e) => e.verdict === 'PINNED'), 'the pin was not honored'),
      ),
  },
  {
    name: 'refusal is monotone in the budget',
    keys: 'spxt',
    why: 'ok at 700, refused at 900, ok again at 4,000 is not a budget rule, it is a bug wearing one',
    check: () =>
      ok(
        ['spxt--', 'spxt-', 'spxt', 'spxt+'].every((k) => run(drive(k)).plan.outcome !== 'insufficient'),
        'a larger budget produced a refusal a smaller one did not',
      ),
  },
  {
    name: 'the same broken reference named twice is one verdict and one charge',
    keys: 'xxxxxx',
    why: 'an id and its `.md` spelling are one reference; two verdicts for one concept breaks the invariant and double-charges the notice',
    check: (p) =>
      all(
        ok(p.entries.filter((e) => e.verdict === 'UNRESOLVED').length === 1, 'a duplicated reference produced two verdicts'),
        ok(p.violations.length === 0, `violations: ${p.violations.join(' | ')}`),
      ),
  },
  {
    name: 'a query with no surviving terms says so instead of claiming it was answered',
    keys: 'qqqqqqq',
    why: 'no terms means nothing was searched for — reporting directories as "already explained" explains nothing',
    check: (p) =>
      all(
        ok(p.terms.length === 0, 'the case no longer drives an empty query'),
        ok(p.reasons.some((r) => r.startsWith('no query')), 'the empty query was not reported'),
        ok(
          p.entries.filter((e) => e.verdict === 'UNSEARCHED').every((e) => e.detail.includes('no query terms')),
          'an entry still claimed its directory was skipped because the query was explained',
        ),
      ),
  },
  {
    name: 'a tier capped by a dial does not blame the budget',
    keys: 'qqm+',
    why: '#29 invariant 1 is only worth having if the next action names the fix that works',
    check: (p) => {
      const capped = p.entries.find((e) => e.verdict === 'SELECTED' && e.tier !== e.askedTier);
      return capped
        ? ok(capped.nextAction.includes('maxRankedTier'), `next action blames the wrong thing: ${capped.nextAction}`)
        : 'no ranked concept was capped, so the case proves nothing';
    },
  },

  // --- floors -------------------------------------------------------------
  {
    name: 'a tiny budget still answers, and names what it could not afford',
    keys: '---',
    why: 'the portable floor: no probe, most directories unread, and the result still says which fix applies',
    check: (p) =>
      all(
        ok(p.outcome === 'ok', `outcome should be ok, got ${p.outcome}`),
        ok(p.notice.undiscovered.length > 0, 'nothing was reported as unaffordable'),
        ok(p.entries.every((e) => e.nextAction.length > 0), 'an entry carried no next action'),
      ),
  },
  {
    name: 'every outcome carries summary, detail and next action',
    keys: 'xxx',
    why: '#29 invariant 1: a data-structure guarantee, not a convention',
    check: (p) => ok(p.entries.every((e) => e.summary && e.detail && e.nextAction), 'an entry was missing one of the three'),
  },
];

// --- the sweep: every fixture × query × exact set × budget, under the ceiling
function sweep(): string | null {
  let runs = 0;
  for (const corpus of FIXTURES) {
    for (const query of QUERIES[corpus.key]) {
      for (const exact of EXACT_SETS[corpus.key]) {
        for (const total of BUDGETS) {
          for (const task of TASKS) {
            const p = select(corpus, {
              query,
              task,
              exact,
              budget: { total, source: 'explicit' },
              estimator: CEILING,
              dials: DEFAULT_DIALS,
              outputPricing: DEFAULT_OUTPUT_PRICING,
            });
            runs++;
            if (p.violations.length > 0)
              return `${corpus.key} "${query}" [${exact}] ${total} ${task}: ${p.violations.join(' | ')}`;
          }
        }
      }
    }
  }
  return runs > 0 ? null : 'the sweep ran nothing';
}

let pass = 0;
for (const c of CASES) {
  const { plan } = run(drive(c.keys));
  const unexpected = plan.violations.filter((v) => !c.violationsExpected?.test(v));
  const missing =
    c.violationsExpected && !plan.violations.some((v) => c.violationsExpected!.test(v))
      ? `expected a violation matching ${c.violationsExpected}`
      : null;
  const fail = c.check(plan) ?? missing ?? (unexpected.length > 0 ? `unexpected violation: ${unexpected.join(' | ')}` : null);
  if (fail === null) {
    pass++;
    console.log(`✓ ${c.name}`);
  } else {
    console.log(`✗ MISMATCH  ${c.name}\n    keys "${c.keys}" — ${fail}\n    invariant: ${c.why}`);
  }
}

const sweepFail = sweep();
if (sweepFail === null) {
  pass++;
  console.log('✓ sweep: no invariant violated under the ceiling estimator, across every fixture × query × exact set × budget × task');
} else {
  console.log(`✗ MISMATCH  sweep\n    ${sweepFail}`);
}

console.log(`\n${pass}/${CASES.length + 1}`);
process.exit(pass === CASES.length + 1 ? 0 : 1);
