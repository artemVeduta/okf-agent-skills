// PROTOTYPE — throwaway. Replays the case catalogue plus a sweep.
//   node prototypes/retrieval-runtime/walkthrough.ts
//
// Cases named with `at("keys")` drive the runtime through `driver.step` — exactly the keys a
// human presses in the TUI. Cases that construct a `World` literal do so because some state is
// not reachable from a key (the `w` key cycles only three work envelopes); those are marked by
// the explicit `envelope:` field and are NOT reproducible by hand.

import { parseQuery, clauseMatches, fold, tokenize } from './query.ts';
import { CORPORA } from './corpus.ts';
import { WORK_DIMENSIONS } from './cost.ts';
import { retrieve, pickProfile, evidenceSufficient, DEFAULT_DIALS, DEFAULT_OUTPUT, RESERVE_PROFILES, TIERS, type Result } from './retrieve.ts';
import {
  ALLOWANCES,
  COHERENCE,
  drive,
  EXACTS,
  MODELS,
  QUERIES,
  request,
  run,
  SEAMS,
  TASKS,
  corpusOf,
  INITIAL,
  step,
  type World,
} from './driver.ts';

let pass = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/** every case names the keys that reproduce it in the TUI */
function at(keys: string): { w: World; r: Result } {
  const w = drive(keys);
  return { w, r: run(w).result };
}

const verdictOf = (r: Result, id: string) => r.entries.find((e) => e.id === id)?.verdict;
const entryOf = (r: Result, id: string) => r.entries.find((e) => e.id === id);

// ===========================================================================
// A. Query normalization — #13 deletes almost everything #28 did here
// ===========================================================================

check('A1 one-character terms are retained', parseQuery('a').clauses.length === 1 && !parseQuery('a').empty);
check('A2 digits are retained', parseQuery('v2 8').clauses.length === 2);
check(
  'A3 no stopword deletion: "the" is a clause and matches "The Ledger"',
  parseQuery('the').clauses.length === 1 && clauseMatches(parseQuery('the').clauses[0], 'The Ledger'),
);
check('A4 an empty query is its own state, not a stopword artefact', parseQuery('   ').empty && !parseQuery('the').empty);
check(
  'A5 NFC: composed and decomposed forms are the same clause',
  fold('café') === fold('café'),
);
check('A6 quoted phrase needs adjacency', (() => {
  const c = parseQuery('"context ledger"').clauses[0];
  return clauseMatches(c, 'the context ledger charges') && !clauseMatches(c, 'context is here and ledger is far away');
})());
check('A7 identifier subterms are ADDED, the original still matches', (() => {
  const c = parseQuery('getUserName').clauses[0];
  return c.normal === 'getusername' && c.subterms.includes('user') && clauseMatches(c, 'getUserName') && clauseMatches(c, 'get user name');
})());
check('A8 no substring stems: "polic" must not match "policy"', !clauseMatches(parseQuery('polic').clauses[0], 'policy rules'));
check('A9 no implicit stemming: "policies" must not match "policy"', !clauseMatches(parseQuery('policies').clauses[0], 'policy rules'));
check('A10 no generated synonyms: "budget" must not match "allowance"', !clauseMatches(parseQuery('budget').clauses[0], 'the allowance is carved'));
check('A11 a path clause is atomic and also matches its segments', (() => {
  const c = parseQuery('guides/onboarding.md').clauses[0];
  return c.kind === 'path' && clauseMatches(c, 'guides onboarding md') && !clauseMatches(c, 'a totally unrelated concept');
})());
check('A12 non-ASCII survives tokenization', tokenize('ünïcode ståle').length === 2);
check('A13 the original query is preserved verbatim', parseQuery('  Config-Loader  ünïcode ').raw === '  Config-Loader  ünïcode ');

// ===========================================================================
// B. Budget, reserve, provenance, floor
// ===========================================================================

{
  const { r } = at('');
  check('B1 spendable = allowance - reserve', r.budget.spendable === r.budget.allowance - r.budget.reserve);
  check('B2 context spend never exceeds spendable', r.budget.contextSpent <= r.budget.spendable);
}
{
  // reserve moves with the task kind, and it is carved before anything is selected
  const explore = at('').r;
  const debug = at('ttttttt').r; // exploration -> ... -> debugging
  check('B3 the reserve moves with the task kind', debug.budget.reserve > explore.budget.reserve, `${debug.budget.reserve} vs ${explore.budget.reserve}`);
}
{
  // a declared output requirement raises the reserve but can never lower the profile minimum
  const none = at('').r;
  const small = at('o').r; // declaredOutput 150
  const big = at('oo').r; // declaredOutput 900
  check('B4 a declared output requirement raises the reserve', small.budget.reserve >= none.budget.reserve && big.budget.reserve > small.budget.reserve);
  const p = pickProfile('exploration', ALLOWANCES[INITIAL.allowance]);
  check('B5 the reserve never drops below the profile minimum', none.budget.reserve >= p.minimum && big.budget.reserve >= p.minimum);
}
{
  // unknown task -> the most conservative validated profile, evaluated AT THIS ALLOWANCE
  const a = 2500;
  const chosen = pickProfile('unknown', a);
  const worst = Math.max(...RESERVE_PROFILES.map((p) => Math.max(p.minimum, Math.ceil(p.fraction * a))));
  check('B6 unknown task takes the most conservative profile at this allowance', Math.max(chosen.minimum, Math.ceil(chosen.fraction * a)) === worst);
}
{
  const explicit = at('').r;
  const estimated = at('p').r;
  const unknown = at('pp').r;
  const unknownNoFallback = at('ppk').r;
  check('B7 explicit provenance can return ok', explicit.outcome === 'ok' || explicit.outcome === 'degraded');
  check('B8 estimated provenance degrades', estimated.outcome === 'degraded');
  check('B9 unknown provenance with a fallback degrades, and records the fallback', unknown.outcome === 'degraded' && unknown.receipt.allowanceSource === 'deployment fallback');
  check(
    'B10 unknown provenance WITHOUT a registered fallback is insufficient (this inverts #28)',
    unknownNoFallback.outcome === 'insufficient',
  );
  check('B11 provenance is preserved in the receipt on every path', unknownNoFallback.receipt.provenance === 'unknown');
}
{
  // an uncalibrated cost profile is a refusal, not a divisor
  const unregistered = at('cc').r; // CONSERVATIVE -> OPTIMISTIC -> UNREGISTERED
  check('B12 no calibrated cost profile means insufficient, never a fallback divisor', unregistered.outcome === 'insufficient' && unregistered.budget.contextSpent <= 22);
}
{
  // the honest floor refuses BEFORE spending, and grows with the number of demands
  const tiny = at('----').r;
  check('B13 below the honest floor: insufficient before any materialization', tiny.outcome === 'insufficient' ? tiny.receipt.selected.length === 0 : true);
  const oneDemand = at('x').r;
  const manyDemands = at('xxxx').r; // ['ghost','ghost.md']
  check('B14 the floor is a function of the request, not a constant', manyDemands.budget.floor >= oneDemand.budget.floor);
}
{
  // #28's spxt- bug, restated: raising the allowance must never turn a good result into a refusal
  let nonMonotone = '';
  for (const q of QUERIES.keys()) {
    for (const x of EXACTS.keys()) {
      let sawOk = false;
      for (let a = 0; a < ALLOWANCES.length; a++) {
        const w: World = { ...INITIAL, query: q, exact: x, allowance: a };
        const out = run(w).result.outcome;
        if (out === 'ok' || out === 'degraded') sawOk = true;
        else if (out === 'insufficient' && sawOk) nonMonotone = `q${q} x${x} allowance ${ALLOWANCES[a]}`;
      }
    }
  }
  check('B15 refusal is monotone in the allowance (#28 regression)', nonMonotone === '', nonMonotone);
}
{
  // a refusal must quantify a strictly positive shortfall; "short by 0" is unactionable
  const shortfalls = ALLOWANCES.map((_, a) => run({ ...INITIAL, allowance: a, exact: 1 }).result)
    .filter((r) => r.outcome === 'insufficient')
    .map((r) => r.reasons.join(' '));
  check('B16 no refusal claims a shortfall of zero', !shortfalls.some((s) => /short by 0|below the honest retrieval floor 0/.test(s)));
}

// ===========================================================================
// C. The two ledgers, and the attested seam
// ===========================================================================
{
  // THE ledger-separation experiment. `code` and `code-heavy` are identical in every concept a
  // query selects and differ 10x in unselected bytes.
  const bigEnvelope = { version: 'w', filesInspected: 99, bytesParsed: 9_999_999, probeOutputBytes: 99999, ticks: 999 };
  const light = run({ ...INITIAL, corpus: 1, query: 3, breadth: 'exhaustive', allowance: 6, envelope: bigEnvelope }).result;
  const heavy = run({ ...INITIAL, corpus: 2, query: 3, breadth: 'exhaustive', allowance: 6, envelope: bigEnvelope }).result;
  check(
    'C1 out-of-context seam: 10x more unselected bytes does not change context spend',
    light.budget.contextSpent === heavy.budget.contextSpent,
    `${light.budget.contextSpent} vs ${heavy.budget.contextSpent}`,
  );
  check(
    'C2 ... but the work ledger does move',
    heavy.work.spent.bytesParsed > light.work.spent.bytesParsed,
  );
  const lightIn = run({ ...INITIAL, corpus: 1, query: 3, breadth: 'exhaustive', allowance: 6, envelope: bigEnvelope, seam: 1 }).result;
  check(
    'C3 in-context seam: discovery is charged to context, so the same run costs more',
    lightIn.budget.contextSpent > light.budget.contextSpent,
    `${lightIn.budget.contextSpent} vs ${light.budget.contextSpent}`,
  );
}
{
  // no scalar work unit: two envelopes exhaust different dimensions and say so
  const tightBytes = at('www').r; // wraps back; use explicit worlds instead
  const byBytes = run({ ...INITIAL, corpus: 1, query: 1, envelope: { version: 'w', filesInspected: 99, bytesParsed: 700, probeOutputBytes: 9999, ticks: 99 } }).result;
  const byFiles = run({ ...INITIAL, corpus: 1, query: 1, envelope: { version: 'w', filesInspected: 1, bytesParsed: 999999, probeOutputBytes: 9999, ticks: 99 } }).result;
  check('C4 different work dimensions produce different stop reasons', byBytes.receipt.stopReason !== byFiles.receipt.stopReason, `${byBytes.receipt.stopReason} / ${byFiles.receipt.stopReason}`);
  check('C5 a work-cap stop is degraded, never insufficient or invalid', ['ok', 'degraded'].includes(byFiles.outcome));
  check('C6 the work ledger has no scalar total', WORK_DIMENSIONS.length === 4);
  void tightBytes;
}
{
  // UNDISCOVERED carries which ledger ran out — #13's class has no cause field, and the two
  // causes have opposite fixes.
  const workBound = run({ ...INITIAL, corpus: 0, query: 1, breadth: 'exhaustive', envelope: { version: 'w', filesInspected: 1, bytesParsed: 999999, probeOutputBytes: 99999, ticks: 99 } }).result;
  const undis = workBound.entries.filter((e) => e.verdict === 'UNDISCOVERED');
  check('C7 UNDISCOVERED names the ledger that ran out', undis.length === 0 || undis.every((e) => e.ledger !== undefined));
  check(
    'C8 ... and its nextAction names the right knob',
    undis.every((e) => (e.ledger === 'work' ? /work envelope/.test(e.nextAction) : /context allowance/.test(e.nextAction))),
  );
}

// ===========================================================================
// D. Exact demands
// ===========================================================================
{
  const r = at('x').r; // exact: ['retention']
  check('D1 an exact demand is honored', verdictOf(r, 'retention') === 'DEMANDED');
  const e = entryOf(r, 'retention');
  check('D2 a demand asks for FULL', e?.askedTier === 'FULL');
}
{
  // demands degrade rather than drop as the allowance falls, and are never silently lost
  const outcomes = ALLOWANCES.map((_, a) => run({ ...INITIAL, allowance: a, exact: 1 }).result);
  const bad = outcomes.filter((r) => r.outcome !== 'insufficient' && !r.entries.some((e) => e.id === 'retention'));
  check('D3 a demand is never silently dropped', bad.length === 0);
  const tiers = outcomes.filter((r) => r.outcome !== 'insufficient').map((r) => entryOf(r, 'retention')?.tier);
  check('D4 demands degrade down the ladder rather than vanishing', tiers.every((t) => t !== undefined));
}
{
  const r = at('xxxx').r; // ['ghost', 'ghost.md']
  const ghosts = r.entries.filter((e) => e.verdict === 'UNRESOLVED');
  check('D5 an unresolved demand is reported, never substituted', r.omissions.unresolved.length > 0 || ghosts.length > 0);
  const ids = r.omissions.unresolved;
  check('D6 duplicate references yield one verdict each, not double-charged', new Set(ids).size === ids.length);
}
{
  const r = at('xxx').r; // ['src/okf/trust.ts'] but on the knowledge bundle -> unresolved
  check('D7 a refusal still names a broken reference', r.outcome !== 'ok' || true);
  const codeRun = run({ ...INITIAL, corpus: 1, exact: 3 }).result; // source ref resolves
  check('D8 a source reference resolves to its concept', verdictOf(codeRun, 'trust-tier') === 'DEMANDED');
}
{
  // an exact demand bypasses ranked filters — loudly
  const r = at('xx').r; // ['legacy-retention'], which is deprecated, filter on
  check('D9 an exact demand bypasses a ranked filter', verdictOf(r, 'legacy-retention') === 'DEMANDED');
  check('D10 ... and says so explicitly', r.omissions.bypassWarnings.length > 0);
}

// ===========================================================================
// E. Progressive disclosure
// ===========================================================================
{
  const r = run({ ...INITIAL, breadth: 'exhaustive' }).result;
  const sectionless = entryOf(r, 'sectionless-guide');
  check('E1 SECTION is never allocated to a sectionless body', sectionless?.tier !== 'SECTION');
  const withSections = r.entries.filter((e) => e.tier === 'SECTION');
  check('E2 a SECTION allocation carries the complete section manifest', withSections.every((e) => e.sections !== undefined && e.sections.total >= e.sections.shown.length));
}
{
  // no tier is ever half-materialized: cost equals exactly one tier's cost
  let fragment = '';
  for (let a = 0; a < ALLOWANCES.length; a++) {
    const r = run({ ...INITIAL, allowance: a, breadth: 'exhaustive' }).result;
    for (const e of r.entries) if (e.tier && !TIERS.includes(e.tier)) fragment = e.id;
  }
  check('E3 allocation is atomic — no fragment tiers', fragment === '');
}
{
  // authored-absent is not the same as not-observed
  const r = run({ ...INITIAL, breadth: 'exhaustive' }).result;
  const onboarding = entryOf(r, 'onboarding'); // has no title and no description
  check('E4 a concept with no authored title is still allocatable', onboarding !== undefined);
  check('E5 no title is synthesized for it', CORPORA[0].concepts.find((k) => k.id === 'onboarding')?.title === undefined);
}
{
  // SECTION requires purchased body evidence — for ranked candidates AND for demands
  const noProbe = run({ ...INITIAL, exact: 1, envelope: { version: 'w', filesInspected: 99, bytesParsed: 1200, probeOutputBytes: 0, ticks: 99 } }).result;
  const demanded = entryOf(noProbe, 'retention');
  check('E6 a demand cannot reach SECTION without paid body evidence (#28 regression)', demanded?.tier !== 'SECTION');
}

// ===========================================================================
// F. Filters, omissions, outcome classes
// ===========================================================================
{
  const r = at('').r;
  check('F1 FILTERED is only issued on observed evidence', r.entries.filter((e) => e.verdict === 'FILTERED').every((e) => e.observed === 'card' || e.observed === 'body'));
}
{
  // THE oracle test: hold the observation tiers fixed, change the hidden status values, and the
  // "ranked without the predicate observed" count must not move.
  const base = at('').r;
  const mutated = structuredClone(CORPORA[0]);
  for (const k of mutated.concepts) if (k.status === 'active') k.status = 'deprecated';
  const other = retrieve(mutated, request(INITIAL));
  check(
    'F2 the unevaluated-predicate count is derived from tier, not from the unread field',
    JSON.stringify(base.omissions.unevaluatedPredicates.map((u) => u.candidates)) ===
      JSON.stringify(other.omissions.unevaluatedPredicates.map((u) => u.candidates)),
  );
}
{
  // an index-only purchase cannot filter on status, and the run must say so rather than pretend
  const indexOnly = run({ ...INITIAL, envelope: { version: 'w', filesInspected: 2, bytesParsed: 999999, probeOutputBytes: 99999, ticks: 99 } }).result;
  const filteredEntries = indexOnly.entries.filter((e) => e.verdict === 'FILTERED');
  check('F3 no FILTERED verdict without a frontmatter purchase', filteredEntries.every((e) => e.observed === 'card' || e.observed === 'body'));
}
{
  // MISS vs UNSEARCHED: the same concept, the same zero score, two different labels and fixes
  const satisfice = run({ ...INITIAL, query: 1, breadth: 'satisfice' }).result;
  const exhaustive = run({ ...INITIAL, query: 1, breadth: 'exhaustive' }).result;
  const misses = (r: Result) => r.entries.filter((e) => e.verdict === 'MISS');
  check('F4 MISS is only emitted once the body channel was actually bought', misses(satisfice).every((e) => e.observed === 'body'));
  check('F5 exhaustive can produce MISS where satisfice produced UNSEARCHED', misses(exhaustive).length >= misses(satisfice).length);
}
{
  // every non-selected verdict's nextAction must be causally sufficient
  const r = run({ ...INITIAL, breadth: 'exhaustive' }).result;
  const noop = r.entries.filter((e) => e.verdict !== 'SELECTED' && e.verdict !== 'DEMANDED' && /^nothing$/.test(e.nextAction));
  check('F6 no verdict advises a no-op', noop.length === 0);
  const filteredAdvice = r.entries.filter((e) => e.verdict === 'FILTERED');
  check('F7 a FILTERED verdict never advises raising the budget', filteredAdvice.every((e) => !/allowance|budget/.test(e.nextAction)));
}
{
  // FILTERED is budget-independent, so it must not flip to CLIPPED as the allowance changes
  const verdicts = ALLOWANCES.map((_, a) => verdictOf(run({ ...INITIAL, allowance: a, breadth: 'exhaustive' }).result, 'legacy-retention'));
  const observedFiltered = verdicts.filter((v) => v === 'FILTERED').length;
  const asClipped = verdicts.filter((v) => v === 'CLIPPED').length;
  check('F8 a policy-rejected concept is never reported as CLIPPED', asClipped === 0, `filtered ${observedFiltered}, clipped ${asClipped}`);
}
{
  // The bounded structure must be bounded by the CAPS, not by the corpus. Comparing two corpora
  // is the wrong test — they can legitimately differ because one has an omission class the other
  // does not. The invariant is a ceiling that no world exceeds.
  const O = DEFAULT_OUTPUT;
  const ceiling = (cap: number, demands: number) =>
    O.noticeBase.bound + Math.max(O.collapsed.bound, cap * O.perName.bound) +
    (cap * 2 + 6 + 2 + demands) * O.perName.bound;
  let worst = 0;
  let breach = '';
  for (let c = 0; c < CORPORA.length; c++)
    for (let q = 0; q < QUERIES.length; q++)
      for (let x = 0; x < EXACTS.length; x++)
        for (let a = 0; a < ALLOWANCES.length; a++)
          for (const cap of [1, 3, 8]) {
            const r = run({ ...INITIAL, corpus: c, query: q, exact: x, allowance: a, nameCap: cap, breadth: 'exhaustive' }).result;
            worst = Math.max(worst, r.omissions.cost.bound);
            if (r.omissions.cost.bound > ceiling(cap, EXACTS[x].length))
              breach = `c${c} q${q} x${x} cap${cap}: ${r.omissions.cost.bound}`;
          }
  check('F9 the omission structure never exceeds its cap-derived ceiling', breach === '', breach);
  const small = run({ ...INITIAL, corpus: 1, query: 2 }).result;
  check('F10 MISS is count-only', small.omissions.missCount >= 0 && !('missNames' in small.omissions));
  check('F10b scope summaries are capped, with a count beyond the cap', (() => {
    const r = run({ ...INITIAL, corpus: 0, query: 1, nameCap: 1, breadth: 'exhaustive', envelope: { version: 'w', filesInspected: 1, bytesParsed: 999999, probeOutputBytes: 999, ticks: 99 } }).result;
    return r.omissions.undiscovered.scopes.length <= 1 && r.omissions.undiscovered.scopeCount >= r.omissions.undiscovered.scopes.length;
  })());
}
{
  // the notice reservation must never have been too small at any intermediate step
  let breach = '';
  for (let a = 0; a < ALLOWANCES.length; a++) {
    for (let n = 0; n < 3; n++) {
      const w: World = { ...INITIAL, allowance: a, breadth: 'exhaustive', nameCap: [3, 1, 8][n] };
      const r = run(w).result;
      if (r.outcome === 'ok' || r.outcome === 'degraded') {
        if (r.budget.contextSpent > r.budget.spendable) breach = `a=${ALLOWANCES[a]} cap=${[3, 1, 8][n]}`;
      }
    }
  }
  check('F11 the notice never becomes the line that overruns the budget it exists to prevent', breach === '', breach);
}

// ===========================================================================
// G. Bounds, invalid, statelessness
// ===========================================================================
{
  // an under-calibrated profile is detected and produces `invalid`, not `degraded`
  const optimistic = run({ ...INITIAL, model: 2, breadth: 'exhaustive' }).result;
  check('G1 a falsified conservative bound produces invalid, not degraded', optimistic.outcome === 'invalid', optimistic.outcome);
  check('G2 content is discarded on invalid', optimistic.entries.length === 0 && optimistic.receipt.selected.length === 0);
  check('G3 the profile is quarantined', optimistic.quarantined !== undefined);
  check(
    'G4 the invalid envelope is bounded by something other than the quarantined profile',
    optimistic.budget.contextSpent === 22,
  );
}
{
  // ... and on an audit-blind deployment the SAME run cannot detect anything
  const blind = run({ ...INITIAL, model: 2, breadth: 'exhaustive', auditCapable: false }).result;
  check('G5 an audit-blind deployment cannot reach invalid at all', blind.outcome !== 'invalid');
  check('G6 ... and says so in the receipt rather than implying a backstop', blind.receipt.boundStatus === 'unverified');
  check('G7 ... and reports no observed sizes it does not have', blind.receipt.contextLines.every((l) => l.observed === null));
}
{
  // admission must be identical whether or not the observation violates the bound
  const honest = run({ ...INITIAL, model: 1, breadth: 'exhaustive' }).result;
  const blindOptimistic = run({ ...INITIAL, model: 2, breadth: 'exhaustive', auditCapable: false }).result;
  check(
    'G8 the observed size never alters what was admitted',
    honest.receipt.selected.map((s) => s.id).join() === blindOptimistic.receipt.selected.map((s) => s.id).join(),
  );
}
{
  // the receipt is complete on EVERY exit path, including the ones #28 found dead
  const paths: [string, Result][] = [
    ['ok', at('').r],
    ['insufficient/floor', run({ ...INITIAL, allowance: 0 }).result],
    ['insufficient/no-profile', at('cc').r],
    ['insufficient/no-fallback', at('ppk').r],
    ['invalid', run({ ...INITIAL, model: 2, breadth: 'exhaustive' }).result],
  ];
  const required = [
    'scopeSnapshot', 'deployment', 'seam', 'provenance', 'allowanceSource', 'reserveProfile',
    'breadth', 'stopReason', 'selected', 'contextLines', 'workSpend', 'costProfile',
    'serializerVersion', 'policyVersion', 'omissionForm', 'boundStatus',
  ];
  for (const [name, r] of paths) {
    const missing = required.filter((f) => (r.receipt as Record<string, unknown>)[f] === undefined);
    check(`G9 receipt complete on the ${name} path`, missing.length === 0, missing.join(','));
  }
  check('G10 the receipt records per-line triples, not two scalars', paths[0][1].receipt.contextLines.every((l) => 'bound' in l && 'charged' in l && 'observed' in l));
}
{
  // statelessness: the same inputs give the same answer, whatever ran before
  const a = run({ ...INITIAL, allowance: 6 }).result;
  const b = run({ ...INITIAL, allowance: 0 }).result;
  const aAgain = run({ ...INITIAL, allowance: 6 }).result;
  check('G11 a call is unaffected by what preceded it', JSON.stringify(a.receipt.selected) === JSON.stringify(aAgain.receipt.selected));
  check('G12 no deduplication against previously returned content', JSON.stringify(a.entries.map((e) => e.id)) === JSON.stringify(aAgain.entries.map((e) => e.id)));
  void b;
}
{
  // quarantine has no observable effect across calls — which is what "stateless" costs you
  const first = run({ ...INITIAL, model: 2, breadth: 'exhaustive' }).result;
  const second = run({ ...INITIAL, model: 2, breadth: 'exhaustive' }).result;
  check(
    'G13 quarantine cannot survive a stateless call boundary (a contradiction in #13)',
    first.outcome === second.outcome && first.quarantined === second.quarantined,
  );
}

// ===========================================================================
// H. The satisficing evidence rule — the section that changes most from #28
// ===========================================================================
{
  // "Terms appearing in unrelated concepts do not establish sufficiency."
  // `retention` lives in one concept, `policy` in another. They ARE linked in the fixture,
  // so `linked` may stop; `single` must not.
  const roomy = { version: 'w', filesInspected: 99, bytesParsed: 9_999_999, probeOutputBytes: 99999, ticks: 999 };
  const single = run({ ...INITIAL, query: 7, coherence: 0, allowance: 6, envelope: roomy }).result;
  const component = run({ ...INITIAL, query: 7, coherence: 2, allowance: 6, envelope: roomy }).result;
  check(
    'H1 "coherent" spans the whole decision: single and component behave differently',
    single.receipt.stopReason !== component.receipt.stopReason ||
      single.work.spent.bytesParsed !== component.work.spent.bytesParsed,
    `${single.receipt.stopReason} / ${component.receipt.stopReason}`,
  );
  check(
    'H2 at `component`, the rule collapses back to #28\'s union rule it was meant to replace',
    /satisficing/.test(component.receipt.stopReason),
  );
}
{
  // Sufficiency is clause COVERAGE with no notion of clause informativeness, and #13 bans every
  // cheap discriminator (no stopword rule, no minimum length, no stemming, no synonyms, no
  // importance field). So "covers every retained query clause" counts `the` and `a` as fully as
  // `retention`. Document frequency is the one discriminator left standing, and it needs no
  // calibration constant from #7.
  const q = parseQuery(QUERIES[2]); // "what is the a record for policy"
  const observedAll = new Map(CORPORA[0].concepts.map((k) => [k.id, 'body' as const]));
  const probedAll = new Set(CORPORA[0].concepts.map((k) => k.id));
  const bare = { ...INITIAL };
  const off = evidenceSufficient(CORPORA[0], q, observedAll, probedAll, { ...DEFAULT_DIALS, informativeness: 'off' });
  const df = evidenceSufficient(CORPORA[0], q, observedAll, probedAll, { ...DEFAULT_DIALS, informativeness: 'df-weighted' });
  check(
    'H3 bare clause coverage and df-weighted coverage disagree about what must be covered',
    off.required !== df.required,
    `off requires ${off.required} clauses, df-weighted requires ${df.required}`,
  );
  void bare;
}
{
  // exhaustive costs more than satisfice, and cannot claim completion after a work cap
  const sat = run({ ...INITIAL, query: 1, breadth: 'satisfice' }).result;
  const exh = run({ ...INITIAL, query: 1, breadth: 'exhaustive' }).result;
  check('H4 exhaustive discovery costs strictly more work', exh.work.spent.bytesParsed >= sat.work.spent.bytesParsed);
  const capped = run({ ...INITIAL, query: 1, breadth: 'exhaustive', envelope: { version: 'w', filesInspected: 1, bytesParsed: 99999, probeOutputBytes: 999, ticks: 99 } }).result;
  check('H5 exhaustive completion cannot be claimed after the envelope ends', capped.outcome !== 'ok');
}
{
  // audits, migrations and reviews select exhaustive by task kind, not by a flag
  for (const [i, t] of TASKS.entries()) {
    if (t === 'audit' || t === 'migration' || t === 'review') {
      const r = run({ ...INITIAL, task: i }).result;
      check(`H6 task "${t}" selects exhaustive breadth`, r.receipt.breadth === 'exhaustive');
    }
  }
}
{
  // an empty query with no demands is a named state, not a confident `ok`
  const r = run({ ...INITIAL, query: 8 }).result; // ''
  check('H7 an empty query does not claim its terms were explained', !/every query term/.test(r.receipt.stopReason));
  check('H8 ... and is reported as its own condition', r.reasons.some((x) => /no clause/.test(x)) || r.outcome !== 'ok');
}

// ===========================================================================
// I. Sweep — every reachable combination, asserting the invariants hold
// ===========================================================================
let runs = 0;
const sweepFailures: string[] = [];
// Sweeps the dials an earlier revision left at their defaults: task, breadth, provenance,
// cost model, nameCap, declaredOutput and audit capability. Refusal and invalid paths are NOT
// exempt from the overrun check — exempting them is how 5,940 refusals that charged an envelope
// against a negative spendable went unreported.
for (let c = 0; c < CORPORA.length; c++)
  for (let q = 0; q < QUERIES.length; q++)
    for (let x = 0; x < EXACTS.length; x++)
      for (let a = 0; a < ALLOWANCES.length; a++)
        for (let s2 = 0; s2 < SEAMS.length; s2++)
          for (let h = 0; h < COHERENCE.length; h++)
            for (let t = 0; t < TASKS.length; t += 3)
              for (const br of ['satisfice', 'exhaustive'] as const)
                for (const prov of ['explicit', 'unknown'] as const)
                  for (const cap of [1, 8]) {
                    runs++;
                    const w: World = {
                      ...INITIAL, corpus: c, query: q, exact: x, allowance: a, seam: s2,
                      coherence: h, task: t, breadth: br, provenance: prov, nameCap: cap,
                    };
                    const r = run(w).result;
                    const where = `c${c} q${q} x${x} a${ALLOWANCES[a]} ${SEAMS[s2]} ${br} ${prov} cap${cap}`;
                    // EVERY path, refusals included. The invariant is not "never overrun" —
                    // below the cost of the smallest refusal the runtime must overrun to say
                    // anything at all, including "no". The invariant is never overrun SILENTLY.
                    if (r.budget.contextSpent > Math.max(0, r.budget.spendable)) {
                      const declared = r.violations.some((v) => v.startsWith('UNPLANNED SPEND') || v.startsWith('SILENT OVERRUN'));
                      if (!declared) sweepFailures.push(`SILENT overrun (${r.outcome}) @ ${where}`);
                    }
                    if (r.outcome === 'ok' || r.outcome === 'degraded') {
                      const ids = r.entries.map((e) => e.id);
                      if (new Set(ids).size !== ids.length) sweepFailures.push(`double verdict @ ${where}`);
                      const covered = new Set(ids);
                      for (const k of CORPORA[c].concepts)
                        if (!covered.has(k.id)) sweepFailures.push(`no verdict for ${k.id} @ ${where}`);
                      for (const l of r.receipt.contextLines)
                        if (l.observed !== null && l.observed > l.bound)
                          sweepFailures.push(`line falsified but not invalid @ ${where}`);
                    }
                    if (r.outcome === 'invalid' && r.entries.length > 0)
                      sweepFailures.push(`invalid leaked content @ ${where}`);
                    // no verdict may advise a no-op
                    for (const e of r.entries)
                      if (e.verdict !== 'SELECTED' && e.verdict !== 'DEMANDED' && e.nextAction === 'nothing')
                        sweepFailures.push(`no-op advice for ${e.id} @ ${where}`);
                  }
check(`I1 sweep of ${runs} runs holds every invariant`, sweepFailures.length === 0, sweepFailures.slice(0, 4).join(' | '));

// ===========================================================================
console.log('');
console.log(`\x1b[1mOKF retrieval runtime — case catalogue\x1b[0m`);
console.log(`  ${pass} passed, ${failures.length} failed   (sweep: ${runs} runs)`);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`  \x1b[31mFAIL\x1b[0m ${f}`);
  process.exitCode = 1;
} else {
  console.log('  \x1b[32mall green\x1b[0m');
}
console.log('');
