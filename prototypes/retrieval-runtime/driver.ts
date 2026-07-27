// PROTOTYPE — throwaway. The key->state machine. The TUI and the walkthrough both drive the
// runtime through THIS, so every replayed case goes through exactly the keys a human presses.

import { CORPORA, type Corpus } from './corpus.ts';
import { COST_MODELS } from './cost.ts';
import {
  DEFAULT_DIALS,
  DEFAULT_ENVELOPE,
  DEFAULT_OUTPUT,
  retrieve,
  type Breadth,
  type Dials,
  type Request,
  type Result,
  type Seam,
  type TaskKind,
} from './retrieve.ts';
import type { WorkEnvelope } from './cost.ts';

export const QUERIES = [
  'retention policy',
  'retention',
  'what is the a record for policy',
  'getUserName',
  '"policy review"',
  'guides/onboarding.md',
  'ünïcode',
  // two clauses that live in two different, unlinked concepts — the case #13's stop rule
  // ("terms appearing in unrelated concepts do not establish sufficiency") exists to change
  'onboarding cadence',
  '',
];

export const EXACTS: string[][] = [[], ['retention'], ['legacy-retention'], ['src/okf/trust.ts'], ['ghost', 'ghost.md']];
export const ALLOWANCES = [200, 400, 700, 1200, 2500, 6000, 20000];
export const TASKS: (TaskKind | 'unknown')[] = ['exploration', 'research', 'review', 'feature', 'audit', 'migration', 'debugging', 'unknown'];
export const MODELS = Object.keys(COST_MODELS) as (keyof typeof COST_MODELS)[];
export const SEAMS: Seam[] = ['out-of-context', 'in-context'];
export const COHERENCE: Dials['coherence'][] = ['single', 'linked', 'component'];

export interface World {
  corpus: number;
  query: number;
  exact: number;
  allowance: number;
  task: number;
  model: number;
  seam: number;
  coherence: number;
  informative: boolean;
  breadth: Breadth | 'auto';
  provenance: 'explicit' | 'estimated' | 'unknown';
  hasFallback: boolean;
  auditCapable: boolean;
  includeDeprecated: boolean;
  declaredOutput: number;
  envelope: WorkEnvelope;
  nameCap: number;
}

export const INITIAL: World = {
  corpus: 0,
  query: 0,
  exact: 0,
  allowance: 4,
  task: 0,
  model: 1,
  seam: 0,
  coherence: 1,
  informative: false,
  breadth: 'auto',
  provenance: 'explicit',
  hasFallback: true,
  auditCapable: true,
  includeDeprecated: false,
  declaredOutput: 0,
  envelope: DEFAULT_ENVELOPE,
  nameCap: DEFAULT_DIALS.nameCap,
};

export const KEYS: [string, string][] = [
  ['f', 'next fixture bundle'],
  ['q', 'next query'],
  ['x', 'next exact-reference set'],
  ['+', 'raise allowance'],
  ['-', 'lower allowance'],
  ['t', 'next task kind'],
  ['c', 'cycle cost profile'],
  ['S', 'toggle seam: out-of-context / in-context'],
  ['h', 'cycle coherence: single / linked / component'],
  ['i', 'toggle df-weighted informativeness'],
  ['b', 'cycle breadth: auto / satisfice / exhaustive'],
  ['p', 'cycle budget provenance'],
  ['k', 'toggle a registered deployment fallback'],
  ['a', 'toggle audit capability (can the deployment count real tokens?)'],
  ['d', 'toggle include deprecated'],
  ['o', 'cycle declared output reserve'],
  ['w', 'cycle work envelope (full / tight bytes / tight files)'],
  ['n', 'cycle omission name cap'],
  ['0', 'reset'],
];

const ENVELOPES: WorkEnvelope[] = [
  DEFAULT_ENVELOPE,
  { ...DEFAULT_ENVELOPE, version: 'work/1-tight-bytes', bytesParsed: 900 },
  { ...DEFAULT_ENVELOPE, version: 'work/1-tight-files', filesInspected: 2 },
];

export function step(w: World, key: string): World {
  const n = { ...w };
  switch (key) {
    case 'f': n.corpus = (w.corpus + 1) % CORPORA.length; break;
    case 'q': n.query = (w.query + 1) % QUERIES.length; break;
    case 'x': n.exact = (w.exact + 1) % EXACTS.length; break;
    case '+': n.allowance = Math.min(ALLOWANCES.length - 1, w.allowance + 1); break;
    case '-': n.allowance = Math.max(0, w.allowance - 1); break;
    case 't': n.task = (w.task + 1) % TASKS.length; break;
    case 'c': n.model = (w.model + 1) % MODELS.length; break;
    case 'S': n.seam = (w.seam + 1) % SEAMS.length; break;
    case 'h': n.coherence = (w.coherence + 1) % COHERENCE.length; break;
    case 'i': n.informative = !w.informative; break;
    case 'b': n.breadth = w.breadth === 'auto' ? 'satisfice' : w.breadth === 'satisfice' ? 'exhaustive' : 'auto'; break;
    case 'p': n.provenance = w.provenance === 'explicit' ? 'estimated' : w.provenance === 'estimated' ? 'unknown' : 'explicit'; break;
    case 'k': n.hasFallback = !w.hasFallback; break;
    case 'a': n.auditCapable = !w.auditCapable; break;
    case 'd': n.includeDeprecated = !w.includeDeprecated; break;
    case 'o': n.declaredOutput = w.declaredOutput === 0 ? 150 : w.declaredOutput === 150 ? 900 : 0; break;
    case 'w': n.envelope = ENVELOPES[(ENVELOPES.indexOf(w.envelope) + 1) % ENVELOPES.length] ?? ENVELOPES[0]; break;
    case 'n': n.nameCap = w.nameCap === 3 ? 1 : w.nameCap === 1 ? 8 : 3; break;
    case '0': return { ...INITIAL };
  }
  return n;
}

export function corpusOf(w: World): Corpus {
  return CORPORA[w.corpus];
}

export function request(w: World): Request {
  return {
    query: QUERIES[w.query],
    exact: EXACTS[w.exact],
    task: TASKS[w.task],
    breadth: w.breadth === 'auto' ? undefined : w.breadth,
    declaration: {
      deployment: 'fixture-harness',
      seam: SEAMS[w.seam],
      allowance: ALLOWANCES[w.allowance],
      provenance: w.provenance,
      fallbackAllowance: w.hasFallback ? 900 : undefined,
      costModelId: MODELS[w.model],
      auditCapable: w.auditCapable,
      declaredOutputReserve: w.declaredOutput,
    },
    filters: { includeDeprecated: w.includeDeprecated, includeDraft: false },
    dials: {
      ...DEFAULT_DIALS,
      coherence: COHERENCE[w.coherence],
      informativeness: w.informative ? 'df-weighted' : 'off',
      nameCap: w.nameCap,
    },
    envelope: w.envelope,
    output: DEFAULT_OUTPUT,
  };
}

export function run(w: World): { req: Request; result: Result } {
  const req = request(w);
  return { req, result: retrieve(corpusOf(w), req) };
}

export function drive(keys: string): World {
  let w = { ...INITIAL };
  for (const k of keys) w = step(w, k);
  return w;
}
