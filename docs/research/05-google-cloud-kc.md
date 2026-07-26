# Google Cloud Knowledge Catalog & OKF Relationship

## Knowledge Catalog Product

Knowledge Catalog (formerly Dataplex Universal Catalog, renamed April 10, 2026) is a Gemini-powered data catalog that provides universal business context and governance across an enterprise's entire data estate. The API, `gcloud dataplex` CLI, and client libraries retain their original names.

Three pillars:
- **Aggregation**: Unifies metadata across Google Cloud services (BigQuery, AlloyDB, Spanner, Cloud SQL, Firestore, Looker), third-party databases, partner catalogs (Atlan, Collibra, Datahub, Ab Initio, Anomalo), and enterprise systems (Palantir, Salesforce, SAP, ServiceNow, Workday). Also aggregates BigQuery measures and LookML into a governed semantic foundation.
- **Enrichment**: Uses Gemini to automatically generate natural-language descriptions, infer business relationships from schemas/query logs/BI models, produce verified SQL example queries, and extract entities from unstructured data (PDFs, contracts).
- **Search**: Hybrid semantic search (Google Search technology under the hood), access-control-aware results, and a measurable context evaluation framework for iterative tuning.

KC operates on a "context graph" — a dynamic map connecting technical schemas with business entities. It produces "data products" (self-contained blocks with SLAs and governance constraints) and provides MCP-based tools for agent consumption.

**Relationship to OKF**: KC is a Google Cloud *product/service*. OKF is an *open format specification*. They are sibling projects authored by the same team (Sam McVeety is co-author on both the KC announcement and OKF v0.2 blogs).

## Blog Announcement

Published **April 22, 2026** by Chai Pydimukkala (Product Lead) and Sam McVeety (Tech Lead, Data Analytics).

Key announcements:
- Dataplex evolves from a passive metadata registry to an "active AI-powered context graph"
- Bloomberg Media is an early customer using KC to power a Data Access AI Agent
- Deep Research Agent in Gemini Enterprise is powered by KC (Preview)
- Existed alongside the OKF v0.1 introduction (June 2026) — both from Google Cloud Next '26 timeline
- **No direct mention of OKF in the announcement blog** — OKF is introduced separately

The "Related articles" sidebar on the KC blog page links to "Open Knowledge format v0.2 tackles agentic trust" (also by Sam McVeety), establishing the connection editorially but not architecturally.

## MCP Toolbox / Agent Integrations

Knowledge Catalog has several agent integration paths. They should not be
collapsed into one “OKF MCP” surface:

### 1. Pre-built `dataplex` tool in MCP Toolbox
- Repo: `github.com/googleapis/mcp-toolbox`
- Binary: `toolbox --prebuilt dataplex --stdio`
- Requires v0.31.0+
- Provides at least these tools: `search_entries`, `lookup_entry`, `search_aspect_types`, `lookup_context`
- Connects via `DATAPLEX_PROJECT` env var
- Supported by: VS Code Copilot, Claude Desktop, Claude Code, Codex (via Data Agent Kit), Cline, Cursor, Windsurf

### 2. Gemini CLI Extension (Knowledge Catalog)
- Repo: `github.com/gemini-cli-extensions/knowledge-catalog`
- Skills available at `github.com/gemini-cli-extensions/knowledge-catalog/tree/main/skills`
- Installed via `gemini extensions install https://github.com/gemini-cli-extensions/knowledge-catalog`
- Does not use MCP Toolbox — it's a native Gemini CLI extension

### Claude Code plugin
- Specific plugin: `knowledge-catalog@claude-plugins-official`
- Installed via `/plugin install knowledge-catalog@claude-plugins-official`

### Recommended system prompt (from Google docs)
When using KC MCP tools, recommended system instructions guide the LLM:
- `search_entries` for finding datasets/tables
- `lookup_entry` for schema/metadata details
- `search_aspect_types` for governance rules/classifications
- `lookup_context` for broad metadata retrieval

### Remote MCP server
Knowledge Catalog also offers a remote MCP server option and a separate data lineage remote MCP server.

## Data Agent Kit

The **Data Agent Kit** is an open-source package that bundles:
- Secure MCP tools (via `mcp-toolbox`)
- Native IDE plugins
- Pre-codified data engineering and data science skills

Supported IDEs: VS Code, Claude Code, Codex, Antigravity CLI

**What it connects to via MCP Toolbox**: AlloyDB, BigQuery, Spanner, Cloud SQL, Knowledge Catalog, and Apache Spark

**Does it use OKF?**: The Data Agent Kit description and documentation pages make **no mention of OKF**. It connects agents to Knowledge Catalog *as a service* via MCP tools, not to OKF bundles on disk. The Knowledge Catalog MCP tools serve as a context retrieval layer from the KC service API, which is a different consumption path than reading OKF bundles from a filesystem.

**Codex integration**: `codex plugin marketplace add GoogleCloudPlatform/data-agent-kit` then `codex plugin install dataplex@data-agent-kit`

## Data Cloud Agents

Google Cloud offers a suite of first-party agents that use Knowledge Catalog:

| Agent | Function | KC usage |
|-------|----------|----------|
| **Data Engineering Agent** | Pipeline creation/migration in BigQuery | Uses KC metadata for transformations |
| **Data Science Agent** | Data prep, ML training planning | Full contextual awareness via KC |
| **Database Onboarding Agent** | Recommend and provision databases | Uses KC context |
| **Database Observability Agent** | Monitor fleet, detect anomalies | Multi-turn remediation |
| **Deep Research Agent** | Multi-stage research across systems | Powered by Knowledge Catalog, traces lineage, blends structured + unstructured |

**Conversational Analytics**: BigQuery, Looker, and databases (Cloud SQL, Spanner, AlloyDB) all have conversational analytics agents grounded in KC entities, relationships, and business metrics.

**Agent development tools**: Conversational Analytics API, BigQuery ADK integration, BigQuery Agent Analytics plugin, Looker agent analytics block.

**OKF relevance**: None of the Data Cloud Agents documentation cited here
mentions OKF. The agents consume context from Knowledge Catalog's *service
API*, not from OKF bundles. Separately, the repository contains an OKF demo
adapter for a bounded field subset.

## Relationship to OKF Format

### Does KC produce OKF?
Not directly. The OKF reference agent produces OKF from BigQuery metadata (it reads BigQuery `INFORMATION_SCHEMA` and generates markdown files). KC itself is a *consumer* of metadata from BigQuery and other sources, but it stores that metadata in its own service, not as OKF bundles.

However, the OKF README explicitly lists "Dataplex" (i.e., Knowledge Catalog) as one source that could *export* to OKF: "export pipelines from existing catalogs (Dataplex, Unity Catalog, Collibra, ...)."

### Does KC consume OKF?
**Evidence:** The official
[OKF v0.2 article](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals/)
describes a Knowledge Catalog round-trip demo. The corresponding primary source
is `toolbox/mdcode/demo/okf/`.

**Scope limit:** This is demo code, not evidence of a generic product-level OKF
import/export API. The adapter maps the Markdown body plus `title`,
`description`, `tags`, `resource`, `type`, `generated.{by,at}`, and
`sources[].{id,resource,title}` through a custom `okf` Dataplex aspect. It does
not map all v0.2 trust/lifecycle/computation fields or arbitrary extension
keys.

**Not established:** The demo does not show that Knowledge Catalog's MCP tools
serve the restored OKF document or that an MCP client can request an OKF
round-trip. Those are separate service/API paths.

### Is OKF independent of KC?
**Yes, by design.** The OKF README explicitly states: "OKF is a universal, vendor-neutral format ... not tied to any particular agent, framework, model provider, or serving system." It explicitly mentions Unity Catalog and Collibra as alternative export sources. OKF bundles are just directories of markdown files — they can be consumed by any static file server, Obsidian, MkDocs, or any LLM that can read files.

### The team relationship
Both KC and OKF share the same tech lead: **Sam McVeety** (Tech Lead, Data Analytics, Engineering, Data Cloud at Google). The OKF v0.2 blog is co-authored by Sam McVeety and Amir Hormati (Tech Lead, BigQuery). This confirms OKF and KC are sibling projects from the same team within Google Cloud's Data Analytics organization.

### The repo relationship
The OKF specification, reference agent, visualizer, and sample bundles all live **inside** the `GoogleCloudPlatform/knowledge-catalog` GitHub repo at the `okf/` directory. The repo also contains `samples/` and `toolbox/` directories. This co-location is practical (same team, same org) but should not be confused with architectural coupling — the OKF README explicitly says KC is just one of many possible producers/consumers.

### What the OKF spec says about KC
The OKF spec itself (SPEC.md) is format-only — it defines frontmatter keys, concept types, and conventions. It does not mention Knowledge Catalog, Dataplex, or any Google service by name. The format is deliberately service-agnostic.

## MCP Tool Implementations

### MCP Toolbox (googleapis/mcp-toolbox)
- **Language**: Go
- **Pre-built tools for KC**: `dataplex` (search, lookup, context retrieval)
- **Other pre-built tools**: BigQuery, Spanner, Cloud SQL, AlloyDB, Apache Spark
- **Usage**: `./toolbox --prebuilt dataplex --stdio`
- **MCP tools exposed** (from the recommended system prompt):
  - `search_entries` — find datasets and tables by natural language or keywords
  - `lookup_entry` — get table schema, metadata, data quality rules, ownership
  - `search_aspect_types` — find governance rules and classifications
  - `lookup_context` — retrieve broad set of metadata for an asset

### Knowledge Catalog Gemini CLI extension
- **Repo**: `github.com/gemini-cli-extensions/knowledge-catalog`
- **Language**: Not yet determined (Gemini CLI extension framework)
- **Skills**: Available in `skills/` directory of the repo
- **Distinction**: This is a Gemini CLI native extension, not an MCP server wrapper. It bundles the skills directly without MCP Toolbox.

### Remote MCP servers
Knowledge Catalog offers two remote MCP server options:
1. **Remote MCP server** — general KC access
2. **Data lineage remote MCP server** — lineage-specific queries

### Antigravity CLI
A CLI agent for testing data context, listed in KC docs: "Use Antigravity CLI agent to test data context" at `dataplex/docs/use-antigravity-cli-agent-to-test-data-context`.

## Summary Table

| Dimension | Knowledge Catalog | Open Knowledge Format |
|-----------|-------------------|----------------------|
| **Type** | Google Cloud service/product | Open specification + file format |
| **GitHub** | `GoogleCloudPlatform/knowledge-catalog` | Same repo, `okf/` directory |
| **Storage** | Google Cloud service (proprietary) | Markdown files in directories (open) |
| **Portability** | Locked to GCP | Any filesystem, git repo, static server |
| **Trust signals** | Internal to service | First-class frontmatter: `generated`, `verified`, `status`, `stale_after`, `sources`, `attested computations` |
| **Agent access** | MCP tools (via `mcp-toolbox`), Gemini CLI extension, REST API | Direct file reading, git clones, any tool that reads markdown |
| **Relationship** | Repository demo maps a bounded OKF subset into a custom Dataplex aspect and back; generic product import/export is not established here | Lives in KC's repo but is format-only and service-agnostic. Reference agent produces OKF from BigQuery but format is not KC-dependent |
| **Authors** | Chai Pydimukkala (PM), Sam McVeety (TL) | Sam McVeety (TL), Amir Hormati (TL) |
