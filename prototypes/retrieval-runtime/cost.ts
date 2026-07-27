// PROTOTYPE — throwaway. Cost model adapter and the two ledgers (#13).
//
// #13 deletes the character divisor: "A cost-model adapter uses exact target tokenization when
// available. Otherwise it uses a versioned conservative profile calibrated for the exact
// tokenizer family and serializer. No valid tokenizer or profile means `insufficient`; there is
// no universal character divisor."
//
// THE ORACLE DISCIPLINE (the class of bug #28 hit three times). Every priced thing carries two
// numbers: a `bound`, which is the only number admission and charging may read, and an
// `observed`, which is ground truth the runtime is not allowed to see and which only the audit
// reads. If `observed > bound` the bound was falsified, and #13 says that is `invalid`, not
// `degraded`. Nothing in this file lets a bound be computed from an observation.

export interface Priced {
  /** conservative upper bound — the ONLY number admission and charging may read */
  bound: number;
  /** ground truth; audit-only. Reading this from the pricing path is the bug. */
  observed: number;
}

export function priced(bound: number, observed: number): Priced {
  return { bound, observed };
}

// ---------------------------------------------------------------------------
// Cost model adapter
// ---------------------------------------------------------------------------

export interface CostModel {
  id: string;
  version: string;
  /** #13 requires the profile be calibrated for the exact tokenizer family AND serializer. */
  tokenizerFamily: string;
  serializerVersion: string;
  /** true when the deployment has the real tokenizer; false when using a conservative profile */
  exact: boolean;
  /**
   * `true` only if a calibration record exists for this (tokenizerFamily, serializerVersion).
   * #13: "No valid tokenizer or profile means `insufficient`."
   */
  calibrated: boolean;
  /**
   * Multiplier applied to a fixture's declared conservative char bound. A profile that is not
   * conservative for this corpus produces bounds below `observed`, which the audit catches and
   * which drives the result to `invalid`. This is how a mis-calibrated profile is exercised
   * without the runtime ever being able to detect it from the inside.
   */
  scale: number;
}

/**
 * A deliberately small registry. `UNREGISTERED` exists so the `insufficient`-on-no-profile path
 * is reachable from the TUI, and `OPTIMISTIC` so the `invalid` path is reachable.
 */
export const COST_MODELS: Record<string, CostModel> = {
  EXACT: {
    id: 'EXACT',
    version: '1.0.0',
    tokenizerFamily: 'fixture-exact',
    serializerVersion: 'okf-yaml/1',
    exact: true,
    calibrated: true,
    scale: 1,
  },
  CONSERVATIVE: {
    id: 'CONSERVATIVE',
    version: '1.0.0',
    tokenizerFamily: 'fixture-bpe',
    serializerVersion: 'okf-yaml/1',
    exact: false,
    calibrated: true,
    scale: 1,
  },
  OPTIMISTIC: {
    id: 'OPTIMISTIC',
    version: '0.9.0-uncalibrated',
    tokenizerFamily: 'fixture-bpe',
    serializerVersion: 'okf-yaml/1',
    exact: false,
    calibrated: true, // claims calibration it does not have — the adversarial fixture
    scale: 0.72,
  },
  UNREGISTERED: {
    id: 'UNREGISTERED',
    version: '0.0.0',
    tokenizerFamily: 'unknown',
    serializerVersion: 'unknown',
    exact: false,
    calibrated: false,
    scale: 1,
  },
};

/** Apply a cost model to a fixture's declared bound. Never touches `observed`. */
export function price(model: CostModel, p: Priced): Priced {
  return { bound: Math.ceil(p.bound * model.scale), observed: p.observed };
}

// ---------------------------------------------------------------------------
// Ledger 1 — the context ledger
// ---------------------------------------------------------------------------

// #13: the context ledger "charges only bytes/tokens crossing the runtime interface:
// materialized concept tiers, the bounded omission notice, and the receipt."
export type ContextLineKind = 'RESERVE' | 'DEMAND' | 'RANKED' | 'NOTICE' | 'RECEIPT' | 'DISCOVERY';

export interface ContextLine {
  kind: ContextLineKind;
  label: string;
  cost: Priced;
  why: string;
}

export class ContextLedger {
  readonly lines: ContextLine[] = [];
  readonly spendable: number;
  constructor(spendable: number) {
    this.spendable = spendable;
  }

  charge(kind: ContextLineKind, label: string, cost: Priced, why: string): void {
    this.lines.push({ kind, label, cost, why });
  }

  /** What admission may reason about. Bounds only. */
  get spent(): number {
    return this.lines.reduce((n, l) => n + l.cost.bound, 0);
  }

  /** Audit-only. */
  get observedSpent(): number {
    return this.lines.reduce((n, l) => n + l.cost.observed, 0);
  }

  get remaining(): number {
    return this.spendable - this.spent;
  }

  /**
   * #28: "Aggregate slack hides per-document deficits" — prose over-estimates and silently pays
   * for a code-dense document that under-estimates, right up until a query selects mostly dense
   * documents. So the ceiling is checked per line, never on the total.
   */
  falsifiedLines(): ContextLine[] {
    return this.lines.filter((l) => l.cost.observed > l.cost.bound);
  }
}

// ---------------------------------------------------------------------------
// Ledger 2 — the discovery-work ledger
// ---------------------------------------------------------------------------

// #13: "a versioned multi-dimensional envelope: concepts/files inspected, bytes read or parsed,
// probe output, and an optional safety timeout" — and, explicitly, "Bytes, files, probes, and
// time do not collapse into a speculative universal work unit." So this is a vector, and there
// is deliberately no scalar `spent` on it.

export interface Work {
  filesInspected: number;
  bytesParsed: number;
  probeOutputBytes: number;
  ticks: number;
}

export const NO_WORK: Work = { filesInspected: 0, bytesParsed: 0, probeOutputBytes: 0, ticks: 0 };

export type WorkDimension = keyof Work;
export const WORK_DIMENSIONS: WorkDimension[] = [
  'filesInspected',
  'bytesParsed',
  'probeOutputBytes',
  'ticks',
];

export interface WorkEnvelope extends Work {
  version: string;
}

export interface WorkLine {
  channel: string;
  scope: string;
  work: Work;
}

export class WorkLedger {
  readonly lines: WorkLine[] = [];
  readonly envelope: WorkEnvelope;
  constructor(envelope: WorkEnvelope) {
    this.envelope = envelope;
  }

  get spent(): Work {
    return this.lines.reduce(
      (a, l) => ({
        filesInspected: a.filesInspected + l.work.filesInspected,
        bytesParsed: a.bytesParsed + l.work.bytesParsed,
        probeOutputBytes: a.probeOutputBytes + l.work.probeOutputBytes,
        ticks: a.ticks + l.work.ticks,
      }),
      { ...NO_WORK },
    );
  }

  /** Which dimensions a prospective purchase would exhaust. Empty means affordable. */
  wouldExhaust(work: Work): WorkDimension[] {
    const after = this.spent;
    return WORK_DIMENSIONS.filter((d) => after[d] + work[d] > this.envelope[d]);
  }

  charge(channel: string, scope: string, work: Work): void {
    this.lines.push({ channel, scope, work });
  }

  /** Dimensions already at or past their cap. */
  exhausted(): WorkDimension[] {
    const s = this.spent;
    return WORK_DIMENSIONS.filter((d) => s[d] >= this.envelope[d]);
  }
}
