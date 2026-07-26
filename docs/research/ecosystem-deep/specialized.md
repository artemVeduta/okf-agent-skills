# OKF Ecosystem — Specialized & Smaller Projects: Deep Investigation

> Research corrected 2026-07-26. Evidence comes from primary repositories,
> package metadata, and official specs; inference is labeled.

---

## 1. Inkeep OpenKnowledge (`github.com/inkeep/open-knowledge`)

### Repository
- **URL**: https://github.com/inkeep/open-knowledge
- **License**: GPL-3.0
- **Language**: TypeScript (monorepo: pnpm workspaces, Turborepo, Biome, Oxlint)
- **Packages**: `@inkeep/open-knowledge` (npm, the CLI + web app)
- **Version snapshot**: GitHub release v0.39.4 (2026-07-24); npm stable tag
  0.38.4 when checked 2026-07-26
- **Website**: https://openknowledge.ai
- **macOS app**: https://openknowledge.ai/download/stable

### What It Does
OpenKnowledge is a general-purpose Markdown IDE and LLM-wiki editor, not an
OKF-only application. It integrates with agent harnesses through MCP/CLI and
includes an optional OKF v0.1 starter pack.

**Evidence:** The pack's own skill says conformance is “pre-populated, not
enforced”; repository tests verify the seeded files. The editor does not become
a continuous OKF validator merely because the starter pack exists.

### Installation

**macOS (Apple Silicon, M1+)**:
```bash
# Download DMG from https://openknowledge.ai/download/stable
# Drag OpenKnowledge to Applications, launch it
```

**Linux, Windows, Intel Mac (web app via CLI)**:
```bash
# Prerequisites: Node.js 24+, git
npm install -g @inkeep/open-knowledge
cd your-project
ok init          # scaffold .ok/ + wire up AI editors
ok start --open  # serve web editor, open in browser
```

### Full Interface

#### `ok init`
Scaffolds a `.ok/` directory and registers the OpenKnowledge MCP server with all detected AI editors. Supports:
- `--content-dir <dir>` — limit content scope to a subfolder
- `--json` — structured JSON summary for scripting
- Interactive prompts: register MCP at user-level, project-level, or both; share `.ok/` config with team or keep local

Registered editors (auto-detected): Claude Code, Claude Desktop, Cursor, Codex, OpenCode, OpenClaw, Pi, Antigravity, LM Studio, Hermes.

#### `ok start`
Starts the local Hocuspocus/CRDT server for the project editor:
- `-p, --port <number>` — bind port
- `-H, --host <address>` — bind address
- `--open` — open browser automatically
- `--mode app` — hand off to macOS desktop app instead of browser
- `--log-level` — `silent|error|warn|info|debug|trace` (default: quiet)
- `--no-color` — disable color output

#### `ok clone <owner/repo>`
Clone a GitHub repo and open with OpenKnowledge:
- `-b <branch>` — pin branch
- Supports `owner/repo` shorthand or full `https://github.com/...` URL
- `ok auth login` for private repos (or use existing `gh` CLI auth)

#### `ok sync / ok pull / ok push`
Git/GitHub sync from terminal. Each goes through running server when available, falls back to plain git. `--json` for JSONL progress events.

#### `ok seed`
Scaffold starter packs:
- `--list-packs` — browse available packs
- `--pack <id>` — choose specific pack
- `--root <dir>` — nest in subfolder
- `--dry-run` — preview

OKF starter pack: `npx create-open-knowledge my-kb --template okf`

#### `ok open <file.md>`
Open a single file in the editor without a project (ephemeral single-file session).

#### `ok status / ok ps / ok stop / ok clean`
Manage running local servers.

#### `ok deinit / ok uninstall`
Remove OpenKnowledge from one project or the whole machine.

#### `ok bug-report / ok diagnose`
Package support bundles for debugging.

#### WYSIWYG Editor Features
- **Full WYSIWYG**: bold, italic, headings, lists, tables, code fences, links, images, callouts, footnotes, inline math, mermaid diagrams
- **Source mode toggle**: live CRDT sync between WYSIWYG and raw markdown
- **Frontmatter properties panel**: visual YAML editor on the right pane (type, title, description, tags, status, timestamp, etc.)
- **Live frontmatter validation**: Content rules plugin checks markdownlint rules + JSON Schema validation for frontmatter
- **Concept graph sidebar**: Right pane shows Outline, Incoming/Outgoing Links, and a Graph view of the document's connections
- **Slash command menu**: `/` opens insert menu for all content shapes
- **Live HTML embeds**: `html preview` code fences render in sandboxed iframes
- **Mermaid diagrams**: live rendering with pan/zoom controls
- **Command palette**: `Cmd+K` for file jump, create commands, tag search, semantic search
- **Real-time collaboration**: CRDT-backed — multiple agents + humans can edit the same doc concurrently
- **Timeline & recovery**: git-backed version history with per-burst diffs and selective rollback
- **GitHub sync**: push/pull, conflict detection, conflict resolution tools
- **File sidebar**: tree view with right-click context menus (New File, New from Template, Reveal in Finder, Open with AI, Share, Rename, Delete)
- **Ask AI composer**: Bottom docked prompt field; `Cmd+L` focuses it; supports `@mentions`
- **Built-in terminal**: Docked terminal in desktop app with multi-session tabs; also acts as AI chat surface
- **Agent activity panel**: See every agent edit with per-edit diffs and selective undo
- **Spell check**: Native macOS spellchecker integration
- **Ignore patterns**: `.okignore` for hiding files/folders without deleting

#### MCP Server
The OpenKnowledge MCP server exposes **21 tools** to AI agents:

**Read tools**: `exec`, `search`, `links`, `lint`, `audit`, `history`, `skills`, `config`, `palette`, `preview_url`, `share_link`, `conflicts`, `workflow`

**Write tools**: `write`, `edit`, `delete`, `move`

**Lifecycle tools**: `install`, `checkpoint`, `restore_version`, `resolve_conflict`

Key capabilities:
- **exec**: Read-only shell (`cat`, `ls`, `grep`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`); returns frontmatter, backlinks, and recent history alongside file contents
- **search**: Ranked workspace search (title boost + body BM25 + recency + optional semantic embeddings). Intent modes: `omnibar` (title/path), `full_text` (default with body)
- **links**: Wiki-link graph queries — `backlinks`, `forward`, `dead`, `orphans`, `hubs`, `suggest`
- **write**: CRUD — `document`, `folder`, `template`, `skill`, `asset`. Supports `position` (replace/append/prepend), `extension` (.md/.mdx), `template` instantiation, batch `documents`
- **edit**: Body find/replace or frontmatter merge-patch. `occurrence` selects which match.
- **agentic search**: The MCP `search` + `links` + `exec` tools enable "enriched search" — agents get file contents, backlinks, and graph context together, no vector database required
- **workflow**: Procedural guides — `ingest`, `research`, `consolidate`, `discover`, `wiki`

#### Agent Skills
Skills are editable documents versioned with the knowledge base:
- **Two scopes**: Project skills (in `.ok/skills/`, versioned and shared) and Global skills (in `~/.ok/skills/`, follow you across projects)
- **Write once, install everywhere**: `install` symlinks the skill into Claude Code, Cursor, Codex, OpenCode, Pi — all pointing at one source
- **Draft → Installed lifecycle**: New skills start as Draft, installed per-editor or all at once
- **Import existing skills**: `ok skills manage --on` imports editor skills into `.ok/skills/` as managed symlinks
- **Built-in `open-knowledge` skill**: Ships with the product, gives agents correct tool-use behavior
- **Skill bundles**: A skill can carry `references/` and `scripts/` files alongside `SKILL.md`

#### Integration Points
10+ agent harnesses supported:
| Agent | Integration | Method |
|-------|-------------|--------|
| Claude Code | MCP + skill | Auto-registered by `ok init` |
| Claude Desktop | MCP + deep link | Auto-registered |
| Cursor | MCP + embedded webview | Auto-registered |
| Codex | MCP + auto-approve mode | Auto-registered |
| OpenCode | MCP + skill | Auto-registered |
| OpenClaw | MCP | Auto-registered |
| Pi | MCP + CLI | Auto-registered |
| Antigravity | MCP | Auto-registered |
| LM Studio | MCP | Auto-registered |
| Hermes | MCP | Auto-registered |
| GitHub Copilot CLI | CLI | Auto-registered |

Each integration has a dedicated docs page at `openknowledge.ai/docs/integrations/<agent>`.

#### Starter Packs
`npx create-open-knowledge my-kb --template okf` scaffolds:
- Knowledge base starter pack with folder structure, index.md, log.md
- LLM wiki pack, codebase wiki pack, entity vault pack, etc.
- Browse with `ok seed --list-packs`

### End-to-End Flow: Create New OKF Knowledge Base → Open Editor → Write a Concept

1. **Install**: `npm install -g @inkeep/open-knowledge`
2. **Create project**: `mkdir my-kb && cd my-kb`
3. **Initialize**: `ok init` — scaffolds `.ok/`, detects AI editors, registers MCP server
4. **Start editor**: `ok start --open` — serves at `http://localhost:<port>`, opens browser
5. **Create concept**: In the WYSIWYG editor, click **New File** → name it `concepts/my-topic.md` → opens in editor
6. **Edit frontmatter**: Right pane **Properties** panel → fill in `type`, `title`, `description`, `tags`, `timestamp`
7. **Write body**: WYSIWYG editing — headings, paragraphs, tables, links to other concepts `[other-concept](../other-concept.md)`
8. **Validate**: Content rules plugin flags markdown issues inline; `Cmd+K → Validate` or MCP `lint`/`audit` tools
9. **Link graph**: Right pane **Links** tab shows incoming/outgoing connections; **Graph** tab shows visual graph
10. **Agent edits**: Open with Claude/Codex → agent reads via MCP `exec`/`search`/`links`, writes via `write`/`edit` → changes appear live in editor via CRDT
11. **Sync**: `ok sync` commits + pushes to GitHub; teammates see changes

---

## 2. knowledge-template (`github.com/open-science-pillars/knowledge-template`)

### Repository
- **URL**: https://github.com/open-science-pillars/knowledge-template
- **Stars**: 1
- **Commits**: 5
- **License**: Apache-2.0
- **Language**: Markdown (knowledge-only project)
- **Conformance target**: OKF v0.1 + Open Science Pillars SPECIFICATION.md §5

### What It Does
A conformant, empty OKF bundle scaffold for Open Science Pillars — earth science data products. Provides one fully annotated example per concept type (dataset, dataset-gotcha, recipe, convention), defines status workflows, evidence rules, and strict YAML conventions. Copy the bundle, replace example files with real concepts, lint before release.

### Bundle Layout
```
your-bundle/
├── index.md          # every concept listed; snapshot source metadata if pinned
├── log.md            # change history, newest first
├── datasets/         # example-dataset.md
├── gotchas/          # example-gotcha.md
├── recipes/          # example-recipe.md
└── conventions/      # example-convention.md
```

### Concept Types and Full Frontmatter

#### Common Fields (ALL concepts)
```yaml
type              # REQUIRED: dataset | dataset-gotcha | recipe | convention
title             # required org-wide
description       # required org-wide
tags              # required org-wide; array
timestamp         # required org-wide; ISO date of last material update
status            # draft → verified → stale → superseded/disputed
```

#### Dataset (`type: dataset`)
**Additional required fields**:
```yaml
resource          # archive URL, DOI, or provider ShortName
version           # version/processing baseline WITH verification date
                  #   e.g. "v2.1 (verified 2026-07-04 against the provider catalog)"
```

**Optional fields**:
```yaml
trainings         # list of ARSET or equivalent training URLs
```

**Body structure**:
```markdown
# [Title]
What the product is (instrument/model, level, grid, period, cadence).
How to access it (the `resource` above; note authentication needs).
How it is structured (dimensions, coordinates, key variables with units).

## Uncertainty
REQUIRED section. Name product's native uncertainty/error fields
(e.g., `analysis_error`), what they do/don't capture, caveats.
If no formal error fields, state what stands in (ensemble spread,
validation statistics, dynamical-consistency properties).

## Known issues
Link dataset gotcha concepts here:
[example-gotcha](../gotchas/example-gotcha.md)
```

#### Dataset-Gotcha (`type: dataset-gotcha`)
**Additional required fields**:
```yaml
severity          # high | medium | low
                  # high = silently wrong results (not error, not warning: wrong numbers)
                  # high REQUIRES matching eval_case id AND second steward review
eval_case         # required when severity=high; eval case id that traps it
dataset           # link to its dataset concept (e.g., ../datasets/example-dataset.md)
evidence          # at least one resolving link supporting the claim
                  # Acceptable: product user guide, ATBD, known-issues page,
                  #   forum thread, or citable reproducing test
```

**Body structure**:
```markdown
# [Title]

**Mechanism:** one trap per concept, stated as fact.
  (e.g., v2.1 files store missing pixels as -9999.0 but omit
  the `_FillValue` attribute, so xarray does not mask them on open.)

**Wrong-result mode:** what silently goes wrong.
  (e.g., means and trends computed over raw variable are biased far cold;
  a basin average can come out below freezing without any error raised.)

**Correct approach:** the factual fix.
  (e.g., masking values equal to -9999.0 after open restores correct
  statistics; v2.2 files carry the attribute and need no workaround.)

**Verification:** how a reader can confirm.
```

#### Recipe (`type: recipe`)
**Additional required fields**:
```yaml
inputs            # list of datasets and parameters the recipe consumes
  - dataset: ../datasets/example-dataset.md
  - region: example basin, lon [-80, 0], lat [0, 60]
  - baseline: 1991-2020
expected          # REQUIRED: expected values
  - quantity: basin-mean anomaly, 2023 annual
    range: [0.6, 1.1]
    units: K
expected_uncertainty  # REQUIRED
  - quantity: basin-mean anomaly, annual
    spread: 0.15 K (one sigma across product versions v2.0 to v2.1)
    method: cross-version spread; block-bootstrap CI on the series
evidence          # validation provenance links
```

**Body**: The validated pattern stated factually. Workflow skills compare their results against `expected` and `expected_uncertainty` ranges; golden notebooks assert against the same ranges.

#### Convention (`type: convention`)
**Additional required fields**: None beyond the org-wide fields.

**Body**: Records cross-cutting practices that outlive any one dataset (e.g., seasonal-mean calendar convention). States the practice and rationale factually.

### Rules

**1. Evidence or Nothing (§5.5)**
Every gotcha and recipe claim carries a resolving evidence link. An evidence-free concept is worse than a gap.

**2. Facts, Not Instructions (§5.8)**
Concepts state facts about data; they never instruct the agent. No imperatives directed at Claude, no tool directives. The knowledge-linter flags instruction-like phrasing.

**3. Strict YAML Quoting**
Quote any value containing a colon. Example: `title: "Unmasked fill values: the sentinel list"`. The linter red-flags unquoted ones.

### Status Workflow (§5.6)
```
draft → verified (with verified date and verified_by)
      → stale
      → superseded | disputed
```

### End-to-End: Clone Template → Write a Dataset Concept

1. **Clone**: `git clone https://github.com/open-science-pillars/knowledge-template.git my-bundle`
2. **Clean**: Delete the four `example-*` files in datasets/, gotchas/, recipes/, conventions/
3. **Write dataset**: Create `datasets/my-product.md`:
```yaml
---
type: dataset
title: "MODIS Aqua SST v2019.0"
description: Level-3 mapped 4 km daily SST from MODIS Aqua, 2002–present.
tags: [sst, modis, aqua, level-3, climate]
timestamp: 2026-07-25
resource: https://podaac.jpl.nasa.gov/dataset/MODIS_AQUA_SST_L3
version: v2019.0 (verified 2026-07-25 against PO.DAAC catalog)
status: draft
trainings:
  - https://appliedsciences.nasa.gov/get-involved/training/english/arset-sst
---
# MODIS Aqua SST v2019.0

Level-3 mapped SST at 4 km resolution, daily composites from MODIS Aqua.
Accessed via PO.DAAC OPeNDAP; authentication-free. Dimensions: time × lat × lon
(3600 × 7200). Key variable: `sst` (degree_C), scale_factor 0.005, add_offset 0.

## Uncertainty

Native uncertainty: `sst_err` (standard deviation from matchup analysis),
0.4 K typical. Does not capture diurnal warming bias or cloud-masking errors
in coastal zones. Cold-pixel bias in high-aerosol regions (e.g., Saharan dust)
is an additional ~0.3 K undocumented in product files; see
[known issues](#known-issues).

## Known issues
[Cold-pixel bias under Saharan dust](../gotchas/modis-aqua-sst-dust-bias.md)
```
4. **Update index.md**: Add entry linking to the new dataset
5. **Update log.md**: Record creation entry, newest first
6. **Lint**: Run knowledge-linter agent before release

---

## 3. openknowledgeformat.com — Browser-Based Validator

### Repository
- **URL**: https://openknowledgeformat.com (static site)
- **Author**: Mathias Onea (mathiasonea.com)
- **Purpose**: Independent OKF v0.1 builder reference — guide, validator, templates, prompt generator

### What It Does
A browser-based tool that validates OKF concept files against the v0.1 specification. Paste Markdown, upload `.md` files, or select a folder. Checks parseable frontmatter, required `type` fields, provides guidance on recommended metadata (title, description, resource, tags, timestamp), and checks internal Markdown link targets.

### What Rules It Checks

**Required checks (blocking)**:
- Concept files must contain parseable YAML frontmatter
- Frontmatter must be an object/map (not a scalar, list, or null)
- Every non-reserved concept file needs a non-empty `type`

**Guidance checks (warnings)**:
- Recommended metadata: title, description, resource, tags, timestamp
- Tags should be an array for predictable filtering
- File-relative and bundle-root Markdown links checked for missing targets

**Permissive behavior**:
- Reserved files (`index.md`, `log.md`) follow their own body structures without concept frontmatter
- Root `index.md` may declare optional `okf_version` frontmatter
- Unknown fields and extension keys are allowed
- Non-Markdown files are ignored

### Starter Templates Available
The site offers a prompt generator at `/okf-prompt-generator` and templates at `/templates` for:
- SaaS app (metrics, tables, playbooks)
- Data warehouse (datasets, tables, metrics)
- Laravel app (routes, models, policies, jobs)
- WordPress site (post types, taxonomies, ACF fields, templates)
- API docs (endpoints, schemas, errors)
- Company knowledge (teams, policies, systems, playbooks)
- AI agent context (systems, tools, playbooks, constraints)

### End-to-End: Visit → Paste → Get Feedback

1. **Visit**: https://openknowledgeformat.com/validator
2. **Paste**: Copy a concept markdown file's content into the text area, or upload `.md` files, or select a folder
   ```markdown
   ---
   type: BigQuery Table
   title: Orders
   tags: sales, revenue
   ---
   # Orders table
   ```
3. **Click "Validate"**
4. **Feedback**:
   - Green check: `type` present, frontmatter parseable
   - Yellow warning: `tags` should be an array `[sales, revenue]` not a scalar `sales, revenue`
   - Yellow warning: `description` recommended but missing
   - Yellow warning: `timestamp` recommended but missing
   - Red error: No `type` field → "Every concept file needs a non-empty type"
   - Link warning: Checks internal `[link](./some-file.md)` paths exist in uploaded set

---

## 4. AgentFi (medium.com/@AgentFitech)

### Source
- **Medium**: https://medium.com/@AgentFitech
- **Blog post**: "Google just standardized 'How AI Agents read the web'. Here's how we shipped it in a day." (June 19, 2026)
- **Product**: https://agentfi.tech

### What They Built
AgentFi is a platform that makes goods and services "visible, trusted, and available for native purchase by ChatGPT, Gemini, Claude and millions of autonomous AI agents." Their core product analyzes websites, generates `llms.txt` and `llms-full.txt` files, deploys them at the edge, and tracks how often the site gets cited across ChatGPT, Perplexity, Gemini, and Claude.

**Within 24 hours of the OKF spec publication (June 12, 2026), AgentFi added OKF bundle generation to their platform.** Their pipeline now:
1. Analyzes your website's content
2. Generates `llms.txt` (the pointer/map for agents)
3. Generates an OKF bundle (the structured library of concepts)
4. Links the OKF bundle's `index.md` from inside `llms.txt`
5. Deploys both at the edge

**Architecture**: llms.txt → OKF bundle → agent citations. The `llms.txt` acts as the pointer (like `sitemap.xml` + `robots.txt` combined for AI agents), while the OKF bundle acts as the structured knowledge library the pointer leads to. Their thesis: "Pointer leads to library."

### Integration Points
AgentFi generates OKF bundles automatically from crawled site content. The generated OKF bundles:
- Structure site content into concept files with typed frontmatter
- Create cross-links between related concepts
- Are linked from `llms.txt` so AI agents follow pointer → library
- Feed into citation tracking (ChatGPT, Perplexity, Gemini, Claude)

---

## 5. kb.duyet.net — Developer's OKF Knowledge Base

### Source
- **Knowledge Base**: https://kb.duyet.net
- **Author**: Duyet Le (Senior Data & AI Engineer, Vietnam)
- **GitHub**: https://github.com/duyet
- **Loading screen**: Shows an interactive concept graph ("Loading graph… Select a node to read it")

### What It Is
A personal knowledge base for Duyet Le, a data/AI engineer with 8+ years of delivery. The site renders as an interactive graph-based browser where concepts are nodes and relationships are edges. It appears to serve as his "second brain" — organizing knowledge about data platforms, AI tooling, and engineering systems.

### Conversion from Existing Markdown
The knowledge base appears to have been converted from Duyet's existing markdown notes and project documentation into an OKF-compatible format. Given his tech stack (TypeScript, ClickHouse, Kubernetes, LangGraph, LlamaIndex) and his blog posts about vibe-coding with Claude Code + Codex + OpenCode, the conversion likely used one or more agent-driven approaches.

**Concept types evident**: Systems, Tools, Playbooks, Constraints — following the OKF AI agent context pattern seen on openknowledgeformat.com

**Structure**: The graph sidebar loads a relationship map of concepts. Each concept is a node; internal markdown links form directed edges. The UI follows OKF's "one concept per file → traversable graph" pattern.

**Repository**: No direct public repository was found for kb.duyet.net specifically; Duyet's GitHub profile (github.com/duyet) hosts many open-source projects including ClickHouse Monitor, AnyRouter, rust-tieng-viet, and others. The knowledge base may be stored in a private repo or generated from markdown in his project repos.

**Agent integration**: Duyet uses Claude Code, Codex, and OpenCode for "vibe-coding" and explicitly describes their roles — Claude for architecture & review, Codex for long-horizon refactors, OpenCode for local/offline edits. His knowledge base likely serves as agent context across these workflows.

---

## 6. OriginTrail DKG + OKF (`@origintrail-official/dkg-okf`)

### Repository
- **npm**: https://www.npmjs.com/package/@origintrail-official/dkg-okf (v10.0.9)
- **GitHub**: https://github.com/OriginTrail/dkg (155 stars, 10 forks, 202 issues)
- **License**: Apache-2.0
- **Language**: TypeScript
- **Dependencies**: 3

### What It Does
A deterministic, pure (no LLM, no network) mapper from OKF bundles to OriginTrail Decentralized Knowledge Graph (DKG) Knowledge Assets. OKF standardizes *how* knowledge is written and exchanged (portable Markdown + YAML frontmatter + cross-links) but ships no verification, provenance, or ownership layer. This package bridges that gap: converts each concept file into an owned, verifiable RDF Knowledge Asset, reconstructing the bundle's cross-concept link graph. The same bundle always yields identical triples and IRIs.

### Installation
```bash
npm i @origintrail-official/dkg-okf
# Requires the dkg CLI (OriginTrail DKG client, v10+)
```

### Deterministic Mapping Algorithm
```
OKF concept file (markdown + frontmatter)
  → Load bundle directory (loadBundleDir)
    → Parse YAML frontmatter per concept file
      → Map concept type → RDF type
        → Map cross-links (markdown [links]) → RDF predicates
          → Generate deterministic IRIs per concept
            → Produce N-Quads (canonical, byte-stable)
              → Create Knowledge Assets on DKG node
```

**Key property**: Pure function — no LLM, no network calls during mapping. Same bundle → same quads every time. The RDF serialization is canonical N-Quads (byte-stable).

### CLI Interface
```bash
# Dry-run: print mapping summary, never touch a node
dkg okf import ./bundle --dry-run --print-nquads

# Import into Working Memory (private, free)
dkg okf import ./bundle --context-graph-id my-graph --create-context-graph

# Share to Shared Working Memory (team-visible, free)
dkg okf import ./bundle --context-graph-id my-graph --share

# Private invite-only context graph
dkg okf import ./bundle --context-graph-id private-graph --private --create-context-graph

# Export context graph back to OKF bundle (clean inverse)
dkg okf export my-graph ./out

# Verify bundle against DKG node state
dkg okf verify ./bundle --context-graph-id my-graph
dkg okf verify ./bundle --context-graph-id my-graph --list-missing
```

**Important flags**:
| Flag | Meaning |
|------|---------|
| `--context-graph-id <id>` | Target context graph |
| `--create-context-graph` | Create context graph if needed |
| `--share` | Share KAs to SWM after finalize |
| `--replace` | Replace existing imported assets |
| `--manifest <path>` | Resume or inspect staged import |
| `--private` | Create/use private context graph |
| `--sub-graph-name <name>` | Import into registered sub-graph |
| `--relate <predicate>` | Override relation mapping for links |
| `--dry-run` | Validate and print RDF without mutating |
| `--print-nquads` | Print canonical N-Quads |

**Export views**: `--view working-memory`, `--view shared-working-memory`, `--view verifiable-memory`

### Memory Tier Lifecycle
```
Working Memory (WM)      — private, free, local to node
    ↓ --share
Shared Working Memory    — team-visible, free, published to network
    ↓ dkg ka publish / publish-async  (explicit, gated, costs TRAC tokens)
Verifiable Memory (VM)   — on-chain proof, immutable
```

Import defaults to WM. Never auto-publishes to VM. On-chain promotion is always an explicit separate step.

### Library API
```typescript
import { loadBundleDir, importBundle, quadsToNQuads } from '@origintrail-official/dkg-okf';

const result = importBundle(loadBundleDir('./bundle'));
console.log(result.concepts.length, 'Knowledge Assets');
console.log(quadsToNQuads(result.quads)); // canonical, byte-stable N-Quads
```

### End-to-End Flow: OKF Bundle → DKG → On-Chain Proof → Verify

1. **Create OKF bundle**: Write concept files (markdown + frontmatter) in a directory
2. **Dry-run mapping**: `dkg okf import ./my-bundle --dry-run --print-nquads`
   - Sees: 5 concepts → 5 Knowledge Assets, N deterministic IRIs, N canonical N-Quads
3. **Import to WM**: `dkg okf import ./my-bundle --context-graph-id my-okf --create-context-graph`
   - Creates context graph, writes KAs to WM, finalizes
4. **Share to team**: `dkg okf import ./my-bundle --context-graph-id my-okf --share`
   - Advancing to SWM; concepts discoverable by team
5. **Publish to chain** (optional, costs TRAC): `dkg ka publish-async <concept-ka-name> --context-graph-id my-okf`
   - On-chain proof created; immutable verifiable record
6. **Verify integrity**: `dkg okf verify ./my-bundle --context-graph-id my-okf --list-missing`
   - Compares deterministic RDF from local bundle against node-visible triples
   - Reports any missing/mismatched concepts

---

## 7. W3C Holon CG — DataBook Profile

### Source
- **Substack article**: "The Format Convergence" by Kurt Cagle & Chloe Shannon (June 23, 2026)
  - https://ontologist.substack.com/p/the-format-convergence
- **DataBook repo (spec)**: https://github.com/w3c-cg/holon/tree/main/architectures/databook (17 stars, 3 forks)
- **DataBook CLI (reference impl)**: https://github.com/kurtcagle/databook (v1.5.1+)
- **W3C Holon Community Group**: Launched June 19, 2026, 30+ participants, chaired by Kurt Cagle

### What It Is
DataBook is a document-plus-data format that extends OKF's markdown + YAML frontmatter architecture with semantic web superpowers. A single DataBook file carries typed fenced data blocks (Turtle, JSON-LD, SPARQL, SHACL) alongside prose and richer frontmatter (IRI identity, versioning, named graph target, push mode). The CLI can parse these blocks and push them directly to a Fuseki triplestore via SPARQL Graph Store Protocol, with SHACL validation gating the push.

### How It Extends OKF Without Forking

The article explicitly proposes DataBook as a **formal OKF profile** — a set of conventions that extend OKF v0.1 for semantic web use cases. Conformant with base spec, backward-compatible with OKF tooling.

**DataBook's extensions to OKF frontmatter**:
| OKF Field | DataBook Extension |
|-----------|-------------------|
| `type` (required) | `id` (IRI — globally unique concept identity) |
| `title` | `version` (version tracking) |
| `description` | `graph` (target named graph URI) |
| `tags` | `author` (provenance) |
| `resource` | `mode` (push mode configuration) |
| `timestamp` | `target` (deployment endpoint) |

**DataBook's additions beyond frontmatter**:
- **Typed fenced blocks**: ` ```turtle`, ` ```jsonld`, ` ```sparql`, ` ```shacl` — carry RDF/SHACL/SPARQL payloads alongside prose
- **SPARQL Graph Store Protocol push**: CLI can deploy RDF payloads directly to a triplestore
- **SHACL validation gating**: Deployment blocked if payload doesn't satisfy shape constraints
- **Executable unit of knowledge**: A DataBook is not just representation; it's a deployable unit

### Differences from OKF
| Dimension | OKF | DataBook |
|-----------|-----|----------|
| **Model** | Wiki. One concept per file. | Document+data. Multiple typed blocks per file. |
| **Graph** | Implicit, links are untyped markdown | Explicit RDF, typed predicates, named graphs |
| **Identity** | File path is identity | IRI (`id:` frontmatter) is identity |
| **Deployment** | Git; agents read files directly | CLI pushes to triplestore via Graph Store Protocol |
| **Validation** | Frontmatter-only | SHACL shape validation gates deployment |
| **Versioning** | Optional `timestamp` | Explicit `version` tracking |
| **Tooling** | Any markdown tool | DataBook CLI (v1.5.1+) |

### The Proposal: OKF Semantic Web Profile
The article proposes filing an issue on the OKF GitHub repo to propose:
1. Richer frontmatter: extend base fields with `id` (IRI), `version`, `graph`, `author`
2. Typed fenced blocks: convention for Turtle/JSON-LD/SPARQL/SHACL blocks
3. Reference to SPARQL Graph Store Protocol for ingest
4. Optional SHACL validation gating deployment

A W3C Holon CG is positioned as the institutional home for this profile work.

### DataBook CLI Commands (from kurtcagle/databook, v1.5.1+)
```bash
databook head <file>      # Read frontmatter metadata
databook push <file>      # Push RDF blocks to triplestore
databook pull <uri>       # Pull from triplestore into DataBook
databook process <file>   # Process/transform RDF blocks
databook validate <file>  # SHACL validation
```

---

## 8. auto-okf (`npm`, indexzero, v0.0.1, Apache-2.0)

### Package
- **npm**: https://www.npmjs.com/package/auto-okf
- **Version**: 0.0.1 (published 12 days ago)
- **Author**: indexzero (Charlie Robbins — prolific Node.js ecosystem contributor, former Nodejitsu/Godaddy)
- **License**: Apache-2.0
- **Dependencies**: 0
- **Dependents**: 0

### What It Does
**Placeholder — "Coming soon."** The npm page contains only: "Multi-writer OKF (Open Knowledge Format) bundles. Coming soon."

### Status
- No GitHub repository found yet (404 at expected URLs)
- No source code published on npm (empty directory listing under Code tab)
- No README beyond the one-liner
- Package exists as a name reservation / placeholder

### Speculation on Intent
Given indexzero's background in distributed systems (invented `winston`, `forever`, `broadway`, Nodejitsu platform), "multi-writer" likely refers to collaborative/CRDT-based concurrent editing of OKF bundles by multiple agents or humans — potentially a conflict-free replicated data type approach to OKF bundle maintenance.

---

## 9. okfgen (`npm`, arindam1729, v0.0.3, MIT)

### Repository
- **npm**: https://www.npmjs.com/package/okfgen
- **GitHub**: https://github.com/Arindam200/okfgen (7 stars, 3 forks, 30 commits)
- **License**: MIT
- **Language**: TypeScript (built with tsup)
- **Dependencies**: 16 (LangChain, Zod, etc.)

### What It Does
OKFgen generates portable OKF v0.1 bundles from documentation, schemas, source code, and URLs using LangChain with swappable model providers (Nebius, OpenRouter, Ollama, OpenAI, Anthropic). It supports both one-shot generation and incremental updates of existing bundles, plus validation, linting, and an interactive graph viewer.

The model never writes files directly — the CLI controls frontmatter, paths, reserved filenames, and output boundaries through deterministic rendering after the LLM returns a structured plan.

### Installation
```bash
npm install -g okfgen
# Requires Node.js 20+

# Or local development:
git clone https://github.com/Arindam200/OKFgen.git
cd OKFgen && npm install && npm run build && npm link
```

### Full Interface

#### Interactive Mode
```bash
okfgen   # opens persistent shell with slash commands
```
Slash commands:
- `/generate [request]` — guided generation flow
- `/update [request]` — refresh last bundle with remembered sources
- `/view [directory]` — open bundle explorer (graph + document views)
- `/validate [directory]` — validate against OKF v0.1 rules
- `/providers` — list model providers and credential variables
- `/provider [name]` — change provider for session
- `/model [id]` — change model for session
- `/api-key` — securely enter/replace credential
- `/status` — show effective config
- `/config save` / `/config reset` — persist/clear defaults
- `/commands` — syntax, examples, hints
- `/exit` — close shell

#### One-Shot CLI
```bash
# Generate a bundle
okfgen generate "Document our payments API" \
  --provider nebius \
  --model meta-llama/Llama-3.3-70B-Instruct \
  --source ./docs ./openapi.yaml \
  --output ./payments-okfgen

# Flags: -p/--provider, -m/--model, --api-key, -s/--source,
#        --config, -o/--output, --base-url, --force, --no-log

# Validate
okfgen validate ./payments-okfgen [--json]

# Lint (editorial + graph quality)
okfgen lint ./payments-okfgen [--strict] [--json]
# Detects: duplicate titles, orphans, thin content, skipped headings,
#          broken links, broken heading anchors

# View (interactive explorer)
okfgen view ./payments-okfgen [--port 4400] [--no-open]

# Initialize project config
okfgen init        # writes okfgen.config.yml
okfgen init --force  # replace existing

# Configure provider
okfgen provider
okfgen provider ollama --model qwen3:8b
```

#### Update Existing Bundle
```bash
okfgen generate "Refresh from latest sources" \
  --source ./docs --output ./existing-bundle
# Auto-detects OKF bundle at output path, supplies it as context,
# produces improved plan: updates changed, adds new, removes stale,
# rebuilds indexes, appends to log.md
```

#### Providers
| Provider | Default Model | Env Variable |
|----------|--------------|--------------|
| Nebius | `zai-org/GLM-5.2` | `NEBIUS_API_KEY` |
| OpenRouter | `openai/gpt-oss-120b` | `OPENROUTER_API_KEY` |
| Ollama | `qwen3:8b` | (none — local) |
| OpenAI | `gpt-5.4-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |

#### TypeScript API
```typescript
import { generateBundle } from "okfgen";

const result = await generateBundle({
  provider: "nebius",
  model: "meta-llama/Llama-3.3-70B-Instruct",
  apiKey: process.env.NEBIUS_API_KEY,
  request: "Document the catalog",
  sources: ["./catalog"],
  outputDirectory: "./catalog-okfgen",
});
// result.mode, result.validation.valid, result.files

// Also exports: createChatModel, renderBundle, validateBundle,
//               provider metadata, Zod schemas
```

#### Agent Skills Integration
The package includes `SKILL.md` for Codex, Claude Code, Cursor, and other coding agents, giving them a safe workflow for generating, validating, and visualizing OKF bundles.

### Safety and Limits
- Source input capped at 1 MB/run
- Hidden dirs, `.git`, dependencies, build output skipped
- Remote sources: 15s timeout, size-checked
- Concept paths constrained inside output dir
- Updates only on recognized OKF bundles (`okf_version: "0.1"` in root index)
- Update cleanup only removes stale OKF markdown; other files preserved
- API keys persisted only after explicit opt-in to `~/.okfgen/.env` (mode `0600`)
- Model output parsed + validated before any file writes

### Generated Bundle Structure
```
payments-okfgen/
├── index.md          # root index, declares okf_version: "0.1"
├── log.md            # creation + update entries
├── api/
│   ├── index.md      # linked directory listing
│   └── authentication.md
└── schemas/
    ├── index.md
    └── payments.md
```

### Integration Points
- **LangChain**: Provider-agnostic model interface — swap Nebius/OpenRouter/Ollama/OpenAI/Anthropic without changing pipeline
- **OKF v0.1**: Full conformance validation; generates spec-compliant frontmatter and reserved files
- **Agent harnesses**: SKILL.md for Claude Code/Codex/Cursor; deterministic rendering keeps LLM from touching files directly
- **CI/CD**: `--json` and `--print` modes for automated pipelines

---

## 10. @fastrag/okf (`npm`, zac_ma, v0.1.0, MIT)

### Repository
- **npm**: https://www.npmjs.com/package/@fastrag/okf
- **GitHub Organization**: https://github.com/fastrag (no public repos — private org)
- **Website**: https://www.bundles.wiki
- **License**: MIT
- **Language**: TypeScript
- **Dependencies**: 8

### What It Does
CLI and Agent toolkit for creating, validating, searching, and visualizing OKF knowledge bundles. Converts document corpora into structured concept graphs, audits their integrity, and explores them through an interactive Viewer Workbench. Pure mechanical execution — no LLM required for CLI operations. Pinned versioned sources produce deterministic, reproducible output.

### Installation
```bash
npm install -g @fastrag/okf
# Command names: okf or wiki (aliases)
```

### Full Interface

#### `okf capabilities`
```bash
okf capabilities --json   # --json required; prints package identity, version, capability IDs
```

#### `okf convert`
```bash
okf convert <input> <bundle-root> --profile <profile.yaml> \
  [--source-type local|github] [--ref <ref>] [--generated-on <YYYY-MM-DD>] [--json]

# <input>: local directory, or short GitHub id (owner/repo), or full GitHub tree URL
# Re-running identical conversion leaves target unchanged (idempotent)
# --generated-on sets explicit bundle date; otherwise resolved from source commit
```

**Conversion Profile** (`profile.yaml`):
```yaml
recipe: "markdown-tree"           # only supported recipe currently
output_namespace: "docs"          # where converted concepts land
concept_type: "Reference Doc"     # emitted OKF type
source_title: "Example Docs"      # title in generated source artifacts
source_name: "example/docs"       # canonical source identity
corpus_entry: "docs"              # required for short GitHub inputs
base_tags: ["docs"]               # tags added to all emitted concepts
resource_base_url: "https://..."  # optional upstream base for resource links
route_base: "/docs"               # optional route root for link rewriting
entry_document: "index.md"        # required when route_base links include bare root
strip_ordering_prefix: true       # removes numeric prefixes from titles/links
```

#### `okf validate`
```bash
okf validate <bundle-root> [--json]
# Checks: parseable frontmatter, non-empty type, reserved index/log rules
# Does NOT evaluate link reachability (use okf bundle links for that)
```

#### `okf bundle`
```bash
okf bundle list --bundle <root> [--kind concept|index|log|all] [--directory <dir>] [--json]
okf bundle status --bundle <root> [--json]
okf bundle links --bundle <root> [--json]             # reports unresolved internal Markdown targets
okf bundle index --bundle <root> [--directory <dir>] [--apply] [--json]
```

#### `okf search`
```bash
okf search --bundle <root> [--limit <n>] [--json] <query...>
# Metadata-only search over title, path, type, description, tags
```

#### `okf viewer`
```bash
# Generate static Viewer Workbench sidecar
okf viewer generate --bundle <root>
# Produces: .okf/viewer/{graph.json, tree.json, search-index.json,
#           detail-concepts.json, viewer-search.js, viewer-manifest.json}
# Deterministic: same bundle bytes + same CLI version = byte-identical output

# Serve viewer locally
okf viewer serve --bundle <root> [--host 127.0.0.1] [--port 4173]
# Serves at /; content/** resolves against canonical bundle files

# Verify sidecar integrity
okf viewer verify --bundle <root> [--json]
# Checks: complete sidecar contract, no-mirrored-content rule,
#         CLI format + generator identity, canonical bundle fingerprint
```

### Viewer Workbench
Interactive browser-based explorer with:
- **Graph view**: Every concept as node, every internal link as directed edge. Select node → open document.
- **Tree view**: Hierarchical bundle navigation
- **Search**: Metadata search with concept navigation
- **Reading view**: Renders concept markdown with cross-references
- **Theme**: Clean light interface with persistent dark mode toggle

### AI Skill Integration
Beyond the CLI, @fastrag/okf includes three agent skills for full-lifecycle wiki management:

| Skill | Role | Authority |
|-------|------|-----------|
| `okf-wiki` | Router — classifies requests, dispatches to leaf skills | Read + Write (via leaves) |
| `okf-wiki-maintain` | Write ops — bootstrap, adopt, update, restructure, health audit | Read + Write |
| `okf-wiki-query` | Read-only queries — search and answer from registered bundles | Read-only |

**Workflows**:
1. **Bootstrap**: "Initialize a wiki for this project" → designs namespace structure → creates conforming bundle + `.okf/schema.md` → CLI validates, indexes
2. **Daily updates**: Query first (okf-wiki-query) → if evidence sufficient, answer with citations → if new knowledge found, persist (okf-wiki-maintain)
3. **Health audit**: Validation + status + managed-index checks → reports mechanical failures + semantic recommendations (stale concepts, weak links, drift)
4. **Viewer Workbench**: Generate → verify → serve → return HTTP URL for graph exploration

**Evidence-first policy**: Answer from source before persisting. Confirm before structural changes. Never write to Reference Bundles or deterministic baselines.

### Public Bundle Examples on bundles.wiki
- **Dictionary of AI Coding** (70 concepts, 2 namespaces) — glossary for AI coding terms
- **Babylon Lite** (47 concepts, 3 namespaces) — Babylon.js sample
- **Astro Docs zh-CN** (367 concepts, 2 namespaces) — Chinese Astro docs
- **Three.js** (798 concepts, 2 namespaces) — Large Three.js docs

### Integration Points
- **GitHub**: Convert public repos directly (`okf convert owner/repo ./out`)
- **OKF v0.1 spec**: Full conformance validation; bundles referenced against `www.bundles.wiki/SPEC.md`
- **Agent harnesses**: Skills for Claude Code, Codex, Cursor for full wiki lifecycle management
- **Static hosting**: Generated Viewer Workbench is self-contained HTML/JS, deployable anywhere
- **Progressive retrieval**: `okf search` as metadata-first retrieval step before loading full context

---

## Summary: Ecosystem Integration Map

```
┌──────────────────────────────────────────────────────────────┐
│                    OKF v0.1 Specification                      │
│            (Google Cloud, June 12, 2026)                      │
└──────────────────────────┬───────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐
  │ Inkeep   │    │ okfgen       │    │ @fastrag/okf          │
  │ OpenKnow │    │ (Arindam)    │    │ (zac_ma)              │
  │ ledge    │    │              │    │                       │
  │          │    │ LangChain    │    │ Pure mechanical       │
  │ WYSIWYG  │    │ LLM → OKF    │    │ docs → OKF            │
  │ Editor   │    │ generation   │    │ Viewer Workbench      │
  │ MCP +    │    │ + validation │    │ + Agent Skills        │
  │ Skills   │    │ + linting    │    │                       │
  └────┬─────┘    └──────┬───────┘    └───────────┬───────────┘
       │                 │                        │
       │    ┌────────────┼────────────────────────┤
       │    ▼            ▼                        ▼
       │  ┌──────────────────────────────────────────┐
       │  │  OKF Bundles (markdown + YAML + links)    │
       │  └────────────────┬─────────────────────────┘
       │                   │
       ▼                   ▼
  ┌──────────────┐  ┌──────────────────┐
  │ AgentFi      │  │ knowledge-templ  │
  │ Website →    │  │ ate (Open Sci)   │
  │ llms.txt +   │  │ Dataset / Gotcha │
  │ OKF bundle   │  │ / Recipe / Conv  │
  └──────────────┘  └──────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ openknow-    │
                    │ ledgeformat  │
                    │ .com         │
                    │ Validator +  │
                    │ Templates    │
                    └──────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐   ┌──────────────┐  ┌──────────────┐
    │OriginTrail│  │ W3C Holon CG │  │ auto-okf     │
    │ DKG + OKF │   │ DataBook     │  │ (indexzero)  │
    │           │   │ Profile      │  │              │
    │ OKF → RDF │   │ Semantic Web │  │ Multi-writer │
    │ → on-chain│   │ extension    │  │ Coming soon  │
    └──────────┘   └──────────────┘  └──────────────┘
          │                │
          ▼                ▼
    ┌──────────┐   ┌──────────────┐
    │ Verified │   │ SPARQL       │
    │ Knowledge│   │ triplestore  │
    │ Assets   │   │ deploy       │
    │ on DKG   │   │ + SHACL gate │
    └──────────┘   └──────────────┘
```

**Key relationships**:
- **inkeep/open-knowledge** is the primary editor/viewer (WYSIWYG + MCP + agent skills)
- **okfgen** generates OKF bundles from source material using LLMs
- **@fastrag/okf** converts docs to OKF mechanically + provides graph-first viewer
- **openknowledgeformat.com** validates bundles in the browser
- **knowledge-template** provides domain-specific concept types for earth science
- **OriginTrail DKG-OKF** bridges OKF to verifiable, on-chain knowledge assets
- **DataBook** extends OKF for semantic web/RDF/SPARQL/SHACL deployment
- **AgentFi** integrates OKF into website → agent citation pipeline
- **auto-okf** is a placeholder for multi-writer collaborative OKF bundles
- **kb.duyet.net** is a real-world developer knowledge base using OKF concepts in a graph UI
