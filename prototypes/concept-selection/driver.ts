/**
 * PROTOTYPE — the keystroke state machine.
 *
 * One `step(world, key)` path, shared by the TUI and the walkthrough. That identity is the
 * load-bearing property: every replayed case goes through exactly the keys a human presses.
 */

import {
  CEILING,
  DEFAULT_DIALS,
  DEFAULT_OUTPUT_PRICING,
  ESTIMATORS,
  TASKS,
  TIERS,
  select,
  type Dials,
  type Estimator,
  type Plan,
  type Request,
  type Tier,
} from './selection.ts';
import { BUDGETS, EXACT_SETS, FIXTURES, QUERIES } from './corpus.ts';

export interface World {
  fixture: number;
  query: number;
  exact: number;
  budget: number;
  task: number;
  unknownBudget: boolean;
  estimator: Estimator;
  dials: Dials;
  log: string[];
}

export const INITIAL: World = {
  fixture: 0,
  query: 0,
  exact: 0,
  budget: 4,
  task: 0,
  unknownBudget: false,
  estimator: CEILING,
  dials: DEFAULT_DIALS,
  log: [],
};

const NOTICE_CAPS = [0.1, 0.35, 1];

export const KEYS: [key: string, help: string][] = [
  ['f', 'next fixture bundle'],
  ['q', 'next query'],
  ['x', 'next exact-reference set'],
  ['+', 'raise the budget'],
  ['-', 'lower the budget'],
  ['u', 'toggle: harness reports no budget'],
  ['t', 'next task kind (changes the reserve)'],
  ['e', 'cycle estimator: ceiling → loose → mean'],
  ['p', 'toggle: may pay to grep bodies'],
  ['s', 'toggle discovery: satisfice ⇄ exhaustive'],
  ['d', 'toggle: include deprecated'],
  ['r', 'toggle: include drafts'],
  ['m', 'cycle the deepest tier a ranked concept may reach'],
  ['n', 'cycle the notice share cap'],
  ['0', 'reset'],
];

export function step(w: World, key: string): World {
  const d = w.dials;
  switch (key) {
    case 'f': {
      const fixture = (w.fixture + 1) % FIXTURES.length;
      return { ...w, fixture, query: 0, exact: 0, log: [...w.log, `fixture → ${FIXTURES[fixture].name}`] };
    }
    case 'q': {
      const qs = QUERIES[FIXTURES[w.fixture].key];
      const query = (w.query + 1) % qs.length;
      return { ...w, query, log: [...w.log, `query → "${qs[query]}"`] };
    }
    case 'x': {
      const xs = EXACT_SETS[FIXTURES[w.fixture].key];
      const exact = (w.exact + 1) % xs.length;
      return { ...w, exact, log: [...w.log, `exact → [${xs[exact].join(', ') || 'none'}]`] };
    }
    case '+':
      return { ...w, budget: Math.min(w.budget + 1, BUDGETS.length - 1), log: [...w.log, `budget ↑`] };
    case '-':
      return { ...w, budget: Math.max(w.budget - 1, 0), log: [...w.log, `budget ↓`] };
    case 'u':
      return { ...w, unknownBudget: !w.unknownBudget, log: [...w.log, `budget source → ${w.unknownBudget ? 'explicit' : 'unknown'}`] };
    case 't': {
      const task = (w.task + 1) % TASKS.length;
      return { ...w, task, log: [...w.log, `task → ${TASKS[task]}`] };
    }
    case 'e': {
      const estimator = ESTIMATORS[(ESTIMATORS.indexOf(w.estimator) + 1) % ESTIMATORS.length];
      return { ...w, estimator, log: [...w.log, `estimator → ${estimator.name}`] };
    }
    case 'p':
      return { ...w, dials: { ...d, allowProbe: !d.allowProbe }, log: [...w.log, `probe → ${!d.allowProbe}`] };
    case 's':
      return { ...w, dials: { ...d, exhaustiveDiscovery: !d.exhaustiveDiscovery }, log: [...w.log, `discovery → ${!d.exhaustiveDiscovery ? 'exhaustive' : 'satisfice'}`] };
    case 'd':
      return { ...w, dials: { ...d, includeDeprecated: !d.includeDeprecated }, log: [...w.log, `deprecated → ${!d.includeDeprecated}`] };
    case 'r':
      return { ...w, dials: { ...d, includeDraft: !d.includeDraft }, log: [...w.log, `drafts → ${!d.includeDraft}`] };
    case 'm': {
      const maxRankedTier = TIERS[(TIERS.indexOf(d.maxRankedTier) + 1) % TIERS.length] as Tier;
      return { ...w, dials: { ...d, maxRankedTier }, log: [...w.log, `max ranked tier → ${maxRankedTier}`] };
    }
    case 'n': {
      const noticeShareCap = NOTICE_CAPS[(NOTICE_CAPS.indexOf(d.noticeShareCap) + 1) % NOTICE_CAPS.length];
      return { ...w, dials: { ...d, noticeShareCap }, log: [...w.log, `notice share cap → ${noticeShareCap}`] };
    }
    case '0':
      return { ...INITIAL, log: [...w.log, 'reset'] };
    default:
      return w;
  }
}

export function request(w: World): Request {
  const corpus = FIXTURES[w.fixture];
  return {
    query: QUERIES[corpus.key][w.query],
    task: TASKS[w.task],
    exact: EXACT_SETS[corpus.key][w.exact],
    budget: { total: BUDGETS[w.budget], source: w.unknownBudget ? 'unknown' : 'explicit' },
    estimator: w.estimator,
    dials: w.dials,
    outputPricing: DEFAULT_OUTPUT_PRICING,
  };
}

export function run(w: World): { plan: Plan; req: Request } {
  const corpus = FIXTURES[w.fixture];
  const req = request(w);
  return { plan: select(corpus, req), req };
}

export function drive(keys: string): World {
  let w = INITIAL;
  for (const k of keys) w = step(w, k);
  return w;
}
