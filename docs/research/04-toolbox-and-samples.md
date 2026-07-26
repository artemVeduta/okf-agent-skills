# Toolbox and Samples — Deep Analysis

> Repository: https://github.com/GoogleCloudPlatform/knowledge-catalog
> Branch: main

## Critical Architectural Insight

This repository serves **two distinct but related products** under one roof:

1. **Google Cloud Knowledge Catalog (formerly Dataplex)** — a Google Cloud service for AI-powered data cataloging and metadata management. The `toolbox/` and `samples/` directories serve this platform.
2. **Open Knowledge Format (OKF)** — a vendor-neutral open specification for representing knowledge as plain markdown files with YAML frontmatter. The `okf/` directory contains the spec, reference implementation, and example bundles.

The OKF specification is explicitly designed to be **universal and not tied to
any agent, framework, model provider, or serving system**. This repository
contains a demo-specific OKF-to-Knowledge-Catalog adapter; that is narrower
evidence than a general product-level import/export contract.

---

## Toolbox

**Location**: `toolbox/`

The toolbox provides development and operational tools for working with Google
Cloud Knowledge Catalog metadata. It contains two TypeScript source packages.
Both have npm-style `package.json` manifests and compile to local binaries, but
neither `kcmd` nor `kcagent` was present in the public npm registry when checked
on 2026-07-26.

### 1. Metadata as Code (`toolbox/mdcode/`)

**Source package / binary**: `kcmd` (`toolbox/mdcode/package.json`; build from source)
**Purpose**: Source-code-artifact-based UX for metadata management and context engineering in Knowledge Catalog.

#### Key Capabilities
- **Local-first metadata authoring**: Metadata is represented as YAML and Markdown files in a hierarchical directory structure mirroring the resource hierarchy of data assets.
- **Bidirectional sync**: `kcmd pull` / `kcmd push` between local workspace and the Knowledge Catalog service.
- **MCP server**: Exposes catalog operations as MCP tools for use in agentic systems (Gemini CLI, etc.).
- **Both TypeScript library and CLI binary**: Can be embedded programmatically or used standalone.

#### Directory Layout Convention
```
path/to/root/
├── catalog.yaml                       # Manifest and config directives
└── catalog/                           # Metadata snapshot
    └── <dir1>/
        └── <entry-id1>.yaml           # Entry
        └── <dir2>/
            ├── <entry-id2>.yaml       # Entry
            └── <entry-id2>.aspect.md  # Sidecar markdown
```

#### Catalog Manifest (`catalog.yaml`)
```yaml
scope: bq-dataset.prod-data.ecommerce

aliases:
  ca-guidelines:
    aspect: data-agents-project.global.ca-guidelines

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

#### CLI Commands
| Command | Description |
|---------|-------------|
| `kcmd init` | Initialize a new catalog snapshot for a BigQuery dataset or EntryGroup |
| `kcmd pull` | Pull the latest catalog snapshot from the service (with `--dry-run`) |
| `kcmd push` | Push local changes to the service (with `--dry-run`) |
| `kcmd status` | Check for local modifications |

#### MCP Server Tools
| Tool | Description |
|------|-------------|
| `list-entries` | List entries in the catalog snapshot |
| `lookup-entry` | Lookup an entry and its metadata |
| `modify-entry` | Modify an entry and its metadata |

**Evidence (2026-07-26):** `toolbox/mdcode/src/tool/mcp.ts` contains exactly
three `registerTool(...)` calls, for the tools above. `pull` and `push` are CLI
commands implemented in `src/tool/commands.ts`; they are not MCP tools.

#### Dependencies
- `@modelcontextprotocol/sdk` ^1.29.0 — MCP server implementation
- `cac` ^7.0.0 — CLI framework
- `glob` ^13.0.6 — file matching
- `yaml` ^2.8.4 — YAML parsing
- `zod` ^4.4.2 — schema validation

#### Test Framework
- Bun test runner (`npm run test:libts`)
- MCP Inspector integration for debugging (`npm run x:mcp`)

#### Architecture
```
toolbox/mdcode/src/
├── libts/           # Core TypeScript library
└── tool/            # CLI + MCP server binary (compiled with Bun)
```

---

### 2. Enrichment Agent (`toolbox/enrichment/`)

**Source package / binary**: `kcagent`
(`toolbox/enrichment/package.json`; build from source, not published on npm as
of 2026-07-26)
**Purpose**: Customizable agentic workflow for extracting information from various sources to build metadata about data assets, usable as agent context.

#### Key Capabilities
- **Extensible MCP tool integration**: Loads MCP servers dynamically from `mcp.json` configuration files (supports both stdio and HTTP transports).
- **Skill-based instruction system**: Loads agent skills from a `skills/` directory using Google ADK's `SkillToolset` and `UnsafeLocalCodeExecutor`.
- **Built-in markdown fileset MCP server**: Ships `md-fileset` binary — an MCP server that provides `list_fileset_contents`, `read_fileset_file`, and `search_fileset_content` tools over a Markdown document directory.
- **CLI entry point (`kcagent`)**: Standalone binary compiled via Bun.

#### CLI
```bash
kcagent enrich \
  --catalog-path . \
  --tools-path tools \
  --prompt-path prompt.md
```

#### MCP Tool Loading (from `tools.ts:25-95`)
The agent reads `mcp.json` at runtime and dynamically creates MCP toolset connections:
- **Stdio**: `command`, `args`, `env` with environment variable expansion (`$VAR` / `${VAR}`)
- **HTTP**: `httpUrl` with the same expansion
- Both support configurable timeouts

#### Skill Loading
Skills are loaded from `<tools-path>/skills/` directory. Each skill has a `SKILL.md` file with YAML frontmatter (`name`, `description`) followed by markdown instruction body — the same format as OKF files.

#### Dependencies
- `@google/adk` ^1.1.0 — Google Agent Development Kit
- `@modelcontextprotocol/sdk` ^1.29.0 — MCP runtime
- `kcmd` (file:`../mdcode`) — local dependency on Metadata as Code library
- `cac` ^7.0.0 — CLI framework

#### Architecture
```
toolbox/enrichment/src/
├── agent/
│   ├── main.ts          # CLI entry point (kcagent)
│   ├── tools.ts         # MCP tool + skill loader
│   ├── enrich/          # Enrichment command implementation
│   └── utils/           # Polyfills and patches
└── tools/
    └── md/              # Built-in md-fileset MCP server
```

#### Built-in MCP Tool: `md-fileset`
Provides three tools for working with a markdown knowledge base directory:
| Tool | Function |
|------|----------|
| `list_fileset_contents` | Browse/navigate directory tree |
| `read_fileset_file` | Read full contents of a file |
| `search_fileset_content` | Full-text search with matching lines and snippets |

---

### How Toolbox Relates to OKF

The generic toolbox does **not** directly operate on OKF format. It operates on
Google Cloud Knowledge Catalog metadata represented in a catalog-specific
YAML/Markdown layout. The repository separately includes
`toolbox/mdcode/demo/okf/`, whose adapter maps a bounded subset of OKF through a
custom Dataplex aspect.

- Both use YAML frontmatter + Markdown body structure
- Both organize knowledge hierarchically in directories
- Both enable local/offline authoring with version control
- The `md-fileset` MCP server could feasibly be used to serve OKF bundles as a tool for agents

The demo preserves the Markdown body plus `title`, `description`, `tags`,
`resource`, `type`, `generated.{by,at}`, and
`sources[].{id,resource,title}`. Its source does not map `verified`, `status`,
`stale_after`, source credibility fields, computation fields, or arbitrary
extension keys. Therefore “lossless round-trip” applies to that demo's mapped
subset, not to every conformant v0.2 document.

---

## Top-Level Samples

**Location**: `samples/`

The top-level samples demonstrate Google Cloud Knowledge Catalog (not OKF) use cases. Both are agent-based and rely on the Google Agent Development Kit (ADK).

### 1. Discovery Agent (`samples/discovery/`)

**Language**: Python  
**Framework**: Google ADK (`google.adk`)  
**Model**: Gemini 3 Flash Preview (via Vertex AI)  

#### What It Demonstrates
Building a search and discovery agent on top of Knowledge Catalog's Semantic Search APIs. The agent performs:
1. **Semantic decomposition** of complex user queries
2. **Predicate extraction** (type, system, name, projectid, etc.)
3. **Parallel search** with multiple query variations
4. **Result deduplication and reranking**

#### File Structure
```
samples/discovery/
├── agent.py            # ADK Agent definition (loads SKILL.md as instruction)
├── tools.py            # knowledge_catalog_search tool (wraps Dataplex API)
├── utils.py            # get_consumer_project from env
├── SKILL.md            # Agent instruction/skill (12KB, detailed)
├── requirements.txt    # google-adk, google-cloud-dataplex
└── README.md           # Setup and usage docs
```

#### Key Code

**Agent Definition** (`agent.py`):
```python
discovery_agent = llm_agent.Agent(
    model=google_llm.Gemini(model=GEMINI_MODEL),
    name='knowledge_catalog_discovery_agent',
    instruction=load_instruction(),  # From SKILL.md
    tools=[tools.knowledge_catalog_search],
)
```

**Search Tool** (`tools.py`): Wraps `dataplex_v1.CatalogServiceClient.search_entries()` with `semantic_search=True`, returning entry metadata (name, system, resource, display_name).

**SKILL.md**: A 12KB instruction file that defines a detailed multi-step workflow:
- Step 1: Understand the query
- Step 2: Semantic decomposition & generating up to 3 search variations
- Step 3: Call Knowledge Catalog Search with predicates (batch parallel)
- Step 4: Merge and deduplicate results
- Step 5: Identify and rank best results

The SKILL.md also contains a full **Predicate Reference Table** mapping natural language keywords to Knowledge Catalog search predicates (`type=`, `system=`, `name:`, `projectid=`, `parent=`, `displayname:`, `description=`).

#### Deployment
Can run as a **root agent** or **sub-agent** (via ADK `AgentTool`). Uses ADK CLI:
```bash
adk run path/to/agent/parent/folder
```

---

### 2. Enrichment Agent (`samples/enrichment/`)

**Language**: Python  
**Purpose**: Agentic enrichment of Knowledge Catalog metadata from external sources.

#### What It Demonstrates
A three-stage enrichment workflow using an LLM to augment catalog metadata with documentation from organizational knowledge sources:
1. **Download** — pull existing metadata snapshot from Knowledge Catalog
2. **Enrich** — run agent to augment metadata with external information
3. **Publish** — push enriched metadata back to Knowledge Catalog

#### File Structure
```
samples/enrichment/
├── README.md
├── .gitignore
├── sample/
│   ├── config/         # Enrichment agent configuration
│   ├── data/           # Sample data setup scripts
│   └── docs/           # External documentation sources (markdown)
└── src/
    ├── env.sh          # Environment setup script
    ├── requirements.txt
    ├── tools/          # MCP tools for the enrichment agent
    └── enrichment/     # Main Python package
        ├── __init__.py
        ├── download.py  # Download metadata snapshot from catalog
        ├── enrich.py    # Run enrichment agent
        ├── publish.py   # Publish enriched metadata
        ├── documentation/  # Documentation generation modules
        ├── metadata/       # Metadata handling utilities
        └── util/           # Shared utilities
```

#### Enrichment Pipeline
```bash
# 1. Download current metadata
python3 -m enrichment.download \
  --dir ../sample/metadata.initial \
  --dataset ${PROJECT}.kc_enrich_sample_data

# 2. Run enrichment agent
python3 -m enrichment.enrich \
  --dir ../sample/metadata.initial \
  --output-dir ../sample/metadata.new \
  --config-dir ../sample/config

# 3. Review changes
git diff --no-index ../sample/metadata.initial ../sample/metadata.new

# 4. Publish
python3 -m enrichment.publish \
  --dir ../sample/metadata.new
```

---

## OKF Directory (Separate from Toolbox/Samples)

**Location**: `okf/`

This is the **OKF specification project** — a fully separate concern from the Knowledge Catalog toolbox. It contains:

```
okf/
├── SPEC.md              # Open Knowledge Format v0.2 specification (37KB)
├── README.md            # OKF project documentation
├── LICENSE.md           # Apache 2.0
├── pyproject.toml       # Python project config (reference agent)
├── .gitignore
├── bundles/             # Example OKF bundles
│   ├── ga4/
│   ├── stackoverflow/
│   ├── crypto_bitcoin/
│   └── acme_retail/
├── samples/             # Bundle generation recipes
│   ├── ga4_merch_store/
│   ├── stackoverflow/
│   └── crypto_bitcoin/
├── src/                 # Reference agent source (Python)
└── tests/               # Python test suite (pytest)
```

### Key OKF Concepts
- **Vendor-neutral**: Not tied to Knowledge Catalog, Google Cloud, or any framework
- **Plain markdown + YAML frontmatter**: Directly readable by humans and LLMs
- **Directory hierarchy**: Concepts organized by type (tables/, datasets/, references/)
- **Automatic index.md**: Progressive disclosure for navigation
- **Graph-shaped**: Cross-links via markdown links between concepts
- **Trust signals in frontmatter**: `sources`, `generated`, `verified`, `status`, `stale_after`
- **Visualization**: Self-contained interactive HTML (`viz.html`) using Cytoscape.js

### Reference Agent
The `okf/src/` directory contains a Python reference agent that:
- Runs in two passes: **BQ pass** (extracts BigQuery metadata) and **web pass** (LLM crawls documentation)
- Produces OKF bundles as directories of markdown files
- Can visualize bundles as interactive HTML graphs
- Supports `--concept` flag for iterating on single concepts

---

## Repository Metadata

| Item | Details |
|------|---------|
| **License** | Apache 2.0 |
| **Contributor Agreement** | Google CLA required (`cla.developers.google.com`) |
| **Code of Conduct** | Contributor Covenant v1.4 |
| **Code Review** | All submissions require review via GitHub pull requests |
| **Testing** | `npm run test` (TypeScript packages), `pytest` (Python/OKF) |
| **Disclaimer** | Not an official Google product |

---

## MCP / Agent Integration Tools

### MCP Servers in the Repository

1. **`kcmd mcp`** (`toolbox/mdcode/`): MCP server for Knowledge Catalog metadata operations (pull, push, list-entries, lookup-entry, modify-entry). Configurable via MCP settings file pointing to a catalog path.

2. **`md-fileset`** (`toolbox/enrichment/`): MCP server for browsing and searching a directory of markdown files — list, read, and search operations over a fileset knowledge base.

### Agent Frameworks Used

- **Google ADK** (`@google/adk` v1.1.0): Used by both toolbox enrichment agent (TypeScript) and discovery sample (Python). Provides `llm_agent.Agent`, `MCPToolset`, `SkillToolset`, and `UnsafeLocalCodeExecutor`.
- **MCP SDK** (`@modelcontextprotocol/sdk` v1.29.0): Used by both toolbox tools for MCP server/client implementations.
- **Custom Agent**: The OKF reference agent in `okf/src/` is a standalone Python implementation that does not use ADK — it uses raw Gemini API calls via `vertexai` / Google GenAI SDK.

### Agent Integration Patterns

1. **SKILL.md as agent instruction**: The discovery sample loads `SKILL.md` at runtime as the agent's system instruction — the same pattern as Claude Code / opencode skills.

2. **Dynamic MCP tool loading**: The enrichment agent (`tools.ts`) reads `mcp.json` at runtime and creates MCP toolset connections dynamically. This enables fully configurable agent tooling without code changes.

3. **Skill-based tool description**: Skills describe how to use MCP tools effectively (see `tools/skills/fileset-source/SKILL.md` in the enrichment demo), creating a layered architecture: MCP server provides raw capabilities, skills describe usage patterns.

4. **Multi-pass agent workflows**: Both the enrichment sample and OKF reference agent use multi-pass workflows (download → enrich → publish; BQ pass → web pass) rather than single-turn interactions.

---

## Observations for Skill Implementation

### Reusable Patterns

1. **SKILL.md format**: The discovery sample's `SKILL.md` (YAML frontmatter + markdown body) is effectively an OKF file — same structure. This convergence suggests skills could be represented as OKF documents, enabling the same tooling to manage both domain knowledge and agent instructions.

2. **`mcp.json` configuration pattern**: The enrichment agent's approach to loading MCP servers from a JSON config file is a clean, reusable pattern for any agent harness. The config supports environment variable expansion, stdio and HTTP transports, and customizable timeouts.

3. **Toolset composition**: The toolbox enrichment agent composes tools from multiple sources (MCP servers loaded from config + skills loaded from directory) — a pattern for building extensible agent harnesses.

4. **Multi-pass agent architecture**: The download/enrich/publish pattern separates concerns cleanly and enables human-in-the-loop review between passes.

### Tools Worth Integrating With

1. **`kcmd` MCP server**: Could be useful if the skill implementation needs to interact with Google Cloud Knowledge Catalog metadata. The MCP interface is well-defined and versioned.

2. **`md-fileset` MCP server**: A generic, self-contained MCP server for markdown knowledge bases. Could serve OKF bundles directly as agent tools. Its three tools (list, read, search) map cleanly to any knowledge navigation workflow.

3. **OKF visualization (`viz.html`)**: The self-contained HTML graph viewer for OKF bundles is a proven pattern for making knowledge bundles browsable without tooling dependencies. Could be adapted for skill-generated documentation.

### Conventions to Adopt

1. **SKILL.md alongside code**: The discovery sample places `SKILL.md` in the same directory as `agent.py` — a convention where agent instructions live with the agent code. This mirrors the OKF philosophy of keeping knowledge close to what it describes.

2. **Progressive disclosure through `index.md`**: OKF auto-generates index files for navigating deep directory hierarchies. This pattern could be applied to skill bundles with many concepts.

3. **Trust signals in frontmatter**: OKF v0.2's frontmatter fields (`generated`, `verified`, `sources`, `status`, `stale_after`) provide a vocabulary for documenting the provenance and freshness of agent-generated knowledge. Could be adopted for skill-generated documentation.

4. **Separate config from code**: Both samples use explicit configuration directories (`config/`, `mcp.json`, environment variables) rather than hardcoding — good for skill portability.

### Key Differences Between Toolbox/Samples and OKF

| Aspect | Toolbox/Samples | OKF |
|--------|----------------|-----|
| **Scope** | Google Cloud Knowledge Catalog (Dataplex) | Universal, vendor-neutral knowledge format |
| **Language** | TypeScript + Python (ADK) | Python (standalone reference agent) |
| **Metadata format** | Dataplex entry YAML/Markdown | OKF spec YAML/Markdown |
| **Cloud dependency** | Requires GC project + APIs | No cloud dependency for format itself |
| **Agent framework** | Google ADK | Custom implementation |
| **Purpose** | Manage GC catalog metadata | Represent any domain knowledge |
| **Portability** | Tied to Dataplex API | Any filesystem, any consumer |

### What's Missing (Implications for Skill Builders)

1. **No OKF toolkit in the toolbox**: The `toolbox/` and `samples/` directories are Knowledge Catalog service tools, not OKF tools. For OKF-specific tooling, one must look to the `okf/src/` reference agent or build custom tools.

2. **No generic OKF producer/consumer libraries**: The reference agent is a proof-of-concept, not a production library. There is no npm/PyPI package for reading/writing OKF bundles generically (beyond the reference agent's internal modules).

3. **No MCP server for OKF bundles**: While `md-fileset` could serve OKF bundles, there is no dedicated OKF-aware MCP server that understands OKF-specific frontmatter fields, cross-links, or the trust-tier system.

4. **Skills and OKF convergence opportunity**: The fact that `SKILL.md` uses the same YAML frontmatter + markdown structure as OKF suggests that skills could be valid OKF documents. This would allow the same discovery, linking, and freshness signals to apply to both domain knowledge and agent instructions.
