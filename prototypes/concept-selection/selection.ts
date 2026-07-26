/**
 * PROTOTYPE — budget-aware concept selection.
 *
 * QUESTION BEING PROTOTYPED (wayfinder #28)
 *   When a user drives a retrieval model with a query, task context, an explicit token budget,
 *   and a representative fixture bundle, which exact-link, path, index, tag, keyword-ranking and
 *   progressive-disclosure behavior returns a relevant concept set while visibly reserving budget
 *   for the rest of the agent operation and never silently overrunning the supplied limit?
 *
 * This module is the only part worth keeping: a pure selector over an injected corpus, an injected
 * request and an injected estimator. No I/O, no clock, no randomness, no tokenizer, no harness
 * coupling, no cache. Every number it reports is an *estimate* derived from observable characters.
 *
 * Deliberately outside it:
 *   - semantic / vector retrieval (excluded by the ticket)
 *   - concept identity, cross-bundle precedence, dedup .......... #22
 *   - redirects, tombstones, inbound-link rewriting ............. #24
 *   - what may be cached and what invalidates it ................ #32
 *   - how freshness is computed (`stale` is injected) ........... #12
 *   - whether deprecated concepts are hidden by default ......... #14
 *   - the adopted numeric defaults (every dial is a candidate) .. #7 / #13
 *   - where the budget number comes from ........................ #13
 *
 * Section citations (§) point at docs/research/ on `main`:
 *   §spec = 02-okf-v02-spec.md   §ws = workspace-topology-and-routing.md
 *   §life = lifecycle-dimensions.md
 */

// ---------------------------------------------------------------------------
// 1. The corpus — what a selector may know before it has spent anything
// ---------------------------------------------------------------------------

/**
 * The four things a concept can be loaded *as*. Progressive disclosure is not a navigation
 * sequence here, it is the unit of allocation: selection picks a (concept, tier) pair.
 */
export type Tier = 'LINE' | 'CARD' | 'SECTION' | 'FULL';
export const TIERS: Tier[] = ['LINE', 'CARD', 'SECTION', 'FULL'];

/** How much of a concept has already been paid for by a discovery purchase. */
export type Seen = 'path' | 'title' | 'line' | 'card';
const SEEN_ORDER: Seen[] = ['path', 'title', 'line', 'card'];
const atLeast = (s: Seen, want: Seen) => SEEN_ORDER.indexOf(s) >= SEEN_ORDER.indexOf(want);

export interface Section {
  heading: string;
  /** Words in this section's body that appear nowhere in the frontmatter. Only a PROBE reveals them. */
  terms: string[];
  chars: number;
  /** Ground-truth tokens. Known to the fixture, never to the selector's arithmetic. */
  actual: number;
}

export interface Concept {
  id: string; // path minus `.md` (§ concept documents)
  dir: string; // directory holding it; '' is the bundle root
  type: string; // the only always-required frontmatter key (§ frontmatter)
  /** RECOMMENDED, not required: a concept carrying only `type` is conformant. */
  title?: string;
  description?: string;
  tags?: string[]; // RECOMMENDED, frequently absent
  /** Canonical URI of the asset this concept *describes*. */
  resource?: string;
  /**
   * Source artefacts this concept was derived from — the code-backed join key. Injected, and
   * deliberately not named after any frontmatter field: whether traceability lives in `sources`,
   * `source_files`, `derived_from` or a namespaced extension is #12's decision, not this
   * prototype's. Overloading `resource` for it (as an earlier draft did) would have decided it.
   */
  sourceRefs?: string[];
  /** Open by construction: consumers MUST tolerate unknown values, so this is not a closed union. */
  status?: string;
  /**
   * Injected. The spec already defines the `stale_after` date comparison; what #12 owns is
   * evidence-based freshness, and either way computing it is not this prototype's job.
   */
  stale: boolean;
  sections: Section[];
  /** Outgoing markdown links: untyped, possibly broken (§ links). */
  links: string[];
  chars: { LINE: number; CARD: number };
  actual: { LINE: number; CARD: number };
}

/** A directory `index.md`: a bulk purchase of the LINE tier for everything it lists (§ index files). */
export interface IndexDoc {
  dir: string;
  entries: string[];
  /** Entries SHOULD carry the linked concept's `description`; real bundles ship bare link lists too. */
  withDescriptions: boolean;
  chars: number;
  actual: number;
}

export interface Corpus {
  key: string;
  name: string;
  note: string;
  concepts: Concept[];
  indexes: IndexDoc[];
  /** The `glob` listing: every path, no content. */
  pathListChars: number;
  pathListActual: number;
}

// ---------------------------------------------------------------------------
// 2. The request — everything the selector is given, nothing it goes and gets
// ---------------------------------------------------------------------------

/** #6 owns this taxonomy; the selector reads only a reserve fraction off it. */
export type TaskKind = 'feature' | 'fix' | 'debugging' | 'exploration' | 'research' | 'review' | 'pre-pr';
export const TASKS: TaskKind[] = ['feature', 'fix', 'debugging', 'exploration', 'research', 'review', 'pre-pr'];

/**
 * Three-valued, following #29's attestation pattern rather than collapsing to a boolean:
 *
 *   explicit   the harness reported a real per-operation budget — proceed
 *   estimated  a number was derived from something else (a declared window, a heuristic) —
 *              proceed with it, but report degraded, because it is not what it claims to be
 *   unknown    nothing was reported — fall back to the floor and report degraded
 *
 * Collapsing `estimated` into `explicit` tells the human a guess is a fact; collapsing it into
 * `unknown` throws away a number that was better than the floor.
 */
export interface Budget {
  total: number;
  source: 'explicit' | 'estimated' | 'unknown';
}

/**
 * The tokenizer-free estimator. No harness hands a skill a tokenizer, so every token figure is
 * characters ÷ a divisor — Codex's own fallback is expressed in characters for want of anything
 * better, though that is a startup-listing budget and not evidence about retrieval.
 *
 * A divisor is a ceiling **only if it is at or below the densest content in the corpus**. There is
 * no universally safe constant: the three below are fixture-calibrated, not measured, and which
 * divisor is safe for real bundles is a measurement #7 owes. `LOOSE` exists to show the failure.
 */
export interface Estimator {
  name: string;
  charsPerToken: number;
}
export const CEILING: Estimator = { name: 'ceiling · chars ÷ 2.9', charsPerToken: 2.9 };
export const LOOSE: Estimator = { name: 'loose · chars ÷ 3.2', charsPerToken: 3.2 };
export const MEAN: Estimator = { name: 'mean · chars ÷ 4.0', charsPerToken: 4.0 };
export const ESTIMATORS: Estimator[] = [CEILING, LOOSE, MEAN];

/**
 * Every value here is a **candidate** awaiting the fixture benchmarks #7 demands. They are dials
 * on the TUI precisely so that nothing in this prototype reads as an adopted default.
 */
export interface Dials {
  reserveFraction: Record<TaskKind, number>;
  /** Stand-in total used when the harness reports no budget. */
  unknownBudgetFloor: number;
  /** Deepest tier a *ranked* (non-pinned) concept may reach. */
  maxRankedTier: Tier;
  strongScore: number;
  mediumScore: number;
  /** #14 owns both defaults; here they are visible switches, and the boot values decide nothing. */
  includeDeprecated: boolean;
  includeDraft: boolean;
  stalePenalty: number;
  allowProbe: boolean;
  /** Keep buying channels after every query term is explained. */
  exhaustiveDiscovery: boolean;
  probeBaseChars: number;
  probeHitChars: number;
  /** `grep -m`: the match cap the probe is priced at before it runs. */
  probeMaxHits: number;
  wTitle: number;
  wDescription: number;
  wTag: number;
  wType: number;
  wPath: number;
  wBody: number;
  wLinkedToPin: number;
  wSameDirAsPin: number;
  /** Notice pricing, in tokens — the notice is generated prose, not a file on disk. */
  noticeBase: number;
  noticeNamed: number;
  noticeCounted: number;
  /** Share of the spendable budget above which the notice collapses from named to counted. */
  noticeShareCap: number;
}

export const DEFAULT_DIALS: Dials = {
  reserveFraction: {
    debugging: 0.45,
    fix: 0.4,
    feature: 0.35,
    review: 0.3,
    'pre-pr': 0.3,
    exploration: 0.25,
    research: 0.2,
  },
  unknownBudgetFloor: 4000,
  maxRankedTier: 'FULL',
  strongScore: 55,
  mediumScore: 25,
  includeDeprecated: false,
  includeDraft: true,
  stalePenalty: 20,
  allowProbe: true,
  exhaustiveDiscovery: false,
  probeBaseChars: 240,
  probeHitChars: 130,
  probeMaxHits: 12,
  wTitle: 30,
  wDescription: 12,
  wTag: 20,
  wType: 10,
  wPath: 15,
  wBody: 8,
  wLinkedToPin: 18,
  wSameDirAsPin: 6,
  noticeBase: 18,
  noticeNamed: 12,
  noticeCounted: 14,
  noticeShareCap: 0.1,
};

export interface Request {
  query: string;
  task: TaskKind;
  /**
   * Paths, ids or source files named by the human or by the task (a changed file, a link the
   * agent is already holding). These are demands, not candidates.
   */
  exact: string[];
  budget: Budget;
  estimator: Estimator;
  dials: Dials;
}

// ---------------------------------------------------------------------------
// 3. The plan — what comes back
// ---------------------------------------------------------------------------

/**
 * Five ways out, because five different things fix them. Collapsing any two produces a message the
 * human cannot act on (#29's REFUSE/EXPIRE split, applied to reads).
 *
 *   CLIPPED       matched, could not be afforded          → raise the budget / pin it
 *   MISS          looked at, nothing matched              → change the query
 *   UNDISCOVERED  never looked at: the channel that would → raise the budget
 *                 have read it cost more than was left
 *   UNSEARCHED    never looked at: discovery stopped       → broaden the query, or
 *                 because every query term was already     switch discovery to exhaustive
 *                 explained somewhere cheaper
 *   FILTERED      excluded by a status policy             → change the policy
 *
 * UNDISCOVERED and UNSEARCHED look identical from outside — an unread directory — and mean
 * opposite things. One is poverty, the other is a satisficing rule doing its job.
 */
export type Verdict =
  | 'PINNED'
  | 'SELECTED'
  | 'CLIPPED'
  | 'MISS'
  | 'UNDISCOVERED'
  | 'UNSEARCHED'
  | 'FILTERED'
  | 'UNRESOLVED';

export interface Entry {
  id: string;
  verdict: Verdict;
  tier?: Tier;
  /** The tier this concept asked for, when it could not be afforded. */
  askedTier?: Tier;
  score: number;
  seen: Seen;
  signals: string[];
  cost: number;
  actual: number;
  /** #29 invariant 1, as a data structure rather than a convention. */
  summary: string;
  detail: string;
  nextAction: string;
}

export type LineKind = 'RESERVE' | 'DISCOVERY' | 'PIN' | 'RANKED' | 'NOTICE';
export interface SpendLine {
  kind: LineKind;
  label: string;
  cost: number;
  actual: number;
  why: string;
}

export interface Notice {
  form: 'none' | 'named' | 'counted';
  clipped: string[];
  /** Directories the budget could not afford to read. */
  undiscovered: string[];
  /** Directories discovery chose not to read, because the query was already explained. */
  unsearched: string[];
  unresolved: string[];
  filtered: string[];
  /** Candidates ranked without their frontmatter ever read — status and tags invisible. */
  unstatused: number;
  missed: number;
  cost: number;
}

export interface Plan {
  outcome: 'ok' | 'degraded' | 'insufficient';
  reasons: string[];
  budget: {
    total: number;
    reserve: number;
    spendable: number;
    spent: number;
    free: number;
    actualSpent: number;
    source: 'explicit' | 'unknown';
    estimator: string;
  };
  lines: SpendLine[];
  entries: Entry[];
  notice: Notice;
  terms: string[];
  /** Terms no channel ever explained. Drives discovery escalation, then honesty. */
  unexplained: string[];
  /** Empty on a healthy run. A non-empty list is the prototype telling on itself. */
  violations: string[];
}

// ---------------------------------------------------------------------------
// 4. Costing
// ---------------------------------------------------------------------------

const est = (chars: number, e: Estimator) => Math.ceil(chars / e.charsPerToken);

/** Raw characters of `c` at `tier`, ignoring anything already paid for. */
export function tierChars(c: Concept, tier: Tier, matched: Section[]): number {
  const line = c.chars.LINE;
  const card = line + c.chars.CARD;
  switch (tier) {
    case 'LINE':
      return line;
    case 'CARD':
      return card;
    case 'SECTION':
      return card + matched.reduce((n, s) => n + s.chars, 0);
    case 'FULL':
      return card + c.sections.reduce((n, s) => n + s.chars, 0);
  }
}

/**
 * What `tier` costs *now*, given what discovery already put in context. Buying a directory's
 * `index.md` pre-pays the LINE tier for everything it lists; a frontmatter scan pre-pays CARD.
 * This is why the index/scan choice is an investment decision and not a lookup.
 */
function chargeableChars(c: Concept, tier: Tier, matched: Section[], seen: Seen): number {
  const line = atLeast(seen, 'line') ? 0 : c.chars.LINE;
  const card = line + (atLeast(seen, 'card') ? 0 : c.chars.CARD);
  switch (tier) {
    case 'LINE':
      return line;
    case 'CARD':
      return card;
    case 'SECTION':
      return card + matched.reduce((n, s) => n + s.chars, 0);
    case 'FULL':
      return card + c.sections.reduce((n, s) => n + s.chars, 0);
  }
}

function chargeableActual(c: Concept, tier: Tier, matched: Section[], seen: Seen): number {
  const line = atLeast(seen, 'line') ? 0 : c.actual.LINE;
  const card = line + (atLeast(seen, 'card') ? 0 : c.actual.CARD);
  switch (tier) {
    case 'LINE':
      return line;
    case 'CARD':
      return card;
    case 'SECTION':
      return card + matched.reduce((n, s) => n + s.actual, 0);
    case 'FULL':
      return card + c.sections.reduce((n, s) => n + s.actual, 0);
  }
}

// ---------------------------------------------------------------------------
// 5. Query terms — no stemming, no synonyms, no expansion. Nothing in the OKF
//    ecosystem does any of it, and faking it here would hide the limitation.
// ---------------------------------------------------------------------------

/** Not a dial, and it should be: both of these are unbenchmarked and English-only. */
const MIN_TERM = 3;
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'how', 'does', 'what', 'why', 'this', 'that', 'from', 'into', 'our',
  'are', 'was', 'you', 'about', 'when', 'where', 'which', 'who', 'has', 'have', 'its', 'per',
]);

export function terms(query: string): string[] {
  const out: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < MIN_TERM || STOPWORDS.has(raw) || out.includes(raw)) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Tokens thrown away for being too short. `v2`, `P0`, `id` and `AI` are all real queries, so the
 * cut-off is reported rather than applied in silence — a dropped token can never show up as
 * unexplained, because it never became a term.
 */
export function droppedTerms(query: string): string[] {
  const out: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 0 && raw.length < MIN_TERM && !out.includes(raw)) out.push(raw);
  }
  return out;
}

const hits = (haystack: string, ts: string[]) => ts.filter((t) => haystack.toLowerCase().includes(t));

// ---------------------------------------------------------------------------
// 6. The selector
// ---------------------------------------------------------------------------

interface Candidate {
  c: Concept;
  score: number;
  signals: string[];
  matched: Section[];
  seen: Seen;
}

export function select(corpus: Corpus, req: Request): Plan {
  const d = req.dials;
  const e = req.estimator;
  const ts = terms(req.query);
  const lines: SpendLine[] = [];
  const reasons: string[] = [];

  // -- Phase BUDGET ---------------------------------------------------------
  // The reserve is carved out *first*. Checking a total after ranking is not reserving: by then
  // the ranker has already decided how to spend money it never had.
  const degraded = req.budget.source !== 'explicit';
  const total = req.budget.source === 'unknown' ? d.unknownBudgetFloor : req.budget.total;
  if (req.budget.source === 'unknown')
    reasons.push(`budget source unknown — falling back to the ${d.unknownBudgetFloor}-token floor, reporting degraded rather than blocking`);
  if (req.budget.source === 'estimated')
    reasons.push(`budget was estimated, not reported — the ${total}-token total is used as given, but every figure below inherits its uncertainty`);
  const nullQuery = ts.length === 0;
  if (nullQuery)
    reasons.push(
      req.query.trim() === ''
        ? 'no query: nothing was searched for, and only exact references can select anything'
        : `no term survived "${req.query}" — every word was a stopword or shorter than the minimum, so nothing was searched for`,
    );
  const dropped = droppedTerms(req.query);
  if (dropped.length > 0)
    reasons.push(`dropped as too short to be a term: ${dropped.map((t) => `"${t}"`).join(', ')} — they can never appear as unexplained, because they never became terms`);
  const reserve = Math.ceil(total * d.reserveFraction[req.task]);
  const spendable = total - reserve;
  lines.push({
    kind: 'RESERVE',
    label: `reserve · ${req.task} · ${Math.round(d.reserveFraction[req.task] * 100)}%`,
    cost: reserve,
    actual: reserve,
    why: 'held back for the rest of the operation before anything is selected',
  });

  let spent = 0;
  let actualSpent = 0;
  const charge = (line: SpendLine) => {
    lines.push(line);
    spent += line.cost;
    actualSpent += line.actual;
  };
  const remaining = () => spendable - spent;

  // -- Phase PIN ------------------------------------------------------------
  // An exact reference is a demand, not a candidate: resolved before ranking, never ranked away.
  const byId = new Map(corpus.concepts.map((c) => [c.id, c]));
  const pins: Concept[] = [];
  const unresolved: string[] = [];
  for (const ref of req.exact) {
    const norm = ref.replace(/\.md$/, '');
    // Exact means exact: a concept id, or an artefact the concept declares. Resolving a bare
    // basename against any directory would be a lookup rule, and #22 owns lookup rules — an
    // earlier draft's `endsWith('/' + name)` fallback silently picked the first of several
    // same-named concepts.
    const found =
      byId.get(norm) ??
      corpus.concepts.find((c) => c.resource === ref || c.sourceRefs?.includes(ref));
    if (found) {
      if (!pins.includes(found)) pins.push(found);
    } else if (!unresolved.includes(norm)) unresolved.push(norm);
  }

  // There is a floor below which no honest answer exists: the path list is the cheapest possible
  // discovery, and a report of what was omitted is not optional. A budget that cannot cover both is
  // refused before a single token is spent, rather than spent down to a misleading answer. The
  // check sits *after* pin resolution — which is pure lookup and costs nothing — so a refusal can
  // still name a reference that resolves to nothing.
  const floorCost = est(corpus.pathListChars, e) + d.noticeBase + d.noticeCounted;
  if (spendable < floorCost) {
    return insufficient(corpus, req, lines, reasons, total, reserve, spendable, 0, 0, ts, unresolved, e,
      `${spendable} spendable tokens cannot cover the path list (${est(corpus.pathListChars, e)}) plus the smallest possible omission notice (${d.noticeBase + d.noticeCounted}) — nothing can be selected honestly`);
  }

  // -- Phase DISCOVER -------------------------------------------------------
  // Discovery is not free, so a budgeted selector must pay for the right to rank. Channels are
  // bought in escalating order and only while query terms remain unexplained — the escalation
  // stops as soon as the query is accounted for, or the money runs out.
  const seen = new Map<string, Seen>(corpus.concepts.map((c) => [c.id, 'path' as Seen]));
  const bump = (id: string, s: Seen) => {
    if (!atLeast(seen.get(id)!, s)) seen.set(id, s);
  };

  charge({
    kind: 'DISCOVERY',
    label: `paths · ${corpus.concepts.length} ids`,
    cost: est(corpus.pathListChars, e),
    actual: corpus.pathListActual,
    why: 'the floor: ids and path segments, no content — bought unconditionally',
  });

  // A term the probe found in a body is explained too — otherwise the selector reports a term as
  // unexplained after having just paid to find it.
  const probedTerms = new Set<string>();
  const explained = (t: string) =>
    probedTerms.has(t) ||
    corpus.concepts.some((c) => {
      const s = seen.get(c.id)!;
      if (c.id.replace(/[/-]/g, ' ').toLowerCase().includes(t)) return true;
      if (atLeast(s, 'title') && (c.title ?? '').toLowerCase().includes(t)) return true;
      if (atLeast(s, 'line') && (c.description ?? '').toLowerCase().includes(t)) return true;
      if (atLeast(s, 'card') && `${(c.tags ?? []).join(' ')} ${c.type}`.toLowerCase().includes(t)) return true;
      return false;
    });
  const unexplained = () => ts.filter((t) => !explained(t));

  // Pins are honored before ranked candidates, and the omission notice is honored before both, so
  // discovery may never eat the money that owes them. `noticeFloor` grows as more things are known
  // to be omissible; it is the same function the allocator reserves against, which is what keeps
  // the final notice from being the line that overruns the budget.
  const unaffordable = new Set<string>();
  const knownNamed = () => unresolved.length + unaffordable.size;
  const noticeFloor = () =>
    pins.reduce((n, c) => n + est(chargeableChars(c, 'LINE', [], seen.get(c.id)!), e), 0) +
    noticeReserve(d, knownNamed(), spendable);

  // Buy where the free channel already points: directories whose paths carry a query term first.
  const pathScore = (dir: string) =>
    corpus.concepts.filter((c) => c.dir === dir && hits(c.id.replace(/[/-]/g, ' '), ts).length > 0).length;
  const dirs = directories(corpus).sort((a, b) => pathScore(b) - pathScore(a));

  // (a) indexes — the cheap bulk purchase of title + description
  for (const dir of dirs) {
    if (!d.exhaustiveDiscovery && unexplained().length === 0) break;
    const idx = corpus.indexes.find((i) => i.dir === dir);
    if (!idx) continue;
    const cost = est(idx.chars, e);
    if (cost > remaining() - noticeFloor()) {
      unaffordable.add(dir);
      continue;
    }
    charge({
      kind: 'DISCOVERY',
      label: `index · ${dir || '(root)'} · ${idx.entries.length} entries`,
      cost,
      actual: idx.actual,
      why: idx.withDescriptions
        ? 'pre-pays the LINE tier for every concept it lists'
        : 'link list without descriptions — pre-pays a bare title, not a description (§spec §8)',
    });
    // A bare link list buys titles and nothing else, so it neither unlocks description scoring nor
    // pre-pays the LINE tier — otherwise the cheaper, less informative index would be strictly
    // better than the richer one, which is how an unused `withDescriptions` flag hides a bug.
    for (const id of idx.entries) bump(id, idx.withDescriptions ? 'line' : 'title');
  }

  // (b) frontmatter scans — the only channel that reveals tags, type and status
  for (const dir of dirs) {
    if (!d.exhaustiveDiscovery && unexplained().length === 0) break;
    const inDir = corpus.concepts.filter((c) => c.dir === dir);
    const cost = inDir.reduce((n, c) => n + est(chargeableChars(c, 'CARD', [], seen.get(c.id)!), e), 0);
    if (cost === 0) continue;
    if (cost > remaining() - noticeFloor()) {
      unaffordable.add(dir);
      continue;
    }
    charge({
      kind: 'DISCOVERY',
      label: `scan · ${dir || '(root)'} · ${inDir.length} cards`,
      cost,
      actual: inDir.reduce((n, c) => n + chargeableActual(c, 'CARD', [], seen.get(c.id)!), 0),
      why: 'tags, type and status exist nowhere else — an index cannot answer a tag query (§spec §8)',
    });
    for (const c of inDir) bump(c.id, 'card');
  }

  // (c) the probe — the only channel that sees words the frontmatter never mentions, and the only
  // one whose cost scales with how well the query matches. Bought last, and often not at all.
  //
  // It is priced at its **cap** rather than at its result count: a real grep hands back its output
  // before anything can count it, so pricing from the number of matches would be an oracle. The
  // cap is `grep -m` — the affordability test uses the bound, the ledger charges what came back,
  // and matches beyond the cap are reported as unread rather than silently missed.
  let probed = false;
  const probedSections = new Set<Section>();
  if (d.allowProbe && ts.length > 0 && (d.exhaustiveDiscovery || unexplained().length > 0)) {
    const bound = est(d.probeBaseChars + d.probeMaxHits * d.probeHitChars, e);
    if (bound <= remaining() - noticeFloor()) {
      const found = corpus.concepts.flatMap((c) => c.sections.filter((s) => hits(s.heading + ' ' + s.terms.join(' '), ts).length > 0));
      const kept = found.slice(0, d.probeMaxHits);
      probed = true;
      for (const sec of kept) {
        probedSections.add(sec);
        for (const t of hits(sec.heading + ' ' + sec.terms.join(' '), ts)) probedTerms.add(t);
      }
      charge({
        kind: 'DISCOVERY',
        label: `probe · ${kept.length} of at most ${d.probeMaxHits} body hits`,
        cost: est(d.probeBaseChars + kept.length * d.probeHitChars, e),
        actual: est(d.probeBaseChars + kept.length * d.probeHitChars, e),
        why: `priced at the ${d.probeMaxHits}-match cap before it ran (${bound}), charged for what came back — grep output enters context line by line`,
      });
      if (found.length > kept.length)
        reasons.push(`probe truncated at ${d.probeMaxHits} matches: ${found.length - kept.length} further body matches were not read`);
    } else {
      reasons.push(`probe skipped: up to ${bound} tokens of grep output would leave nothing for the pins and the omission notice`);
    }
  }

  const unreadDirs = dirs.filter((dir) => corpus.concepts.filter((c) => c.dir === dir).every((c) => seen.get(c.id) === 'path'));
  const undiscoveredDirs = unreadDirs.filter((dir) => unaffordable.has(dir)).map((dir) => dir || '(root)');
  const unsearchedDirs = unreadDirs.filter((dir) => !unaffordable.has(dir)).map((dir) => dir || '(root)');

  // -- Phase RANK -----------------------------------------------------------
  const pinIds = new Set(pins.map((c) => c.id));
  const pinDirs = new Set(pins.map((c) => c.dir));
  const pinLinks = new Set(pins.flatMap((c) => c.links));
  const candidates: Candidate[] = [];
  const filtered: string[] = [];
  let unstatused = 0;

  for (const c of corpus.concepts) {
    if (pinIds.has(c.id)) continue;
    const s = seen.get(c.id)!;

    // Status filtering is not free: on a budget too small to scan frontmatter, a deprecated
    // concept is indistinguishable from a live one. The filter can only act on what was read.
    if (atLeast(s, 'card')) {
      if (c.status === 'deprecated' && !d.includeDeprecated) {
        filtered.push(c.id);
        continue;
      }
      if (c.status === 'draft' && !d.includeDraft) {
        filtered.push(c.id);
        continue;
      }
    } else {
      // Counting only the non-stable ones would read the field this branch exists to say was
      // never read. All the selector knows is that it ranked something blind.
      unstatused++;
    }

    const signals: string[] = [];
    let score = 0;
    const add = (n: number, why: string) => {
      if (n > 0) {
        score += n;
        signals.push(why);
      }
    };

    const pathHits = hits(c.id.replace(/[/-]/g, ' '), ts);
    add(pathHits.length * d.wPath, `path:${pathHits.join('+')}`);

    if (atLeast(s, 'title')) {
      const titleHits = hits(c.title ?? '', ts);
      add(titleHits.length * d.wTitle, `title:${titleHits.join('+')}`);
    }
    if (atLeast(s, 'line')) {
      const descHits = hits(c.description ?? '', ts);
      add(descHits.length * d.wDescription, `desc:${descHits.join('+')}`);
    }
    if (atLeast(s, 'card')) {
      const tagHits = hits((c.tags ?? []).join(' '), ts);
      const typeHits = hits(c.type, ts);
      add(tagHits.length * d.wTag, `tag:${tagHits.join('+')}`);
      add(typeHits.length * d.wType, `type:${typeHits.join('+')}`);
      if ((c.tags ?? []).length === 0) signals.push('untagged');
    }

    const matched: Section[] = [];
    for (const sec of c.sections) {
      if (!probedSections.has(sec)) continue;
      const sh = hits(sec.heading + ' ' + sec.terms.join(' '), ts);
      matched.push(sec);
      add(sh.length * d.wBody, `body:${sec.heading}`);
    }

    // Links are untyped (§spec §6), so proximity to a pin is a hint, never an inclusion rule: an
    // untyped edge cannot distinguish "you need this" from "see also".
    if (pinLinks.has(c.id)) add(d.wLinkedToPin, 'linked-from-pin');
    if (pinDirs.has(c.dir)) add(d.wSameDirAsPin, 'same-dir-as-pin');

    // A penalty may demote a match but must never delete it: pushed to zero, a stale concept
    // becomes indistinguishable from one that matched nothing, and the human is told the bundle
    // has no answer when it has an old one. Floor of 1 = "ranked last, still named".
    if (c.stale && score > 0) {
      const demoted = Math.max(1, score - d.stalePenalty);
      signals.push(`stale ${score} → ${demoted}`);
      score = demoted;
    }
    candidates.push({ c, score, signals, matched, seen: s });
  }
  candidates.sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));

  // -- Phase ALLOCATE -------------------------------------------------------
  const entries: Entry[] = [];
  const clipped: string[] = [];
  const undiscovered: string[] = [];
  const unsearched: string[] = [];
  let missed = 0;

  // Pins first, degrading down the ladder rather than dropping: a concept the human named is more
  // useful as a title than as an absence, because absence reads as "the bundle has nothing".
  // A pin's SECTION tier may only use sections the probe actually returned: knowing which section
  // matches is exactly what the probe was paid for, and a pin does not get it for free.
  const pinPlans = pins.map((c) => ({
    c,
    matched: c.sections.filter((s) => probedSections.has(s)),
    tier: 'FULL' as Tier,
    asked: 'FULL' as Tier,
  }));
  const pinCost = () =>
    pinPlans.reduce((n, p) => n + est(chargeableChars(p.c, p.tier, p.matched, seen.get(p.c.id)!), e), 0);
  const fixedNamed = unresolved.length + undiscoveredDirs.length + unsearchedDirs.length + filtered.length;
  // Reserve only what is *already* known to be omissible. Reserving for the ranked fill's worst
  // case as well made a pin that costs nothing — its LINE tier already pre-paid by an index —
  // refuse the whole selection with tokens to spare, and made the refusal non-monotone in the
  // budget: ok at 700, refused at 900, ok again at 4,000. The ranked loop reserves for its own
  // pending clips as it goes, and the final collapse backstops both.
  const pinBudget = remaining() - noticeReserve(d, fixedNamed, spendable);
  // Degrade the most expensive pin first: it frees the most budget per step, so fewer pins are
  // degraded overall. The order references were typed in is not a priority signal, and letting it
  // decide which one survives at FULL would be a ranking rule the human cannot see.
  const byCost = [...pinPlans].sort(
    (a, b) =>
      est(chargeableChars(b.c, 'FULL', b.matched, seen.get(b.c.id)!), e) -
      est(chargeableChars(a.c, 'FULL', a.matched, seen.get(a.c.id)!), e),
  );
  for (const floor of ['SECTION', 'CARD', 'LINE'] as Tier[]) {
    if (pinCost() <= pinBudget) break;
    for (const p of byCost) {
      if (pinCost() <= pinBudget) break;
      if (TIERS.indexOf(p.tier) > TIERS.indexOf(floor)) p.tier = floor;
    }
  }
  if (pins.length > 0 && pinCost() > Math.max(pinBudget, 0)) {
    // Even at LINE the pins do not fit. A partial answer here would be the silent overrun in a
    // different costume, so the selection refuses and says by how much.
    return insufficient(corpus, req, lines, reasons, total, reserve, spendable, spent, actualSpent, ts, unresolved, e,
      `the ${pins.length} exact reference(s) cost ${pinCost()} at the LINE tier; ${Math.max(pinBudget, 0)} spendable tokens remain — short by ${pinCost() - Math.max(pinBudget, 0)}`);
  }

  for (const p of pinPlans) {
    const s = seen.get(p.c.id)!;
    const cost = est(chargeableChars(p.c, p.tier, p.matched, s), e);
    const askedCost = est(chargeableChars(p.c, p.asked, p.matched, s), e);
    charge({
      kind: 'PIN',
      label: `${p.c.id} @ ${p.tier}`,
      cost,
      actual: chargeableActual(p.c, p.tier, p.matched, s),
      why: 'named by the human or the task — honored before anything is ranked',
    });
    const full = p.tier === p.asked;
    entries.push({
      id: p.c.id,
      verdict: 'PINNED',
      tier: p.tier,
      askedTier: p.asked,
      score: Number.POSITIVE_INFINITY,
      seen: s,
      signals: ['exact reference'],
      cost,
      actual: chargeableActual(p.c, p.tier, p.matched, s),
      summary: full ? `pinned at ${p.tier}` : `pinned, degraded ${p.asked} → ${p.tier}`,
      detail: full ? `asked ${p.asked}, afforded ${p.tier} (${cost})` : `asked ${p.asked} (${askedCost}), afforded ${p.tier} (${cost})`,
      nextAction: full ? 'none' : `raise the budget by ~${askedCost - cost} to read it in full`,
    });
  }

  for (const { c, score, seen: s } of candidates) {
    if (score > 0) continue;
    if (s === 'path') (unaffordable.has(c.dir) ? undiscovered : unsearched).push(c.id);
    else {
      missed++;
      entries.push({
        id: c.id,
        verdict: 'MISS',
        score: 0,
        seen: s,
        signals: [],
        cost: 0,
        actual: 0,
        summary: 'looked at, nothing matched',
        detail: `read at the ${s.toUpperCase()} tier; no query term appears in it`,
        nextAction: 'change the query — this one is counted, never named',
      });
    }
  }

  // Then the ranked fill. Tiers are atomic: a half-read concept is indistinguishable in context
  // from a whole one, which is worse than not having it. Each placement reserves for the worst
  // notice still reachable — every remaining candidate could yet be clipped.
  const scored = candidates.filter((cand) => cand.score > 0);
  for (const [i, cand] of scored.entries()) {
    const { c, score, signals, matched, seen: s } = cand;
    const pending = scored.length - i - 1;
    const asked: Tier = score >= d.strongScore ? 'FULL' : score >= d.mediumScore ? (matched.length ? 'SECTION' : 'CARD') : 'LINE';
    const capped = TIERS[Math.min(TIERS.indexOf(asked), TIERS.indexOf(d.maxRankedTier))];
    let placed: Tier | undefined;
    for (let i = TIERS.indexOf(capped); i >= 0; i--) {
      const t = TIERS[i];
      const cost = est(chargeableChars(c, t, matched, s), e);
      if (spent + cost + noticeReserve(d, fixedNamed + clipped.length + pending, spendable) <= spendable) {
        placed = t;
        break;
      }
    }
    if (!placed) {
      clipped.push(c.id);
      entries.push({
        id: c.id,
        verdict: 'CLIPPED',
        score,
        seen: s,
        signals,
        cost: 0,
        actual: 0,
        summary: `matched (${score}) but the budget is spent`,
        detail: `cheapest tier LINE costs ${est(chargeableChars(c, 'LINE', matched, s), e)}; ${remaining() - noticeReserve(d, fixedNamed + clipped.length + pending, spendable)} spendable tokens remain after the notice`,
        nextAction: 'raise the budget, narrow the query, or name it as an exact reference',
      });
      continue;
    }
    const cost = est(chargeableChars(c, placed, matched, s), e);
    const askedCost = est(chargeableChars(c, asked, matched, s), e);
    charge({
      kind: 'RANKED',
      label: `${c.id} @ ${placed}`,
      cost,
      actual: chargeableActual(c, placed, matched, s),
      why: `score ${score} → asked ${asked}${placed === asked ? '' : `, afforded ${placed}`}`,
    });
    entries.push({
      id: c.id,
      verdict: 'SELECTED',
      tier: placed,
      askedTier: asked,
      score,
      seen: s,
      signals,
      cost,
      actual: chargeableActual(c, placed, matched, s),
      summary: `selected at ${placed} (score ${score})`,
      detail: signals.join(', ') || 'no signal',
      nextAction:
        placed === asked
          ? 'none'
          : TIERS.indexOf(asked) > TIERS.indexOf(d.maxRankedTier)
            ? `the maxRankedTier dial capped this at ${d.maxRankedTier}; raising the budget will not change it`
            : `raise the budget by ~${askedCost - cost} for ${asked}`,
    });
  }

  for (const id of undiscovered)
    entries.push({
      id,
      verdict: 'UNDISCOVERED',
      score: 0,
      seen: 'path',
      signals: [],
      cost: 0,
      actual: 0,
      summary: 'never looked at — could not afford to',
      detail: 'index and frontmatter scan for its directory both cost more than what was left',
      nextAction: 'raise the budget — this is not a statement about relevance',
    });
  for (const id of unsearched)
    entries.push({
      id,
      verdict: 'UNSEARCHED',
      score: 0,
      seen: 'path',
      signals: [],
      cost: 0,
      actual: 0,
      summary: 'never looked at — discovery stopped first',
      detail: nullQuery
        ? 'there were no query terms to explain, so no channel was worth buying and its directory was never opened'
        : 'every query term was already explained by a cheaper channel, so its directory was never opened',
      nextAction: nullQuery ? 'ask something, or name an exact reference' : 'broaden the query, or switch discovery to exhaustive',
    });
  for (const id of filtered)
    entries.push({
      id,
      verdict: 'FILTERED',
      score: 0,
      seen: 'card',
      signals: [],
      cost: 0,
      actual: 0,
      summary: 'excluded by status policy',
      detail: 'status is deprecated or draft and the matching dial is off — #14 owns the default',
      nextAction: 'toggle the deprecated/draft dial to rank it',
    });
  for (const ref of unresolved)
    entries.push({
      id: ref,
      verdict: 'UNRESOLVED',
      score: 0,
      seen: 'path',
      signals: [],
      cost: 0,
      actual: 0,
      summary: 'exact reference resolves to nothing',
      detail: 'no concept id or declared artefact matches it — broken links are legal, so this is reported, not thrown',
      nextAction: 'fix the reference, accept that the knowledge is not written yet, or follow a redirect this prototype does not follow (#24)',
    });

  // -- Phase NOTICE ---------------------------------------------------------
  // "Never *silently* overrun" makes the report of what was left out part of the selection, so it
  // is paid for out of the same budget. A per-item notice does not converge on a large bundle —
  // the more you omit, the bigger the notice, the less you can include — so past a share of the
  // budget it collapses to counts.
  const dirsOf = (v: Verdict) => {
    const out: string[] = [];
    for (const en of entries.filter((x) => x.verdict === v)) {
      const dir = byId.get(en.id)?.dir ?? '';
      const label = dir || '(root)';
      if (!out.includes(label)) out.push(label);
    }
    return out;
  };
  const reportedUndiscovered = dirsOf('UNDISCOVERED');
  const reportedUnsearched = dirsOf('UNSEARCHED');
  // Everything the notice *names* is priced. `missed` and `unstatused` are single counted lines and
  // ride inside `noticeBase`; unsearched directories are named, grow with the bundle, and are the
  // commonest omission under satisficing — printing them free understated the notice's own cost.
  const named =
    clipped.length + unresolved.length + reportedUndiscovered.length + reportedUnsearched.length + filtered.length;
  const anything = named > 0 || missed > 0 || reportedUnsearched.length > 0 || unstatused > 0;
  const notice: Notice = {
    form: anything ? noticeForm(d, named, spendable) : 'none',
    clipped,
    undiscovered: reportedUndiscovered,
    unsearched: reportedUnsearched,
    unresolved,
    filtered,
    unstatused,
    missed,
    cost: 0,
  };
  notice.cost = notice.form === 'none' ? 0 : notice.form === 'named' ? d.noticeBase + named * d.noticeNamed : d.noticeBase + d.noticeCounted;
  // The collapse has two triggers, not one: naming costs more than the share cap allows, or more
  // than what is physically left. The reservation guarantees the collapsed form always fits.
  if (notice.cost > remaining()) {
    notice.form = 'counted';
    notice.cost = d.noticeBase + d.noticeCounted;
  }
  if (notice.cost > 0)
    charge({
      kind: 'NOTICE',
      label: `notice · ${notice.form} · ${named} named, ${missed} missed`,
      cost: notice.cost,
      actual: notice.cost,
      why:
        notice.form === 'counted'
          ? 'naming every omission would cost more than the concepts it describes — collapsed to counts'
          : 'what was left out, and which of the four fixes applies',
    });

  const left = unexplained();
  if (left.length > 0)
    reasons.push(`no channel explained ${left.map((t) => `"${t}"`).join(', ')} — there is no stemming, no synonym and no alias resolution anywhere in OKF`);

  const plan: Plan = {
    outcome: degraded ? 'degraded' : 'ok',
    reasons,
    budget: {
      total,
      reserve,
      spendable,
      spent,
      free: spendable - spent,
      actualSpent,
      source: req.budget.source,
      estimator: e.name,
    },
    lines,
    entries,
    notice,
    terms: ts,
    unexplained: left,
    violations: [],
  };
  plan.violations = verify(corpus, plan, reserve, total);
  return plan;
}

function directories(corpus: Corpus): string[] {
  const seen: string[] = [];
  for (const c of corpus.concepts) if (!seen.includes(c.dir)) seen.push(c.dir);
  return seen;
}

function noticeForm(d: Dials, named: number, spendable: number): 'named' | 'counted' {
  return d.noticeBase + named * d.noticeNamed > d.noticeShareCap * spendable ? 'counted' : 'named';
}

function noticeSize(d: Dials, named: number, spendable: number): number {
  return noticeForm(d, named, spendable) === 'named' ? d.noticeBase + named * d.noticeNamed : d.noticeBase + d.noticeCounted;
}

/**
 * What must be held back for the notice: the largest notice reachable from here, not the notice as
 * it stands. `noticeSize` is not monotone — one more clipped concept can flip the form from named
 * to counted and make the notice *smaller* — so reserving the current size lets the next clip, or
 * the collapse itself, overrun. Both failures were found by replaying the catalogue, not by
 * reasoning about it.
 *
 * The maximum over every reachable count is closed-form: the named form grows until it crosses the
 * share cap, so the ceiling is the largest named form still under the cap, or the collapsed form,
 * whichever is bigger. That makes the share cap mean exactly what it says — this much of the
 * budget, at most, may be spent describing what was left out.
 */
function noticeReserve(d: Dials, reachable: number, spendable: number): number {
  const cap = d.noticeShareCap * spendable;
  const named = (k: number) => d.noticeBase + k * d.noticeNamed;
  // The collapsed form is always reachable — running out of room collapses the notice too — so it
  // is the floor of every reservation, even when nothing has been omitted yet.
  const collapsed = d.noticeBase + d.noticeCounted;
  if (named(reachable) <= cap) return Math.max(collapsed, named(reachable));
  const kMax = Math.max(0, Math.floor((cap - d.noticeBase) / d.noticeNamed));
  return Math.max(collapsed, named(Math.min(kMax, reachable)));
}

function insufficient(
  corpus: Corpus,
  req: Request,
  lines: SpendLine[],
  reasons: string[],
  total: number,
  reserve: number,
  spendable: number,
  spent: number,
  actualSpent: number,
  ts: string[],
  unresolved: string[],
  e: Estimator,
  why: string,
): Plan {
  const plan: Plan = {
    outcome: 'insufficient',
    reasons: [...reasons, why],
    budget: { total, reserve, spendable, spent, free: spendable - spent, actualSpent, source: req.budget.source, estimator: e.name },
    lines,
    // A refusal still owes a verdict for everything: nothing was read, so everything is
    // undiscovered. Exempting this path from the check — as an earlier draft did — weakens the
    // verifier to fit the gap instead of closing it.
    entries: [
      ...unresolved.map((ref) => ({
        id: ref,
        verdict: 'UNRESOLVED' as Verdict,
        score: 0,
        seen: 'path' as Seen,
        signals: [],
        cost: 0,
        actual: 0,
        summary: 'exact reference resolves to nothing',
        detail: 'no concept id or declared artefact matches it',
        nextAction: 'fix the reference',
      })),
      ...corpus.concepts
        .filter((c) => !unresolved.includes(c.id))
        .map((c) => ({
          id: c.id,
          verdict: 'UNDISCOVERED' as Verdict,
          score: 0,
          seen: 'path' as Seen,
          signals: [],
          cost: 0,
          actual: 0,
          summary: 'never looked at — the selection was refused before discovery',
          detail: why,
          nextAction: 'raise the budget, or ask for fewer exact references',
        })),
    ],
    // A refusal spends nothing, so its notice is free: there is no selection for it to crowd out.
    notice: { form: unresolved.length > 0 ? 'named' : 'none', clipped: [], undiscovered: [], unsearched: [], unresolved, filtered: [], unstatused: 0, missed: 0, cost: 0 },
    terms: ts,
    unexplained: [],
    violations: [],
  };
  plan.violations = verify(corpus, plan, reserve, total);
  return plan;
}

// ---------------------------------------------------------------------------
// 7. Verification — the prototype telling on itself
// ---------------------------------------------------------------------------

function verify(corpus: Corpus, plan: Plan, reserve: number, total: number): string[] {
  const v: string[] = [];
  const { spent, actualSpent, spendable } = plan.budget;

  if (spent > spendable) v.push(`ESTIMATED OVERRUN: spent ${spent} > spendable ${spendable}`);
  if (spent + reserve > total) v.push(`RESERVE BREACHED: ${spent} + ${reserve} > ${total}`);
  // The one that matters: the estimate held, the real thing did not fit. Only reachable with an
  // estimator that is not an upper bound.
  if (actualSpent + reserve > total)
    v.push(`SILENT OVERRUN: real ${actualSpent} + reserve ${reserve} > total ${total} — the estimate said ${spent}`);
  else if (actualSpent > spent) v.push(`ESTIMATE NOT A CEILING: real ${actualSpent} > estimated ${spent} (${plan.budget.estimator})`);

  // A ceiling has to hold per document, not on average: which documents a query selects is not
  // known in advance, so slack on prose must never be allowed to pay for a deficit on a schema.
  for (const l of plan.lines) {
    if (l.actual > l.cost) v.push(`LINE UNDER-ESTIMATED: ${l.label} — real ${l.actual} > estimated ${l.cost}`);
  }

  const seen = new Set<string>();
  for (const en of plan.entries) {
    if (seen.has(en.id)) v.push(`DOUBLE VERDICT: ${en.id}`);
    seen.add(en.id);
  }
  for (const c of corpus.concepts) if (!seen.has(c.id)) v.push(`NO VERDICT: ${c.id}`);

  for (const c of corpus.concepts) {
    let last = -1;
    for (const t of TIERS) {
      const n = tierChars(c, t, c.sections);
      if (n < last) v.push(`TIER COSTS NOT MONOTONE: ${c.id} at ${t}`);
      last = n;
    }
  }
  return v;
}
