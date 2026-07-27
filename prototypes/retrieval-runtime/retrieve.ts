// PROTOTYPE — throwaway. The retrieval runtime contract adopted in #13.
//
//   retrieve(scope snapshot, query, exact references, task kind,
//            budget attestation, breadth and filters)
//     -> bounded materialized context package + omissions + receipt
//
// Pure: no I/O, no clock, no randomness, no tokenizer, no cache. Everything variable is
// injected. The TUI imports this; nothing flows the other way.
//
// Where this prototype DEPARTS from #13 as written, it is marked `DEPARTURE:` and the
// departure is argued in README.md. Those are the findings.

import {
  ContextLedger,
  WorkLedger,
  COST_MODELS,
  price,
  priced,
  NO_WORK,
  WORK_DIMENSIONS,
  type CostModel,
  type Priced,
  type Work,
  type WorkDimension,
  type WorkEnvelope,
} from './cost.ts';
import { parseQuery, clauseMatches, tokenize, type Query } from './query.ts';
import type { Concept, Corpus, Section } from './corpus.ts';

// ---------------------------------------------------------------------------
// Contract vocabulary
// ---------------------------------------------------------------------------

export const TIERS = ['LINE', 'CARD', 'SECTION', 'FULL'] as const;
export type Tier = (typeof TIERS)[number];

export type Outcome = 'ok' | 'degraded' | 'insufficient' | 'invalid';
export type Breadth = 'satisfice' | 'exhaustive';
export type Provenance = 'explicit' | 'estimated' | 'unknown';

/**
 * DEPARTURE (the load-bearing one). #13 states as a design constant that "internal
 * shared-runtime reads do not consume model context". That is not a constant — it is a
 * property of how the runtime is deployed, and #13 itself defers that to #5 ("whether the
 * runtime ships as a CLI, script, or library remains with #5"). A CLI's stdout arrives as a
 * tool result, which is model context. So the seam is ATTESTED by the adapter, and the
 * context ledger has exactly one rule: it charges bytes entering model context.
 */
export type Seam = 'in-context' | 'out-of-context';

export type Verdict =
  | 'SELECTED'
  | 'DEMANDED'
  | 'CLIPPED'
  | 'MISS'
  | 'UNDISCOVERED'
  | 'UNSEARCHED'
  | 'FILTERED'
  | 'UNRESOLVED';

/** Which ledger ran out. #13's five classes have no cause field, so CLIPPED and UNDISCOVERED
 *  each conflate two failures with opposite fixes. DEPARTURE: carry the cause. */
export type Ledger = 'context' | 'work';

export interface Entry {
  id: string;
  verdict: Verdict;
  tier?: Tier;
  askedTier?: Tier;
  /** for SECTION: which sections were materialized, and how many exist. */
  sections?: { shown: string[]; total: number };
  score: number;
  observed: ObservedTier;
  ledger?: Ledger;
  cost: Priced;
  summary: string;
  detail: string;
  /** must be causally sufficient: doing this, with all else fixed, changes the verdict. */
  nextAction: string;
}

/** How much of a concept the runtime has actually observed. Gates what it may claim. */
export type ObservedTier = 'none' | 'locator' | 'title' | 'line' | 'card' | 'body';
const OBSERVED_ORDER: ObservedTier[] = ['none', 'locator', 'title', 'line', 'card', 'body'];
const atLeast = (a: ObservedTier, b: ObservedTier) =>
  OBSERVED_ORDER.indexOf(a) >= OBSERVED_ORDER.indexOf(b);

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type TaskKind = 'feature' | 'debugging' | 'exploration' | 'research' | 'review' | 'audit' | 'migration';

export interface ReserveProfile {
  version: string;
  kind: TaskKind | 'unknown';
  fraction: number;
  /** #13: a declared requirement "may increase that reserve but cannot reduce the profile minimum" */
  minimum: number;
}

export const RESERVE_PROFILES: ReserveProfile[] = [
  { version: 'reserve/1', kind: 'exploration', fraction: 0.2, minimum: 200 },
  { version: 'reserve/1', kind: 'research', fraction: 0.25, minimum: 240 },
  { version: 'reserve/1', kind: 'review', fraction: 0.3, minimum: 300 },
  { version: 'reserve/1', kind: 'feature', fraction: 0.35, minimum: 360 },
  { version: 'reserve/1', kind: 'audit', fraction: 0.35, minimum: 360 },
  { version: 'reserve/1', kind: 'migration', fraction: 0.4, minimum: 420 },
  { version: 'reserve/1', kind: 'debugging', fraction: 0.45, minimum: 500 },
];

/** The adapter's attestation. #13 calls this "attest"; the OKF spec reserves that word for a
 *  deterministic verdict over a receipt, so this prototype calls it what it is: a declaration. */
export interface Declaration {
  deployment: string;
  seam: Seam;
  allowance: number;
  provenance: Provenance;
  /** a versioned calibrated deployment fallback, when one exists */
  fallbackAllowance?: number;
  costModelId: keyof typeof COST_MODELS;
  /**
   * Can this deployment supply an exact post-emission token count of the final wire payload?
   * If not, the runtime is AUDIT-BLIND: it cannot detect a falsified bound, and every receipt
   * must say so rather than implying a backstop that does not exist.
   */
  auditCapable: boolean;
  /** declared output or tool requirement; may raise the reserve, never lower the minimum */
  declaredOutputReserve: number;
}

export interface Filters {
  includeDeprecated: boolean;
  includeDraft: boolean;
}

export interface Dials {
  /** how far a coherent evidence set may reach. `single` and `component` are the two ends of
   *  the range #13's undefined word "coherent" spans. */
  coherence: 'single' | 'linked' | 'component';
  /** off = #13 as written (bare clause coverage). df = coverage weighted by how many concepts
   *  in the corpus contain the clause, so a clause everything matches discharges almost nothing. */
  informativeness: 'off' | 'df-weighted';
  /** a clause matched by more than this share of the corpus is uninformative under `df-weighted` */
  dfCeiling: number;
  strongScore: number;
  mediumScore: number;
  /** cap on how many CLIPPED/FILTERED names the bounded structure may carry before collapsing */
  nameCap: number;
  noticeShareCap: number;
}

export const DEFAULT_DIALS: Dials = {
  coherence: 'linked',
  informativeness: 'off',
  dfCeiling: 0.6,
  strongScore: 6,
  mediumScore: 3,
  nameCap: 3,
  noticeShareCap: 0.25,
};

export const DEFAULT_ENVELOPE: WorkEnvelope = {
  version: 'work/1',
  filesInspected: 12,
  bytesParsed: 40000,
  probeOutputBytes: 4000,
  ticks: 50,
};

export interface Request {
  query: string;
  exact: string[];
  task: TaskKind | 'unknown';
  declaration: Declaration;
  breadth?: Breadth;
  filters: Filters;
  dials: Dials;
  envelope: WorkEnvelope;
  /** injected bounds for generated output. Bounds price; observations only audit. */
  output: {
    noticeBase: Priced;
    perName: Priced;
    collapsed: Priced;
    receiptBase: Priced;
    receiptPerLine: Priced;
    invalidEnvelope: Priced;
  };
}

export const DEFAULT_OUTPUT = {
  noticeBase: priced(14, 12),
  perName: priced(9, 8),
  collapsed: priced(10, 9),
  receiptBase: priced(40, 34),
  receiptPerLine: priced(6, 5),
  /** a fixed, content-free literal, measured once per deployment. It names nothing, which is
   *  the price of being bounded by something other than the profile just quarantined. */
  invalidEnvelope: priced(22, 20),
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface Omissions {
  form: 'none' | 'named' | 'counted';
  clipped: string[];
  clippedCount: number;
  filtered: string[];
  filteredCount: number;
  missCount: number;
  undiscovered: { scopes: string[]; scopeCount: number; channels: string[] };
  unsearched: { scopes: string[]; scopeCount: number; channels: string[] };
  unresolved: string[];
  /**
   * DEPARTURE. #13 says "Unobserved filter evidence remains incomplete discovery; never assume
   * it passed or failed" and then enumerates a model-facing structure with no slot to say it.
   * Inclusion IS the pass action, so without this carrier the rule has no observable. Derived
   * from the observation tier, never from the unobserved field's value — reading the field to
   * count who is hiding is exactly the oracle #28 had to remove.
   */
  unevaluatedPredicates: { predicate: string; candidates: number }[];
  /** #13: exact demands bypass ranked-result filters "with an explicit warning" */
  bypassWarnings: string[];
  aliasExpansions: string[];
  cost: Priced;
}

export interface Receipt {
  scopeSnapshot: string;
  deployment: string;
  seam: Seam;
  provenance: Provenance;
  allowanceSource: string;
  reserveProfile: string;
  breadth: Breadth;
  stopReason: string;
  selected: { id: string; tier: Tier; sections?: string[] }[];
  /** DEPARTURE: per-line triples, not two scalars. #28 proved aggregate slack hides per-document
   *  deficits, so a receipt carrying only totals cannot evidence the invariant #13 leans on. */
  contextLines: { label: string; bound: number; charged: number; observed: number | null }[];
  workSpend: Work;
  costProfile: string;
  serializerVersion: string;
  policyVersion: string;
  omissionForm: string;
  /** honest statement of whether falsification could have been detected at all */
  boundStatus: 'verified' | 'unverified';
  cost: Priced;
}

export interface Result {
  outcome: Outcome;
  reasons: string[];
  budget: {
    allowance: number;
    reserve: number;
    spendable: number;
    contextSpent: number;
    floor: number;
  };
  work: { spent: Work; envelope: WorkEnvelope; exhausted: WorkDimension[] };
  entries: Entry[];
  omissions: Omissions;
  receipt: Receipt;
  query: Query;
  /** audit findings. A falsified bound drives the outcome to `invalid`. */
  violations: string[];
  /** set when the run had to quarantine a cost profile */
  quarantined?: string;
}

// ---------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------

export function retrieve(corpus: Corpus, req: Request): Result {
  const reasons: string[] = [];
  const violations: string[] = [];
  const d = req.dials;
  const decl = req.declaration;
  const query = parseQuery(req.query);
  const model = COST_MODELS[decl.costModelId];

  // -- Phase 1: cost model admission -----------------------------------------
  // #13: "No valid tokenizer or profile means `insufficient`; there is no universal character divisor."
  if (!model || !model.calibrated) {
    return refuse(
      corpus,
      req,
      query,
      'insufficient',
      [`no calibrated cost profile for deployment ${decl.deployment} (${decl.costModelId})`],
      decl.allowance,
      0,
      violations,
    );
  }

  // -- Phase 2: allowance and provenance -------------------------------------
  let allowance = decl.allowance;
  let allowanceSource = 'declared';
  if (decl.provenance === 'unknown') {
    if (decl.fallbackAllowance === undefined) {
      // #13: "Without such a profile, retrieval returns `insufficient`." This inverts #28's
      // validated "unknown budget degrades rather than blocks", on assertion rather than evidence.
      return refuse(
        corpus,
        req,
        query,
        'insufficient',
        ['budget provenance is unknown and no calibrated deployment fallback is registered'],
        decl.allowance,
        0,
        violations,
      );
    }
    allowance = decl.fallbackAllowance;
    allowanceSource = 'deployment fallback';
    reasons.push('budget provenance unknown; using the calibrated deployment fallback');
  } else if (decl.provenance === 'estimated') {
    reasons.push('budget provenance is estimated, not explicit');
  }

  // -- Phase 3: reserve, carved before selection ------------------------------
  const profile = pickProfile(req.task, allowance);
  // "may increase that reserve but cannot reduce the profile minimum"
  const reserve = Math.max(
    profile.minimum,
    Math.ceil(profile.fraction * allowance) + decl.declaredOutputReserve,
  );
  const spendable = allowance - reserve;

  // #13 gives `allowance - reserve = spendable` and separately a profile minimum that a declared
  // requirement "cannot reduce". Composed, those permit `reserve >= allowance` and a spendable of
  // zero or below, and #13 says nothing about it. Nothing can be emitted truthfully there — not
  // even a refusal, which is itself model-visible output.
  if (spendable < req.output.invalidEnvelope.bound) {
    return refuse(
      corpus,
      req,
      query,
      'insufficient',
      [
        `the ${profile.version}/${profile.kind} reserve of ${reserve} leaves ${spendable} spendable, ` +
          `below the ${req.output.invalidEnvelope.bound} needed to emit even a refusal`,
      ],
      allowance,
      reserve,
      violations,
    );
  }

  const ctx = new ContextLedger(spendable);
  const work = new WorkLedger(req.envelope);

  // -- Phase 4: the honest retrieval floor ------------------------------------
  // DEPARTURE: the floor is a function of the REQUEST, not a constant. #13 states it as a
  // property of the runtime, but "never silently drop a demand" makes the smallest truthful
  // envelope grow with the number of demands. A request with 400 demands cannot be answered
  // truthfully in the space a request with one demand needs.
  const demandNames = dedupe(req.exact);
  const floor =
    req.output.receiptBase.bound +
    req.output.noticeBase.bound +
    req.output.collapsed.bound +
    demandNames.length * req.output.perName.bound;
  if (spendable < floor) {
    return refuse(
      corpus,
      req,
      query,
      'insufficient',
      [
        `spendable ${spendable} is below the honest retrieval floor ${floor}` +
          (demandNames.length ? ` (${demandNames.length} exact demands must be nameable)` : ''),
      ],
      allowance,
      reserve,
      violations,
      demandNames,
    );
  }

  if (query.empty && demandNames.length === 0) {
    // #28 had to give this its own state after returning `ok` with "every query term was
    // already explained" for a query with no terms. #13's outcome set still has no name for it.
    reasons.push('the query carries no clause and no exact demand');
  }

  // -- Phase 5: discovery -----------------------------------------------------
  const breadth: Breadth = req.breadth ?? defaultBreadth(req.task);
  const observed = new Map<string, ObservedTier>();
  const probed = new Set<string>();
  const setObserved = (id: string, t: ObservedTier) => {
    if (!atLeast(observed.get(id) ?? 'none', t)) observed.set(id, t);
  };

  const inContext = decl.seam === 'in-context';
  const channelsUsed: string[] = [];
  const undiscoveredScopes: string[] = [];
  const unsearchedScopes: string[] = [];
  const undiscoveredChannels = new Set<string>();
  const unsearchedChannels = new Set<string>();
  let stopReason = 'discovery completed';

  /** A channel purchase. Charged to whichever ledger the attested seam puts it on. */
  const buy = (channel: string, scope: string, cost: Priced, w: Work, why: string): boolean => {
    const short = work.wouldExhaust(w);
    if (short.length > 0) {
      undiscoveredChannels.add(channel);
      if (!undiscoveredScopes.includes(scope)) undiscoveredScopes.push(scope);
      stopReason = `work envelope exhausted on ${short.join(', ')}`;
      return false;
    }
    if (inContext) {
      // #28's world: discovery output is model-visible, so it competes with materialization.
      const priced_ = price(model, cost);
      if (ctx.spent + priced_.bound + reserveForOmissions(0) + receiptReserve() > spendable) {
        undiscoveredChannels.add(channel);
        if (!undiscoveredScopes.includes(scope)) undiscoveredScopes.push(scope);
        stopReason = 'context allowance exhausted during discovery (in-context seam)';
        return false;
      }
      ctx.charge('DISCOVERY', `${channel}:${scope}`, priced_, why);
    }
    work.charge(channel, scope, w);
    if (!channelsUsed.includes(channel)) channelsUsed.push(channel);
    return true;
  };

  // Reserve arithmetic needs to exist before discovery under the in-context seam, so it is
  // declared here and closes over the mutable omission counters below.
  let knownOmissions = 0;
  const demandNamesUpperBound = dedupe(req.exact).length;

  /**
   * FINDING. #13 makes the receipt a context-ledger item ("materialized concept tiers, the
   * bounded omission notice, and the receipt") and requires it to record twelve fields
   * including per-line spend. Its size is therefore a function of how many ledger lines the run
   * produces — so every purchase enlarges the very thing that must be reserved for it, and its
   * final size is unknowable before selection. That is exactly the property #28 had to fix for
   * the notice ("the reservation must be the largest notice still reachable"), and #13 applies
   * the discipline to the notice alone. Without this reservation the runtime overruns: driven by
   * hand at `S-` on the knowledge bundle it charged 206 against 200 spendable and still called
   * itself `degraded`.
   */
  // Seam-aware: DISCOVERY lines exist only when discovery output is model-visible, so reserving
  // for them on the out-of-context seam over-reserves for lines that cannot occur. An earlier
  // revision did exactly that and turned a demand that would have fit into a refusal.
  const maxReachableLines =
    corpus.concepts.length +
    (inContext ? [...new Set(corpus.concepts.map((k) => k.dir))].length * 3 + 1 : 0) +
    2; // the notice and the receipt itself
  const receiptReserve = () => receiptBound(req, maxReachableLines);
  const extrasCeiling =
    d.nameCap * 2 + // scope names, both classes, capped like every other named omission
    6 + // channel names, both classes
    2 + // active predicates
    demandNamesUpperBound; // bypass warnings cannot exceed the demands
  function reserveForOmissions(pending: number): number {
    // #28: the reservation must be the largest notice still REACHABLE, floored at the collapsed
    // form — one more clipped concept can flip named->counted and make the notice SMALLER, so
    // reserving "the notice as it stands" is not monotone and lets the collapse overrun.
    const maxNamed = Math.min(d.nameCap, knownOmissions + pending);
    let best = req.output.noticeBase.bound + req.output.collapsed.bound;
    for (let k = 0; k <= maxNamed; k++) {
      best = Math.max(best, req.output.noticeBase.bound + k * req.output.perName.bound);
    }
    return best + extrasCeiling * req.output.perName.bound;
  }

  // 5a. Filesystem inventory. #13: "Filesystem inventory establishes what exists."
  const gotInventory = buy('inventory', corpus.key, corpus.inventory, { ...NO_WORK, filesInspected: 1, bytesParsed: corpus.inventoryBytes, ticks: 1 }, 'the inventory of what exists');
  if (gotInventory) for (const k of corpus.concepts) setObserved(k.id, 'locator');

  const dirs = [...new Set(corpus.concepts.map((k) => k.dir))];

  // 5b/c/d. Indexes, frontmatter scans, body parses — escalating, stopping when the evidence
  // rule is satisfied under `satisfice`.
  const sufficiency = () => evidenceSufficient(corpus, query, observed, probed, d);

  for (const dir of dirs) {
    if (breadth === 'satisfice' && sufficiency().sufficient) {
      unsearchedChannels.add('index').add('frontmatter').add('body');
      if (!unsearchedScopes.includes(dir)) unsearchedScopes.push(dir);
      stopReason = 'satisficing: the evidence rule was satisfied';
      continue;
    }
    const idx = corpus.indexes.find((i) => i.dir === dir);
    if (idx) {
      if (buy('index', dir, idx.cost, { ...NO_WORK, filesInspected: 1, bytesParsed: idx.bytes, ticks: 1 }, idx.withDescriptions ? 'title and description in bulk' : 'title only')) {
        // #28 fb0a147: a bare index reveals title only and pre-pays no tier; a descriptive
        // index reveals title + description and pre-pays LINE.
        for (const id of idx.entries) setObserved(id, idx.withDescriptions ? 'line' : 'title');
      } else continue;
    }
    const inDir = corpus.concepts.filter((k) => k.dir === dir);
    const scanCost = priced(inDir.length * 14, inDir.length * 12);
    if (buy('frontmatter', dir, scanCost, { ...NO_WORK, filesInspected: inDir.length, bytesParsed: inDir.reduce((n, k) => n + Math.min(k.bytes, 300), 0), ticks: 1 }, 'tags, type and status')) {
      for (const k of inDir) setObserved(k.id, 'card');
    } else continue;

    if (breadth === 'satisfice' && sufficiency().sufficient) {
      unsearchedChannels.add('body');
      if (!unsearchedScopes.includes(dir)) unsearchedScopes.push(dir);
      stopReason = 'satisficing: the evidence rule was satisfied';
      continue;
    }
    const bodyCost = priced(inDir.reduce((n, k) => n + Math.min(k.cost.body.bound, 60), 0), 0);
    const bodyWork = { ...NO_WORK, filesInspected: inDir.length, bytesParsed: inDir.reduce((n, k) => n + k.bytes, 0), probeOutputBytes: inDir.length * 80, ticks: 2 };
    if (buy('body', dir, bodyCost, bodyWork, 'body-only words and which section matches')) {
      for (const k of inDir) {
        setObserved(k.id, 'body');
        probed.add(k.id);
      }
    }
  }

  // -- Phase 6: exact demands, resolved before ranking -------------------------
  const resolved = new Map<string, Concept>();
  const unresolved: string[] = [];
  for (const ref of demandNames) {
    const hit =
      corpus.concepts.find((k) => k.id === ref) ??
      corpus.concepts.find((k) => k.path === ref) ??
      corpus.concepts.find((k) => (k.sourceRefs ?? []).includes(ref));
    if (hit) resolved.set(ref, hit);
    else unresolved.push(ref);
  }
  knownOmissions += unresolved.length;

  // -- Phase 7: filters, evidence-bound ---------------------------------------
  const filtered: string[] = [];
  const bypassWarnings: string[] = [];
  const unevaluated: { predicate: string; candidates: number }[] = [];
  const predicates: { name: string; active: boolean; reject: (k: Concept) => boolean }[] = [
    { name: 'status=deprecated', active: !req.filters.includeDeprecated, reject: (k) => k.status === 'deprecated' },
    { name: 'status=draft', active: !req.filters.includeDraft, reject: (k) => k.status === 'draft' },
  ];
  // The count is filled in after ranking: it must cover the candidates that actually entered
  // ranking or selection below the tier that exposes the predicate field — not every concept in
  // the corpus, which would double-count things already reported as UNSEARCHED/UNDISCOVERED.
  // Counted by observation tier, never by reading the field: reading `status` to report how many
  // deprecated concepts are hiding is exactly the information the scan was supposed to cost money
  // to obtain — the oracle #28 had to remove.
  const countBlind = (ids: string[]) =>
    ids.filter((id) => !atLeast(observed.get(id) ?? 'none', 'card')).length;

  // -- Phase 8: ranking --------------------------------------------------------
  const entries: Entry[] = [];
  const ranked: { k: Concept; score: number; matched: Section[] }[] = [];
  let missCount = 0;

  for (const k of corpus.concepts) {
    const seen = observed.get(k.id) ?? 'none';
    const isDemand = [...resolved.values()].includes(k);

    if (!isDemand) {
      const rejecting = predicates.find(
        (p) => p.active && atLeast(seen, 'card') && p.reject(k),
      );
      if (rejecting) {
        // Budget-independent exclusions dominate budget-dependent ones: a FILTERED concept
        // reported as CLIPPED would carry "raise the budget", which can never surface it.
        filtered.push(k.id);
        knownOmissions += 1;
        entries.push({
          id: k.id,
          verdict: 'FILTERED',
          score: 0,
          observed: seen,
          cost: priced(0, 0),
          summary: `excluded by ${rejecting.name}`,
          detail: `observed at the ${seen.toUpperCase()} tier; the predicate read its status and rejected it`,
          nextAction: `turn off the ${rejecting.name} filter`,
        });
        continue;
      }
    }

    if (seen === 'none' || seen === 'locator') {
      const inUnreached = undiscoveredScopes.includes(k.dir);
      entries.push({
        id: k.id,
        verdict: inUnreached ? 'UNDISCOVERED' : unsearchedScopes.includes(k.dir) ? 'UNSEARCHED' : 'UNSEARCHED',
        score: 0,
        observed: seen,
        ledger: inUnreached ? (inContext ? 'context' : 'work') : undefined,
        cost: priced(0, 0),
        summary: inUnreached ? 'never examined: ran out of room to look' : 'never examined: discovery stopped first',
        detail: inUnreached
          ? `${k.dir} was never read; ${stopReason}`
          : `${k.dir} was never read because the evidence rule was already satisfied`,
        nextAction: inUnreached
          ? inContext
            ? 'raise the context allowance'
            : 'raise the discovery-work envelope'
          : 'switch breadth to exhaustive, or broaden the query',
      });
      knownOmissions += 1;
      continue;
    }

    const { score, matched } = scoreConcept(k, query, seen, probed.has(k.id), d, corpus);
    if (score === 0 && !isDemand) {
      // MISS requires that every applicable channel was examined. Under satisfice that is
      // frequently false, so a zero-score concept read only through an index is UNSEARCHED
      // evidence wearing a MISS label. DEPARTURE: gate MISS on body observation.
      if (atLeast(seen, 'body')) {
        missCount += 1;
        knownOmissions += 1;
        entries.push({
          id: k.id,
          verdict: 'MISS',
          score: 0,
          observed: seen,
          cost: priced(0, 0),
          summary: 'every enabled channel was examined; nothing matched',
          detail: 'read through inventory, index, frontmatter and body',
          nextAction: 'change the query',
        });
      } else {
        knownOmissions += 1;
        entries.push({
          id: k.id,
          verdict: 'UNSEARCHED',
          score: 0,
          observed: seen,
          cost: priced(0, 0),
          summary: `read only to the ${seen.toUpperCase()} tier; its body was never examined`,
          detail: 'a zero score here is not evidence of a miss — the body channel was never bought',
          nextAction: 'switch breadth to exhaustive so the body channel is bought',
        });
      }
      continue;
    }
    ranked.push({ k, score, matched });
  }

  ranked.sort((a, b) => b.score - a.score || a.k.id.localeCompare(b.k.id));

  // -- Phase 9: allocation -----------------------------------------------------
  const clipped: string[] = [];
  const selected: { id: string; tier: Tier; sections?: string[] }[] = [];

  /** #13: SECTION unavailable when the body has no usable heading-delimited section. */
  const availableTiers = (k: Concept, canSection: boolean): Tier[] =>
    k.sections.length > 0 && canSection ? ['LINE', 'CARD', 'SECTION', 'FULL'] : ['LINE', 'CARD', 'FULL'];

  const tierCost = (k: Concept, tier: Tier, matched: Section[]): Priced => {
    const seen = observed.get(k.id) ?? 'none';
    // Pre-payment only exists when discovery output was itself model-visible. Under the
    // out-of-context seam nothing has crossed the interface yet, so nothing is pre-paid —
    // #28's index-pre-pays-LINE result is a property of the in-context seam alone.
    const prepaidLine = inContext && atLeast(seen, 'line');
    const prepaidCard = inContext && atLeast(seen, 'card');
    const line = prepaidLine ? priced(0, 0) : add(k.cost.locator, k.cost.titleDesc);
    const card = add(line, prepaidCard ? priced(0, 0) : k.cost.frontmatter);
    switch (tier) {
      case 'LINE':
        return price(model, line);
      case 'CARD':
        return price(model, card);
      case 'SECTION': {
        // DEPARTURE: SECTION carries the concept's complete section manifest. Without it a
        // SECTION payload is a title, a description, full frontmatter and some prose — it looks
        // exactly like a short complete concept, and the loss is invisible from inside context.
        // It is the only tier whose content can vanish without a trace, and #13 gives it no
        // disclosure rule.
        const body = matched.reduce((a, s) => add(a, s.cost), priced(0, 0));
        return price(model, add(add(card, k.cost.manifest), body));
      }
      case 'FULL':
        return price(model, add(card, k.cost.body));
    }
  };

  const fits = (cost: Priced, pending: number) =>
    ctx.spent + cost.bound + reserveForOmissions(pending) + receiptReserve() <= spendable;

  // 9a. Demands first, degraded down the available ladder, never dropped.
  const demandEntries: Entry[] = [];
  for (const [ref, k] of resolved) {
    const canSection = probed.has(k.id);
    const ladder = availableTiers(k, canSection);
    const matched = k.sections.filter((s) => sectionMatches(s, query));
    let placed: Tier | null = null;
    for (const tier of [...ladder].reverse()) {
      if (tier === 'SECTION' && matched.length === 0) continue;
      const cost = tierCost(k, tier, matched);
      if (fits(cost, 0)) {
        placed = tier;
        ctx.charge('DEMAND', `${k.id}@${tier}`, cost, `exact demand ${ref}`);
        selected.push({ id: k.id, tier, sections: tier === 'SECTION' ? matched.map((s) => s.heading) : undefined });
        demandEntries.push({
          id: k.id,
          verdict: 'DEMANDED',
          tier,
          askedTier: 'FULL',
          sections: tier === 'SECTION' ? { shown: matched.map((s) => s.heading), total: k.sections.length } : undefined,
          score: Infinity,
          observed: observed.get(k.id) ?? 'none',
          cost,
          summary: `exact demand honored at ${tier}`,
          detail: tier === 'FULL' ? 'honored in full' : `degraded from FULL to ${tier} to fit the allowance`,
          nextAction: tier === 'FULL' ? 'nothing' : 'raise the allowance to honor it at FULL',
        });
        break;
      }
    }
    if (placed === null) {
      // #13: "refuse them explicitly when their minimum cannot fit". Measured against what the
      // demands owe — NOT against the ranked fill's worst-case notice, which is the two-questions-
      // one-comparison bug that made #28 refuse with budget to spare and be non-monotone in it.
      return refuse(
        corpus,
        req,
        query,
        'insufficient',
        [
          `exact demand ${ref} does not fit even at ${availableTiers(k, false)[0]}: ` +
            `short by ${tierCost(k, availableTiers(k, false)[0], []).bound + ctx.spent + reserveForOmissions(0) + receiptReserve() - spendable}`,
        ],
        allowance,
        reserve,
        violations,
        unresolved,
      );
    }
    // an exact demand bypasses ranked-result filters — loudly
    const bypassed = predicates.find((p) => p.active && atLeast(observed.get(k.id) ?? 'none', 'card') && p.reject(k));
    if (bypassed) bypassWarnings.push(`${k.id} was returned as an exact demand despite ${bypassed.name}`);
  }
  entries.push(...demandEntries);

  // 9b. Ranked fill.
  for (let i = 0; i < ranked.length; i++) {
    const { k, score, matched } = ranked[i];
    if (selected.some((s) => s.id === k.id)) continue;
    const canSection = probed.has(k.id);
    const ladder = availableTiers(k, canSection);
    const asked: Tier =
      score >= d.strongScore ? 'FULL' : score >= d.mediumScore ? (matched.length > 0 && canSection ? 'SECTION' : 'CARD') : 'LINE';
    const pending = ranked.length - i - 1;
    let placed: Tier | null = null;
    for (const tier of ladderDownFrom(ladder, asked)) {
      if (tier === 'SECTION' && matched.length === 0) continue;
      const cost = tierCost(k, tier, matched);
      if (fits(cost, pending + 1)) {
        placed = tier;
        ctx.charge('RANKED', `${k.id}@${tier}`, cost, `score ${score}`);
        selected.push({ id: k.id, tier, sections: tier === 'SECTION' ? matched.map((s) => s.heading) : undefined });
        entries.push({
          id: k.id,
          verdict: 'SELECTED',
          tier,
          askedTier: asked,
          sections: tier === 'SECTION' ? { shown: matched.map((s) => s.heading), total: k.sections.length } : undefined,
          score,
          observed: observed.get(k.id) ?? 'none',
          cost,
          summary: `selected at ${tier}`,
          detail: tier === asked ? 'at the tier its score asked for' : `degraded from ${asked}`,
          nextAction: tier === asked ? 'nothing' : 'raise the allowance for a deeper tier',
        });
        break;
      }
    }
    if (placed === null) {
      clipped.push(k.id);
      knownOmissions += 1;
      entries.push({
        id: k.id,
        verdict: 'CLIPPED',
        askedTier: asked,
        score,
        observed: observed.get(k.id) ?? 'none',
        ledger: 'context',
        cost: priced(0, 0),
        summary: 'matched, but no tier fit the context allowance',
        detail: `wanted ${asked}; even LINE did not fit with the omission notice and receipt reserved`,
        nextAction: 'raise the context allowance, or name it as an exact demand',
      });
    }
  }

  // -- Phase 10: the bounded model-facing structure ----------------------------
  const rankedOrSelected = [...ranked.map((r) => r.k.id), ...selected.map((s) => s.id)];
  for (const p of predicates) {
    if (!p.active) continue;
    const blind = countBlind([...new Set(rankedOrSelected)]);
    if (blind > 0) unevaluated.push({ predicate: p.name, candidates: blind });
  }

  const namedTotal = clipped.length + filtered.length + unresolved.length;
  const wantNamed = req.output.noticeBase.bound + Math.min(namedTotal, d.nameCap) * req.output.perName.bound;
  const collapse =
    namedTotal > d.nameCap ||
    wantNamed > d.noticeShareCap * spendable ||
    wantNamed > spendable - ctx.spent - receiptReserve();
  const form: Omissions['form'] = namedTotal === 0 && missCount === 0 ? 'none' : collapse ? 'counted' : 'named';
  // Everything the structure NAMES is priced. #28 had to learn this the hard way: unsearched
  // directory names were printed free, and they grow with the bundle.
  const extras =
    omissionExtras(undiscoveredScopes, undiscoveredChannels, unsearchedScopes, unsearchedChannels, unevaluated, bypassWarnings, d.nameCap);
  const omissionCost = price(
    model,
    add(
      form === 'none'
        ? priced(0, 0)
        : form === 'counted'
          ? add(req.output.noticeBase, req.output.collapsed)
          : add(req.output.noticeBase, mul(req.output.perName, Math.min(namedTotal, d.nameCap))),
      mul(req.output.perName, extras),
    ),
  );
  ctx.charge('NOTICE', 'omissions', omissionCost, `${form} form`);

  const omissions: Omissions = {
    form,
    clipped: form === 'named' ? clipped.slice(0, d.nameCap) : [],
    clippedCount: clipped.length,
    filtered: form === 'named' ? filtered.slice(0, d.nameCap) : [],
    filteredCount: filtered.length,
    missCount,
    // FINDING: #13 caps CLIPPED and FILTERED names but leaves UNDISCOVERED/UNSEARCHED to
    // "summarize affected scopes and channels" uncapped — and scopes grow with the bundle, so
    // the structure #13 calls bounded is not. They are capped here on the same rule as the rest.
    undiscovered: {
      scopes: undiscoveredScopes.slice(0, d.nameCap),
      scopeCount: undiscoveredScopes.length,
      channels: [...undiscoveredChannels],
    },
    unsearched: {
      scopes: unsearchedScopes.slice(0, d.nameCap),
      scopeCount: unsearchedScopes.length,
      channels: [...unsearchedChannels],
    },
    unresolved,
    unevaluatedPredicates: unevaluated,
    bypassWarnings,
    aliasExpansions: [],
    cost: omissionCost,
  };

  // -- Phase 11: the receipt ---------------------------------------------------
  const receiptCost = price(model, priced(receiptBound(req, ctx.lines.length), Math.ceil(receiptBound(req, ctx.lines.length) * 0.86)));
  ctx.charge('RECEIPT', 'receipt', receiptCost, 'the audit record');

  const receipt: Receipt = {
    scopeSnapshot: `${corpus.key}@${corpus.concepts.length}`,
    deployment: decl.deployment,
    seam: decl.seam,
    provenance: decl.provenance,
    allowanceSource,
    reserveProfile: `${profile.version}/${profile.kind}`,
    breadth,
    stopReason,
    selected,
    contextLines: ctx.lines.map((l) => ({
      label: `${l.kind} ${l.label}`,
      bound: l.cost.bound,
      charged: l.cost.bound,
      observed: decl.auditCapable ? l.cost.observed : null,
    })),
    workSpend: work.spent,
    costProfile: `${model.id}@${model.version}`,
    serializerVersion: model.serializerVersion,
    policyVersion: 'policy/1',
    omissionForm: form,
    boundStatus: decl.auditCapable ? 'verified' : 'unverified',
    cost: receiptCost,
  };

  // -- Phase 12: audit ---------------------------------------------------------
  if (ctx.spent > spendable) violations.push(`SILENT OVERRUN: charged ${ctx.spent} against ${spendable} spendable`);
  if (decl.auditCapable) {
    // Falsification is detectable only where an independent post-emission measurement exists.
    // On an audit-blind deployment there is exactly one number per string — the profile's — and
    // nothing to compare it against, so `invalid` is unreachable and the receipt says so.
    for (const l of ctx.falsifiedLines()) {
      violations.push(`BOUND FALSIFIED: ${l.kind} ${l.label} observed ${l.cost.observed} > bound ${l.cost.bound}`);
    }
  }

  const exhausted = work.exhausted();
  const degradedReasons = [...reasons];
  if (undiscoveredScopes.length > 0) degradedReasons.push(`${undiscoveredScopes.length} scope(s) never examined`);
  if (clipped.length > 0) degradedReasons.push(`${clipped.length} candidate(s) clipped`);
  if (breadth === 'exhaustive' && (undiscoveredScopes.length > 0 || exhausted.length > 0))
    degradedReasons.push('exhaustive completion cannot be claimed: the work envelope ended first');

  let outcome: Outcome = degradedReasons.length > 0 ? 'degraded' : 'ok';
  let quarantined: string | undefined;
  if (violations.some((v) => v.startsWith('BOUND FALSIFIED') || v.startsWith('SILENT OVERRUN'))) {
    // #13: "A falsified conservative upper bound produces `invalid`, not degraded. Discard
    // content when detected before emission... quarantine the profile."
    outcome = 'invalid';
    quarantined = `${model.id}@${model.version}`;
    return {
      outcome,
      reasons: [`cost profile ${quarantined} was falsified; content discarded`, ...violations],
      budget: { allowance, reserve, spendable, contextSpent: req.output.invalidEnvelope.bound, floor },
      work: { spent: work.spent, envelope: req.envelope, exhausted },
      // Content discarded. Verdicts survive as counts only — they were computed under a
      // falsified bound, so naming anything would re-emit content the discard just removed.
      entries: [],
      omissions: {
        ...omissions,
        form: 'counted',
        clipped: [],
        filtered: [],
        unresolved: [],
        cost: priced(0, 0),
      },
      receipt: { ...receipt, selected: [], omissionForm: 'counted', cost: priced(0, 0) },
      query,
      violations,
      quarantined,
    };
  }

  return {
    outcome,
    reasons: degradedReasons,
    budget: { allowance, reserve, spendable, contextSpent: ctx.spent, floor },
    work: { spent: work.spent, envelope: req.envelope, exhausted },
    entries,
    omissions,
    receipt,
    query,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const add = (a: Priced, b: Priced): Priced => priced(a.bound + b.bound, a.observed + b.observed);
const mul = (a: Priced, n: number): Priced => priced(a.bound * n, a.observed * n);
function omissionExtras(
  uScopes: string[],
  uChannels: Set<string>,
  sScopes: string[],
  sChannels: Set<string>,
  unevaluated: { predicate: string; candidates: number }[],
  bypass: string[],
  cap: number,
): number {
  return (
    Math.min(uScopes.length, cap) + uChannels.size +
    Math.min(sScopes.length, cap) + sChannels.size +
    unevaluated.length + bypass.length
  );
}

const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter((x) => x.length > 0))];

function receiptBound(req: Request, lines: number): number {
  return req.output.receiptBase.bound + (lines + 2) * req.output.receiptPerLine.bound;
}

function ladderDownFrom(ladder: Tier[], asked: Tier): Tier[] {
  const i = ladder.indexOf(asked);
  const from = i === -1 ? ladder.length - 1 : i;
  return ladder.slice(0, from + 1).reverse();
}

/** #13: "Unknown tasks use the most conservative validated profile." Conservatism is
 *  allowance-dependent, because the profiles are not totally ordered — one has the larger
 *  fraction, another the larger minimum. So it is evaluated at THIS allowance. */
export function pickProfile(task: TaskKind | 'unknown', allowance: number): ReserveProfile {
  if (task !== 'unknown') {
    const p = RESERVE_PROFILES.find((x) => x.kind === task);
    if (p) return p;
  }
  return RESERVE_PROFILES.reduce((a, b) =>
    Math.max(b.minimum, Math.ceil(b.fraction * allowance)) > Math.max(a.minimum, Math.ceil(a.fraction * allowance)) ? b : a,
  );
}

/** #13: audits, migrations, validation and corpus-wide reviews use exhaustive. */
function defaultBreadth(task: TaskKind | 'unknown'): Breadth {
  return task === 'audit' || task === 'migration' || task === 'review' ? 'exhaustive' : 'satisfice';
}

function searchableText(k: Concept, seen: ObservedTier, probed: boolean): string {
  const parts: string[] = [k.id, k.path];
  if (atLeast(seen, 'title') && k.title) parts.push(k.title);
  if (atLeast(seen, 'line') && k.description) parts.push(k.description);
  if (atLeast(seen, 'card')) {
    if (k.type) parts.push(k.type);
    parts.push(...(k.tags ?? []));
  }
  if (probed) {
    if (k.preamble) parts.push(k.preamble);
    parts.push(...k.sections.map((s) => `${s.heading} ${s.text}`));
  }
  return parts.join(' ');
}

function sectionMatches(s: Section, query: Query): boolean {
  const text = `${s.heading} ${s.text}`;
  return query.clauses.some((c) => clauseMatches(c, text));
}

function scoreConcept(
  k: Concept,
  query: Query,
  seen: ObservedTier,
  probed: boolean,
  d: Dials,
  corpus: Corpus,
): { score: number; matched: Section[] } {
  let score = 0;
  const weights = corpus ? clauseWeights(corpus, query, d) : [];
  query.clauses.forEach((c, i) => {
    const w = weights[i] ?? 1;
    if (clauseMatches(c, `${k.id} ${k.path}`)) score += 2 * w;
    if (atLeast(seen, 'title') && k.title && clauseMatches(c, k.title)) score += 4 * w;
    if (atLeast(seen, 'line') && k.description && clauseMatches(c, k.description)) score += 3 * w;
    if (atLeast(seen, 'card')) {
      if (k.type && clauseMatches(c, k.type)) score += 1 * w;
      if ((k.tags ?? []).some((t) => clauseMatches(c, t))) score += 3 * w;
    }
    if (probed && k.sections.some((s) => clauseMatches(c, `${s.heading} ${s.text}`))) score += 3 * w;
  });
  const matched = probed ? k.sections.filter((s) => sectionMatches(s, query)) : [];
  return { score: Math.round(score), matched };
}

/**
 * DEPARTURE (proposed fix, off by default so the run shows both). #13 bans every cheap
 * discriminator by name — no stopword rule, no minimum term length, no stemming, no synonyms,
 * no importance field — and then defines sufficiency as bare clause coverage. Document
 * frequency is the one discriminator left standing: it is lexical, deterministic, needs no
 * calibration constant from #7, and it is computable from the inventory #13 already mandates.
 */
function clauseWeights(corpus: Corpus, query: Query, d: Dials): number[] {
  if (d.informativeness === 'off') return query.clauses.map(() => 1);
  const n = corpus.concepts.length || 1;
  return query.clauses.map((c) => {
    const df = corpus.concepts.filter((k) =>
      clauseMatches(c, `${k.id} ${k.title ?? ''} ${k.description ?? ''} ${k.preamble ?? ''} ${k.sections.map((s) => s.heading + ' ' + s.text).join(' ')}`),
    ).length;
    const share = df / n;
    return share > d.dfCeiling ? 0 : 1;
  });
}

/**
 * #13's stop rule: "Satisficing stops only when a calibrated evidence rule finds that one
 * candidate or a coherent linked evidence set covers every retained query clause. Terms
 * appearing in unrelated concepts do not establish sufficiency."
 *
 * "Coherent" is used twice in #13 and defined nowhere. Its two defensible extremes are exactly
 * the two rules the resolution was choosing between: at `single`, coverage by one concept — a
 * rule so strict that satisfice degenerates into exhaustive-bounded-by-the-work-cap. At
 * `component`, coverage by any connected set — and since index files link every concept in a
 * directory, that is #28's union rule under a new name. The dial makes the collapse visible.
 */
export function evidenceSufficient(
  corpus: Corpus,
  query: Query,
  observed: Map<string, ObservedTier>,
  probed: Set<string>,
  d: Dials,
): { sufficient: boolean; covered: number; required: number; by: string[] } {
  const weights = clauseWeights(corpus, query, d);
  const required = query.clauses.map((_, i) => i).filter((i) => weights[i] > 0);
  if (required.length === 0) return { sufficient: false, covered: 0, required: 0, by: [] };

  const seenConcepts = corpus.concepts.filter((k) => atLeast(observed.get(k.id) ?? 'none', 'title'));
  const coverOf = (k: Concept) => {
    const text = searchableText(k, observed.get(k.id) ?? 'none', probed.has(k.id));
    return new Set(required.filter((i) => clauseMatches(query.clauses[i], text)));
  };

  const groups: Concept[][] =
    d.coherence === 'single'
      ? seenConcepts.map((k) => [k])
      : d.coherence === 'linked'
        ? seenConcepts.map((k) => [k, ...seenConcepts.filter((o) => k.links.includes(o.id) || o.links.includes(k.id))])
        : [seenConcepts];

  let best: { covered: number; by: string[] } = { covered: 0, by: [] };
  for (const g of groups) {
    const union = new Set<number>();
    for (const k of g) for (const i of coverOf(k)) union.add(i);
    if (union.size > best.covered) best = { covered: union.size, by: g.map((k) => k.id) };
  }
  return { sufficient: best.covered === required.length, covered: best.covered, required: required.length, by: best.by };
}

function refuse(
  corpus: Corpus,
  req: Request,
  query: Query,
  outcome: Outcome,
  reasons: string[],
  allowance: number,
  reserve: number,
  violations: string[],
  unresolved: string[] = [],
): Result {
  // Every exit point emits the same shape and runs the same audit. #28's refusal path skipped
  // the verifier and returned before demands were resolved, so a broken reference vanished from
  // a refusal that should have named it.
  const cost = req.output.invalidEnvelope;
  const spendable = allowance - reserve;
  // A refusal is itself model-visible output, so it is charged like everything else. When it does
  // not fit, that is unplanned spend — #13 requires recording it ("record the unplanned spend")
  // and this is the one path where it is unavoidable: there is no smaller way to say no.
  const unplanned = Math.max(0, cost.bound - Math.max(0, spendable));
  if (unplanned > 0) {
    violations.push(`UNPLANNED SPEND: the refusal envelope costs ${cost.bound} against ${spendable} spendable`);
  }
  return {
    outcome,
    reasons,
    budget: { allowance, reserve, spendable, contextSpent: cost.bound, floor: 0 },
    work: { spent: { ...NO_WORK }, envelope: req.envelope, exhausted: [] },
    entries: unresolved.map((ref) => ({
      id: ref,
      verdict: 'UNRESOLVED' as const,
      score: 0,
      observed: 'none' as const,
      cost: priced(0, 0),
      summary: 'exact demand did not resolve',
      detail: 'no concept, path or source reference matched it',
      nextAction: 'check the reference',
    })),
    omissions: {
      form: unresolved.length > 0 ? 'named' : 'none',
      clipped: [],
      clippedCount: 0,
      filtered: [],
      filteredCount: 0,
      missCount: 0,
      undiscovered: { scopes: [], scopeCount: 0, channels: [] },
      unsearched: { scopes: [], scopeCount: 0, channels: [] },
      unresolved,
      unevaluatedPredicates: [],
      bypassWarnings: [],
      aliasExpansions: [],
      cost,
    },
    receipt: {
      scopeSnapshot: `${corpus.key}@${corpus.concepts.length}`,
      deployment: req.declaration.deployment,
      seam: req.declaration.seam,
      provenance: req.declaration.provenance,
      allowanceSource: 'n/a',
      reserveProfile: 'n/a',
      breadth: req.breadth ?? 'satisfice',
      stopReason: reasons[0] ?? 'refused',
      selected: [],
      contextLines: [{ label: 'REFUSAL envelope', bound: cost.bound, charged: cost.bound, observed: req.declaration.auditCapable ? cost.observed : null }],
      workSpend: { ...NO_WORK },
      costProfile: req.declaration.costModelId,
      serializerVersion: 'n/a',
      policyVersion: 'policy/1',
      omissionForm: unresolved.length > 0 ? 'named' : 'none',
      boundStatus: req.declaration.auditCapable ? 'verified' : 'unverified',
      cost,
    },
    query,
    violations,
  };
}
