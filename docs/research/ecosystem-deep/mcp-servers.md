# OKF Ecosystem: MCP Servers & Integrations — Deep Investigation

> Exhaustive research on 5 OKF ecosystem projects. Each section covers repository metadata, architecture, installation, MCP tools, end-to-end flows, configuration, and agent harness integration.

---

## Table of Contents

1. [@copperbox/okf-mcp](#1-copperboxokf-mcp) — The canonical OKF MCP server (39 commits, ISC, 248 weekly)
2. [caedora-mcp](#2-caedora-mcp) — Caedora.app's MCP server (109 commits, MPL-2.0, 5 weekly)
3. [okfy-ai](#3-okfy-ai) — Docs-to-OKF conversion pipeline + MCP. (34 commits, MIT, 572 weekly)
4. [@quatrain/okf](#4-quatrainokf) — Quatrain Core OKF flat-file storage adapter (785 commits, AGPL-3.0, 555 weekly)
5. [okf-toolset](#5-okf-toolset) — TypeScript toolkit for OKF: embeddings, search, MCP, refiner, Git. (3 commits, MIT, 27 weekly)

---

## 1. @copperbox/okf-mcp

### Repository

| Field | Value |
|---|---|
| **GitHub** | https://github.com/copperbox/okf-mcp |
| **npm** | https://www.npmjs.com/package/@copperbox/okf-mcp |
| **Stars** | 1 |
| **Commits** | 39 |
| **License** | ISC |
| **Language** | TypeScript |
| **Version** | 0.20.0 (4 days ago) |
| **Weekly Downloads** | ~248 |
| **Author** | [dantheuber](https://www.npmjs.com/~dantheuber) (copperbox) |
| **Dependencies** | 3 (no database, no embedding SDK) |
| **Node Requirement** | Node.js 20+ |

### What it does

**The canonical OKF MCP server.** `@copperbox/okf-mcp` is the reference implementation giving AI agents a standardized OKF v0.1 backend. It indexes a directory of Markdown files with YAML frontmatter (a "bundle") into an in-memory link graph and exposes it through MCP resources and tools for **search, graph traversal, validation, and authoring**. The bundle stays plain editable markdown — humans browse it with any editor (including as an Obsidian vault), while agents work through the MCP server. It is deliberately **database-free and embedding-free**; the only network calls are for optional read-only remote bundles. It supports multi-bundle setups (org brain + project brain), colocated bundles (one vault = many bundles), remote bundle fetching from GitHub trees or `.tar.gz` archives, cross-bundle graph edge derivation, and a full repair/doctor CLI. Write tools are gated behind `--writable`.

### Installation

```bash
# Via npx (no install needed for MCP config):
npx -y @copperbox/okf-mcp --bundle /path/to/bundle --writable

# Local install:
npm install @copperbox/okf-mcp
npm run build
node dist/cli.js --bundle /path/to/your/bundle
```

### MCP Configuration JSON

**Basic (single bundle, writable):**
```json
{
  "mcpServers": {
    "okf": {
      "command": "npx",
      "args": [
        "-y", "@copperbox/okf-mcp",
        "--bundle", "brain=/absolute/path/to/your/bundle",
        "--writable"
      ]
    }
  }
}
```

**Read-only (omit `--writable`):**
```json
{
  "mcpServers": {
    "okf": {
      "command": "npx",
      "args": [
        "-y", "@copperbox/okf-mcp",
        "--bundle", "brain=/absolute/path/to/your/bundle"
      ]
    }
  }
}
```

**Multi-bundle (org + project brains):**
```json
{
  "mcpServers": {
    "okf": {
      "command": "npx",
      "args": [
        "-y", "@copperbox/okf-mcp",
        "--bundle", "org=/absolute/path/to/org-brain-clone",
        "--bundle", "project=/absolute/path/to/this-repo/brain",
        "--writable"
      ]
    }
  }
}
```

**Remote bundle (read-only from GitHub):**
```json
{
  "mcpServers": {
    "okf": {
      "command": "npx",
      "args": [
        "-y", "@copperbox/okf-mcp",
        "--bundle", "project=/path/to/local/brain",
        "--remote-bundle", "okf=https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf",
        "--writable"
      ]
    }
  }
}
```

**Colocated bundles (one vault = many bundles):**
```json
{
  "mcpServers": {
    "okf": {
      "command": "npx",
      "args": [
        "-y", "@copperbox/okf-mcp",
        "--colocated-bundles", "/path/to/knowledge",
        "--writable"
      ]
    }
  }
}
```

**Local checkout (after `npm install && npm run build`):**
```json
{
  "mcpServers": {
    "okf": {
      "command": "node",
      "args": [
        "/absolute/path/to/okf-mcp/dist/cli.js",
        "--bundle", "brain=/absolute/path/to/your/bundle",
        "--writable"
      ]
    }
  }
}
```

### MCP Tools — Complete Catalog

#### Read Tools (always available)

| Tool | Parameters | What it does |
|---|---|---|
| `list_bundles` | none | Lists all configured bundles with concept counts, read-only flags, `description`, and `loaded` marker for lazily mounted colocated bundles |
| `get_bundle_guide` | `root?` (path or URL) | Returns each colocated root's `AGENTS.md` guide plus every bundle's one-line `description`. Registered dynamically when a colocated root is mounted |
| `reload_bundles` | `bundle?` (string/array) | Re-reads bundles from disk/remote/archive; reports added/removed/changed concepts. No-arg covers loaded bundles; naming an unloaded bundle loads it |
| `load_remote_bundle` | `{ id, url, include?, exclude?, canonicalUrl? }` | Indexes a read-only bundle from a public GitHub tree URL or `.tar.gz`/`.tgz`/`.zip` archive, in memory only |
| `load_colocated_remote_bundles` | `{ url, only?, include?, exclude?, canonicalUrl? }` | Mounts a published colocated root by URL, returning root `AGENTS.md` guide inline |
| `list_remote_bundles` | none | Lists remote bundles currently loaded with source URLs and descriptions |
| `list_concepts` | `bundle?`, `prefix?`, `type?` | Concept metadata (including `resource` URI when set), filterable by prefix/type |
| `get_concept` | `bundle?`, `id`, `section?` | One full document: frontmatter, body, outgoing links, and `sections` heading list; `section` fetches a single body section |
| `get_citations` | `bundle?`, `id` | Numbered `# Citations` entries classified as `external`/`concept`/`missing`; duplicate sections merged |
| `read_document` | `bundle?`, `path` | Raw markdown of any bundle document by path (incl. reserved `index.md`/`log.md`); missing `index.md` synthesized from frontmatter |
| `search_concepts` | `bundle?`, `query?`, `type?`, `tag?`, `path?`, `link?`, `orphan?`, `resource?`, `limit?`, `cursor?` | Text query + type/tag/path/link/orphan filters, paginated; `resource` filter maps asset URI to its concept |
| `list_types` | `bundle?` | Distinct concept `type` values with usage counts |
| `list_tags` | `bundle?` | Distinct tag values with usage counts |
| `suggest_concept_path` | `bundle?`, `type`, `tag?` | Where a new concept should live, ranked by where same-type concepts already are |
| `graph_summary` | `bundle?` | Compact overview: counts, types, tags, orphans, `crossBundleEdges` |
| `get_neighbors` | `bundle?`, `id`, `direction` ("in"/"out"/"both"), `depth?`, `crossBundle?` | Bounded graph expansion around a concept |
| `find_path` | `bundle?`, `from`, `to`, `crossBundle?` | Shortest directed link path between two concepts; with `crossBundle: true` accepts `bundle:concept` IDs |
| `export_graph` | `bundle?`, `format` ("json"/"dot"/"mermaid"), `crossBundle?` | Exports graph in named format |
| `concept_history` | `bundle?`, `id` | Git commit history for a concept file, newest first, following renames (requires git repo) |
| `concept_diff` | `bundle?`, `id`, `ref?` | Unified git diff of a concept file against a ref (default: most recent change). Requires git repo |
| `validate_bundle` | `bundle?` | OKF v0.1 conformance errors + soft warnings; fixable warnings name their `okf-mcp repair` fixer id |

#### Write Tools (only with `--writable`)

| Tool | Parameters | What it does |
|---|---|---|
| `write_concept` | `bundle`, `id`, `frontmatter`, `body` | Creates/updates a concept, auto-stamps `timestamp`, appends `log.md`, regenerates `index.md` |
| `update_concept` | `bundle`, `id`, `patch?`, `section?`, `content?`, `keepTimestamp?` | Partial update: shallow frontmatter patch (`null` deletes key) and/or replace one body section by heading (bytes survive untouched elsewhere) |
| `delete_concept` | `bundle`, `id`, `refuseIfLinked?` | Deletes a concept (optionally refusing while inbound links exist), logs it, regenerates indexes |
| `rename_concept` | `bundle`, `id`, `to` | Moves concept to new path, rewrites inbound links across bundle, logs, regenerates indexes |
| `promote_concept` | `bundle`, `id`, `toBundle`, `toPath?`, `stub?` | Moves concept into another writable bundle, leaving a citation stub behind; logs/reindexes both bundles |
| `append_log_entry` | `bundle`, `summary`, `directory?` | Records a change-narrative entry in the bundle-root or per-directory `log.md` |
| `regenerate_indexes` | `bundle?` | Rewrites `index.md` navigation from frontmatter; reports hand-curated indexes (`generated: false`) it skipped |

Key behaviors:
- `search_concepts` and `get_concept` declare `anthropic/alwaysLoad` in `_meta` — they load eagerly even under deferred tool loading.
- Aggregate tools (`search_concepts`, `list_concepts`, `list_types`, `list_tags`, `graph_summary`) cover **all** bundles when `bundle` is omitted.
- Per-concept and write tools require explicit `bundle` when >1 bundle is mounted.
- Writes are constrained to safe relative `.md` paths inside the bundle; reserved filenames and dot-directories rejected.

### CLI Commands

```
okf-mcp --bundle [id=]<path> [...] [command]

  mcp                 Start the stdio MCP server (default)
  inspect             Print a summary of each bundle's graph
  validate            Report conformance errors and warnings (exit 1 on errors)
  search <query>      Search concepts
  concept <id>        Print one concept document as JSON
  graph [format] [bundle]    Export link graph (json | dot | mermaid | html)
  index               Regenerate index.md files (requires --writable)
  pack [bundle]       Publish a bundle as a distributable archive
  repair [bundle]     Detect and auto-fix known bundle defect classes
```

CLI flags: `--bundle`, `--colocated-bundles`, `--only`, `--remote-bundle`, `--colocated-remote-bundles`, `--canonical-url`, `--writable`, `--watch`

### End-to-End Flow: Agent Reads a Concept

1. **Agent connects**: MCP client spawns `npx -y @copperbox/okf-mcp --bundle brain=/path --writable`
2. **Server starts**: Parses all `.md` files in the bundle directory, builds in-memory link graph, exposes MCP resources at `okf://brain/<path>` and tools
3. **Agent's first action** (recommended): Calls `graph_summary` to get counts, types, tags, orphans
4. **Agent searches**: Calls `search_concepts` with `{ query: "order processing", type: "Playbook" }`
   - Returns: list of concept previews with `id`, `title`, `frontmatter`, match locations, body snippet, enclosing section heading
5. **Agent reads**: Calls `get_concept` with `{ bundle: "brain", id: "tables/orders" }`
   - Returns: `{ frontmatter: { type: "Table", title: "Orders", ... }, body: "# Orders\n\n...", links: [{ target: "./customers.md", ...}], sections: ["# Orders", "## Schema", "## Constraints"] }`
6. **Agent explores**: Calls `get_neighbors` with `{ id: "tables/orders", direction: "both", depth: 2 }`
   - Returns inbound + outbound neighbor concepts up to depth 2
7. **Agent traces further**: Calls `find_path` with `{ from: "tables/orders", to: "playbooks/checkout" }`
   - Returns directed path linking through intermediate concepts
8. **Agent validates**: Calls `validate_bundle` to check bundle conformance
   - Returns errors + warnings with fixer IDs for mechanical fixes

### End-to-End Flow: Agent Writes a Concept

1. **Agent decides to record**: Learned something durable
2. **Agent suggests placement**: Calls `suggest_concept_path` with `{ bundle: "brain", type: "Decision" }`
   - Returns ranked suggestions like `"decisions/"` where other Decision-type concepts live
3. **Agent writes**: Calls `write_concept` with `{ bundle: "brain", id: "decisions/use-postgres", frontmatter: { type: "Decision", title: "Use PostgreSQL", tags: ["database", "infrastructure"] }, body: "## Rationale\n\n..." }`
4. **Server handles**:
   - Writes `decisions/use-postgres.md` with frontmatter + body + auto-stamped `timestamp`
   - Appends a log entry to the nearest existing `log.md` (directory-scoped or bundle-root)
   - Regenerates `decisions/index.md` navigation
   - Updates in-memory graph index
5. **Agent also writes stand-alone log**: Calls `append_log_entry` with `{ bundle: "brain", summary: "Added PostgreSQL decision; discarding MongoDB option" }`
6. **Git sync is manual**: Agent (or user) must `git pull` before relying on shared brain, and `git commit && git push` after writing to shared brain. After pulling, call `reload_bundles`.

### Configuration Options

| Flag | Type | Description |
|---|---|---|
| `--bundle [id=]<path>` | Repeatable | Mount a local bundle. `path` autogenerates id from folder name; `id=path` sets explicit id |
| `--colocated-bundles <root>` | Repeatable | Mount every immediate subdirectory of root as its own bundle |
| `--only <folder,folder,...>` | With colocated | Restrict colocated mount to named subfolders |
| `--remote-bundle id=<url>` | Repeatable | Mount a read-only remote bundle (GitHub tree or archive) |
| `--colocated-remote-bundles <url>` | Repeatable | Mount a published colocated root from a remote URL |
| `--canonical-url [id=]<url>` | Repeatable | Declare canonical URL for cross-bundle awareness |
| `--writable` | Boolean | Enable all write tools (server-wide) |
| `--watch` | Boolean | Auto-reload local bundles on `.md` file changes |
| `GITHUB_TOKEN` | Env var | Used for GitHub API rate limits (never sent to non-GitHub hosts) |

### Integration with Agent Harnesses

All harnesses use the same MCP stdio config block. Config file locations:

| Harness | Config File |
|---|---|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | Use `claude mcp add --transport stdio okf -- npx -y @copperbox/okf-mcp --bundle ...` |
| Cursor | `~/.cursor/mcp.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Codex | `~/.codex/config.toml` (`[mcp_servers.okf]` section) |
| OpenCode | Standard `mcpServers` JSON config |

**Recommended CLAUDE.md/AGENTS.md snippet** (provides ambient "brain grows while you work" behavior):
```markdown
## Knowledge capture (OKF brain)

This project keeps a persistent knowledge base (the "brain") behind the `okf` MCP server.

- Before starting non-trivial work, check the brain: orient with `graph_summary`, then
  `search_concepts` for anything related to the task, and treat what you find as prior context.
- When you learn something durable — a decision and its rationale, a gotcha, how a
  system actually works, a convention worth keeping — record it before finishing:
  call `suggest_concept_path` to pick a placement, then `write_concept`.
- Keep concepts small and linked: one idea per concept, document-relative markdown links.
- Don't record ephemera — the brain is for knowledge that should still be true next month.
- If the brain is shared, the server never syncs git for you. Before relying on it,
  run `git pull` in the bundle repo, then call `reload_bundles`.
- After writing durable knowledge to a shared brain, commit and push it.
```

### Source Layout

```
src/
├── authoring.ts    # Write path (write_concept, update_concept, delete, rename, promote, append_log)
├── bundle.ts       # Bundle loading and scanning
├── canonical.ts    # Canonical URL matching for cross-bundle edge derivation
├── cli.ts          # CLI entry point
├── frontmatter.ts  # YAML frontmatter parsing
├── git.ts          # Git history/diff helpers
├── graph.ts        # Graph traversal and edge derivation
├── index.ts        # Public exports
├── pack.ts         # Archive export (pack command)
├── parser.ts       # Markdown parsing, link extraction, body sections
├── promote.ts      # Cross-bundle concept promotion
├── remote.ts       # Remote bundle fetching (GitHub API, tar.gz/zip archives)
├── repair.ts       # Auto-fixer registry (citation-format, duplicate-headings, okf-uri-to-canonical, absolute-links-to-relative)
├── search.ts       # Structured search engine
├── server.ts       # MCP wire protocol (tools + resources + instructions)
├── store.ts        # In-memory index
├── suggest.ts      # Concept placement suggestions
├── types.ts        # Type definitions
├── validate.ts     # OKF v0.1 conformance validation
├── visualize.ts    # Self-contained HTML graph export with force simulation
└── watch.ts        # File watcher (--watch)
```

---

## 2. caedora-mcp

### Repository

| Field | Value |
|---|---|
| **GitHub** | https://github.com/WilliamFClarke/caedora |
| **npm** | https://www.npmjs.com/package/caedora-mcp |
| **Stars** | 1 |
| **Commits** | 109 |
| **License** | MPL-2.0 |
| **Language** | TypeScript |
| **Version** | 0.2.0 (1 month ago) |
| **Weekly Downloads** | ~5 |
| **Author** | [williamfclarke](https://www.npmjs.com/~williamfclarke) |
| **Homepage** | https://caedora.app |
| **Dependencies** | 5 |

### What it does

`caedora-mcp` is the **MCP server companion to Caedora.app**, a privacy-first desktop editor + agent workspace for OKF bundles. Caedora stores bundle content in the user's local folder or their own GitHub repository — never on Caedora servers. The MCP server exposes **read, search, validation, and write** tools to MCP-aware agents over stdio. It supports both local filesystem bundles (`--bundle`) and GitHub-hosted bundles (`--github`). Unique features include **source ingestion** (`ingest_source`), regex search (`grep_concepts`), query recording (`record_query`), and **concept graph** visualization. Write tools preserve producer-defined YAML fields, maintain timestamps, regenerate hierarchical indexes, and record operations in `log.md`.

### Installation

```bash
npm install caedora-mcp
# Or via npx (no install for MCP config):
npx -y caedora-mcp --bundle /path/to/knowledge-bundle
```

### MCP Configuration JSON

```json
{
  "mcpServers": {
    "caedora": {
      "command": "npx",
      "args": ["-y", "caedora-mcp", "--bundle", "/absolute/path/to/your-vault"]
    }
  }
}
```

For GitHub-hosted bundles (needs `GITHUB_TOKEN`):
```json
{
  "mcpServers": {
    "caedora": {
      "command": "npx",
      "args": ["-y", "caedora-mcp", "--github", "owner/repository"]
    },
    "env": {
      "GITHUB_TOKEN": "github_pat_xxx"
    }
  }
}
```

Read-only mode:
```json
{
  "mcpServers": {
    "caedora": {
      "command": "npx",
      "args": ["-y", "caedora-mcp", "--bundle", "/path/to/vault", "--read-only"]
    }
  }
}
```

### MCP Tools — Complete Catalog

#### Read Tools

| Tool | Parameters | What it does |
|---|---|---|
| `list_concepts` | `folder?`, `type?` | Lists concept metadata, filterable by folder prefix and type |
| `read_concept` | `path` | Reads full concept document: frontmatter + body + links + backlinks |
| `search_concepts` | `query`, `tag?`, `type?`, `limit?` | Text search across concepts with tag/type filtering |
| `grep_concepts` | `regex`, `flags?`, `limit?` | Regex search across concept bodies |
| `list_tags` | none | Distinct tag values with usage counts |
| `list_types` | none | Distinct concept type values |
| `concepts_by_tag` | `tag` | Lists all concepts with a specific tag |
| `concept_graph` | `path?` | Returns the link graph for a concept or whole bundle |
| `lint_bundle` | `recordLint?` | Validates bundle against OKF conventions |

#### Write Tools

| Tool | Parameters | What it does |
|---|---|---|
| `create_concept` | `...` | Creates a new concept document with frontmatter + body |
| `update_concept` | `...` | Updates an existing concept's content or metadata |
| `rename_concept` | `from`, `to` | Moves/renames a concept, updating inbound links |
| `delete_concept` | `path` | Deletes a concept document |
| `ingest_source` | `...` | Ingests external source content into OKF concepts |
| `rebuild_indexes` | none | Regenerates hierarchical index.md files |
| `record_query` | `summary`, `conceptPaths?` | Records an agent query in the bundle log |

### End-to-End Flow: Agent Reads a Concept

1. Agent connects via MCP stdio
2. Agent calls `list_concepts()` to browse the bundle overview
3. Agent calls `search_concepts("database schema", tag="backend")` to find relevant concepts
4. Agent calls `read_concept("tables/orders")` — returns full frontmatter, body, links, and backlinks
5. Agent optionally calls `concept_graph("tables/orders")` to visualize link relationships
6. Agent optionally calls `grep_concepts("PRIMARY KEY")` for code/pattern-level search

### End-to-End Flow: Agent Writes a Concept

1. Agent calls `create_concept(...)` with path, frontmatter, and body
2. Server writes `.md` file, stamps timestamp, regenerates indexes, appends `log.md`
3. Agent optionally calls `record_query("architecture decision", ["decisions/database-choice"])` for history
4. Agent optionally calls `rebuild_indexes()` to refresh navigation pages

### Configuration Options

| Flag | Type | Description |
|---|---|---|
| `--bundle <path>` | String | Path to local OKF bundle directory |
| `--vault <path>` | String | Legacy alias for `--bundle` |
| `--github <owner/repository>` | String | GitHub repository as bundle source |
| `--read-only` | Boolean | Disables all write tools |
| `GITHUB_TOKEN` | Env var | GitHub personal access token for API access |

### Integration with Agent Harnesses

| Harness | Config File |
|---|---|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Claude Code | Already has file tools; optional caedora server for indexed search, graph traversal, conformant writes |
| Codex | Standard MCP config block in `~/.codex/config.toml` |

### Source Layout

```
packages/caedora-mcp/src/
├── cli.ts            # CLI entry point
├── server.ts         # MCP server wiring
├── lib/
│   ├── conventions.ts  # OKF conventions
│   ├── frontmatter.ts  # YAML frontmatter parsing
│   └── okf.ts          # OKF core logic
├── providers/
│   ├── github.ts       # GitHub bundle provider
│   ├── local-node.ts   # Local filesystem bundle provider
│   └── types.ts        # Provider type definitions
└── tools/
    ├── operations.ts   # Tool orchestration
    ├── read.ts         # Read tool implementations
    ├── search.ts       # Search tool implementations
    ├── write.ts        # Write tool implementations
    └── write.test.ts   # Write tool tests
```

---

## 3. okfy-ai

### Repository

| Field | Value |
|---|---|
| **GitHub** | https://github.com/0dust/OKFy |
| **npm** | https://www.npmjs.com/package/okfy-ai |
| **Stars** | 59 |
| **Forks** | 7 |
| **Commits** | 34 |
| **License** | MIT |
| **Language** | TypeScript |
| **Version** | 0.3.3 (13 days ago) |
| **Weekly Downloads** | ~572 |
| **Author** | [0dust](https://www.npmjs.com/~0dust) |
| **Dependencies** | 11 |
| **Package Manager** | pnpm |

### What it does

**OKFy turns documentation websites and local Markdown folders into OKF v0.1-conformant bundles**, then serves them to agent harnesses through a read-only MCP server. It is purpose-built for the use-case: "give coding agents searchable, source-linked documentation — locally." Key capabilities:

- **Crawl** documentation websites into OKF bundles (respects `robots.txt`, same-origin by default)
- **Import** local Markdown folders into OKF bundles
- **Register sources** with crawl policy + max age for auto-refresh
- **Serve** bundles through a read-only MCP server with 6 tools
- **Multi-source workspaces**: serve Stripe + Clerk + local docs in one MCP server
- **Activation packets**: generate HTML inspector + config + proof transcripts
- **Doctor diagnostics**: check source state, bundle validity, MCP visibility
- **Freshness management**: `stale-while-refresh`, `blocking`, or `off` modes

Operates entirely locally — no OKFY account, cloud registry, or hosted ranking service.

### Installation

```bash
# No install needed (npx for MCP):
npx -y okfy-ai serve stripe --mcp --auto-refresh

# Optional global install for shorter commands:
npm install -g okfy-ai

# Package name is okfy-ai; CLI command is okfy
okfy demo
```

### MCP Configuration JSON

**Single registered source (Stripe docs):**
```json
{
  "mcpServers": {
    "stripe-okf": {
      "command": "npx",
      "args": ["-y", "okfy-ai", "serve", "stripe", "--mcp", "--auto-refresh"]
    }
  }
}
```

**Multi-source workspace (Stripe + Clerk):**
```json
{
  "mcpServers": {
    "stripe-clerk-okf": {
      "command": "npx",
      "args": ["-y", "okfy-ai", "serve", "stripe", "clerk", "--mcp", "--auto-refresh"],
      "startup_timeout_sec": 20,
      "tool_timeout_sec": 60,
      "enabled": true
    }
  }
}
```

**Local bundle path (no auto-refresh):**
```json
{
  "mcpServers": {
    "local-okf": {
      "command": "npx",
      "args": ["-y", "okfy-ai", "serve", "./okf/api-docs", "./okf/product-docs", "--mcp"]
    }
  }
}
```

**After global install:**
```json
{
  "mcpServers": {
    "stripe-okf": {
      "command": "okfy",
      "args": ["serve", "stripe", "--mcp", "--auto-refresh"]
    }
  }
}
```

### MCP Tools — Complete Catalog

All tools are **read-only**. Auto-refresh is server-side source maintenance, not an agent-callable write tool.

| Tool | Parameters | What it does |
|---|---|---|
| `bundle_summary` | `source?` | Show bundle or workspace stats, validation status, and source freshness when available |
| `search_concepts` | `query`, `source?`, `type?`, `tags?`, `limit?` | Search concept previews by query, optional source filter, type, or tags |
| `read_concept` | `source?`, `id` | Read one concept body, frontmatter, links, backlinks, and source |
| `get_neighbors` | `source?`, `id` | Traverse outbound links and backlinks around a concept |
| `list_types` | `source?` | List concept types and counts, optionally filtered by workspace source |
| `list_tags` | `source?` | List tags and counts, optionally filtered by workspace source |

### CLI Commands

```
okfy init <name> <url>
  Register a source and print client-ready setup preview (does NOT write config files)

okfy doctor <name> [more-names...]
  Check source state, bundle validity, freshness, npx availability, config shape, MCP tool visibility, stdout

okfy add <name> <url>
  Register a documentation source with crawl policy

okfy sources
  List registered sources

okfy check <name-or-bundle>
  Check freshness of a registered source

okfy update <name>
  Manually refresh a registered source's bundle

okfy remove <name> --yes
  Remove a registered source

okfy crawl <url> --out <dir>
  One-shot docs website crawl into an OKF bundle

okfy import <path> --out <dir>
  Import local Markdown folder into OKF bundle

okfy validate <bundle>
  Validate OKF bundle conformance

okfy inspect <bundle>
  Print bundle metadata

okfy activate <name-or-bundle> [more...] --client codex --out okfy-activation
  Create activation packet: inspector.html + setup.md + proof.json

okfy map <name-or-bundle> [more...] --out okfy-inspector.html
  Generate static HTML Inspector

okfy serve <name-or-bundle> [more...] --mcp
  Start MCP server for bundles/sources

okfy demo
  Run interactive demo with bundled example
```

### End-to-End Flow: Docs → OKF → Agent Query

1. **Register a source**:
   ```bash
   npx -y okfy-ai init stripe https://docs.stripe.com/checkout --client codex --max-pages 100 --max-depth 4
   ```
   - Crawls the URL, creates local OKF bundle in `~/.okfy/stripe/`
   - Prints MCP config + first prompt

2. **Add the config** to agent's MCP servers:
   ```toml
   [mcp_servers.stripe_okf]
   command = "npx"
   args = ["-y", "okfy-ai", "serve", "stripe", "--mcp", "--auto-refresh"]
   ```

3. **Agent connects** → MCP server starts → loads cached bundle from `~/.okfy/stripe/`

4. **Agent receives query**: "Explain the minimum Checkout Sessions backend flow"

5. **Agent calls `bundle_summary`**: Gets bundle size, validity, and freshness

6. **Agent calls `search_concepts`**:
   ```json
   { "query": "checkout sessions backend flow", "limit": 5 }
   ```
   - Returns: deterministic lexical search results with concept previews

7. **Agent calls `read_concept`**:
   ```json
   { "id": "guides/checkout-sessions" }
   ```
   - Returns: full frontmatter + body with original source URL in `resource`

8. **Agent calls `get_neighbors`**:
   ```json
   { "id": "guides/checkout-sessions" }
   ```
   - Returns: linked concepts for deeper context

9. **Agent answers** with source references from `resource` fields

10. **Freshness automatically managed**: `stale-while-refresh` keeps bundles current

### Multi-Source Workspace End-to-End

```bash
# Register multiple sources
npx -y okfy-ai add stripe https://docs.stripe.com/checkout --max-pages 100 --max-depth 4
npx -y okfy-ai add clerk https://clerk.com/docs --max-pages 100 --max-depth 4

# Verify setup
npx -y okfy-ai doctor stripe clerk --client codex

# Serve all through one MCP server
npx -y okfy-ai serve stripe clerk --mcp --auto-refresh
```

Agent can then filter searches by source:
```json
{ "query": "checkout sessions", "source": "stripe", "limit": 5 }
```

Duplicate concept IDs are disambiguated with `source`:
```json
{ "source": "stripe", "id": "guides/quickstart" }
```

### Configuration Options

| Flag/Option | Description |
|---|---|
| `--client <codex\|claude-code\|generic\|...>` | Generate setup for specific client |
| `--max-pages <n>` | Crawl page limit |
| `--max-depth <n>` | Crawl depth limit |
| `--mcp` | Start in MCP stdio mode |
| `--auto-refresh` | Enable automatic source freshness refreshing |
| `--refresh-mode <stale-while-refresh\|blocking\|off>` | Refresh strategy |
| `--source-name <name>` | Label for imported local bundles |
| `--force` | Overwrite existing output bundle |
| `OKFY_HOME` | Env var: override default cache directory (`~/.okfy`) |

### Security Defaults

- Crawls respect `robots.txt` and stay same-origin by default
- Page count, depth, response size, and concurrency are capped
- Private network URL literals and redirects to private targets rejected by default
- Preflight DNS-resolved private targets rejected before fetch
- `--force` refuses unsafe output directories (`.`, `/`, home dir, repo root, input path, symlinks)
- HTML and Markdown treated as text; scripts are NOT executed
- MCP tools are read-only; refresh is server-side, not agent-callable

### Integration with Agent Harnesses

**Claude Code:**
```bash
npx -y okfy-ai init stripe https://docs.stripe.com/checkout --client claude-code
claude mcp add --transport stdio stripe-okf -- npx -y okfy-ai serve stripe --mcp --auto-refresh
```

**Codex** (`~/.codex/config.toml`):
```toml
[mcp_servers.stripe_okf]
command = "npx"
args = ["-y", "okfy-ai", "serve", "stripe", "--mcp", "--auto-refresh"]
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
```

**Claude Desktop, Cursor, Gemini CLI, OpenCode** — standard MCP JSON config block.

**OKFy Agent Skill**: Ships with the package at `skills/okfy/SKILL.md` — gives skill-aware agents the OKFy setup workflow, MCP tool order, workspace source filters, and safety rules.

### Programmatic Usage

```typescript
// MCP server creation
import { createMcpServer, type ServeOptions } from "okfy-ai/mcp";

// Setup helpers (artifact generation)
import { serveCommand, renderClientArtifacts, expectedMcpTools } from "okfy-ai/setup";
```

### Source Layout

```
src/
├── cli.ts                   # CLI command dispatcher
├── cli-content-actions.ts   # crawl, import, validate actions
├── cli-presenters.ts        # Output formatting
├── cli-source-actions.ts    # add, remove, check, update sources
├── cli-targets.ts           # UI targets
├── cli-workspace-actions.ts # Multi-source workspace actions
├── crawl/                   # Crawler engine
├── crawler.ts               # Web crawler
├── activation.ts            # Activation packet generation
├── duration.ts              # Duration helpers
├── frontmatter.ts           # YAML frontmatter handling
├── graph.ts                 # Link graph
├── hash.ts                  # Content hashing
├── importer.ts              # Local Markdown → OKF importer
├── index.ts                 # Public exports
├── inspector-html.ts        # HTML Inspector generation
├── inspector.ts             # Bundle inspector
├── mcp.ts                   # MCP server creation
├── mcp-contract.ts          # MCP tool definitions
├── mcp-results.ts           # MCP response formatting
├── mcp-source-runtime.ts    # Source-level MCP runtime
├── metadata.ts              # OKF metadata
├── normalize.ts             # Path/ID normalization
├── okf.ts                   # OKF core logic
├── okfy-home.ts             # ~/.okfy directory management
├── public/                  # Public API surface
├── reader.ts                # Bundle reader
├── refresh.ts               # Source refresh logic
├── search.ts                # Deterministic lexical search
├── setup.ts                 # Client setup generation
├── setup-artifacts.ts       # Setup artifact generation
├── setup-diagnostics.ts     # Doctor diagnostics
├── source-lifecycle.ts      # Source lifecycle management
├── source-store.ts          # Source registry (SQLite-backed)
├── source-store-schema.ts   # Source store DB schema
├── types.ts                 # Type definitions
├── util/                    # Utility modules
├── validate.ts              # OKF validation
├── vendor.d.ts              # Vendor type declarations
├── workspace.ts             # Multi-source workspace logic
└── writer.ts                # Bundle writer
```

### Features Not Implemented (Limits)

- One source page/file = one concept; no heading-based splitting
- HTML cleanup quality varies by documentation site
- Local imports are explicit snapshots (no auto-refresh for local paths)
- MCP is stdio-first (no Streamable HTTP yet)
- Search is deterministic lexical, not embeddings-based
- GitHub repo URLs have no dedicated importer (use local checkout)

---

## 4. @quatrain/okf

### Repository

| Field | Value |
|---|---|
| **GitHub** | https://github.com/Quatrain/Core |
| **npm** | https://www.npmjs.com/package/@quatrain/okf |
| **Stars** | 1 |
| **Forks** | 1 |
| **Commits** | 785 (parent monorepo) |
| **License** | AGPL-3.0 |
| **Language** | TypeScript |
| **Version** | 1.0.5 (1 day ago) |
| **Weekly Downloads** | ~555 |
| **Authors** | [crapougnax](https://www.npmjs.com/~crapougnax), [elliottlepine](https://www.npmjs.com/~elliottlepine) |
| **Dependencies** | 5 |
| **Package Manager** | Yarn |

### What it does

`@quatrain/okf` is **NOT an MCP server**. It is a **flat-file persistence adapter** for the Quatrain Core backend framework. It implements the `OKFBackendAdapter` class that serializes Quatrain `PersistedBaseObject` entities into structured JSON files on disk, conforming to an "OKF" directory layout. It is designed to facilitate **local-first, offline-first architectures** by excluding relational databases.

Despite its name referencing "Open Knowledge Format," this package is **not directly related to the Google OKF v0.1 specification** for Markdown-based knowledge bundles. It uses OKF as a naming convention for its flat-file structure (directory trees of JSON files), not Markdown concept documents. Key features:

- **Decoupled Architecture**: Pure filesystem storage independent of Git versioning or sync layers
- **Operator Auditing**: Stores operator email in each document's `meta.created_by`
- **Hierarchical Layouts**:
  - Telemetry: `telemetry/YYYY-MM-DD/{type}/{HHMMSS}-{millis}-{bassinId}.json`
  - Business objects: `{collection}/{uid}.json`

### What "OKF flat file storage adapter" means

In Quatrain's context, "OKF flat file storage adapter" means a **JSON file-based backend** that replaces traditional databases (PostgreSQL, Firestore, SQLite) with a filesystem directory of `.json` files. Each Quatrain business object (extending `PersistedBaseObject`) gets serialized as a single `.json` file in a hierarchical directory. This is the "flat file" aspect. "OKF" here refers to Quatrain's internal naming for the directory layout convention, not the Google OKF Markdown spec.

This adapter enables:
- Fully offline/local development without any database server
- Git-versioned application data (`.json` files are diffable)
- The same Quatrain business logic to run against files, PostgreSQL, Firestore, or SQLite via adapter swapping
- Telemetry data stored in date-partitioned directory trees

### Installation

```bash
npm install @quatrain/okf
```

### API / Usage

```typescript
import { Backend } from '@quatrain/backend';
import { OKFBackendAdapter } from '@quatrain/okf';

// 1. Register the adapter
const okfAdapter = new OKFBackendAdapter({
  config: {
    database: '/path/to/my/data/okf' // Root folder for JSON files
  }
});

// Set as default database backend
Backend.addBackend(okfAdapter, 'default', true);
```

```typescript
import { PersistedBaseObject } from '@quatrain/backend';
import { StringProperty } from '@quatrain/core';

// 2. Define a model
class Bassin extends PersistedBaseObject {
  static COLLECTION = 'bassins';
  static PROPS_DEFINITION = [
    { name: 'name', type: StringProperty.TYPE }
  ];
}

// 3. Create and save
const basin = await Bassin.factory();
basin.set('name', 'Bassin N°4');
basin.set('createdBy', 'pascal@sodav.ci'); // Stored in meta block

await basin.save();
// Writes: /path/to/my/data/okf/bassins/{uid}.json
```

```typescript
// 4. Query
const query = Bassin.query().filter('name', 'eq', 'Bassin N°4');
const results = await Bassin.repository().query(query);

results.items.forEach((item) => {
  console.log(item.val('name'));
});
```

### On-Disk Layout

```
/path/to/my/data/okf/
├── bassins/
│   ├── abc-123.json
│   └── def-456.json
└── telemetry/
    └── 2025-01-15/
        └── temperature/
            └── 143045-789-bassinX.json
```

Each `.json` file contains:
```json
{
  "uid": "abc-123",
  "name": "Bassin N°4",
  "meta": {
    "created_by": "pascal@sodav.ci"
  }
}
```

### Configuration Options

| Option | Description |
|---|---|
| `config.database` | Root directory path for JSON file storage |
| `Backend.addBackend(adapter, name, isDefault)` | Register adapter as named backend |

### MCP Tools

**None.** This is not an MCP server. It has no Agent tools. It is purely a persistence adapter for backend applications.

### Integration with Agent Harnesses

**None.** This package has no MCP interface and no agent-specific configuration. It is a library used within Quatrain backend applications.

The parent `Quatrain/Core` repo provides `GEMINI.md` and `.agents/` configuration for AI-assisted development of the framework itself, but the `@quatrain/okf` package does not expose any agent-facing tools.

### Source Layout

```
packages/okf/
├── HOWTO.md                   # Usage guide
├── README.md                  # Overview
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts               # Public exports
    ├── OKFBackendAdapter.ts   # Main adapter implementation
    └── OKFBackendAdapter.test.ts
```

### Key Architectural Note

This package is part of the broader **Quatrain Core modular framework** which includes:
- `@quatrain/core` — In-memory model/validation engine
- `@quatrain/backend` — Backend adapter interface
- `@quatrain/backend-postgres`, `@quatrain/backend-sqlite`, `@quatrain/backend-firestore` — DB adapters
- `@quatrain/okf` — Flat-file JSON adapter
- `@quatrain/auth-*`, `@quatrain/storage-*`, `@quatrain/queue-*` — Other service adapters

The "OKF" in this package's name is a Quatrain-internal term for their flat-file directory convention. It is **not** the same as the Google OKF (Open Knowledge Format) spec for interlinked Markdown concepts.

---

## 5. okf-toolset

### Repository

| Field | Value |
|---|---|
| **GitHub** | https://github.com/skye0402/okf-toolset |
| **npm** | https://www.npmjs.com/package/okf-toolset |
| **Stars** | 0 |
| **Forks** | 0 |
| **Commits** | 3 |
| **License** | MIT |
| **Language** | TypeScript |
| **Version** | 0.3.0 (14 days ago) |
| **Weekly Downloads** | ~27 |
| **Author** | [skye0402](https://www.npmjs.com/~skye0402) |
| **Dependencies** | 2 |
| **Package Manager** | pnpm |
| **Node Requirement** | Node.js 20+, ESM-only |

### What it does

`okf-toolset` is a **TypeScript library** (not a standalone CLI/server) that provides a comprehensive toolkit for working with OKF v0.1 bundles. It is **filesystem-first** — Markdown files with YAML frontmatter are the source of truth. The toolkit bakes in:

- **Core OKF**: parse, render, validate, normalize concept IDs, resolve links, extract citations
- **Filesystem store** (`FileOkfStore`): scan/list/get/write/delete concepts, append logs, manage drafts
- **Refiner** (`OkfRefiner`): create/move/delete/update concepts, rewrite links, regenerate indexes
- **Embeddings** (`rebuildEmbeddingCache`, `openEmbeddingIndex`): injectable provider interface + rebuildable JSONL cache, `incremental` rebuild support, in-process cosine search for up to ~10k concepts
- **Search** (`OkfSearchEngine`): keyword, embedding, and deterministic hybrid search
- **MCP** (`registerOkfTools`): registers OKF tools on a **host-owned** MCP server (the host chooses transport, auth, deployment)
- **Git** (`OkfGitHelper`): optional history/diff/blame helpers (never commits/pushes unless called explicitly)

It is designed as a library that other applications (MCP servers, CLIs, desktop apps) build upon. It self-describes as a migration from a Python prototype (`memory.py` → core/fs/drafts, `okf_tools.py` → `DefaultOkfToolbox`, `okf_mcp_server.py` → `registerOkfTools`, `refiner/*` → `/refiner` operations).

### Installation

```bash
npm install okf-toolset
```

### API / Usage

#### Basic Search
```typescript
import { FileOkfStore } from 'okf-toolset/fs';
import { OkfSearchEngine } from 'okf-toolset/search';
import { DefaultOkfToolbox } from 'okf-toolset';

const store = new FileOkfStore('./knowledge');
const engine = new OkfSearchEngine(store);
const toolbox = new DefaultOkfToolbox(engine);

console.log(await toolbox.search('sales order'));
```

#### Embeddings + Hybrid Search
```typescript
import { FileOkfStore } from 'okf-toolset/fs';
import { rebuildEmbeddingCache, openEmbeddingIndex } from 'okf-toolset/embeddings';
import { OkfSearchEngine } from 'okf-toolset/search';

const provider = {
  modelId: 'my-embedding-model',
  dimensions: 1536,
  async embedTexts(texts: string[]) {
    // Call OpenAI, SAP GenAI Hub, Vertex, local model, etc.
    return texts.map(() => new Array(1536).fill(0));
  },
};

const store = new FileOkfStore('./knowledge');
await rebuildEmbeddingCache(await store.scanBundle(), provider, {
  cachePath: '.okf-cache/embeddings.jsonl',
  incremental: true,
});

const vectorIndex = await openEmbeddingIndex('.okf-cache/embeddings.jsonl');
const engine = new OkfSearchEngine(store, {
  embeddingProvider: provider,
  vectorIndex,
});

console.log(await engine.search('sales order playbook', { mode: 'hybrid' }));
```

#### MCP Server Integration
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DefaultOkfToolbox } from 'okf-toolset';
import { FileOkfStore } from 'okf-toolset/fs';
import { registerOkfTools } from 'okf-toolset/mcp';
import { OkfSearchEngine } from 'okf-toolset/search';

const server = new McpServer({ name: 'okf', version: '0.1.0' });
const store = new FileOkfStore('./knowledge');
const toolbox = new DefaultOkfToolbox(new OkfSearchEngine(store));

registerOkfTools(server, toolbox, { store });
```

#### Imports Summary
```typescript
import { parseConcept, DefaultOkfToolbox } from 'okf-toolset';
import { FileOkfStore } from 'okf-toolset/fs';
import { rebuildEmbeddingCache, openEmbeddingIndex } from 'okf-toolset/embeddings';
import { OkfSearchEngine } from 'okf-toolset/search';
import { registerOkfTools } from 'okf-toolset/mcp';
import { OkfRefiner } from 'okf-toolset/refiner';
import { OkfGitHelper } from 'okf-toolset/git';
```

### MCP Tools

`registerOkfTools(server, toolbox, { store })` registers tool handlers on a host-owned `McpServer` instance. The exact tool names and schemas are defined by the library's `DefaultOkfToolbox` which wraps `OkfSearchEngine` and `FileOkfStore`. The library registers tools for:

- Draft creation/approval (`okf_create_draft`) — LLM creates a draft, drafts are approved into OKF concepts
- Context retrieval (`okf_context`) — retrieves concept knowledge for agent use
- Search (keyword, embedding, hybrid) — via the search engine
- Safe execution wrapper (`executeSafely()`) — rejects path traversal and `drafts/` bypass attempts

The e2e test demonstrates the full pipeline:
1. LLM reads source text → returns `okf_create_draft` tool calls
2. Drafts are approved into OKF concepts
3. `okf_context` retrieves the new knowledge for a second LLM answer
4. Adversarial prompt attempts path traversal / `drafts/` writes → `executeSafely()` rejects

### MCP Configuration

Since `okf-toolset` is a **library**, not a CLI, you need to build your own MCP server that uses it. The library's README provides the pattern:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DefaultOkfToolbox } from 'okf-toolset';
import { FileOkfStore } from 'okf-toolset/fs';
import { registerOkfTools } from 'okf-toolset/mcp';
import { OkfSearchEngine } from 'okf-toolset/search';

const server = new McpServer({ name: 'okf', version: '0.1.0' });
const store = new FileOkfStore('./knowledge');
const toolbox = new DefaultOkfToolbox(new OkfSearchEngine(store));

registerOkfTools(server, toolbox, { store });
```

Then configure your agent harness to spawn your Node.js server (the host still chooses stdio, Streamable HTTP, auth, and deployment).

### End-to-End Flow: Embedding-Powered Search

1. **Setup**: Create a `FileOkfStore` pointing at a bundle directory
2. **Build embeddings cache**: Provide an `EmbeddingProvider` (e.g., OpenAI, SAP GenAI Hub, Vertex), call `rebuildEmbeddingCache()` to generate `.okf-cache/embeddings.jsonl`
3. **Search**: `engine.search("query", { mode: "hybrid" })` combines keyword matching + cosine similarity over embeddings
4. **Result**: Returns ranked concept matches that an agent can then `read_concept` on

### End-to-End Flow: LLM-Powered Draft Creation (e2e test)

1. **LLM reads source text**: Gets raw text
2. **LLM returns `okf_create_draft` tool calls**: Produces structured concept drafts with frontmatter
3. **Drafts approved**: Drafts are promoted into OKF concepts via the refiner
4. **Knowledge retrieval**: `okf_context` retrieves newly created concepts
5. **Adversarial test**: Path traversal and `drafts/` bypass attacks → `executeSafely()` rejects

### Configuration Options

| Option | Description |
|---|---|
| `EmbeddingProvider` | User-provided interface: `{ modelId, dimensions, embedTexts(texts: string[]): Promise<number[][]> }` |
| `cachePath` | Embedding cache file path (default: `.okf-cache/embeddings.jsonl`) |
| `incremental` | Whether to rebuild embeddings incrementally |
| `mode` | Search mode: `"keyword"`, `"embedding"`, or `"hybrid"` |
| `OKF_LLM_PROVIDER` | LLM provider for e2e tests: `sap-genai-hub` or `litellm` |
| `OKF_LLM_BASE_URL` | LLM API base URL |
| `OKF_LLM_TOKEN_URL` | OAuth token URL (SAP GenAI Hub) |
| `OKF_LLM_CLIENT_ID` | OAuth client ID |
| `OKF_LLM_CLIENT_SECRET` | OAuth client secret |
| `OKF_LLM_API_KEY` | Bearer token (alternative to OAuth) |
| `OKF_LLM_MODEL` | Model name, deployment ID, or deployment URL |
| `OKF_LLM_E2E` | Enable e2e test (must be `true`) |

### Write Safety

`FileOkfStore` uses an **in-process mutex** per bundle and **atomic temp-file rename**. This protects one MCP server process from parallel tool-call races. Multi-process write coordination is out of scope for v1.

### Extension Points (OKF v0.1 + Producer Extensions)

The library preserves OKF v0.1 conformance (parseable YAML frontmatter + non-empty `type`) while adding producer-defined extensions:

- `drafts` — Work-in-progress concepts before approval
- `status` — Concept lifecycle status
- `source_run` — Provenance tracking
- `proposed_type` — Type proposals before finalization
- `startup_policy` — Whether concept is loaded eagerly
- Embeddings — Derived JSONL vector cache
- Git helpers — Optional history/diff/blame

### Integration with Agent Harnesses

`okf-toolset` is **not directly usable** as an MCP server from agent configs. It is a **building block** that developers use to build their own MCP servers. The recommended pattern:

1. Write a thin Node.js CLI that creates `McpServer`, `FileOkfStore`, `DefaultOkfToolbox`, and calls `registerOkfTools`
2. Configure agent harness to spawn your CLI via stdio
3. The harness gets tools registered by `registerOkfTools` (draft creation, context retrieval, search, etc.)

The library does NOT ship cloud-provider SDKs (OpenAI, SAP GenAI Hub, etc.) — users provide their own embedding provider with `embedTexts(texts[])`.

### Source Layout

```
src/
├── index.ts           # Main exports: parseConcept, DefaultOkfToolbox
├── toolbox.ts         # DefaultOkfToolbox implementation
├── core/              # parse, render, validate, normalize IDs, resolve links, extract citations
├── embeddings/        # rebuildEmbeddingCache, openEmbeddingIndex, vector search
├── fs/                # FileOkfStore: scan/list/get/write/delete concepts, logs, drafts
├── git/               # OkfGitHelper: optional history/diff/blame (never auto-commits)
├── mcp/               # registerOkfTools: register OKF tools on host-owned MCP server
├── refiner/           # OkfRefiner: create/move/delete/update concepts, rewrite links, regenerate indexes
├── search/            # OkfSearchEngine: keyword, embedding, hybrid search
└── utils/             # Shared utilities
```

### Design Principle Summary

| Module | Maps from Python prototype |
|---|---|
| `core` + `fs` + `drafts` | `memory.py` |
| `DefaultOkfToolbox` + `search` + `context rendering` | `okf_tools.py` |
| `registerOkfTools` in `mcp/` | `okf_mcp_server.py` |
| `refiner/` | `refiner/*` |

### Features NOT in v1

- No file watcher (intentionally; future `chokidar` extension possible)
- No multi-process write coordination (single writer or lockfile adapter needed)
- No vector DB adapters yet (SQLite/pgvector/Qdrant listed as future possibilities)
- Embeddings cache is limited to hundreds to ~10k concepts (larger needs vector DB adapter)

---

## Comparative Summary

| Feature | @copperbox/okf-mcp | caedora-mcp | okfy-ai | @quatrain/okf | okf-toolset |
|---|---|---|---|---|---|
| **Type** | Standalone MCP server | Standalone MCP server | CLI + MCP server | Library (persistence adapter) | Library (toolkit) |
| **OKF Spec** | v0.1 (full impl) | v0.1 (full impl) | v0.1 (conformant) | Quatrain-internal only | v0.1 |
| **Read Tools** | 20 tools | 9 tools | 6 tools | None (MCP) | Via `registerOkfTools` |
| **Write Tools** | 7 tools (gated) | 7 tools (gated) | Read-only | CRUD via Backend API | Via refiner |
| **Embeddings** | None | None | None | None | Yes (JSONL cache) |
| **Remote Bundles** | GitHub trees, archives | GitHub repos | URL crawl + import | None | None |
| **Multi-Bundle** | Yes (cross-bundle edges) | No | Yes (multi-source workspace) | N/A | Single bundle |
| **Git Integration** | history, diff tools | No | Refresh tracking | Filesystem only | history/diff/blame helpers |
| **Obsidian Compat** | Yes (open as vault) | No | No | No | No |
| **Auto-Refresh** | `--watch` for local | No | `--auto-refresh` for sources | No | No |
| **Agent Harnesses** | Any MCP client | Any MCP client | Claude Code, Codex, Cursor, etc. | None | Needs custom server |
| **License** | ISC | MPL-2.0 | MIT | AGPL-3.0 | MIT |
| **Maturity** | v0.20 (39 commits) | v0.2 (109 commits) | v0.3.3 (34 commits) | v1.0.5 (785 commits) | v0.3 (3 commits) |
| **Weekly Downloads** | ~248 | ~5 | ~572 | ~555 | ~27 |
