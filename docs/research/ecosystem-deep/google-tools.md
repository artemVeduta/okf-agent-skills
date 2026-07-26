# Google-Originated OKF Tools — Exhaustive Source Investigation

> Based on deep inspection of GitHub source at
> `GoogleCloudPlatform/knowledge-catalog`, commit `3fcbb9f`, July 2026.

---

## 1. Enrichment Agent (reference_agent)

### Repository

`okf/src/reference_agent/` — a Python package of 15 source files forming the
**reference implementation** of an agentic knowledge enrichment pipeline.

### What it does

An LLM-driven agent (Google ADK + Gemini) that reads structured metadata from a
**source** (currently only BigQuery), enriches each concept into an OKF v0.2
markdown document, optionally crawls web pages to augment the bundle, and
regenerates `index.md` files. It is Google's published reference producer for
the repository's BigQuery example; it is not designated as the canonical
producer for all OKF bundles.

### Source files (audited inventory)

```
okf/src/reference_agent/
├── __init__.py            (22 B — package marker)
├── __main__.py            (94 B — delegates to cli.main())
├── cli.py                 (6985 B — argparse CLI, entry point)
├── runner.py              (10597 B — orchestration loop)
├── agent.py               (1500 B — ADK Agent builder)
├── bundle/
│   ├── __init__.py        (368 B — public API re-exports)
│   ├── document.py        (3702 B — OKFDocument dataclass + validation)
│   ├── index.py           (3385 B — index.md regeneration)
│   ├── paths.py           (988 B — concept_id ↔ filesystem conversion)
│   └── synthesizer.py     (1497 B — LLM directory descriptions)
├── sources/
│   ├── __init__.py        (96 B — re-exports ConceptRef, Source)
│   ├── base.py            (904 B — Source ABC + ConceptRef dataclass)
│   └── bigquery.py        (8122 B — BigQuerySource implementation)
├── tools/
│   ├── __init__.py        (0 B)
│   ├── bundle_tools.py    (7165 B — read_existing_doc, write_concept_doc)
│   ├── context.py         (1999 B — ToolContext + WebState globals)
│   ├── source_tools.py    (2313 B — list_concepts, read_concept_raw, sample_rows)
│   └── web_tools.py       (3590 B — fetch_url)
├── web/
│   ├── __init__.py        (0 B)
│   └── fetcher.py         (2766 B — Page dataclass, URL→markdown parser)
├── prompts/
│   ├── reference_instruction.md   (5262 B — BQ pass system prompt)
│   └── web_ingestion_instruction.md (15286 B — web pass system prompt)
└── viewer/
    ├── __init__.py        (106 B — re-export generate_visualization)
    ├── generator.py       (6570 B — bundle→Cytoscape.js graph builder)
    ├── static/
    │   ├── viz.js         (9978 B — viewer JavaScript)
    │   └── viz.css        (4421 B — viewer CSS)
    └── templates/
        └── viz.html       (2131 B — HTML shell with placeholder slots)
```

### Installation/Run

```bash
# Python ≥3.11
cd okf/
pip install -e ".[dev]"

# Requires:
#   - google-adk >= 2.0
#   - google-cloud-bigquery >= 3.20
#   - pyyaml, pydantic, markdownify
#   - gcloud auth application-default login (for BigQuery)
#   - GOOGLE_API_KEY or ADC (for Gemini API)

# Usage:
python -m reference_agent enrich --source bq --dataset project.dataset --out ./output
```

### Full CLI Interface

```
reference-agent enrich
  --source {bq}                  REQUIRED  Source type (only "bq" supported)
  --dataset STR                  REQUIRED  "project.dataset" identifier
  --billing-project STR          Optional  GCP project to bill queries to
  --out PATH                     REQUIRED  Bundle root directory
  --concept STR                  Repeatable  Enrich only this concept id (e.g. "tables/events_")
  --model STR                    Default: gemini-flash-latest  Gemini model id
  --web-seed URL                 Repeatable  Seed URL for web pass
  --web-seed-file PATH           Repeatable  File with one seed URL per line (# comments ok)
  --web-max-pages INT            Default: 100  Hard cap on pages fetched
  --web-allowed-host HOSTNAME    Repeatable  Extra allowed host beyond seed hosts
  --web-allowed-path-prefix PREFIX Repeatable  Only fetch URLs with this path prefix
  --web-denied-path-substring S  Repeatable  Reject URLs with this path substring
  --web-max-depth INT            Default: 2  Max hop distance from any seed
  --no-web                       Flag  Skip web pass entirely
  -v, --verbose                  Flag  Debug logging

reference-agent visualize
  --bundle PATH                  REQUIRED  Bundle root directory
  --out PATH                     Optional   Output HTML path (default: <bundle>/viz.html)
  --name STR                     Optional   Display name (default: bundle directory name)
```

### Architecture

```
cli.main()
  ├── "enrich" → ReferenceRunner
  │              ├── Source.list_concepts() → [ConceptRef]
  │              ├── for each concept:
  │              │   └── enrich_concept(ref)
  │              │       ├── ADK Runner (BQ agent)
  │              │       │   ├── Model: gemini-flash-latest
  │              │       │   ├── Instruction: reference_instruction.md
  │              │       │   └── Tools: [list_concepts, read_concept_raw,
  │              │       │              sample_rows, read_existing_doc,
  │              │       │              write_concept_doc]
  │              │       └── Agent calls write_concept_doc exactly once per concept
  │              ├── run_web_pass() (optional)
  │              │   ├── ADK Runner (web agent)
  │              │   │   ├── Tools: [list_concepts, read_concept_raw,
  │              │   │   │          read_existing_doc, write_concept_doc, fetch_url]
  │              │   │   └── Instruction: web_ingestion_instruction.md
  │              │   └── fetch_url tool enforces: max_pages, allowed_hosts,
  │              │       allowed_path_prefixes, denied_path_substrings, max_depth
  │              └── regenerate_indexes(bundle_root)
  │                  └── Synthesizes index.md files recursively
  └── "visualize" → generate_visualization(bundle_root, out_path)
                     ├── _walk_concepts() → [Concept]
                     │   └── Extracts: id, type, title, description, resource,
                     │                tags, status, generated, verified, stale_after,
                     │                sources, trust_tier, stale, links_to
                     ├── _build_graph() → {nodes, edges, bodies, types, palette}
                     └── Inlines JSON + JS + CSS into viz.html template
```

**Key architectural decisions:**

1. **Two-phase agent runs**: BQ pass (structural enrichment), then web pass
   (contextual augmentation). The BQ pass covers every concept; the web pass
   is optional and additive.
2. **Per-concept ADK sessions**: Each concept gets its own `enrich-<uuid>`
   session via `InMemorySessionService`. No shared conversational state.
3. **Tool context via globals**: `set_context()` / `get_context()` store source
   and bundle root as module-level globals, avoiding explicit DI.
4. **Web state is separate from tool context**: `set_web_state()` /
   `get_web_state()` / `clear_web_state()` manage crawl state. `is_web_pass()`
   lets tools know which pass is active.
5. **Augmentation guard in `write_concept_doc`**: During web pass, the tool
   refuses to shrink a BigQuery Table's `# Schema` field set or `sources` list,
   enforcing that web pass only augments, never replaces.

### BQ Pass — Exact Metadata Extraction

**`BigQuerySource`** (`sources/bigquery.py`):

**SQL queries issued:**
- `bigquery.Client.list_tables(dataset_ref)` — no SQL; uses the REST API
  `tables.list` to enumerate tables.
- `bigquery.Client.get_table(table_ref)` — REST API `tables.get` for schema,
  partitioning, clustering, row count, labels.
- For sampling: `bigquery.Client.list_rows(table_ref, max_results=n)` (REST
  `tabledata.list`) for base tables; for views/materialized views, falls back
  to `SELECT * FROM project.dataset.table LIMIT n` query.

**Sharding detection:**
- Regex `^(?P<prefix>.+?_)(?P<shard>\d{6,8})$` detects GA4-style daily shards
  (`events_20250601`). The `events_` family gets one ConceptRef with
  `hint.wildcard=True`, `family_prefix="events_"`, `shard_count`, `first_shard`,
  `last_shard`.

**ConceptRef generation:**
- 1 `BigQuery Dataset` concept: id=`datasets/<dataset_id>`, resource=
  `https://bigquery.googleapis.com/v2/projects/<p>/datasets/<d>`
- 1 `BigQuery Table` concept per shard family (wildcard, with representative
  table being the latest shard) + 1 per singleton table.

**Metadata extracted per table (`read_concept`):**
```
dataset_project, dataset_id, representative_table_id, wildcard
friendly_name, description, labels
num_rows, num_bytes, created, modified
schema: [{name, type, mode, description?, fields? (recursive for RECORD)}]
time_partitioning: {type, field, expiration_ms}
range_partitioning: {field, range: {start, end, interval}}
clustering_fields: [string]
family_prefix, shard_count, first_shard, last_shard (if wildcard)
```

### Web Pass — fetch_url Implementation

**`fetch_url`** (`tools/web_tools.py`) enforces a multi-layer filter:

1. Scheme check → `http`/`https` only.
2. Host check → `parsed.netloc` must be in `state.allowed_hosts`.
3. Path prefix allowlist → `path.startswith(p)` for at least one prefix.
4. Denied substring blocklist → any `bad in path` rejects.
5. Already-visited dedup → `state.visited` set.
6. Budget check → `state.fetched_count >= state.max_pages`.
7. Depth tracking → URL must already be registered in `state.url_depth`
   (i.e., must have been surfaced as a link from a parent page). Unknown
   URLs manually typed by the agent are rejected with message:
   `"URL not reachable from a seed within the crawl graph"`.
8. Depth cap → `depth > state.max_depth` rejects.
9. On success: increments `fetched_count`, adds page to `visited`, registers
   all outbound links at `child_depth = depth + 1`.

**`fetch_and_parse`** (`web/fetcher.py`):
- Uses `urllib.request.urlopen` (stdlib, no external HTTP library).
- Custom User-Agent: `"okf-reference-agent/0.1 (+https://github.com/amirhormati/open-knowledge-format)"`.
- Extracts `<title>` via regex for page title.
- Extracts `<a href>` via regex for outbound links, resolves relative URLs,
  deduplicates by absolute URL.
- Converts HTML → markdown via `markdownify(html, heading_style="ATX")`.
- Truncates markdown to 40 KB (hard ceiling).
- Returns a `Page(url, title, markdown, links)` dataclass.

### Concept Document Generation — write_concept_doc

**`write_concept_doc`** (`tools/bundle_tools.py`):

**Frontmatter fields written:**
```yaml
type: <concept type>           # From ConceptRef — REQUIRED
title: <display name>          # LLM-authored
description: <one sentence>    # LLM-authored — used in index.md
resource: <canonical URI>      # From BigQuery metadata
tags: [list]                   # LLM-inferred
status: stable|draft|deprecated # Default: stable
generated:                     # Auto-filled by tool
  by: reference_agent/<model>
  at: <ISO 8601 UTC now>
sources:                       # LLM-populated provenance
  - id: <key>                  # Stable key for footnote attribution
    resource: <URI>
    title: <label>
```

**Frontmatter key ordering**: `_PREFERRED_KEY_ORDER = ("type", "resource",
"title", "description", "tags", "status", "generated", "verified",
"stale_after", "sources", "usage_window")`. Produced frontmatter uses this
order; newly authored keys appear after.

**Validation**: Only `type` is required (OKF v0.2 §11). If missing, the tool
returns an error dict instead of writing:
```json
{"error": "Refusing to write document with invalid frontmatter: ...", "concept_id": "..."}
```

**Body structure** (as instructed by `reference_instruction.md`):
1. 1–3 paragraph prose description (grain, time range, obfuscation)
2. `# Schema` — flattened field listing with nested RECORD sub-fields
3. `# Common query patterns` — 1–3 fenced ```sql blocks
4. No `# Citations` section (provenance lives in frontmatter `sources`)

**Cross-linking**: LLM is instructed to use file-relative paths based on
`list_concepts()` output. Eg. `[users](users.md)` from a sibling table doc,
`[dataset](../datasets/<slug>.md)` from a table doc.

**Serialization**: `OKFDocument.serialize()` produces:
```
---
key: value
---
\nbody text\n
```
Uses `yaml.safe_dump(sort_keys=False)` for deterministic output.

### Index Regeneration

**`regenerate_indexes`** (`bundle/index.py`):

1. Walks bundle with `rglob("*.md")`, collects all directories containing `.md`
   files.
2. For each directory (bottom-up):
   - Gathers entries: `.md` files → extracts `title`, `description`, `type`
     from frontmatter; subdirectories → uses cached description from
     `dir_descriptions`.
   - Writes `index.md` with one section per type:
     ```markdown
     # BigQuery Table
     * [Title](file.md) - description
     ```
   - Stores directory description for parent via `synthesize_description()`
     (calls Gemini for a ≤25-word one-sentence summary).
3. Top-level `index.md` gets synthesized from all first-level children.

### Log Entries

Event logging during enrichment (in `runner.py`):
- Compact mode (default): `[concept_id] → tool(args)`, `[concept_id] ← tool:
  summary`
- Verbose mode (`-v`): full JSON dumps of function call args and responses
- Web pass logs: `[web] → fetch_url(url=...)`, `[web] ← fetch_url: title,
  markdown size, link count`
- Final summary: `Enriched N concept(s) into <path>; web pass used M seed(s)`

### ADK Agent Definition

**`build_bq_agent`** (`agent.py`):
```python
Agent(
    name="okf_bq_reference_agent",
    model="gemini-flash-latest",
    instruction=_load_prompt("reference_instruction.md"),
    tools=[
        FunctionTool(list_concepts),
        FunctionTool(read_concept_raw),
        FunctionTool(sample_rows),
        FunctionTool(read_existing_doc),
        FunctionTool(write_concept_doc),
    ],
)
```

**`build_web_agent`** (`agent.py`):
```python
Agent(
    name="okf_web_ingestion_agent",
    model="gemini-flash-latest",
    instruction=_load_prompt("web_ingestion_instruction.md"),
    tools=[
        FunctionTool(list_concepts),
        FunctionTool(read_concept_raw),
        FunctionTool(read_existing_doc),
        FunctionTool(write_concept_doc),
        FunctionTool(fetch_url),
    ],
)
```

**Model interaction pattern:**
- ADK `Runner.run()` called with `InMemorySessionService` (no persistent state
  between concepts).
- Each tool is a plain Python function (no async). The ADK framework handles
  model ↔ tool loop transparently.
- The model is instructed to call `write_concept_doc` **exactly once** per
  concept and then stop for BQ pass.
- For web pass, the model drives its own crawl: it decides which links to
  follow and when to stop (within budget constraints).

### Key Implementation Patterns

1. **Source abstraction with ABC**: `Source` base class with `list_concepts()`,
   `read_concept()`, `sample_rows()`, `find()`. New sources (e.g., Spanner,
   Postgres) can be added by implementing the interface.

2. **Tool functions are stateless, context via globals**: Each tool function
   gets its dependencies through `get_context()` / `get_web_state()` module-level
   singletons, set before the agent runs. This avoids passing context through
   ADK's framework.

3. **Concept ID as tuple of segments**: `("tables", "events_")` → filesystem
   path `tables/events_.md`. The `parse_concept_id(s: str)` function splits on
   `/`, validating each segment against `[A-Za-z0-9_][A-Za-z0-9_.\-]*`.

4. **Augmentation instead of replacement**: Web pass must always call
   `read_existing_doc` first and merge content. Schema guard and sources guard
   in `write_concept_doc` enforce this mechanically.

5. **Crawl budget tracking via WebState dataclass**: `visited: set[str]`,
   `fetched_count: int`, `url_depth: dict[str, int]`. All budget enforcement
   lives in `fetch_url`, not in the prompt.

6. **LLM-authored descriptions feed index regeneration**: The synthesizer
   generates one-sentence directory descriptions from child entry metadata,
   enabling progressive-disclosure index pages.

### OKF Spec Compliance

**Fully implements:**
- §4.1: Required `type`, recommended `title`/`description`/`resource`/`tags`
- §5.1: `sources` frontmatter with `id`, `resource`, `title`, and
  per-claim footnotes keyed to `sources[].id`
- §5.2: `generated: {by, at}` auto-filled; `verified` not produced (no
  human verification in reference agent)
- §6: File-relative cross-links between concepts
- §8: `index.md` auto-generation with grouped sections
- §11: Only `type` is required for conformance

**Partially implements:**
- §5.4: `status` can be set by LLM (`draft`/`stable`/`deprecated`), defaults
  to `stable`
- §5.5: `stale_after` not produced by the agent (frontmatter key exists in
  preferred order but LLM isn't instructed to populate it)
- §7: Actor convention used (`reference_agent/<model>` for generated.by)
- §10: No Attested Computation support yet (not applicable to table enrichment)

---

## 2. Visualizer (the `visualize` subcommand)

### Repository

`okf/src/reference_agent/viewer/` — 5 files forming the bundle visualization
generator, invoked as `reference-agent visualize --bundle <path>`.

### What it does

Walks an OKF bundle directory tree, reads every concept `.md` document,
builds a graph of nodes (concepts) and edges (internal markdown links),
and generates a **self-contained HTML file** (`viz.html`) that renders an
interactive graph using Cytoscape.js with a side-panel detail view showing
the rendered markdown body.

### Source files

```
okf/src/reference_agent/viewer/
├── __init__.py       (106 B — exports generate_visualization)
├── generator.py      (6570 B — bundle walker + graph builder)
├── templates/
│   └── viz.html      (2131 B — HTML shell with __VIZ_CSS__, __VIZ_JS__,
│                      __BUNDLE_NAME__, __BUNDLE_DATA__ placeholders)
└── static/
    ├── viz.js        (9978 B — viewer client-side logic)
    └── viz.css       (4421 B — viewer styles)
```

### Bundle → JSON Transformation

**`generate_visualization(bundle_root, out_path, bundle_name=None)`**
(`generator.py`):

**Step 1: Walk concepts** (`_walk_concepts(bundle_root)`):
- `bundle_root.rglob("*.md")` excluding `index.md`
- Each `.md` → `OKFDocument.parse()`
- Extracts into a `Concept` dataclass:
  ```
  id:          "tables/events_"          (relative path, .md stripped, / separators)
  type:        "BigQuery Table"          (from frontmatter type)
  title:       "GA4 Events"              (from frontmatter, or concept_id fallback)
  description: "One row per event..."    (from frontmatter)
  resource:    "https://bigquery..."    (from frontmatter)
  tags:        ["ga4", "events"]        (from frontmatter; non-list coerced to list)
  status:      "stable"                  (default "stable")
  generated:   {by: "...", at: "..."}   (if dict in frontmatter)
  verified:    [{by: "...", at: "..."}] (via normalize_verified())
  stale_after: "2026-12-31"             (stringified)
  sources:     [{id, resource, title}...] (list of dicts)
  trust_tier:  "unverified"|"machine-confirmed"|"human-reviewed"
  stale:       true|false               (via is_stale() comparing date)
  links_to:    ["tables/users", "references/joins/events___users"]
  body:        "<raw markdown body>"
  ```

**Step 2: Extract internal links** (`_extract_links(body, doc_dir, bundle_root)`):
- Regex: `\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)`
- Match must point to a `.md` file and not be an external URL (`://`,
  starts with `/`).
- Target is resolved relative to the document's directory, then made relative
  to bundle root.
- `.md` suffix is stripped to produce the concept ID.

**Step 3: Build graph** (`_build_graph(concepts)`):
```json
{
  "nodes": [
    {
      "data": {
        "id": "tables/events_",
        "label": "GA4 Events",
        "type": "BigQuery Table",
        "description": "One row per event",
        "resource": "https://bigquery.googleapis.com/v2/...",
        "tags": ["ga4", "events"],
        "status": "stable",
        "generated": {"by": "...", "at": "..."},
        "verified": [{"by": "human:ahormati", "at": "..."}],
        "stale_after": "2026-12-31",
        "sources": [{"id": "ga4-schema", "resource": "https://...", "title": "..."}],
        "trust_tier": "human-reviewed",
        "stale": false,
        "color": "#3b82f6",
        "size": 45
      }
    }
  ],
  "edges": [
    {
      "data": {
        "id": "tables/events___tables/users",
        "source": "tables/events_",
        "target": "tables/users"
      }
    }
  ],
  "bodies": {
    "tables/events_": "# Definition\n\n..."
  },
  "types": ["BigQuery Dataset", "BigQuery Table", "Reference"],
  "palette": {
    "BigQuery Dataset": "#8b5cf6",
    "BigQuery Table": "#3b82f6",
    "Reference": "#10b981"
  }
}
```

**Step 4: Embed into HTML template**:
- Reads `viz.html` template (shell with placeholder strings).
- Reads `viz.css` and `viz.js` as raw strings.
- String-replaces:
  - `/*__VIZ_CSS__*/` → CSS content
  - `/*__VIZ_JS__*/` → JS content
  - `__BUNDLE_NAME__` → `json.dumps(name)`
  - `__BUNDLE_DATA__` → `json.dumps(graph, default=str)`
- Writes single HTML file.

### Viewer HTML Internals

**Template** (`viz.html`):

```html
<!DOCTYPE html><html><head>
  <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
  <style>/*__VIZ_CSS__*/</style>
</head><body>
  <header>
    <strong id="bundle-name"></strong>
    <input id="search" type="search" placeholder="Search title / id / tag">
    <select id="filter-type"><option value="">All types</option></select>
    <select id="layout">
      <option value="cose">cose (force)</option>
      <option value="concentric">concentric</option>
      <option value="breadthfirst">breadth-first</option>
      <option value="circle">circle</option>
      <option value="grid">grid</option>
    </select>
    <button id="reset">Reset view</button>
  </header>
  <main>
    <section id="graph"></section>
    <section id="detail"><!-- detail panel --></section>
  </main>
  <script>window.BUNDLE_NAME = __BUNDLE_NAME__;</script>
  <script>window.BUNDLE = __BUNDLE_DATA__;</script>
  <script>/*__VIZ_JS__*/</script>
</body></html>
```

### Viewer JavaScript (`viz.js`) — Key Behaviors

**Search implementation:**
- Case-insensitive substring match across `label`, `id`, and `tags` joined
  string.
- Matching nodes and connecting edges get dimmed via `.dim` CSS class
  (opacity 0.15), non-matching ones stay visible.

**Type filter:**
- Dropdown populated from `window.BUNDLE.types`.
- Selecting a type dims all nodes of other types and their connecting edges.

**Layout options:**
- `cose` (force-directed, default)
- `concentric`, `breadthfirst`, `circle`, `grid`
- `animate: false` for instant layout changes.

**Node styling:**
- `background-color: data(color)` — color from type palette.
- `width/height: data(size)` — size proportional to body length
  (`30 + min(60, len(body) // 200)`), range 30–90px.
- Stale nodes: dashed red border (2px `#b91c1c`).
- Deprecated nodes: opacity 0.55.
- Selected nodes: amber border (3px `#f59e0b`).

**Edge styling:**
- Light gray (`#cbd5e1`), 1.5px width, bezier curves, triangle arrows.
- Selected edges: amber highlight.

**Detail panel:**
- Clicking a node shows: type chip (colored), title, concept ID, badges
  (status, trust tier, staleness), frontmatter fields (description, resource,
  tags, generated, verified, sources), and rendered markdown body via
  `marked.parse()`.
- Internal link rewriting:
  - Links starting with `/` and ending in `.md` are detected.
  - Target concept ID = `href.slice(1, -3)`.
  - If target exists in `nodeIndex`, link becomes in-page navigation via
    `showDetail(target)` instead of opening a new page.
  - External links get `target="_blank" rel="noopener"`.
- Backlinks section: reverse-lookup for any concept that links to the
  displayed concept, clickable to navigate.
- Auto-shows first `BigQuery Dataset` node (or first node) on load.

**Initial view:**
```javascript
const initial =
  bundle.nodes.find((n) => n.data.type === "BigQuery Dataset") ||
  bundle.nodes[0];
if (initial) showDetail(initial.data.id);
```

### Key Implementation Patterns

1. **Self-contained HTML**: All JS, CSS, and data embedded via string
   replacement — no build step, no web server needed, opens in any browser.

2. **Type-based color palette**: Static mapping `_TYPE_PALETTE` in generator;
   unknown types get `#94a3b8` (slate gray).

3. **Evidence signals in the UI**: Badges show `status`, `trust_tier`,
   `stale`/`fresh` state derived from frontmatter `stale_after`.

4. **Link extraction uses relative path resolution**: Links are resolved
   relative to the document's parent directory, then made bundle-relative,
   producing stable concept IDs regardless of doc location.

---

## 3. kcmd CLI + MCP (mdcode)

### Repository

`toolbox/mdcode/` — a TypeScript library, CLI binary, and MCP server for
**Metadata as Code** — bi-directional sync between local YAML/MD files and
Google Cloud Knowledge Catalog (Dataplex).

### What it does

Provides a `kcmd` CLI that initializes a local catalog snapshot from a
BigQuery dataset or Dataplex EntryGroup, pulls metadata from the Knowledge
Catalog API, lets users/agents edit entries in YAML + sidecar Markdown files,
and pushes changes back to the Catalog. The same binary also serves as an MCP
server for agentic workflows.

### Source files (complete inventory)

```
toolbox/mdcode/
├── package.json          (1260 B — npm metadata, deps, scripts)
├── tsconfig.json         (TS build config)
├── src/
│   ├── tool/
│   │   ├── main.ts       (2110 B — CLI entry via cac)
│   │   ├── commands.ts   (2495 B — init, pull, push command handlers)
│   │   └── mcp.ts        (MCP server with 3 registered tools)
│   └── libts/
│       ├── index.ts      (191 B — barrel exports)
│       ├── manifest.ts   (5608 B — CatalogManifest: init, load, save)
│       ├── snapshot.ts   (10440 B — CatalogSnapshot: CRUD on local entries)
│       ├── sync.ts       (4200 B — CatalogSync: pull/push logic)
│       ├── source.ts     (2700 B — CatalogSource, SourceFactory)
│       ├── layout.ts     (910 B — CatalogLayout abstraction)
│       ├── metadata.ts   (499 B — Entry, Aspect types)
│       ├── layouts/      (per-source directory layout strategies)
│       │   ├── bigquery.ts
│       │   ├── entrygroup.ts
│       │   └── kb.ts
│       ├── sources/      (per-source catalog entry iterators)
│       │   ├── bigquery.ts
│       │   ├── entrygroup.ts
│       │   └── kb.ts
│       ├── gcp/
│       │   ├── index.ts      (116 B)
│       │   ├── context.ts    (1386 B — ApiContext, GcloudTokenProvider)
│       │   ├── dataplex.ts   (8341 B — CatalogClient, types)
│       │   ├── bigquery.ts   (1627 B — BigQuery metadata queries)
│       │   ├── crm.ts        (1260 B — Resource Manager lookup)
│       │   └── api.ts        (3068 B — HTTP client, retry, auth)
│       └── tsconfig.json
```

### Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.29.0",
  "cac": "^7.0.0",
  "glob": "^13.0.6",
  "yaml": "^2.8.4",
  "zod": "^4.4.2"
}
```

### Installation/Run

```bash
git clone https://github.com/googlecloudplatform/knowledge-catalog
cd toolbox/mdcode
npm install

# Build (compiles TypeScript lib + compiles CLI to standalone binary via bun):
npm run build
# → dist/kcmd (standalone binary via bun build --compile)
# → build/ts/kcmd/ (TypeScript compilation output)

# Prerequisites:
#   - gcloud auth application-default login
#   - Bun ≥1.3 for binary compilation
#   - npm for dependencies

# Direct CLI usage (via bun):
bun run dist/kcmd --help

# Or use the compiled binary:
./dist/kcmd --help
```

### Library Usage

```typescript
import * as kcmd from 'kcmd';

// Initialize from BigQuery
const manifest = await kcmd.CatalogManifest.initWithBigQuery(
  'prod-data.ecommerce', ctx
);

// Load from filesystem
const snapshot = await kcmd.CatalogSnapshot.fromPath('.', ctx);

// Pull from Catalog service
const sync = new kcmd.CatalogSync(catalog, snapshot);
const result = await sync.pull();
```

### Full CLI Interface

```
kcmd <command> [options]

Commands:
  init     Initialize a new catalog snapshot
  pull     Pull catalog entries
  push     Push catalog entries
  mcp      Run the Model Context Protocol (MCP) server
  status   Check for local modifications (declared, not implemented)
```

#### `kcmd init`

```
kcmd init --entry-group <project.location.id>
kcmd init --bigquery-dataset <project.dataset> [--bigquery-dataset <project.dataset> ...]
kcmd init --kb <project.location.id>
kcmd init [any of above] --pull   # Also pull entries during init
```

`--entry-group`: Initialize from a Dataplex EntryGroup. Scope:
`entrygroup.<project.location.id>`.

`--bigquery-dataset`: Initialize from one or more BigQuery datasets. Scope:
`bigquery_dataset.<project.dataset>`. Multiple `--bigquery-dataset` flags
allowed (scope becomes array).

`--kb`: Initialize from a Knowledge Base EntryGroup. Scope:
`kb.<project.location.id>`.

**What `init` does:**
1. Creates a source via `CatalogManifest.initWith*()` which looks up the
   resource in GCP, discovers its EntryGroup/EntryType/AspectType metadata.
2. Saves `catalog.yaml` to current directory with scope config.
3. If `--pull` flag set, also pulls all entries from the Catalog service.

**Generated `catalog.yaml`:**
```yaml
scope: bigquery_dataset.prod-data.ecommerce
snapshot:
  entries:
    - bigquery-table
    - bigquery-view
  aspects:
    - overview
    - descriptions
publishing:
  aspects:
    - overview
    - descriptions
```

#### `kcmd pull`

```bash
kcmd pull
# Pulls latest metadata from Knowledge Catalog service.
# Reports conflicts if local changes not yet pushed.
# No --dry-run flag currently (not implemented).
```

**What `pull` does:**
1. Loads `CatalogManifest` from `catalog.yaml`.
2. Iterates over source entries via `manifest.source.entries()`.
3. For each entry, calls `catalog.lookupEntry()`.
4. Filters by `entryTypes` from snapshot config.
5. Stores each entry locally via `snapshot._storeEntry()`.
6. Writes entries as YAML files under `catalog/<dir>/<entry-id>.yaml` with
   optional sidecar `.aspect.md` files.

#### `kcmd push`

```bash
kcmd push [--force] [--validate-only]
```

`--force`: Force push changes (declared, behavior not implemented).
`--validate-only`: Only validate changes without applying (declared, behavior
not implemented).

**What `push` does:**
1. Lists all local entries.
2. For each, calls `snapshot._fetchEntry()` which reads the local YAML,
   converts to service format.
3. Checks if the entry exists in the Catalog (via `lookupEntry`).
4. If new: calls `catalog.createEntry()`.
5. If existing: builds update mask from `aspects` and optionally
   `entry_source`/`parent_entry` (for user-managed entry groups), calls
   `catalog.modifyEntry()`.

#### `kcmd status`

Declared in `CatalogSync` but throws `"Not yet implemented"`.

### MCP Server Implementation

**Startup:**
```bash
kcmd mcp --path /path/to/catalog/root
```

**MCP config** (for Gemini CLI / Claude Desktop):
```json
{
  "mcpServers": {
    "kc-mac": {
      "command": "kcmd",
      "args": ["mcp", "--path", "/path/to/root"]
    }
  }
}
```

**Authentication:** Uses `gcloud auth print-access-token` via
`GcloudTokenProvider` in `gcp/context.ts`.

**MCP Tools** (defined in `mcp.ts`):

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `list-entries` | none | Returns JSON array of all local entry names |
| `lookup-entry` | `name: string` (entry name) | Returns full entry JSON (type, resource, aspects) |
| `modify-entry` | `name: string`, `field: string` ("resource" or aspect key), `updates: Record<string, any>` | Updates resource-level metadata or a specific aspect. Returns updated entry JSON. |

**Evidence (source checked 2026-07-26):** `mcp.ts` registers exactly the three
tools above. `pull` and `push` are implemented as CLI command handlers in
`commands.ts`; they are not registered MCP tools. Website prose that lists
five MCP tools conflates the CLI and MCP surfaces.

**`modify-entry` behavior:**
1. Looks up the existing entry.
2. If `field == "resource"`: updates `resource.description`.
3. Otherwise: treats `field` as an aspect key, validates it's registered in
   `snapshot.aspectTypes`.
4. If entry is from an ingested source and the aspect is a required aspect
   (e.g., schema from BigQuery), rejects modification.
5. Saves updated entry via `layout.saveEntry()`.

### YAML Sidecar Format

**Entry file** (`catalog/<dir>/<entry-id>.yaml`):
```yaml
id: products
type: bigquery-table

resource:
  name: projects/prod-data/datasets/ecommerce/tables/products
  displayName: Products Table
  description: All products in the catalog
  labels:
    env: prod
  createTime: 2026-04-23T00:44:03Z
  updateTime: 2026-04-23T00:44:03Z

schema:
  # ... aspect data (keyed by aspect type)

contacts:
  # ... another aspect
```

**Sidecar markdown** (`catalog/<dir>/<entry-id>.overview.md`):
```yaml
---
userManaged: true
links:
  - ...
---
[markdown content]
```

### Architecture

```
CLI (kcmd)
├── init  → CatalogManifest.initWithBigQuery() / initWithEntryGroup()
│           └── source.ts → SourceFactory → CatalogSource
│               ├── BIGQUERY_DATASET → BigQuerySource
│               ├── ENTRYGROUP → EntryGroupSource
│               └── KB → KnowledgeBaseSource
│
├── pull  → CatalogSync.pull()
│           ├── source.entries() → async iterable of catalog entries
│           │   └── gcp/dataplex.ts → CatalogClient.listEntries()
│           ├── catalog.lookupEntry() per entry
│           ├── snapshot._storeEntry() → write YAML + MD
│           └── layout.saveEntry() (layout strategy per source type)
│
├── push  → CatalogSync.push()
│           ├── snapshot.listEntries() → layout.listEntries()
│           ├── snapshot._fetchEntry() → read YAML, convert to service format
│           ├── catalog.lookupEntry() → check existence
│           ├── catalog.createEntry() or catalog.modifyEntry()
│           └── dataplex.ts → HTTP REST to Knowledge Catalog API
│
└── mcp   → mcp.startServer()
            ├── StdioServerTransport
            └── McpServer with 3 tools
```

**Layout strategies** (`layouts/`): Maps the source type to a directory
convention on disk. For BigQuery sources, entries are organized with
directory hierarchy mirroring the GCP resource path.

**API layer** (`gcp/api.ts`): HTTP client with retry logic. Uses
`gcloud auth print-access-token` to obtain Bearer tokens. Communicates
with:
- `https://dataplex.googleapis.com/v1/` (Knowledge Catalog API)
- `https://bigquery.googleapis.com/` (schema metadata)
- `https://cloudresourcemanager.googleapis.com/` (project lookup)

### End-to-End: `kcmd init` → edit locally → `kcmd push`

1. **`kcmd init --bigquery-dataset prod-data.ecommerce`**
   - Looks up BigQuery metadata for `prod-data.ecommerce`.
   - Discovers the associated Dataplex EntryGroup.
   - Fetches EntryType definitions (e.g., `bigquery-table`, `bigquery-view`)
     and their required AspectTypes.
   - Writes `catalog.yaml` with scope and snapshot config.
   - Creates local directory structure: `catalog/<dist_id>/<entry>.yaml`.

2. **`kcmd pull`** (or `--pull` during init)
   - Authenticates via `gcloud auth application-default login`.
   - Calls `POST https://dataplex.googleapis.com/v1/projects/<p>/locations/<l>/entryGroups/<eg>/entries:search` (or equivalent API).
   - For each entry, calls `GET .../entries:lookupEntry` with aspect view filter.
   - Writes each entry as `catalog/<dir>/<entry-id>.yaml`.
   - For user-managed aspects (e.g., `overview`), writes sidecar
     `catalog/<dir>/<entry-id>.overview.md`.

3. **Edit locally**
   - Modify YAML files: change descriptions, add labels, modify aspect data.
   - Modify sidecar `.md` files: add enriched context, markdown descriptions.

4. **`kcmd push`**
   - Reads all local YAML files.
   - For each entry, converts local format → `dataplex.Entry` service format.
   - Filters aspects by `publishingConfig.aspects` (only publishes listed
     aspects).
   - For ingested entries, skips required aspects (cannot push BigQuery
     schema changes — those come from the system).
   - If entry doesn't exist in the Catalog: `createEntry()` API call.
   - If entry exists: `modifyEntry()` with update mask built from modified
     aspect keys.
   - Reports success or failure per entry.

### Key Implementation Patterns

1. **Zod schemas for validation**: `manifestSchema` validates the YAML
   structure on load; handles single scope vs multi-scope arrays.

2. **Type system via Dataplex API**: EntryTypes and AspectTypes are fetched
   from the Catalog service at init time and cached in `Map<string, Type>`
   keyed by both service name (e.g., `projects/p/locations/l/entryTypes/t`)
   and shorthand (`p.l.t`).

3. **Dual name representation**: `localName` (filesystem-friendly) vs
   `serviceName` (API format `projects/p/locations/l/entryGroups/eg/entries/...`).
   The `CatalogSource` abstraction handles the mapping.

4. **Layout abstraction**: `CatalogLayout` interface with `createLayout()`
   factory selects the right directory layout based on source type.

5. **Modification guard for ingested entries**: In `updateEntry()`, if the
   source is ingested and the aspect is required, the tool refuses to modify
   it — ingested metadata is authoritative from the source system.

6. **Publishing config filter**: Only aspects listed in `publishing.aspects`
   in `catalog.yaml` are pushed; others remain local-only.

7. **Standalone binary via Bun compile**: `npm run build:tool` compiles
   TypeScript to a standalone executable using `bun build --compile`.

---

## 4. kcagent

### Repository

The public repository implements the `kcagent` package in
[`toolbox/enrichment`](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/3fcbb9f828/toolbox/enrichment).
Its
[`package.json`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828/toolbox/enrichment/package.json)
names the package and command `kcagent`, while the
[`README`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828/toolbox/enrichment/README.md)
documents `kcagent enrich`.

### Status

**Evidence:** `kcagent` is open source in the repository. No matching public npm
package was verified at the research date, so the source implementation and npm
distribution status must be described separately.

**Evidence:** The documented command enriches a Knowledge Catalog entry with
agent-discovered context. It must not be described as a hypothetical unified
wrapper around `reference_agent` and `kcmd` unless its source implements that
composition.

### Gap Analysis

Given the existing tools:

1. **Enrichment** — handled by `reference_agent` (Python, BigQuery + web
   scraping, ADK-based, Gemini-driven).

2. **Bi-directional sync** — handled by `kcmd` (TypeScript, local YAML/MD ↔
   Dataplex Catalog, MCP server).

3. **Visualization** — handled by the `visualize` subcommand (self-contained
   Cytoscape.js HTML).

4. **Unresolved product opportunity** — a unified workflow that:
   - Connects to Knowledge Catalog (like kcmd)
   - Enriches entries (like reference_agent)
   - Dynamically loads MCP servers and skills
   - Provides a built-in `md-fileset` MCP server for file browsing
   - Could serve as a "bring your own agent" runtime

The public `kcagent` source covers enrichment, but no matching public npm
distribution was verified and the broader composition above was not
established. Do not infer missing source code from missing package-registry
publication.

---

## Cross-Tool Comparison

| Dimension | reference_agent | visualize | kcmd/mdcode | kcagent |
|-----------|----------------|-----------|-------------|---------|
| Language | Python 3.11+ | Python (part of ref_agent) | TypeScript + Bun | N/A (not in repo) |
| LLM | Google ADK + Gemini | None | None | (would use LLM) |
| Input | BigQuery datasets + web URLs | OKF bundle | Knowledge Catalog API | (would use both) |
| Output | OKF bundle (.md files) | Self-contained HTML | Catalog YAML + MD | (would produce OKF) |
| MCP Server | No | No | Yes (3 tools) | (would have) |
| Authentication | ADC (gcloud) | None | gcloud access token | (would use gcloud) |
| Package format | pip installable | pip installable | Bun standalone binary | N/A |

## Key Observations

1. **All tools are in the same monorepo** (`GoogleCloudPlatform/knowledge-catalog`),
   but in separate build systems (Python in `okf/`, TypeScript in `toolbox/`).

2. **The reference_agent is the canonical OKF producer.** Its prompt and tool
   definitions represent the intended authoring workflow for OKF v0.2 bundles.
   Every implementation choice — two-phase BQ+web, augmentation-guard writes,
   concept ID as tuple, source abstraction — is deliberately instructive.

3. **kcmd is a separate stack** that addresses a different problem: mapping
   between Dataplex Catalog's native format and developer-friendly local files.
   It complements, not duplicates, the reference_agent.

4. **The visualize subcommand is tightly coupled to the reference_agent**
   (same package, shares `bundle/document.py` for parsing, uses the same
   concept ID scheme).

5. **OKF v0.2 conformance** is enforced in the reference_agent at the document
   validation level (`OKFDocument.validate()` requires `type`), in the tool
   level (`write_concept_doc` rejects invalid frontmatter), and in the viewer
   level (reads `trust_tier`, `stale`, `verified`, `sources` and surfaces them
   as UI badges).
