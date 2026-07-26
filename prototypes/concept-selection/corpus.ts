/**
 * PROTOTYPE — the fake bundles the selector reads.
 *
 * Three fixtures: a code-backed repo bundle, a knowledge-only bundle with no tags anywhere, and a
 * 60-concept bundle big enough to break a per-item omission notice. Nothing here is worth keeping;
 * it is replaced by a real bundle reader.
 *
 * Character counts are made up but internally consistent. Each document also carries a
 * ground-truth token count derived from a per-document density, so the TUI can show an estimator
 * being wrong. Densities: prose 4.3 chars/token, mixed 3.8, dense (tables, schemas) 3.4, code
 * (minified JSON, generated SQL) 3.0.
 *
 * These densities are what make the `ceiling` estimator a ceiling — divide by 2.9 and nothing
 * here underestimates; divide by 3.2 (`loose`) and the code-dense document alone breaks it. That
 * is a property of these invented numbers, not of real bundles: which divisor is safe is a
 * measurement #7 owes, and no real document was measured to produce any of this.
 */

import type { Concept, Corpus, IndexDoc, Section } from './selection.ts';

type Density = 'prose' | 'mixed' | 'dense' | 'code';
const CPT: Record<Density, number> = { prose: 4.3, mixed: 3.8, dense: 3.4, code: 3.0 };
const tok = (chars: number, d: Density) => Math.ceil(chars / CPT[d]);

interface Spec {
  id: string;
  type: string;
  title?: string;
  description?: string;
  tags?: string[];
  resource?: string;
  sourceRefs?: string[];
  status?: 'draft' | 'stable' | 'deprecated';
  stale?: boolean;
  links?: string[];
  density?: Density;
  cardChars?: number;
  sections: [heading: string, chars: number, terms: string[], density?: Density][];
}

function concept(s: Spec): Concept {
  const dir = s.id.includes('/') ? s.id.slice(0, s.id.lastIndexOf('/')) : '';
  const density = s.density ?? 'prose';
  const lineChars = (s.title?.length ?? 0) + (s.description?.length ?? 0) + 12;
  const cardChars = s.cardChars ?? 150 + (s.tags?.join(', ').length ?? 0) + (s.resource?.length ?? 0);
  const sections: Section[] = s.sections.map(([heading, chars, terms, d]) => ({
    heading,
    terms,
    chars,
    actual: tok(chars, d ?? density),
  }));
  return {
    id: s.id,
    dir,
    type: s.type,
    title: s.title,
    description: s.description,
    tags: s.tags ?? [],
    resource: s.resource,
    sourceRefs: s.sourceRefs,
    status: s.status ?? 'stable',
    stale: s.stale ?? false,
    sections,
    links: s.links ?? [],
    chars: { LINE: lineChars, CARD: cardChars },
    actual: { LINE: tok(lineChars, 'prose'), CARD: tok(cardChars, 'dense') },
  };
}

function indexDoc(dir: string, entries: string[], withDescriptions: boolean): IndexDoc {
  const chars = 70 + entries.length * (withDescriptions ? 105 : 44);
  return { dir, entries, withDescriptions, chars, actual: tok(chars, 'mixed') };
}

function bundle(o: Omit<Corpus, 'pathListChars' | 'pathListActual'>): Corpus {
  const pathListChars = o.concepts.reduce((n, c) => n + c.id.length + 4, 0);
  return { ...o, pathListChars, pathListActual: tok(pathListChars, 'dense') };
}

// --- 1. Code-backed: a billing repo's `okf/` bundle -------------------------

const codeBacked = bundle({
  key: '1',
  name: 'acme-billing (code-backed)',
  note: 'A repo bundle. Concepts declare the source artefacts they were derived from, so a changed file is an exact reference.',
  concepts: [
    concept({
      id: 'overview',
      type: 'Reference',
      title: 'Billing knowledge bundle',
      description: 'Entry point for revenue, orders and the monthly close.',
      tags: ['overview'],
      links: ['metrics/revenue', 'playbooks/close-the-books'],
      sections: [['Scope', 620, ['bundle', 'billing', 'scope']]],
    }),
    concept({
      id: 'metrics/revenue',
      type: 'Metric',
      title: 'Recognised revenue',
      description: 'How recognised revenue is computed for SaaS contracts, net of refunds.',
      tags: ['revenue', 'billing', 'finance'],
      sourceRefs: ['src/billing/revenue.ts'],
      density: 'mixed',
      links: ['metrics/mrr', 'tables/orders', 'tables/invoices'],
      sections: [
        ['Definition', 780, ['recognised', 'contract', 'deferred']],
        ['Computation', 1680, ['sql', 'proration', 'refund', 'ledger'], 'dense'],
        ['Caveats', 910, ['refund', 'chargeback', 'timezone']],
      ],
    }),
    concept({
      id: 'metrics/arr',
      type: 'Metric',
      title: 'Annual recurring revenue',
      description: 'Normalised annual value of active subscriptions.',
      tags: ['revenue', 'saas'],
      density: 'mixed',
      sections: [
        ['Definition', 540, ['subscription', 'normalised']],
        ['Computation', 760, ['sql', 'snapshot'], 'dense'],
      ],
    }),
    concept({
      id: 'metrics/churn',
      type: 'Metric',
      title: 'Logo churn',
      description: 'Share of accounts that cancelled in a period.',
      tags: ['retention'],
      stale: true,
      sections: [['Definition', 610, ['cancel', 'cohort']]],
    }),
    concept({
      id: 'tables/orders',
      type: 'BigQuery Table',
      title: 'core.orders',
      description: 'One row per placed order, including cancelled ones.',
      tags: ['orders', 'bigquery'],
      resource: 'bq://acme.core.orders',
      density: 'dense',
      sections: [
        ['Schema', 1840, ['column', 'partition', 'order_id', 'status']],
        ['Examples', 720, ['query', 'join']],
      ],
    }),
    concept({
      id: 'tables/invoices',
      type: 'BigQuery Table',
      title: 'core.invoices',
      description: 'Issued invoices with their payment state.',
      tags: ['billing', 'invoices'],
      resource: 'bq://acme.core.invoices',
      sourceRefs: ['src/billing/invoice.ts'],
      density: 'dense',
      sections: [['Schema', 1320, ['column', 'invoice_id', 'paid_at']]],
    }),
    concept({
      id: 'tables/customers',
      type: 'BigQuery Table',
      title: 'core.customers',
      description: 'Account records and their billing contacts.',
      tags: ['customers'],
      density: 'dense',
      sections: [['Schema', 980, ['column', 'account_id']]],
    }),
    concept({
      id: 'tables/posting-export',
      type: 'BigQuery Table',
      title: 'core.posting_export',
      description: 'Generated export of accounting postings, one row each.',
      tags: ['postings', 'bigquery'],
      density: 'code',
      sections: [['Schema', 1560, ['column', 'posting_id', 'generated']]],
    }),
    concept({
      id: 'playbooks/close-the-books',
      type: 'Playbook',
      title: 'Monthly close',
      description: 'The quarterly and monthly close process, step by step.',
      tags: ['finance', 'process'],
      links: ['metrics/revenue', 'metrics/arr', 'tables/orders', 'tables/invoices'],
      sections: [
        ['Steps', 1450, ['freeze', 'reconcile', 'sign-off']],
        ['Escalation', 480, ['controller', 'escalate']],
      ],
    }),
    concept({
      id: 'playbooks/legacy-close',
      type: 'Playbook',
      title: 'Legacy close (pre-2024)',
      description: 'The close process used before the ledger migration.',
      tags: ['finance'],
      status: 'deprecated',
      sections: [['Steps', 990, ['freeze', 'reconcile', 'legacy']]],
    }),
    concept({
      id: 'playbooks/incident-billing',
      type: 'Playbook',
      title: 'Billing incident response',
      description: 'What to do when invoices go out wrong.',
      tags: ['billing', 'incident'],
      status: 'draft',
      sections: [['Steps', 700, ['rollback', 'notify']]],
    }),
    concept({
      id: 'policies/revenue-recognition',
      type: 'Policy',
      title: 'Revenue recognition policy',
      description: 'When revenue may be recognised, and who signs off.',
      tags: ['finance', 'policy'],
      density: 'mixed',
      sections: [
        ['Rules', 1560, ['recognise', 'obligation', 'sign-off']],
        ['Exceptions', 640, ['pilot', 'waiver']],
      ],
    }),
    // §11: a concept carrying only `type` is fully conformant. Nothing may require more.
    concept({
      id: 'policies/unfiled-note',
      type: 'Note',
      sections: [['(unsectioned)', 430, ['unfiled', 'scratch']]],
    }),
    concept({
      id: 'policies/data-retention',
      type: 'Policy',
      title: 'Data retention policy',
      description: 'How long billing records are kept.',
      tags: ['policy'],
      sections: [['Rules', 820, ['retain', 'purge']]],
    }),
  ],
  indexes: [
    indexDoc('', ['overview'], true),
    indexDoc('metrics', ['metrics/revenue', 'metrics/arr', 'metrics/churn'], true),
    indexDoc('tables', ['tables/orders', 'tables/invoices', 'tables/customers', 'tables/posting-export'], true),
    indexDoc('playbooks', ['playbooks/close-the-books', 'playbooks/legacy-close', 'playbooks/incident-billing'], true),
    // A bare link list: legal, and it buys a title with no description — so it neither unlocks
    // description scoring nor pre-pays the LINE tier.
    indexDoc('policies', ['policies/revenue-recognition', 'policies/data-retention', 'policies/unfiled-note'], false),
  ],
});

// --- 2. Knowledge-only: a bundle that is the whole source of truth ----------
//     No tags anywhere, so the tag channel degrades to nothing.

const knowledgeOnly = bundle({
  key: '2',
  name: 'okf-domain (knowledge-only)',
  note: 'No code to fall back on and no tags anywhere: retrieval *is* the interface, and the tag signal is dead.',
  concepts: [
    concept({
      id: 'readme',
      type: 'Reference',
      title: 'How this bundle works',
      description: 'Reading order and conventions.',
      sections: [['Conventions', 560, ['convention', 'order']]],
    }),
    concept({
      id: 'glossary',
      type: 'Reference',
      title: 'Glossary',
      description: 'Short definitions of every term used here.',
      sections: [['Terms', 1240, ['term', 'definition', 'durable', 'lifecycle']]],
    }),
    concept({
      id: 'domain/durable-context',
      type: 'Term',
      title: 'Durable context',
      description: 'Knowledge that survives across agent sessions without duplicating implementation.',
      sections: [
        ['Definition', 690, ['rationale', 'invariant', 'workflow']],
        ['Boundaries', 820, ['mirror', 'config', 'constant']],
      ],
    }),
    concept({
      id: 'domain/code-backed-project',
      type: 'Term',
      title: 'Code-backed project',
      description: 'A project where executable behavior lives in code and code is authoritative.',
      sections: [['Definition', 610, ['authoritative', 'recoverable']]],
    }),
    concept({
      id: 'domain/knowledge-only-project',
      type: 'Term',
      title: 'Knowledge-only project',
      description: 'A project whose durable knowledge is entirely documents.',
      sections: [['Definition', 580, ['document', 'source', 'truth']]],
    }),
    concept({
      id: 'domain/automatic-lifecycle',
      type: 'Term',
      title: 'Automatic lifecycle',
      description: 'The recurring read-and-small-update behavior during normal project work.',
      sections: [['Definition', 700, ['evidence', 'approval', 'update']]],
    }),
    concept({
      id: 'domain/trust-tier',
      type: 'Term',
      title: 'Trust tier',
      description: 'Derived confidence in a concept, never stored on it.',
      stale: true,
      sections: [['Definition', 640, ['verified', 'derived', 'human']]],
    }),
    concept({
      id: 'process/grilling-loop',
      type: 'Playbook',
      title: 'The grilling loop',
      description: 'One question at a time until a decision is pinned.',
      sections: [['Steps', 780, ['question', 'decision']]],
    }),
    concept({
      id: 'process/wayfinder-map',
      type: 'Playbook',
      title: 'Wayfinder map',
      description: 'How the map and its decision tickets are kept.',
      sections: [['Steps', 910, ['ticket', 'frontier', 'fog']]],
    }),
    concept({
      id: 'process/release-checklist',
      type: 'Playbook',
      title: 'Release checklist',
      description: 'Everything that must be true before a version is tagged.',
      sections: [['Steps', 1030, ['tag', 'changelog', 'verify']]],
    }),
  ],
  indexes: [
    indexDoc('', ['readme', 'glossary'], true),
    indexDoc(
      'domain',
      ['domain/durable-context', 'domain/code-backed-project', 'domain/knowledge-only-project', 'domain/automatic-lifecycle', 'domain/trust-tier'],
      true,
    ),
    // `process/` has no index.md at all — legal, and the only channel left for it is a scan.
  ],
});

// --- 3. Large: 60 concepts, six directories --------------------------------
//     Big enough that naming every omission costs more than the answer.

const AREAS = ['ingest', 'storage', 'transform', 'serving', 'policy', 'ops'];
const largeConcepts: Concept[] = [];
for (const [ai, area] of AREAS.entries()) {
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, '0');
    const cachey = i % 4 === 0;
    largeConcepts.push(
      concept({
        id: `${area}/${area}-${n}`,
        type: ai % 2 === 0 ? 'Reference' : 'Policy',
        title: `${area} ${n}`,
        description: cachey
          ? `Cache behavior and invalidation for the ${area} stage.`
          : `Notes on the ${area} stage, step ${i}.`,
        tags: cachey ? [area, 'cache'] : [area],
        density: i % 3 === 0 ? 'dense' : 'prose',
        sections: [['Notes', 500 + i * 40, cachey ? ['cache', 'invalidate', area] : [area, 'step']]],
      }),
    );
  }
}
const large = bundle({
  key: '3',
  name: 'atlas (60 concepts)',
  note: 'Six directories of ten. Any query matching broadly makes the omission notice the biggest line item.',
  concepts: largeConcepts,
  indexes: AREAS.map((area) => indexDoc(area, largeConcepts.filter((c) => c.dir === area).map((c) => c.id), true)),
});

export const FIXTURES: Corpus[] = [codeBacked, knowledgeOnly, large];

// --- Things a human cycles through in the TUI ------------------------------

export const QUERIES: Record<string, string[]> = {
  '1': [
    'how is recognised revenue computed',
    'orders table schema',
    'monthly close process',
    'refund proration ledger',
    'churn',
    'authentication rate limiting',
    'posting export column schema',
    '',
  ],
  '2': ['what is durable context', 'knowledge-only project', 'release checklist', 'trust tier', 'embeddings'],
  '3': ['cache invalidation', 'policy', 'storage', 'quantum'],
};

export const EXACT_SETS: Record<string, string[][]> = {
  '1': [
    [],
    ['metrics/revenue'],
    ['src/billing/revenue.ts'],
    ['metrics/mrr'],
    ['metrics/revenue', 'tables/orders', 'policies/revenue-recognition'],
    ['tables/orders', 'metrics/mrr'],
    ['metrics/mrr', 'metrics/mrr.md'],
  ],
  '2': [[], ['domain/durable-context'], ['domain/does-not-exist'], ['glossary', 'domain/trust-tier']],
  '3': [[], ['policy/policy-04'], ['ops/ops-01', 'ops/ops-02', 'ops/ops-03']],
};

export const BUDGETS = [150, 300, 700, 1500, 4000, 12000, 40000];
