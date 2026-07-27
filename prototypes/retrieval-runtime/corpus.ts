// PROTOTYPE — throwaway. Fixtures for the retrieval runtime (#13).
//
// #13: "The existing prototype fixtures remain deterministic regression fixtures, not
// calibration evidence." Every number below is invented. They exist to make behavior
// reachable, never to justify a default.

import { priced, type Priced } from './cost.ts';

export interface Section {
  heading: string;
  /** searchable body text of this section */
  text: string;
  cost: Priced;
}

export interface Concept {
  id: string;
  dir: string;
  path: string;
  /** #13: LINE carries "authored title and description WHEN PRESENT" — both optional. */
  title?: string;
  description?: string;
  type?: string;
  tags?: string[];
  /** open string per the OKF spec; `undefined` means the author wrote none */
  status?: string;
  /** #12 owns the real field name; injected here and deliberately not named after a candidate */
  sourceRefs?: string[];
  /** untyped edges (spec §6) — ranking and coherence hints only */
  links: string[];
  /** body text before the first heading. Its existence is why SECTION ⊊ FULL. */
  preamble?: string;
  sections: Section[];
  cost: {
    locator: Priced;
    /** title + description as LINE renders them */
    titleDesc: Priced;
    /** complete authored frontmatter in canonical serialized form */
    frontmatter: Priced;
    /** the section manifest this prototype adds to SECTION — see README */
    manifest: Priced;
    /** the complete concept body */
    body: Priced;
  };
  /** discovery-work cost of reading and parsing this file */
  bytes: number;
}

export interface IndexDoc {
  dir: string;
  entries: string[];
  /** #28 fb0a147: bare reveals title only and pre-pays nothing; descriptive reveals
   *  title+description and pre-pays LINE. Only meaningful under the in-context seam. */
  withDescriptions: boolean;
  cost: Priced;
  bytes: number;
}

export interface Corpus {
  key: string;
  name: string;
  note: string;
  concepts: Concept[];
  indexes: IndexDoc[];
  /** cost of the filesystem inventory itself */
  inventory: Priced;
  inventoryBytes: number;
}

function c(x: Partial<Concept> & { id: string; dir: string }): Concept {
  const sections = x.sections ?? [];
  const bodyChars =
    (x.preamble?.length ?? 0) + sections.reduce((n, s) => n + s.text.length, 0);
  return {
    path: `${x.dir}/${x.id}.md`,
    links: [],
    sections: [],
    bytes: Math.max(120, bodyChars * 2),
    cost: {
      locator: priced(6, 6),
      titleDesc: priced(
        Math.ceil(((x.title?.length ?? 0) + (x.description?.length ?? 0)) / 3) || 0,
        Math.ceil(((x.title?.length ?? 0) + (x.description?.length ?? 0)) / 3.4) || 0,
      ),
      frontmatter: priced(28, 24),
      manifest: priced(Math.max(2, sections.length * 4), Math.max(2, sections.length * 3)),
      body: priced(Math.ceil(bodyChars / 2.9), Math.ceil(bodyChars / 3.6)),
    },
    ...x,
  } as Concept;
}

function s(heading: string, text: string): Section {
  return { heading, text, cost: priced(Math.ceil(text.length / 2.9), Math.ceil(text.length / 3.6)) };
}

// ---------------------------------------------------------------------------
// KNOWLEDGE — a knowledge-only bundle. Carries the multi-clause / unlinked case.
// ---------------------------------------------------------------------------

const KNOWLEDGE: Corpus = {
  key: 'knowledge',
  name: 'knowledge-only bundle',
  note: 'Sectioned and sectionless bodies, sparse metadata, one deprecated concept.',
  inventory: priced(24, 20),
  inventoryBytes: 400,
  indexes: [
    { dir: 'concepts', entries: ['retention', 'policy-review'], withDescriptions: true, cost: priced(40, 34), bytes: 600 },
    { dir: 'guides', entries: ['onboarding', 'sectionless-guide'], withDescriptions: false, cost: priced(16, 13), bytes: 300 },
  ],
  concepts: [
    c({
      id: 'retention',
      dir: 'concepts',
      title: 'Retention window',
      description: 'How long durable context is kept before compaction.',
      type: 'concept',
      tags: ['lifecycle', 'storage'],
      status: 'active',
      links: ['policy-review'],
      preamble: 'Retention is measured per bundle.',
      sections: [
        s('Definition', 'The retention window is the interval during which a concept remains addressable.'),
        s('Rationale', 'Compaction without a window destroys provenance and makes audits impossible.'),
        s('Edge cases', 'A concept referenced by an open ticket is retained past its window.'),
      ],
    }),
    c({
      id: 'policy-review',
      dir: 'concepts',
      title: 'Policy review',
      description: 'The cadence at which a retention policy is re-approved.',
      type: 'concept',
      tags: ['governance'],
      status: 'active',
      links: [],
      sections: [
        s('Cadence', 'Every policy is reviewed each quarter by its owner.'),
        s('Escalation', 'An unreviewed policy is escalated after two missed quarters.'),
      ],
    }),
    c({
      id: 'onboarding',
      dir: 'guides',
      // no title, no description — authored-absent, distinct from not-observed
      type: 'guide',
      status: 'active',
      links: ['retention'],
      sections: [s('First week', 'Read the bundle index and the concept map before writing anything.')],
    }),
    c({
      id: 'sectionless-guide',
      dir: 'guides',
      title: 'Sectionless guide',
      description: 'A body with no headings at all.',
      type: 'guide',
      status: 'active',
      links: [],
      preamble:
        'This guide is four paragraphs of prose with no heading anywhere in it, which is why SECTION is not an available tier for it and allocation must move from CARD straight to FULL.',
      sections: [],
    }),
    c({
      id: 'legacy-retention',
      dir: 'concepts',
      title: 'Legacy retention',
      description: 'Superseded retention rules kept for provenance.',
      type: 'concept',
      tags: ['lifecycle'],
      status: 'deprecated',
      links: ['retention'],
      sections: [s('History', 'The original retention rule was a flat ninety days for every bundle.')],
    }),
  ],
};

// ---------------------------------------------------------------------------
// CODE — a code-backed bundle. Carries identifiers, source refs, the ledger-separation
// experiment (a large unselected body), and a nested-heading trap.
// ---------------------------------------------------------------------------

const CODE: Corpus = {
  key: 'code',
  name: 'code-backed bundle',
  note: 'Identifier-heavy, source-traceable, with one very large unselected concept.',
  inventory: priced(30, 26),
  inventoryBytes: 520,
  indexes: [
    { dir: 'okf', entries: ['trust-tier', 'get-user-name'], withDescriptions: true, cost: priced(44, 38), bytes: 700 },
  ],
  concepts: [
    c({
      id: 'trust-tier',
      dir: 'okf',
      title: 'Trust tier',
      description: 'Advisory classification of verification evidence.',
      type: 'concept',
      tags: ['trust'],
      status: 'active',
      sourceRefs: ['src/okf/trust.ts'],
      links: ['get-user-name'],
      sections: [
        s('Definition', 'A trust tier records what evidence was seen, never what authority was granted.'),
        s('Non-goals', 'A tier is not a permission level and must not gate a write.'),
      ],
    }),
    c({
      id: 'get-user-name',
      dir: 'okf',
      title: 'getUserName resolution',
      description: 'How the getUserName identifier resolves across adapters.',
      type: 'concept',
      tags: ['identity'],
      status: 'active',
      sourceRefs: ['src/okf/user.ts'],
      links: [],
      sections: [s('Resolution', 'The adapter resolves get_user_name and getUserName to one record.')],
    }),
    c({
      id: 'bulk-export',
      dir: 'okf',
      title: 'Bulk export',
      description: 'A very large concept that no query below selects.',
      type: 'concept',
      status: 'active',
      links: [],
      // deliberately enormous: the ledger-separation experiment reads it during discovery
      // and must never charge it to context under the out-of-context seam.
      preamble: 'x'.repeat(9000),
      sections: [],
    }),
  ],
};

// A corpus identical to CODE in every concept a query selects, but with 10x the unselected
// bytes. #13's ledger split predicts identical CONTEXT spend across the pair; #28's
// single-ledger pricing predicts different spend. That difference is the experiment.
const CODE_HEAVY: Corpus = {
  ...CODE,
  key: 'code-heavy',
  name: 'code-backed bundle (10x unselected bytes)',
  note: 'Identical in every selected concept; only unselected material differs.',
  concepts: CODE.concepts.map((k) => {
    if (k.id !== 'bulk-export') return k;
    const { cost: _dropCost, bytes: _dropBytes, ...rest } = k;
    return c({ ...rest, preamble: 'x'.repeat(90000), sections: [] });
  }),
};

export const CORPORA: Corpus[] = [KNOWLEDGE, CODE, CODE_HEAVY];
export const byKey = (key: string): Corpus => CORPORA.find((x) => x.key === key) ?? KNOWLEDGE;
