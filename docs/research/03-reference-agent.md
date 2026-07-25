# OKF Reference Agent — Deep Analysis

## Overview

The reference agent (`reference_agent`) is a proof-of-concept CLI tool that
produces OKF bundles by running an LLM (Gemini via Google ADK) against a
BigQuery dataset and optional web documentation. It implements a **two-pass
architecture**:

1. **BQ pass** — one LLM call per concept, using BigQuery metadata tools to
   generate concept `.md` files (dataset + tables with schema, queries,
   cross-links).
2. **Web pass** — a single LLM session that crawls seed URLs, fetches pages,
   and decides to (a) augment existing concepts, (b) mint new `references/`
   docs, or (c) skip.

After both passes, `regenerate_indexes()` walks the bundle and writes
auto-generated `index.md` files at each directory level.

The agent is also a **consumer** of OKF: the `visualize` subcommand walks any
OKF bundle and produces a single self-contained `viz.html` file with a
Cytoscape.js force-directed graph.

**Key architectural properties:**

- Built on Google ADK (`google-adk>=2.0`) with `Agent`, `Runner`,
  `FunctionTool`, and `InMemorySessionService`.
- Source-agnostic `Source` ABC with a single `BigQuerySource`
  implementation.
- Tools provided to the LLM are real Python functions wrapped as
  `FunctionTool` instances.
- All mutable state (source ref, bundle root, web crawl budget) lives in
  module-level globals accessed via `get_context()` / `get_web_state()`.
- The BQ pass runs one fresh session per concept (stateless across concepts);
  the web pass runs one long session with crawl state.

---

## Source Code Structure

```
okf/src/reference_agent/
├── __init__.py            # empty namespace
├── __main__.py            # main() entry point
├── agent.py               # build_bq_agent(), build_web_agent()
├── cli.py                 # argparse: enrich + visualize subcommands
├── runner.py              # ReferenceRunner: orchestrates passes
├── bundle/
│   ├── __init__.py        # re-exports OKFDocument, paths, regenerate_indexes
│   ├── document.py        # OKFDocument dataclass: parse/serialize/validate
│   ├── paths.py           # concept_id_to_path / path_to_concept_id
│   ├── index.py           # regenerate_indexes() — walks dirs, writes index.md
│   └── synthesizer.py     # LLM-based one-sentence directory description
├── sources/
│   ├── __init__.py        # empty
│   ├── base.py            # ConceptRef dataclass + Source ABC
│   └── bigquery.py        # BigQuerySource: list/read/sample concepts
├── tools/
│   ├── __init__.py        # empty
│   ├── context.py         # ToolContext, WebState globals + accessors
│   ├── bundle_tools.py    # read_existing_doc(), write_concept_doc()
│   ├── source_tools.py    # list_concepts(), read_concept_raw(), sample_rows()
│   └── web_tools.py       # fetch_url() — enforced crawl budget
├── prompts/
│   ├── reference_instruction.md   # BQ pass LLM instructions
│   └── web_ingestion_instruction.md  # Web pass LLM instructions
├── viewer/
│   ├── __init__.py
│   ├── generator.py       # generate_visualization(): walk bundle → viz.html
│   ├── templates/viz.html # HTML shell with Cytoscape.js + marked.js CDN links
│   └── static/
│       ├── viz.css        # embedded CSS
│       └── viz.js         # embedded JS (graph init, search, detail panel)
└── web/
    ├── __init__.py
    └── fetcher.py         # fetch_and_parse(): urllib → markdownify → Page
```

### Key module responsibilities

| Module | Responsibility |
|---|---|
| `bundle/document.py` | OKF v0.2 document model: YAML frontmatter parse/serialize, validate (`type` required), `trust_tier()`, `is_stale()`, `normalize_verified()` |
| `bundle/paths.py` | Maps `tuple[str,...]` concept IDs to filesystem paths (`tables/users` → `tables/users.md`) |
| `bundle/index.py` | Walks bundle, groups concepts by `type` frontmatter, writes `index.md` files. Uses LLM `synthesizer.py` for directory descriptions when >1 child. |
| `bundle/synthesizer.py` | Calls Gemini to produce one-sentence directory descriptions from child titles/descriptions. Falls back to a static summary if the LLM call fails. |
| `sources/base.py` | `ConceptRef` (frozen dataclass: `id: tuple[str,...]`, `type`, `resource`, `hint`) and `Source` ABC with `list_concepts()`, `read_concept()`, `sample_rows()`, `find()` |
| `sources/bigquery.py` | `BigQuerySource`: discovers tables, collapses sharded tables (e.g. `events_20210101`...`events_20210131`) into one wildcard concept. Queries metadata via Python BigQuery client. Supports sample rows via `list_rows` for tables or `SELECT * LIMIT N` for views. |
| `tools/bundle_tools.py` | `write_concept_doc()`: auto-fills `generated`, reorders frontmatter, validates, enforces **augmentation guards** during web pass (schema shrinkage, sources shrinkage). `read_existing_doc()`: returns existing doc as `{frontmatter, body}`. |
| `tools/web_tools.py` | `fetch_url()`: enforces host allow-list, path prefix/deny filters, max-depth cap, max-pages cap, duplicate detection, reachability-from-seed validation. Records depth of discovered links. |
| `web/fetcher.py` | `fetch_and_parse()`: fetches HTML via `urllib`, extracts title + `<a href>` links, converts HTML to markdown via `markdownify`, truncates at 40KB. |
| `viewer/generator.py` | `generate_visualization()`: walks bundle `.md` files (skipping `index.md`), builds `Concept` objects with v0.2 signals (status, trust_tier, stale), extracts cross-links via regex `](<target>.md)`, serializes as JSON embedded in HTML. |
| `runner.py` | `ReferenceRunner`: instantiates two ADK agents + runners, orchestrates BQ pass (one session per concept), then web pass (one session total), then `regenerate_indexes()`. Provides compact event logging. |
| `agent.py` | Factory functions assembling `Agent` instances with appropriate tool sets. BQ agent: 5 tools (list, read raw, sample, read existing doc, write doc). Web agent: 6 tools (same 5 + `fetch_url`). |
| `cli.py` | `argparse` with `enrich` and `visualize` subcommands. Parses seed files, computes allowed hosts from seed hostnames. |

---

## CLI Interface

Two subcommands:

### `enrich`

```bash
python -m reference_agent enrich \
    --source bq \
    --dataset <project.dataset> \
    --out ./bundles/<name> \
    [--concept tables/events_]        # repeatable; limit to specific concepts
    [--web-seed URL]                  # repeatable
    [--web-seed-file path]            # repeatable; lines with # comments
    [--web-max-pages 100]             # default 100
    [--web-allowed-host HOST]         # repeatable; extends default (seed hosts)
    [--web-allowed-path-prefix /prefix/]  # repeatable
    [--web-denied-path-substring /login]   # repeatable
    [--web-max-depth 2]               # default 2
    [--no-web]                        # skip web pass entirely
    [--model gemini-flash-latest]     # default
    [--billing-project PROJECT]       # for BQ queries
    [-v]
```

### `visualize`

```bash
python -m reference_agent visualize \
    --bundle ./bundles/<name> \
    [--out /path/to/output.html]      # default: <bundle>/viz.html
    [--name "Display Name"]           # default: bundle dir name
```

**Seed file format:** one URL per line, `#` comments allowed. Parsed by
`_parse_seed_file()` in `cli.py:33`.

---

## BQ Pass (Metadata Extraction)

### How BigQuery metadata is queried

`BigQuerySource.list_concepts()` (`sources/bigquery.py:58`) does the
following:

1. Always creates one `BigQuery Dataset` concept (id `datasets/<dataset_id>`)
   with the dataset resource URI.
2. Lists all tables via `client.list_tables()`.
3. Classifies each table: if the table name matches the shard suffix regex
   `^(?P<prefix>.+?_)(?:P<shard>\d{6,8})$` (e.g. `events_20210101`), it is
   grouped into a single wildcard family concept with `hint.wildcard=True`,
   `hint.shard_count`, `hint.first_shard`, `hint.last_shard`.
4. Singleton tables (no numeric suffix) each get their own concept.

`read_concept()` uses the most recent shard as the representative table to
fetch metadata from: schema (recursively expanded via `_schema_to_dict()`),
row count, byte size, creation/modification times, labels, time/range
partitioning config, and clustering fields.

`sample_rows()` tries `client.list_rows()` for base tables; for views and
materialized views, falls back to `SELECT * LIMIT N`.

### How metadata maps to OKF concepts

The BQ agent (prompted by `reference_instruction.md`) follows this workflow
per concept:

1. `read_existing_doc(concept_id)` — see if prior doc exists (for
   refinement/iteration).
2. `read_concept_raw(concept_id)` — get full metadata dict.
3. `sample_rows(concept_id, n=3)` — optionally get sample data.
4. `list_concepts()` — learn all other concepts for cross-linking.
5. Compose and call `write_concept_doc()` exactly once.

The prompt mandates specific frontmatter (`type`, `title`, `description`,
`resource`, `tags`) and body sections: prose description, `# Schema` (flattened
table with RECORD nesting), `# Common query patterns` (fenced SQL blocks), and
cross-links relative to the current doc's directory.

---

## Web Pass (Enrichment)

### Crawl architecture

The web pass runs as a **single long-running LLM session** with crawl state in
`WebState` (`tools/context.py:11`). The user message (`runner.py:138`)
provides:

- Seed URLs
- Hard limits: max pages, max hop depth, allowed hosts, path prefixes,
  denied substrings

The LLM drives its own crawl: calls `fetch_url()` repeatedly, receives the
markdown content + extracted outbound links, and decides which links to
follow next.

### How URLs are fetched

`web_tools.py:fetch_url()` enforces all limits **inside the tool** (the LLM
cannot override them):

1. Scheme must be http/https.
2. Host must be in `state.allowed_hosts` (default: seed hostnames only).
3. Path must match `allowed_path_prefixes` (if set) and not contain any
   `denied_path_substrings`.
4. URL must not already be in `state.visited`.
5. `state.fetched_count` must be < `state.max_pages`.
6. URL must be reachable from a seed (i.e. have a recorded depth in
   `state.url_depth`). Seeds are pre-registered at depth 0; each fetched
   page's outbound links are registered at `depth+1`.
7. Depth must not exceed `state.max_depth`.

On success, the tool returns `{url, title, markdown, links, fetched_count,
max_pages_budget, depth, max_depth}`. On rejection, it returns `{error,
url, fetched_count, max_pages_budget}`.

### How the LLM decides

The web prompt (`web_ingestion_instruction.md`, 15KB) is the longest prompt.
Key directives:

- **Follow high-value links**: seed pages are typically indexes; the most
  valuable outbound links are to sample-query/cookbook pages,
  metric-definition pages, and field/enum reference pages.
- **Three choices per page**: (1) enrich existing concept(s), (2) mint a
  `references/<slug>` doc via a four-gate test, or (3) skip.
- **Four-gate test for references**: the page must be a referenceable
  entity/metric/enum (gate 1), not bundle-level meta like overview/tutorial
  (gate 2), must support a concrete citation sentence (gate 3), and must be
  reusable by 2+ existing concepts (gate 4).
- **Metrics and joins bypass the gates**: metrics (aggregations with SQL)
  are always minted as `references/metrics/<slug>.md` and must be cited
  from each contributing table. Join paths go in
  `references/joins/<a>__<b>.md` with both sides linking back.
- **Augmentation rules**: when enriching existing concepts, the LLM must
  preserve all existing frontmatter values (type, title, resource
  verbatim), merge (never replace) tags and sources, and preserve every
  `#` heading and schema field from the existing doc.
- **Schema guard**: `write_concept_doc()` refuses writes during the web
  pass that shrink a `BigQuery Table` doc's `# Schema` field set or its
  `sources` list — forcing the LLM to re-read and retry.

---

## Bundle Generation

### How concept `.md` files are written

`write_concept_doc()` (`tools/bundle_tools.py:50`):

1. Parses the concept ID, derives the filesystem path.
2. Auto-fills `generated: {by: reference_agent/<model>, at: <ISO timestamp>}`
   unless the caller provides its own `{by, at}` mapping.
3. Reorders frontmatter keys to a canonical order (`type`, `resource`,
   `title`, `description`, `tags`, `status`, `generated`, `verified`,
   `stale_after`, `sources`, `usage_window`).
4. Creates an `OKFDocument`, validates (`type` required), serializes
   (YAML frontmatter + `---` delimiters + body), and writes.
5. During the web pass (`is_web_pass() == True`), if the path already exists,
   runs the augmentation guard:
   - Compares existing `# Schema` backtick-quoted field names with new ones.
     Rejects if any fields are missing.
   - Compares existing `sources` list size with new one. Rejects if shrunk.
   - Guard only fires for `type: BigQuery Table` docs.
6. Returns `{path, bytes}` on success or `{error, concept_id}` on failure.

### Frontmatter population

- `type`: always populated from the `ConceptRef.type` (e.g. `BigQuery Table`,
  `BigQuery Dataset`, `Reference`).
- `title`: human-readable display name, recommended by prompts.
- `description`: one sentence, used verbatim in `index.md`.
- `resource`: BigQuery REST URI for BQ concepts; the ingested page URL for
  reference concepts.
- `tags`: YAML list inferred from metadata (e.g. `[ga4, ecommerce,
  sharded-tables]`). For references: `[metric]`, `[join]`, etc.
- `generated`: auto-filled with `{by, at}`.
- `sources`: list of `{id, resource, title}` — BQ metadata + ingested page
  URLs. Claims in body are footnoted to `sources[].id`.
- `status`: `draft`/`stable`/`deprecated`, defaults to `stable`.
- `verified`: human or process attestation events (v0.2 §5.2).
- `stale_after`: date after which the concept is stale (v0.2 §5.5).

### Linking strategy

Cross-links use paths **relative to the linking doc's directory**:

- Sibling table from `tables/events_.md`: `[users](users.md)`
- Parent dataset: `[dataset](../datasets/ga4_obfuscated_sample_ecommerce.md)`
- Reference from table: `[purchasers](../references/metrics/purchasers.md)`
- From reference to table: `[events_](../tables/events_.md)`

This ensures links resolve correctly when browsing on GitHub or any
static file server. Absolute paths (starting with `/`) are forbidden.

### Index regeneration

`regenerate_indexes()` (`bundle/index.py:57`) walks the bundle bottom-up
(deepest directories first for parent description synthesis):

1. For each directory, collects all `.md` children and subdirectories.
2. Groups concepts by `type` frontmatter.
3. Writes `index.md` with `# <Type>` headings and markdown lists.
4. For subdirectory entries in parent `index.md`, uses the directory's
   own description (from `dir_descriptions`) — either a single child's
   description or an LLM-generated synthesis via `synthesizer.py`.

---

## Visualizer

### How viz.html is generated

`viewer/generator.py:generate_visualization()`:

1. Walks the bundle, skips `index.md`, parses each `.md` file as `OKFDocument`.
2. Builds a `Concept` dataclass per file, extracting all OKF v0.2 signals:
   - `status`, `trust_tier` (derived from `verified`), `stale` (from
     `stale_after`), `generated`, `verified`, `sources`.
3. Extracts cross-links from the body via regex
   `\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)`, resolving them relative to
   the doc's directory. Absolute paths and external URLs are skipped.
4. Builds a graph: nodes with type-based color palette (BigQuery Dataset
   `#8b5cf6`, BigQuery Table `#3b82f6`, Reference `#10b981`), edges from
   cross-links, bodies keyed by concept ID.
5. Loads `viz.html` template, inlines `viz.css` and `viz.js`, embeds the
   graph as `window.BUNDLE = <JSON>`, and writes a single HTML file.

### Cytoscape.js integration

The embedded JS (`viewer/static/viz.js`):

- Initializes Cytoscape with elements from the embedded JSON.
- Node styling: colored by type (`data(color)`), size proportional to body
  length, stale nodes get dashed red border, deprecated nodes get 55%
  opacity, selected nodes get amber border.
- Edge styling: light gray with arrowheads, bezier curves.
- **Search:** filters nodes by label/id/tags substring match; dims
  non-matching nodes and edges.
- **Type filter:** dropdown of all types in the bundle; dims non-matching.
- **Layout switcher:** cose (force-directed, default), concentric,
  breadth-first, circle, grid.
- **Detail panel:** on node tap, shows frontmatter (type chip with color,
  title, id, badges for status/trust-tier/staleness), description,
  resource link, tags, generated/verified/sources, rendered body
  (via `marked.js`), and backlinks (computed from reverse link graph).
- **Internal link rewriting:** links matching `/<path>.md` are rewired to
  navigate within the viewer instead of following the path.
- Auto-selects the first BigQuery Dataset or first node on load.

### Bundle embedding

- `viz.css`: 4.4KB, dark header, grid layout, styled frontmatter
  description list, badges with color-coded classes.
- `viz.html`: ~2KB shell with CDN links to Cytoscape 3.28.1 and
  marked 12.0.0, placeholder markers for CSS/JS/data.
- Result: a single self-contained HTML file (e.g. GA4 viz.html is 46KB
  for 2 concepts, Stack Overflow viz.html is 95KB for 10+ concepts).

---

## Samples and Bundles

### Available bundles

Four bundles checked into the repo:

| Bundle | Dataset | Concepts | Notes |
|---|---|---|---|
| `ga4/` | `ga4_obfuscated_sample_ecommerce` | 1 dataset, 1 table family (`events_*`), 7 metric references | Sharded daily tables, e-commerce |
| `stackoverflow/` | `stackoverflow` | 1 dataset, ~10 tables (posts, users, tags, comments, votes, badges, post_history, post_links), references | Independent entities, multi-concept enrichment |
| `crypto_bitcoin/` | `crypto_bitcoin` | 1 dataset, 4 tables (blocks, transactions, inputs, outputs), references | Tightly related fact tables, FK relationships |
| `acme_retail/` | (unknown dataset) | Present in bundles directory, unlisted in samples | Additional example |

### Bundle structure (GA4 example)

```
bundles/ga4/
├── index.md                          # top-level index
├── viz.html                          # self-contained viewer
├── datasets/
│   ├── index.md
│   └── ga4_obfuscated_sample_ecommerce.md
├── tables/
│   ├── index.md
│   └── events_.md
└── references/
    ├── index.md
    └── metrics/
        ├── index.md
        ├── purchasers.md
        ├── n_day_active_users.md
        ├── n_day_inactive_users.md
        ├── frequently_active_users.md
        ├── highly_active_users.md
        ├── acquired_users.md
        └── google_acquired_cohorts.md
```

### Concept file examination

**Dataset concept** (`datasets/ga4_obfuscated_sample_ecommerce.md`):
- Frontmatter: `type: BigQuery Dataset`, resource URI, title, description,
  tags, `generated: {by, at}`, `sources` with two entries (BQ metadata + GA4
  demo docs).
- Body: prose (1 para), `# Schema` (references child table), `# Common query
  patterns` (2 SQL snippets — wildcard count, `__TABLES__` metadata).
- Cross-links: `[events_](../tables/events_.md)`.
- Footnotes: `[^ga4-demo-docs]` keyed to `sources[].id`.

**Table concept** (`tables/events_.md`):
- Frontmatter: `type: BigQuery Table`, `resource` with wildcard `*`, title,
  one-sentence description, `tags: [analytics, e-commerce, ga4,
  sharded-tables]`, `generated`, `sources` (3 entries: GA4 export docs, BQ
  metadata, sample queries).
- Body: prose (3 paras) describing grain, time range, use cases, nested
  records.
- `# Schema`: HTML table with field name, type, mode, description — nested
  RECORD fields indented with `*field.subfield*` notation.
- `# Common query patterns`: 3 fenced SQL blocks (event counts, `UNNEST`
  on `event_params`, `UNNEST` on `items`).
- `# Metrics`: bullet list of 7 metric references with relative links.
- Footnotes at bottom: `[^ga4-export-docs]`, `[^metadata]`.

**Metric reference** (`references/metrics/purchasers.md`):
- Frontmatter: `type: Reference`, `resource` (source page URL), title,
  description, `tags: [metric, audience, ga4, purchasers]`, `generated`,
  `sources` (one entry).
- Body: one-sentence definition, `# Schema` (states it's a query pattern, not
  a schema), `# Common query patterns` (fenced SQL block with the metric
  computation), footnote.

---

## Tests

### What is tested

Six test files covering key modules:

| Test file | Coverage |
|---|---|
| `test_document.py` | `OKFDocument` parse/serialize roundtrip, no-frontmatter fallback, unterminated frontmatter error, `validate()` rejection of missing `type`, v0.2 signals: `normalize_verified()` (bare mapping→list), `trust_tier()` (unverified / machine-confirmed / human-reviewed), `is_stale()` (past/present/future dates, absent key, unparseable) |
| `test_index.py` | `regenerate_indexes()` groups by type, writes relative links, synthesizes directory descriptions, reuses single-child description, skips empty directories |
| `test_bigquery_source.py` | Wildcard shard collapse (`events_20210101`...→`events_`), `sample_rows()` via `list_rows` for tables, fallback to `SELECT * LIMIT N` for views, `read_concept()` returns schema with nested RECORD fields and partitioning/clustering |
| `test_bundle_tools.py` | `write_concept_doc()`: basic write, auto-fill `generated`, preserve user-supplied `generated`, web-pass schema shrinkage rejection, web-pass sources shrinkage rejection, web-pass augmentation with new section allowed, BQ-pass (non-web) can shrink schema, guard only fires for `BigQuery Table` type |
| `test_web_fetcher.py` | `fetch_and_parse()`: title extraction, link extraction (relative→absolute, mailto/javascript skip), non-HTML rejection, truncation at 40KB, network error wrapping |
| `test_web_tools.py` | `fetch_url()`: seed fetch records child link depth, allowed-path-prefix rejection, denied-path-substring rejection, max-depth cap, unregistered URL rejection |
| `test_viewer.py` | `generate_visualization()`: writes HTML with Cytoscape + marked.js, `index.md` excluded from concepts, cross-links become edges, missing target links skipped, node colors match palette, v0.2 signals (status, trust_tier, stale, verified, sources) in payload, raises `FileNotFoundError` for missing bundle |

### Test patterns

- All tests use `pytest` with `tmp_path` fixtures.
- Mock `bigquery.Client` via `unittest.mock.patch`.
- Mock `fetch_and_parse` via `unittest.mock.patch`.
- `autouse` fixture `_cleanup` clears `clear_web_state()` to avoid state
  leakage between tests.
- Tests exercise error paths explicitly: schema shrinkage rejection,
  augmentation guard behavior, network errors, invalid URLs.

---

## Observations for Skill Implementation

### What the agent does that a skill should replicate

1. **Two-pass enrichment model** — metadata extraction (structured source →
   concepts) then web augmentation (documentation → enrich + reference minting).
   This is the core pattern: build the skeleton from authoritative metadata,
   then flesh it out from documentation.

2. **LLM-as-crawler with tight guardrails** — the LLM decides which links to
   follow, but the fetch tool enforces host allow-list, path filters, depth,
   page budget. This is safer than open-ended crawling and leverages LLM
   judgment for link selection.

3. **Augmentation guards** — the `write_concept_doc()` schema and sources
   guards prevent the web pass from destroying metadata-pass content. This
   pattern (tool-level validation that rejects destructive writes) is a
   strong design for any multi-pass enrichment pipeline.

4. **Structured extractions (metrics, joins, dimensions)** — the web prompt
   explicitly instructs the LLM to recognize and extract these content types
   into their own `references/` subdirectories with mandatory back-linking.
   This is a domain-specific pattern for catalog enrichment.

5. **Relative cross-linking** — all links are file-relative, making the
   bundle browseable as plain files on GitHub or any filesystem.

6. **Auto-generated `index.md`** — groups by type, synthesizes directory
   descriptions, enables progressive disclosure for agents and humans.

### What is different (agent-specific, not needed in a skill)

1. **Google ADK dependency** — the agent uses `google.adk.Agent`,
   `google.adk.runners.Runner`, and `InMemorySessionService`. A skill would
   use the host agent's own runtime (no separate runner).

2. **BigQuery-specific source** — only one source implementation exists. A
   skill would be source-agnostic: the host agent brings its own ability to
   read data.

3. **Module-level globals for context** — `_ctx` and `_web` are module-level
   in `tools/context.py`. This works for a single-threaded CLI but is not
   appropriate for a skill loaded into a multi-session agent.

4. **Inline LLM for index synthesis** — `synthesizer.py` calls Gemini
   directly. A skill would delegate to the host agent for this.

5. **SDK-specific function tools** — `FunctionTool` wrapping is ADK-specific.
   A skill would express tools in the host agent's native tool format.

### Design patterns worth adopting

1. **Concept-aware write tool** — `write_concept_doc()` understands the OKF
   format (frontmatter ordering, auto-filled `generated`, validation) and
   enforces augmentation rules. A skill's write tool should similarly
   understand the output format's invariants.

2. **Web crawl state as a tool-enforced dataclass** — `WebState` tracking
   `visited`, `fetched_count`, `url_depth` inside the tool rather than in
   the prompt means the LLM cannot hallucinate around limits.

3. **Canonical frontmatter key order** — `_PREFERRED_KEY_ORDER` in
   `bundle_tools.py:17` ensures consistent output formatting, which is
   important for diffability in version control.

4. **Separate prompt files** — `reference_instruction.md` and
   `web_ingestion_instruction.md` are loaded as package resources via
   `importlib.resources`. This separation makes prompts versionable and
   editable independently of code.

5. **Validation at write time, not read time** — `write_concept_doc()` calls
   `doc.validate()` before writing, catching missing required keys early.

6. **Idempotent writes** — `read_existing_doc()` + `write_concept_doc()`
   allows re-running the BQ pass without losing web pass additions (as long
   as the schema guard only fires during the web pass).

7. **Bundle format self-description** — the viz generator reads the bundle
   format, doesn't require a separate schema. It extracts whatever
   frontmatter keys exist and renders accordingly.

### CLI patterns worth adopting

- `enrich` / `visualize` subcommand split (separation of production from
  consumption).
- Repeatable `--concept` for iterative development.
- Seed file format: URLs + `#` comments, parsed with deduplication.
- Allowed-host inference from seed hostnames (default: only seed hosts).
- Explicit `--no-web` flag to skip web pass.
- Verbose mode that toggles detailed LLM event logging.
