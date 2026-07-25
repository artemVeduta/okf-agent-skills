# OKF Ecosystem Projects — Full Investigation

> Research date: July 25, 2026
> Deep dives: 8 files, 8,643 lines total in `ecosystem-deep/`

## Deep Dive Index

Each project group has a companion deep-dive file with full CLI interfaces, end-to-end flows, API references, and installation methods:

| File | Projects covered | Lines |
|------|-----------------|-------|
| [ecosystem-deep/google-tools.md](ecosystem-deep/google-tools.md) | Enrichment Agent, Visualizer, kcmd CLI+MCP, kcagent | 1,082 |
| [ecosystem-deep/validators.md](ecosystem-deep/validators.md) | okflint, superops-team/okf, signed-okf | 1,046 |
| [ecosystem-deep/producers.md](ecosystem-deep/producers.md) | OpenWiki (LangChain), pi-openwiki, leadcraft, WordPress Plugin, Web Converter | 1,107 |
| [ecosystem-deep/consumers.md](ecosystem-deep/consumers.md) | Kiso, @docmd/plugin-okf, okf-viewer, okapi-okf | 750 |
| [ecosystem-deep/skills.md](ecosystem-deep/skills.md) | rakibtg/okf-skill, fabricioctelles OKF skill, hermes-okf, okforge | 843 |
| [ecosystem-deep/mcp-servers.md](ecosystem-deep/mcp-servers.md) | @copperbox/okf-mcp, caedora-mcp, okfy-ai, @quatrain/okf, okf-toolset | 1,240 |
| [ecosystem-deep/ts-libraries.md](ecosystem-deep/ts-libraries.md) | 6 TypeScript libraries (core-okf, js-okf, okf-tool, turbomem/okf, sorane/okf, okf-toolkit) | 1,557 |
| [ecosystem-deep/specialized.md](ecosystem-deep/specialized.md) | Inkeep, knowledge-template, openknowledgeformat.com, AgentFi, kb.duyet.net, OriginTrail DKG, W3C DataBook, auto-okf, okfgen, fastrag/okf | 1,018 |

---

## Projects from Ecosystem Map

### 1. Enrichment Agent (Google)
- **URL**: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
- **Repository**: github.com/GoogleCloudPlatform/knowledge-catalog (monorepo)
- **Description**: Reference agent that pulls metadata from BigQuery and emits OKF bundles. Has a web-crawl enrichment pass where the LLM fetches seed URLs and follows auth docs to enrich concepts or mint new reference docs. Bundles GA4, Stack Overflow, and crypto_bitcoin included as samples.
- **Relationship to OKF**: Producer (the reference implementation for bundle generation)
- **Status**: Functional PoC — works for BigQuery public datasets, not a product
- **Language/Stack**: Python 3.13, Google ADK (Agent Development Kit), Gemini
- **License**: Apache 2.0
- **Key Files/Features**: `enrich` subcommand with `--source bq` and `--web-seed` / `--web-seed-file`, web pass with `--web-max-pages` cap, `--no-web` for BQ-only runs
- **OKF-Specific Logic**: Generates one `.md` concept per BigQuery table/schema/entity, populates YAML frontmatter with `type`, `title`, `description`, `resource`, `tags`, `timestamp`. Web pass makes `enrich` / `mint` / `skip` decisions per fetched page. Generates `index.md` and `log.md` as reserved files.
- **Dependencies**: BigQuery, Gemini API key or Vertex AI, ADK framework. Only source pluggable interface exists (nothing else implemented).
- → **Deep dive**: [ecosystem-deep/google-tools.md](ecosystem-deep/google-tools.md) — full CLI, architecture, 15 source files analyzed, end-to-end flow

### 2. viz.html — Static HTML Visualizer (Google)
- **URL**: Same monorepo as Enrichment Agent
- **Repository**: github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
- **Description**: Takes any OKF bundle and generates a self-contained HTML file with interactive concept graph (force-directed via Cytoscape.js), detail panel, search, type filters, backlinks.
- **Relationship to OKF**: Consumer/visualizer
- **Status**: Ready — works, performs well for 10-50 concepts, struggles at 500+
- **Language/Stack**: Python (generation) + JavaScript/Cytoscape.js (viewer), CDN dependencies
- **License**: Apache 2.0
- **Key Files/Features**: `visualize` subcommand, Cytoscape.js force-directed graph, "Cited by" backlinks, search by title/ID/tags, alternative layouts (cose, concentric, breadthfirst, circle, grid)
- **OKF-Specific Logic**: Parses OKF frontmatter, builds node graph from internal markdown links, renders frontmatter + markdown body in side panel
- **Dependencies**: Cytoscape.js CDN, marked.js CDN. Same monorepo as enrichment agent.
- → **Deep dive**: [ecosystem-deep/google-tools.md](ecosystem-deep/google-tools.md) — bundle→JSON transformation, Cytoscape.js schema, internal link rewiring

### 3. kcmd CLI + MCP Server (Google)
- **URL**: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode
- **Repository**: Same Google Cloud monorepo
- **Description**: Bidirectional sync between local metadata (YAML/markdown) and Google Cloud Knowledge Catalog. "Git for metadata" — local edit, push/pull to cloud. Ships as TypeScript library, CLI, and MCP server.
- **Relationship to OKF**: Bridge tool (between filesystem OKF and Knowledge Catalog backend)
- **Status**: Early product — CLI works, MCP server real, no versioned npm releases
- **Language/Stack**: TypeScript, npm (`kcmd`), GCP Knowledge Catalog
- **License**: Apache 2.0
- **Key Files/Features**: `init`, `pull`, `push`, `status`, `mcp` subcommands. MCP tools: `pull`, `push`, `list-entries`, `lookup-entry`, `modify-entry`.
- **OKF-Specific Logic**: YAML/sidecar format differs from pure OKF (oriented toward Dataplex catalog). Builds hierarchical layout mirroring resource structure.
- **Dependencies**: GCP project with Knowledge Catalog enabled, `gcloud` auth
- → **Deep dive**: [ecosystem-deep/google-tools.md](ecosystem-deep/google-tools.md) — full CLI, 20+ TS source files, MCP server with 3 tools, pull/push sync flow

### 4. Google Cloud Knowledge Catalog
- **URL**: https://cloud.google.com/products/knowledge-catalog
- **Repository**: N/A (GCP product)
- **Description**: GCP's AI-powered metadata catalog (formerly Dataplex). Native OKF ingestion, automatic harvesting from BigQuery/AlloyDB/Spanner/Cloud SQL/Firestore/Looker, third-party integrations (Ab Initio, Anomalo, Atlan, Collibra, Datahub), Gemini enrichment, sub-second semantic search for agents.
- **Relationship to OKF**: Consumer (ingests OKF bundles natively) + enterprise backend
- **Status**: GA Google Cloud product
- **Language/Stack**: GCP enterprise stack
- **License**: Proprietary (GCP service)
- **Key Files/Features**: Native OKF ingestion, Context APIs + MCP tools, data products with SLAs
- **OKF-Specific Logic**: Ingests OKF bundles directly. Not OKF-native — OKF is the portable interop layer.
- **Dependencies**: Google Cloud Platform, paid service (free tier: 100 DCU-hr/month + 1 MiB storage + 1M API calls)

### 5. superops-team/okf CLI
- **URL**: https://github.com/superops-team/okf
- **Repository**: github.com/superops-team/okf
- **Description**: Go CLI that scans a Git repository and generates an OKF bundle from source code. Incremental updates via git hooks, built-in linter (13 rules), query engine, cross-platform binaries.
- **Relationship to OKF**: Producer (generates bundles from code repos)
- **Status**: Released — v1.2.0 (June 2026), 16 stars, 17 commits
- **Language/Stack**: Go, Apache 2.0
- **License**: Apache 2.0
- **Key Files/Features**: `okf init` (initial scan), `okf hook` (git hook install), `okf lint` (13 rules: OKF001–OKF010), `okf search` (type/tags/full-text), incremental updates via Git commits. Clean package layout: `pkg/okf/`, `pkg/parser/`, `pkg/query/`, `pkg/lint/`, `pkg/git/`.
- **OKF-Specific Logic**: Generates one concept per meaningful file, populates frontmatter (`type`, `title`, `description`, `resource`, `tags`, `timestamp`). Validates against OKF spec (F001: missing type, F002: missing title, 8 warning rules). Stores bundle in `.okf/knowledge/`.
- **Dependencies**: Go stdlib (does not depend on other OKF tools). Complementary to okflint (one produces, one gates).
- → **Deep dive**: [ecosystem-deep/validators.md](ecosystem-deep/validators.md) — 14 CLI subcommands, 13 lint rules, git repo scanning pipeline, incremental update mechanism

### 6. okflint — The Ruff of Documentation
- **URL**: https://github.com/mattdav/okflint
- **Repository**: github.com/mattdav/okflint
- **Description**: Deterministic, LLM-free compliance linter for OKF documentary bases. Three-tier rule system (OKF Core / Profile / Hygiene). Declare your own standard in a YAML manifest. Resolves `[[wikilinks]]` against Obsidian vaults. Generates `index.md` files.
- **Relationship to OKF**: Validator/linter (compliance gate)
- **Status**: Released — v0.3.1 (July 20, 2026), 4 stars, 53 commits
- **Language/Stack**: Python 3.12+, MIT, PyPI (`pip install okflint`), pip/uv
- **License**: MIT
- **Key Files/Features**: `okflint audit` (descriptive, always exit 0), `okflint validate` (normative gate, exit 1 on failure), `okflint index` (generates §6 `index.md`). Three-tier rule system with user-declared profiles in `okf-base.yaml` manifest. 18 documented rules (F001-F201, R001-R002, S101-S202, L001-L003). Multi-bundle vaults via `okf-vault.json`. JSON output for CI. Obsidian `[[wikilinks]]` resolution. Dry-run diffs for index generation.
- **OKF-Specific Logic**: Implements OKF spec §9 conformance rules deterministically. Validates reserved files (`index.md`, `log.md`) separately from concepts. Profile layer lets teams declare required fields, status vocabularies, and custom types. Hygiene layer provides optional strictness (semantic cohesion scoring via TF-IDF/cosine).
- **Dependencies**: pyyaml, beartype. Published on PyPI (v0.3.1, 7 releases since June 27). API docs at mattdav.github.io/okflint.
- → **Deep dive**: [ecosystem-deep/validators.md](ecosystem-deep/validators.md) — 15 lint rules (F001–F201), full CLI, manifest structure, wikilink resolution, index generation, JSON output, API imports

### 7. Kiso — Publishing Engine
- **URL**: https://github.com/oak-invest/kiso / https://oak-invest.github.io/kiso/
- **Repository**: github.com/oak-invest/kiso
- **Description**: Java CLI that turns OKF bundles into static websites for humans and AI agents. Includes `llms.txt` and `sitemap.xml` generation, DaisyUI themes, publishing profiles, GitHub Action.
- **Relationship to OKF**: Consumer/publisher (bundle → static site)
- **Status**: Released — v0.1.5 (July 2026), 16 stars, 225 commits
- **Language/Stack**: Java (Maven), Apache 2.0
- **License**: Apache 2.0
- **Key Files/Features**: `check` (validate markdown structure), `build` (generate static site). GitHub Action (`oak-invest/kiso/applications/kiso-cli-action@v0.1.3`). Publishing profiles (`.kiso/<profile>/configuration.yaml`). Configuration: `site.baseUrl`, `theme.name` (DaisyUI), `content.ignorePatterns` (glob). Auto-generates `llms.txt` and `sitemap.xml`.
- **OKF-Specific Logic**: Reads OKF bundles (directories of `.md` with frontmatter), generates HTML pages with frontmatter rendering, internal link navigation, concept graphs. Validates bundle conformance before building.
- **Dependencies**: Java JRE. No direct dependency on other OKF tools beyond consuming OKF bundles.
- → **Deep dive**: [ecosystem-deep/consumers.md](ecosystem-deep/consumers.md) — full CLI, JTE templates, DaisyUI themes, publishing profiles, llms.txt/sitemap.xml generation, GitHub Action

### 8. OpenWiki 0.2 (LangChain)
- **URL**: https://github.com/langchain-ai/openwiki
- **Repository**: github.com/langchain-ai/openwiki
- **Description**: CLI that reads codebases, generates structured wikis in OKF format, and wires them into agent instruction files (CLAUDE.md, .cursorrules, AGENTS.md). Personal mode builds a local brain wiki from connectors (Git, Gmail, Notion, X/Twitter, Web Search, Hacker News).
- **Relationship to OKF**: Producer (codebase → OKF wiki) + Consumer (agents read wikis)
- **Status**: Production-ready — v0.2 (July 2026), 13.2k stars, 189 commits, npm (`openwiki`)
- **Language/Stack**: TypeScript/Node.js, MIT, multi-provider LLM support (OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, Ollama, etc.)
- **License**: MIT
- **Key Files/Features**: `openwiki --init` (generate docs), `openwiki --update` (incremental update), `openwiki personal` (local brain wiki). Code mode outputs to `openwiki/` dir. Personal mode outputs to `~/.openwiki/wiki/`. Mermaid diagram generation with validation/repair loop. CI workflows for GitHub Actions, GitLab CI, Bitbucket Pipelines. Local connectors for Git, Notion, Gmail, X/Twitter, Web Search, Hacker News. Auto-injects `<!-- OPENWIKI:START -->` blocks into AGENTS.md/CLAUDE.md.
- **OKF-Specific Logic**: Emits OKF v0.1 conformant bundles. Every non-reserved `.md` has YAML frontmatter with non-empty `type`. Valid `timestamp` values. `index.md` and `log.md` as reserved documents. Standard markdown links between concept documents. Producer-defined extension fields accepted and preserved during updates.
- **Dependencies**: Node.js, multi-model support (OpenAI/Anthropic/Gemini/Bedrock/OpenRouter providers). No dependency on other OKF ecosystem pieces. Backed by LangChain (the org), not a side project.
- → **Deep dive**: [ecosystem-deep/producers.md](ecosystem-deep/producers.md) — full CLI (12+ flags), 12+ LLM providers, 6 connectors, Mermaid diagrams, CI workflows, agent file injection, step-by-step flow

### 9. signed-okf — Trust Layer
- **URL**: https://github.com/dynamicfeed/signed-okf
- **Repository**: github.com/dynamicfeed/signed-okf
- **Description**: Cryptographic trust layer for OKF bundles. Hashes every file, wraps hashes plus provenance envelope in a manifest, Ed25519-signs it. Any consumer can verify with issuer's public key.
- **Relationship to OKF**: Additive trust layer (provenance for bundles)
- **Status**: Early — v0.2.1 (July 2026), 2 stars, 1 commit. NOT on PyPI (only GitHub).
- **Language/Stack**: Python 3.8+, cryptography library, Apache 2.0
- **License**: Apache 2.0
- **Key Files/Features**: `sign_okf.py keygen` (Ed25519 keypair), `sign_okf.py sign` (hash + sign bundle), `verify_okf.py` (re-hashes + checks signature). JWKS-based key distribution (`--jwks` can be local file or public URL). Optional OriginTrail DKG anchoring.
- **OKF-Specific Logic**: Adds `okf.manifest.json` file (not an OKF reserved name, so additive). Adds optional frontmatter keys per OKF spec extension policy. Tamper-evident: any change to any file or manifest breaks verification. Spec-compliant with "MAY include additional keys" rule.
- **Dependencies**: Python `cryptography` library. Built by Dynamic Feed (dynamicfeed.ai). Compatible with OriginTrail DKG for on-chain anchoring.
- → **Deep dive**: [ecosystem-deep/validators.md](ecosystem-deep/validators.md) — keygen/sign/verify CLI, manifest JSON structure, Ed25519 flow, JWKS distribution, tamper-evident design

### 10. hermes-okf — Agent Memory
- **URL**: https://github.com/EliaszDev/hermes-okf
- **Repository**: github.com/EliaszDev/hermes-okf
- **Description**: Filesystem-based memory system for Hermes agent ecosystem. Stores decisions, observations, plans as OKF concept files. Filesystem-first — plain `.md` + YAML. Git-backed history, RAG integration, config validator, hot/cold memory model.
- **Relationship to OKF**: Storage backend (agent memory using OKF as the persistence format)
- **Status**: Functional — v0.5.9 (July 2026), 26 stars, 71 commits, ON PyPI
- **Language/Stack**: Python 3.9+, MIT, PyPI (`pip install hermes-okf`)
- **License**: MIT
- **Key Files/Features**: Hermes plugin (`hermes memory setup`), standalone CLI (`hermes-okf init|validate|search|show|log|diff|revert|snapshot|context`), decorators (`@memorize_decision`, `@memorize_tool`), config validator (15 checks, 5 seconds), `GitOKFBundle` (auto-commit, diff, revert), hot memory buffer, graph extraction, search index, optional RAG (LangChain/ChromaDB).
- **OKF-Specific Logic**: Concept files with YAML frontmatter using Hermes-specific types: `Decision`, `Observation`, `Context`, `Plan`, `Session`, `ToolCall`. Cross-linked with internal markdown references. Implicit knowledge graph from markdown links. Validates OKF conformance. Queryable through tool registry.
- **Dependencies**: pyyaml (core), optional LangChain/ChromaDB for RAG. Tight coupling to HermesAgent ecosystem limits broader adoption, but architecture is reference-worthy.
- → **Deep dive**: [ecosystem-deep/skills.md](ecosystem-deep/skills.md) — 22 CLI subcommands, all Python source, decorators, GitOKFBundle, hot/cold memory, RAG, config validator

### 11. Inkeep Open Knowledge
- **URL**: https://github.com/inkeep/open-knowledge
- **Repository**: github.com/inkeep/open-knowledge
- **Description**: Beautiful, AI-native WYSIWYG markdown editor and LLM wiki tool. macOS app + web UI. Integrates with Claude, Codex, OpenCode, Pi. MCP, skills, agentic search. OKF starter pack. Git/GitHub sync.
- **Relationship to OKF**: Editor/IDE ± consumer (native OKF editing with validation)
- **Status**: Active — v0.9+ (July 2026), 3.1k stars, 1,293 commits
- **Language/Stack**: TypeScript/React, GPL-3.0, monorepo (packages/), pnpm, Biome
- **License**: GPL-3.0
- **Key Files/Features**: CLIs: `ok init`, `ok start --open`. Full WYSIWYG markdown editor. Side-by-side AI editing with Claude/Codex/OpenCode/Pi. MCP server + agent skills. Team sharing via git/GitHub. Embeddable HTML and rich components. Starter packs including OKF template.
- **OKF-Specific Logic**: OKF starter pack (`npx create-open-knowledge my-kb --template okf`) generates conformant OKF knowledge base. Live frontmatter validation. Internal link resolution. Concept graph sidebar. "OKF by default" workflow.
- **Dependencies**: Node.js 24+, git. Inkeep has funding + existing product (AI search widget). Still pre-1.0.
- → **Deep dive**: [ecosystem-deep/specialized.md](ecosystem-deep/specialized.md) — full CLI, 21 MCP tools, agent skills system, WYSIWYG features, 10+ agent integrations

### 12. knowledge-template (Open Science)
- **URL**: https://github.com/open-science-pillars/knowledge-template
- **Repository**: github.com/open-science-pillars/knowledge-template
- **Description**: Conformant, empty OKF bundle scaffold for scientific knowledge management. One fully annotated example per concept type (dataset, gotcha, recipe, convention). Conformance target: OKF v0.1 + Open Science Pillars profile.
- **Relationship to OKF**: Template/scaffold (starter bundle)
- **Status**: Ready — v1.0 (July 3, 2026), 1 star, 5 commits
- **Language/Stack**: Markdown-only (no runtime), CC-BY-4.0
- **License**: CC-BY-4.0
- **Key Files/Features**: Concept types: `dataset` (with `resource`, `trainings`, `## Uncertainty`), `dataset-gotcha` (with `severity`, `evidence` links), `recipe` (inputs, expected values + uncertainty ranges), `convention`. Two core rules: "Evidence or nothing" and "Facts, not instructions". Strict YAML quoting. Status workflow: `draft` → `verified` → `stale` → `superseded` or `disputed`.
- **OKF-Specific Logic**: Extends OKF v0.1 with domain-specific frontmatter fields and content conventions. Every gotcha links its dataset concept. Every recipe validates expected values + uncertainty. Inline comments explain frontmatter rationale.
### 13. okf-skill (Agent Skill)
- **URL**: https://github.com/rakibtg/okf-skill
- **Repository**: github.com/rakibtg/okf-skill
- **Description**: Single Agent Skill (SKILL.md) that teaches AI coding agents how to read and write OKF bundles. Includes dependency-free Python 3 stdlib scripts for bundle mechanics: init, new concept, gen index, add log entry, validate.
- **Relationship to OKF**: Agent skill (teaches agents to produce/consume OKF)
- **Status**: Functional — v1.0 (2026), 4 stars, 19 commits
- **License**: Apache 2.0 (skill code), Google's license (vendored SPEC.md)
- **Key Files/Features**: `SKILL.md` (~150 lines, progressive disclosure), scripts: `init_bundle.py`, `new_concept.py`, `gen_index.py`, `add_log_entry.py`, `validate.py`. All scripts are Python 3 stdlib only — zero dependencies, no pip install. Templates: `concept.md.tmpl`, `index.md.tmpl`, `log.md.tmpl`. References: vendored `SPEC.md`, `cheatsheet.md`. Installable via `npx skills add rakibtg/okf-skill`.
- **OKF-Specific Logic**: Deterministic scripts for OKF bundle creation and maintenance. `validate.py` implements §9 hard rules as code. `gen_index.py` handles `okf_version` in root `index.md` correctly. Agent uses progressive disclosure — keeps SKILL.md in context, opens SPEC.md or cheatsheet only when needed.
- **Dependencies**: Python 3 (stdlib only). No dependencies on other ecosystem pieces. Compatible with any Agent Skills format agent (Claude Code, OpenCode, Codex).

### 14. leadcraft — Tech Lead Planning Plugin
- **URL**: https://github.com/dskst/leadcraft
- **Repository**: github.com/dskst/leadcraft
- **Description**: Claude Code plugin for writing structured deliverables (plans, estimates, ADRs, design docs). Output is an OKF v0.1 Knowledge Bundle. 5-level planning model (Objective/Initiative/Epic/Story/Task). Tracker-agnostic (default local markdown, opt-in GitHub Issues).
- **Relationship to OKF**: Producer (structured deliverables → OKF bundle)
- **Status**: Early — v0.1 (July 2026), 1 star, 3 commits
- **License**: MIT
- **Key Files/Features**: 17 skills: `compose-objective`, `compose-initiative`, `compose-epic`, `compose-stories`, `estimate-points`, `identify-risks`, `review-stories`, `write-adr`, `write-dd`, `build-bundle` (generates index.md/log.md + OKF conformance validation). Tracker abstraction with local + GitHub backends. OKF conformance reference file.
- **OKF-Specific Logic**: Every deliverable is an OKF concept with `type`, `title`, `description`, `tags`, `timestamp`, `resource` frontmatter. `build-bundle` skill generates `index.md`/`log.md` and validates against OKF v0.1 spec. Bundle-absolute links. Story slug format based on objective/initiative/epic hierarchy.
- **Dependencies**: Claude Code plugin system. Default local backend requires no external dependencies. GitHub backend requires `gh` CLI.

### 15. pi-openwiki (IBM PI Port)
- **URL**: https://github.com/barvhaim/pi-openwiki
- **Repository**: github.com/barvhaim/pi-openwiki
- **Description**: LangChain's OpenWiki agent ported to IBM PI harness. Generates/maintains codebase documentation with Pi's AI capabilities. Produces OKF output format.
- **Relationship to OKF**: Producer (codebase → OKF wiki, via IBM PI ecosystem)
- **Status**: Fresh port — v0.1 (July 2026), 9 stars, 6 commits
- **Language/Stack**: TypeScript (PI extension), MIT
- **License**: MIT
- **Key Files/Features**: `/openwiki:init`, `/openwiki:update`, `/openwiki:chat <question>`. Git-aware incremental updates. Modular extension architecture (`extensions/openwiki/` with commands, tools, events, git-utils, metadata, prompts). Auto-updates AGENTS.md/CLAUDE.md. Package ready for Pi package gallery.
- **OKF-Specific Logic**: Same OKF output format as OpenWiki (OKF v0.1 conformant). `openwiki/` directory with `quickstart.md`, `architecture/`, `workflows/`, `domain/`, `operations/`, `testing/` structure.
- **Dependencies**: IBM PI >= 0.80.0, Node.js with TypeScript. Requires PI harness (limits adoption outside IBM ecosystem).

### 16. OriginTrail DKG + OKF
- **URL**: Blog post at blog.prototypr.io
- **Repository**: @origintrail-official/dkg-okf (npm)
- **Description**: Connects OKF bundles to OriginTrail Decentralized Knowledge Graph (DKG) for on-chain provenance. Each bundle gets an owner, cryptographic proof, and immutable on-chain record. npm package `@origintrail-official/dkg-okf` v10.0.9 (published 4 days ago).
- **Relationship to OKF**: Trust + persistence layer (on-chain anchoring of bundles)
- **Status**: Concept — npm package active (v10.0.9, 1,730 weekly downloads), blog post July 4, 2026
- **Language/Stack**: TypeScript (npm package), Apache 2.0
- **License**: Apache 2.0
- **Key Files/Features**: `@origintrail-official/dkg-okf` — "Deterministic Google Open Knowledge Format (OKF) → DKG mapper." 1,730 weekly downloads, 1 dependent.
- **OKF-Specific Logic**: Maps OKF bundles deterministically to DKG. Built on top of signed-okf approach.
- **Dependencies**: OriginTrail DKG node or testnet access.

### 17. WordPress Plugin (Suganthan)
- **URL**: https://suganthan.com/blog/open-knowledge-format/
- **Repository**: Pending WordPress Plugin Directory review
- **Description**: WordPress plugin that auto-generates OKF bundles from WordPress posts/pages. Watches publish/edit events, rebuilds bundle on every update. Dashboard shows internal link graph. Bundle served at `/okf/` or via query param.
- **Relationship to OKF**: Producer (WordPress content → OKF bundle)
- **Status**: Ready — live, submitted to WP Plugin Directory
- **Language/Stack**: PHP 7.4+, GPL
- **License**: GPL
- **Key Files/Features**: Posts/pages → OKF concept files with frontmatter + clean markdown. Served at `yoursite.com/okf/` with pretty permalinks. Settings page for post type inclusion/exclusion. Read-only (never touches content, uninstall leaves no traces). Bundle rebuilds on every post update.
- **OKF-Specific Logic**: Converts WP content to OKF concepts. Maintains YAML frontmatter with post metadata as concept properties. Internal link graph visualization in WP dashboard.
- **Dependencies**: WordPress 6.0+, PHP 7.4+, pretty permalinks enabled.

### 18. openknowledgeformat.com
- **URL**: https://openknowledgeformat.com/
- **Repository**: N/A (community site)
- **Description**: Browser-based OKF frontmatter validator + starter templates + interactive examples. Zero install, zero dependencies. Paste YAML frontmatter, get instant validation against OKF spec.
- **Relationship to OKF**: Validator + educational tool
- **Status**: Ready — live since June 13, 2026
- **Language/Stack**: Web (browser-based), no license info
- **License**: Unknown
- **Key Files/Features**: Frontmatter paste-and-validate, starter templates, interactive examples. First stop for newcomers.
- **OKF-Specific Logic**: Validates YAML frontmatter against OKF spec rules. Shows what valid bundles look like.
- **Dependencies**: Browser only. No other ecosystem dependencies.

### 19. Suganthan Web Converter
- **URL**: https://suganthan.com/free-seo-tools/okf-generator/
- **Description**: Paste a URL or sitemap, crawls up to 100 pages, strips chrome, converts each page into an OKF concept with cross-links, delivers as ZIP. Visual graph shows page links.
- **Relationship to OKF**: Producer (website → OKF bundle at page level)
- **Status**: Functional — works at page level (one file per page)
- **Language/Stack**: Web tool
- **License**: Unknown
- **OKF-Specific Logic**: Page-level conversion (one concept per page). Cross-links from page links. Limited to page-granularity concept extraction.
- **Dependencies**: Web-based, no local dependencies.

### 20. W3C Holon CG — DataBook Profile
- **URL**: https://ontologist.substack.com/p/the-format-convergence
- **Description**: W3C Holon Community Group proposal for DataBook — a formal OKF profile for semantic web use cases. Adds IRI-based identity (`id:`), version tracking, typed fenced blocks carrying RDF/SPARQL/SHACL, push to SPARQL triplestore, SHACL validation gating.
- **Relationship to OKF**: Profile/extension (semantic web layer on top of OKF)
- **Status**: Proposal (June 2026)
- **Language/Stack**: N/A (specification)
- **License**: N/A
- **Key Files/Features**: IRI identity, version tracking + author provenance, typed fenced blocks (Turtle, JSON-LD, SPARQL, SHACL), Graph Store Protocol push, SHACL validation gating deployment.
- **OKF-Specific Logic**: Extends OKF without forking. Uses OKF as base layer for semantic web metadata.
- **Dependencies**: SPARQL triplestore, SHACL processor.

### 21. AgentFitech
- **URL**: https://medium.com/@AgentFitech
- **Description**: Startup that built OKF support (producer + consumer) within 24 hours of spec release. Documented process on Medium.
- **Relationship to OKF**: Producer + Consumer (built OKF integration into their product)
- **Status**: Proof of concept (blog post, no public repo)
- **Language/Stack**: Unknown
- **License**: N/A
- **OKF-Specific Logic**: Full OKF compliance in one sprint — validates simplicity of the format.
- **Dependencies**: Unknown.

### 22. kb.duyet.net
- **URL**: https://kb.duyet.net/m/tech-okf-open-knowledge-format
- **Description**: Developer (Duyet) converted existing markdown knowledge base into strict-conformant OKF bundle.
- **Relationship to OKF**: Producer (personal KB → OKF)
- **Status**: Live example
- **Language/Stack**: Markdown
- **License**: N/A
- **OKF-Specific Logic**: Demonstrates that adding `type` to existing markdown frontmatter is sufficient for OKF conformance.
- **Dependencies**: None.

---

## Independently Discovered Projects

These projects were found via npm search, PyPI, and GitHub search, beyond what the ecosystem map lists.

### npm Packages

| Package | Publisher | Description | Version | Weekly Downloads | License |
|---------|-----------|-------------|---------|-------------------|---------|
| `open-knowledge-format` | kkonstantinov | Placeholder — "Coming soon" | 0.0.1 | 20 | MIT |
| `@origintrail-official/dkg-okf` | branarakic | OKF → DKG deterministic mapper | 10.0.9 | 1,730 | Apache-2.0 |
| `@docmd/plugin-okf` | GitHub Actions | Generate OKF bundle from docmd site | 0.8.17 | 5,572 | MIT |
| `@quatrain/okf` | crapougnax | OKF flat file storage adapter | 1.0.5 | 540 | AGPL-3.0 |
| `okforge` | jetienne | OKF skill for Claude Code — bundle mechanics + Stop-hook | 1.0.12 | 1,935 | MIT |
| `@equationalapplications/core-okf` | GitHub Actions | Zero-dep TypeScript OKF primitives (frontmatter, concepts, index/log builders) | 4.22.0 | 3,148 | MIT |
| `okfy-ai` | 0dust | Convert docs → OKF bundles + serve to MCP agents | 0.3.3 | 2,154 | MIT |
| `@copperbox/okf-mcp` | GitHub Actions | MCP server providing OKF backend to coding agents | 0.20.0 | 2,860 | ISC |
| `@turbomem/okf` | arneeshaima | OKF parser, validator, writer for Node.js | 1.0.0 | 439 | Apache-2.0 |
| `auto-okf` | indexzero | Multi-writer OKF bundles | 0.0.1 | 137 | Apache-2.0 |
| `js-okf` | prabhay759 | TypeScript library for creating/updating OKF bundles | 0.3.1 | 819 | MIT |
| `okfgen` | arindam1729 | Generate + validate OKF bundles with LangChain + any model provider | 0.0.3 | 495 | MIT |
| `@fastrag/okf` | zac_ma | Convert doc corpora → OKF bundles + graph-first Viewer Workbenches | 0.1.0 | 511 | MIT |
| `okf-toolset` | skye0402 | Filesystem-first OKF toolkit: embeddings, search, MCP, refiner, Git helpers | 0.3.0 | 712 | MIT |
| `okf-tool` | hanfang5057 | TypeScript OKF library: parse, write, search, validate | 0.2.0 | 322 | Apache-2.0 |
| `okapi-okf` | GitHub Actions | OKF Knowledge Studio — visualize, explore, audit, edit, query bundles | 0.2.1 | 335 | MIT |
| `okf-toolkit` | rubenlazarus | Parse, validate, chunk OKF bundles for RAG pipelines | 0.1.0 | 152 | Apache-2.0 |
| `@sorane/okf` | GitHub Actions | OKF parsing, validation, serialization for sorane | 0.5.0 | 195 | MIT |
| `caedora-mcp` | williamfclarke | MCP server for reading/maintaining OKF bundles | 0.2.0 | 169 | MPL-2.0 |
| `okf-viewer` | GitHub Actions | Browse OKF bundle via local CLI + Next.js viewer | 0.4.1 | 150 | MIT |

**Most significant newly discovered npm packages:**
- **`@docmd/plugin-okf`** (5.5k weekly downloads) — most popular OKF npm package by downloads. Generates OKF bundles from docmd sites.
- **`@equationalapplications/core-okf`** (3.1k downloads, v4.22.0) — mature, zero-dependency TypeScript library. Likely the best maintained TS OKF library.
- **`@copperbox/okf-mcp`** (2.8k downloads, v0.20.0) — actively maintained MCP server for OKF. High version number suggests rapid iteration.
- **`okforge`** (1.9k downloads, v1.0.12) — Claude Code skill specifically for OKF bundle mechanics.
- **`okfy-ai`** (2.1k downloads) — Docs-to-OKF converter + MCP server. Full pipeline.
- **`okf-toolset`** (712 downloads) — Most comprehensive toolkit: embeddings, search, MCP, refiner, Git helpers.
- **`okapi-okf`** (335 downloads) — Dedicated OKF studio with visualization, editing, querying.

### PyPI Packages

| Package | Author | Description | Version | Python | License |
|---------|--------|-------------|---------|--------|---------|
| `okflint` | mattdav | Compliance linter for OKF | 0.3.1 | 3.12+ | MIT |
| `hermes-okf` | EliaszDev | Agent memory system on OKF | 0.5.9 | 3.9+ | MIT |

Note: `signed-okf` is NOT on PyPI (returns 404). Only distributed via GitHub currently.

### Other Notable Discoveries

- **fabricioctelles/skills** (36 stars, 86 commits): Collection of agent skills including an OKF skill (`skills/okf-open-knowledge-format/SKILL.md`). This is the repo linked from okf.md's footer. It's a meta-repo hosting skills for various topics (SEO, Substack, Coolify, etc.), with the OKF skill being one of ~15. The skill includes a bash validator, conversion guides (Notion, Obsidian, CSV), and integration with Knowledge Catalog via kcmd. This is a separate OKF skill from rakibtg/okf-skill.

- **vercel-labs/skills** (referenced by okf-skill): The Agent Skills framework. `npx skills add` installs skills from GitHub repos. okf-skill is distributed through this ecosystem.

---

## Ecosystem Summary

### Most Relevant Projects for Building an OKF Skill Suite

| Priority | Project | Why |
|----------|---------|-----|
| **P0** | `rakibtg/okf-skill` | Existing agent skill for producing/consuming OKF — best starting point or reference for building our own |
| **P0** | `okflint` (mattdav) | The gold-standard validator. Any skill suite MUST run okflint for conformance gating |
| **P0** | OKF Spec (GoogleCloudPlatform/knowledge-catalog) | Authoritative source. All tools ultimately reference this |
| **P1** | `fabricioctelles/skills` (OKF skill) | Alternative OKF skill implementation — another reference for skill design |
| **P1** | `hermes-okf` | Reference architecture for OKF as agent memory — types, decorators, session lifecycle |
| **P1** | `OpenWiki` (LangChain) | Production-grade producer. Shows how OKF integrates with agent instruction files |
| **P1** | `@equationalapplications/core-okf` | Mature TypeScript library — useful if building TypeScript tooling |
| **P2** | `superops-team/okf` CLI | Git-aware bundle generation. Complementary to okflint |
| **P2** | `leadcraft` | Example of OKF as output format for structured planning — architectural pattern reference |
| **P2** | `knowledge-template` (Open Science) | Example of domain-specific OKF profile — reference for profile design |
| **P3** | `Kiso` | Publishing — useful if we need static site output |
| **P3** | `signed-okf` | Trust layer — relevant if we add provenance features |

### Gaps in the Ecosystem

1. **No unified agent skill suite.** Existing skills (rakibtg/okf-skill, fabricioctelles OKF skill) are single-SKILL.md files. No one has built a multi-skill suite covering the full lifecycle: init → author → validate → enrich → publish → maintain. This is our primary opportunity.

2. **No automatic lifecycle implementation.** The OKF ecosystem map describes "automatic lifecycle" as a concept, but no tool implements it. Agents consult OKF knowledge and do small maintenance writes during normal work — but this requires a skill that orchestrates: (a) reading relevant context from the bundle at session start, (b) identifying what to write/update during the session, (c) validating and committing changes.

3. **No MCP server for OKF validation.** Several MCP servers exist for OKF storage/retrieval (`@copperbox/okf-mcp`, `caedora-mcp`, `okfy-ai`), but none that provide deterministic validation as an MCP tool. Wrapping okflint behind MCP would fill this gap.

4. **No incremental enrichment from multiple sources.** The Google enrichment agent only supports BigQuery. No tool enriches OKF bundles from codebases, APIs, issue trackers, or other live sources in an ongoing way.

5. **No OKF-native Obsidian plugin.** There's natural compatibility but no dedicated plugin for validation + templates within Obsidian.

6. **No VS Code extension.** No lint-on-save or preview pane for OKF bundles in VS Code.

7. **No public OKF bundle registry/gallery.** No central place to discover, share, or remix OKF bundles.

8. **No OKF → schema.org / JSON-LD bridge.** Semantic web interop is still at proposal stage (DataBook).

9. **No CI-native GitHub Action for OKF.** okflint can run in CI, but there's no pre-packaged GitHub Action (`okf-validate@v1`).

10. **Language gaps:** Most tools are Python or TypeScript. No Rust, no Go library (superops-team/okf is a CLI, not a library). No .NET, no Ruby tooling.

### Reference Implementations

These projects demonstrate what "doing OKF well" looks like:

| Aspect | Reference | Notes |
|--------|-----------|-------|
| **Validation** | `okflint` | Gold standard. Three-tier rules, profile system, deterministic. Should be the CI gate for any bundle. |
| **Agent Skill Design** | `rakibtg/okf-skill` | Clean progressive disclosure, deterministic scripts, vendored spec. Reference for SKILL.md structure. |
| **Agent Memory** | `hermes-okf` | Type system for agent concepts (Decision, Observation, Plan, Session), decorator pattern, Git history. |
| **Codebase → OKF** | `OpenWiki` (LangChain) | Production-grade. Multi-model, CI integration, agent file injection. |
| **Bundle Publishing** | `Kiso` | Simple CLI, GitHub Action, llms.txt + sitemap.xml output. |
| **Trust** | `signed-okf` | Ed25519 signatures, JWKS key distribution, additive (doesn't break plain OKF). |
| **Domain Profile** | `knowledge-template` (Open Science) | Shows how to define a vocabulary on top of OKF without forking the spec. |
| **Planning** | `leadcraft` | Shows OKF as structured deliverable output from a planning workflow. |
| **Editor Integration** | `Inkeep Open Knowledge` | Full WYSIWYG with live OKF validation. What a mature editor experience looks like. |

### Ecosystem Health Assessment

**Strengths:**
- Rapid growth: 22+ projects in 6 weeks since spec publication (June 12, 2026)
- Multi-language: Python, TypeScript, Go, Java, PHP represented
- Both producer and consumer tools exist
- Validation tooling is production-quality (okflint)
- LangChain backing (OpenWiki, 13.2k stars) signals strong community validation
- npm ecosystem is particularly rich (20+ packages, several with 1k+ weekly downloads)

**Weaknesses:**
- Most projects are 0.x or "functional PoC" — few production-hardened
- Heavy fragmentation: 5+ different OKF TypeScript libraries, no clear standard
- Google's own tooling is BigQuery-only and PoC-level
- No governance body or foundation (yet) beyond the spec
- Ecosystem map on okf.md is already slightly out of date (doesn't list many npm packages)

---

## Deep Dive Index

Detailed per-project research is in `ecosystem-deep/`. Each file covers full CLI interfaces, end-to-end flows, API references, installation methods, and key implementation patterns:

| Project | Deep dive file | Key new findings |
|---------|---------------|-----------------|
| Enrichment Agent (Google) | [google-tools.md](ecosystem-deep/google-tools.md) | 15 source files analyzed; BQ pass with shard-collapse regex, schema sampling; web pass fetch_url with 8-step filter chain; ADK agent definition with tool bindings |
| viz.html Visualizer | [google-tools.md](ecosystem-deep/google-tools.md) | Bundle→JSON graph transformation; Cytoscape.js node/edge schema; internal link rewiring for viewer navigation; self-contained HTML template assembly |
| kcmd CLI + MCP | [google-tools.md](ecosystem-deep/google-tools.md) | 20+ TS source files; pull/push sync flow; MCP server with 3 tools (list-entries, lookup-entry, modify-entry); YAML sidecar format |
| kcagent | [google-tools.md](ecosystem-deep/google-tools.md) | **Does not exist** in the public repo — gap confirmed |
| okflint | [validators.md](ecosystem-deep/validators.md) | 15 lint rules (F001–F201, R001–R002, S101–S202, L001–L003); full audit/validate/index CLI; manifest profile system; wikilink resolution algorithm; JSON output for CI; API imports |
| superops-team/okf | [validators.md](ecosystem-deep/validators.md) | 14 CLI subcommands; 13 lint rules; git repo scanning (AST for Go, regex for others); incremental updates via state file; cross-platform binaries (6 OS/arch) |
| signed-okf | [validators.md](ecosystem-deep/validators.md) | keygen/sign/verify CLI; manifest JSON (9 fields); Ed25519 7-step signing flow; JWKS format and distribution (file + HTTPS URL); tamper-evident design |
| OpenWiki (LangChain) | [producers.md](ecosystem-deep/producers.md) | 12+ LLM providers with per-provider config; 6 connectors (Git/Notion/Gmail/X/Web Search/HN); Mermaid diagrams with validation/repair loop; CI for GitHub/GitLab/Bitbucket; AGENTS.md/CLAUDE.md injection |
| pi-openwiki (IBM PI) | [producers.md](ecosystem-deep/producers.md) | 3 commands + 2 tools; modular extension architecture; git-based update detection; comprehensive comparison with original OpenWiki |
| leadcraft | [producers.md](ecosystem-deep/producers.md) | All 17 skills documented with full interfaces; 5-level planning model; abstract tracker contract (local + GitHub backends); build-bundle OKF conformance rules |
| WordPress Plugin (BotsBrief) | [producers.md](ecosystem-deep/producers.md) | Post metadata→frontmatter mapping table; settings page fields; rebuild triggers; `/okf/` serving |
| Suganthan Web Converter | [producers.md](ecosystem-deep/producers.md) | URL/sitemap input; 100-page crawl limit; v0.2 fields (generated, sources); ZIP delivery |
| Kiso | [consumers.md](ecosystem-deep/consumers.md) | Java 21 Maven; JTE templates + commonmark-java; DaisyUI themes; publishing profiles; llms.txt/sitemap.xml/search index generation; GitHub Action |
| @docmd/plugin-okf | [consumers.md](ecosystem-deep/consumers.md) | 8 config options; type resolution precedence (5-step); locale/version strategies; per-page opt-out |
| okf-viewer | [consumers.md](ecosystem-deep/consumers.md) | Next.js 16 + React 19; open/validate CLI; directory tree; knowledge graph (@xyflow/react); shadcn/ui + Tailwind v4 |
| okapi-okf | [consumers.md](ecosystem-deep/consumers.md) | pnpm monorepo; interactive force-directed graph; in-browser CodeMirror editing; insights (orphans/broken links); AI "Ask the bundle" (opt-in) |
| rakibtg/okf-skill | [skills.md](ecosystem-deep/skills.md) | Full SKILL.md contents; 5 scripts (init_bundle, new_concept, gen_index, add_log_entry, validate); 3 templates; progressive disclosure architecture; end-to-end BigQuery concept flow |
| fabricioctelles OKF skill | [skills.md](ecosystem-deep/skills.md) | Full SKILL.md; validate.sh; conversion guides; kcmd integration; comparison with rakibtg approach |
| hermes-okf | [skills.md](ecosystem-deep/skills.md) | 22 CLI subcommands; all Python source analyzed; @memorize_decision/@memorize_tool decorators; GitOKFBundle; hot/cold memory model; config validator (15 checks) |
| okforge | [skills.md](ecosystem-deep/skills.md) | Full CLI; Stop-hook nudge mechanism; .okforge.config.json mapping; 3 operational modes; webview generator |
| @copperbox/okf-mcp | [mcp-servers.md](ecosystem-deep/mcp-servers.md) | Canonical MCP server — 20 read tools + 7 write tools; multi-bundle; colocated bundles; cross-bundle edges; remote GitHub bundles; auto-fix registry |
| caedora-mcp | [mcp-servers.md](ecosystem-deep/mcp-servers.md) | 9 read + 7 write tools; unique grep_concepts (regex); ingest_source; local + GitHub bundle providers |
| okfy-ai | [mcp-servers.md](ecosystem-deep/mcp-servers.md) | Docs→OKF pipeline + MCP; crawl websites; import Markdown; 6 read-only MCP tools; auto-refresh freshness management |
| @quatrain/okf | [mcp-servers.md](ecosystem-deep/mcp-servers.md) | **NOT related to Google OKF spec** — JSON flat-file persistence adapter for Quatrain Core framework |
| okf-toolset | [mcp-servers.md](ecosystem-deep/mcp-servers.md) | Core parsing; filesystem store; embeddings (JSONL cache + hybrid search); MCP tool registration; refiner; Git helpers |
| @equationalapplications/core-okf | [ts-libraries.md](ecosystem-deep/ts-libraries.md) | Most mature TS library (v4.22, 3.1k DL/wk); zero dependencies; full API: parse, validate, create, modify concepts/bundles/indexes |
| js-okf | [ts-libraries.md](ecosystem-deep/ts-libraries.md) | Interactive mind-map viewer via HTTP server; concept CRUD; bundle management |
| okf-tool | [ts-libraries.md](ecosystem-deep/ts-libraries.md) | Most comprehensive bundle API: CRUD, search, link graph, sub-index management, pluggable filesystem |
| @turbomem/okf | [ts-libraries.md](ecosystem-deep/ts-libraries.md) | Bridges OKF to embedded memory system for agents; parser + validator + writer |
| @sorane/okf | [ts-libraries.md](ecosystem-deep/ts-libraries.md) | Unique AI disclosure fields (IPTC digital source type, EU AI Act labeling); JSON Schema validation |
| okf-toolkit | [ts-libraries.md](ecosystem-deep/ts-libraries.md) | Only library with RAG chunking: heading-boundary + sentence splitting with overlap and per-chunk link attribution |
| Inkeep Open Knowledge | [specialized.md](ecosystem-deep/specialized.md) | `ok init`/`ok start`/`ok clone`/`ok sync` CLI; 21 MCP tools; agent skills system; 10+ agent integrations; starter packs |
| knowledge-template | [specialized.md](ecosystem-deep/specialized.md) | All 4 concept types with full frontmatter+body; evidence rules; status workflow; strict YAML quoting; OSP SPEC §5 |
| openknowledgeformat.com | [specialized.md](ecosystem-deep/specialized.md) | Browser validator: required/guidance/permissive rules; 7 template types; paste→validate flow |
| AgentFi | [specialized.md](ecosystem-deep/specialized.md) | llms.txt→OKF pipeline; 24-hour ship story |
| kb.duyet.net | [specialized.md](ecosystem-deep/specialized.md) | Developer KB with graph-based UI; Claude Code + Codex + OpenCode integration |
| OriginTrail DKG-OKF | [specialized.md](ecosystem-deep/specialized.md) | Deterministic mapping algorithm; CLI import/export/verify; memory tier lifecycle (WM→SWM→VM); on-chain proofs |
| W3C Holon DataBook | [specialized.md](ecosystem-deep/specialized.md) | OKF profile proposal; 6 frontmatter extensions; typed fenced blocks; Graph Store Protocol push; SHACL gating |
| okfgen | [specialized.md](ecosystem-deep/specialized.md) | LangChain + 5 providers; interactive shell; generate/update/validate/lint/view CLI; TypeScript API |
| @fastrag/okf | [specialized.md](ecosystem-deep/specialized.md) | Mechanical convert/validate/search/viewer CLI; Viewer Workbench; 3 agent skills (router/maintain/query) |

## Updated Gaps (from deep dives)

New gaps discovered beyond the original 10:

11. **No MCP validation server** — @copperbox/okf-mcp and caedora-mcp are the leading candidates, but neither wraps okflint. An MCP server that delegates to okflint and returns structured validation results would fill a clear gap.
12. **Quatrain/okf is a false positive** — Despite the npm name, @quatrain/okf is NOT related to OKF. The npm namespace is noisy.
13. **No kcagent in public repo** — The kcagent enrichment agent referenced in documentation does NOT exist in the public GoogleCloudPlatform/knowledge-catalog repository. This is a gap in Google's public tooling.
14. **@sorane/okf has AI governance fields** — Only library with IPTC digital source type and EU AI Act compliance labeling. No other library addresses AI disclosure or provenance labeling at the frontmatter level.
15. **okf-toolkit is the only RAG-aware library** — Heading-boundary + sentence splitting with overlap and per-chunk link attribution. If the skill suite needs RAG integration, this is the only library that handles OKF-specific chunking.

## Updated Most Relevant Projects

| Priority | Project | Why (updated) |
|----------|---------|---------------|
| **P0** | `okflint` (mattdav) | Gold-standard validator. 15 lint rules, profile system, wikilink resolution, JSON output. The CI gate. |
| **P0** | `rakibtg/okf-skill` | Existing agent skill with progressive disclosure architecture. 5 Python stdlib scripts. Best SKILL.md reference. |
| **P0** | `@equationalapplications/core-okf` | Most mature TS library (v4.22, zero-deps). If TypeScript tooling is needed, this is the foundation. |
| **P1** | `hermes-okf` | Reference architecture for OKF as agent memory — types, decorators, GitOKFBundle, session lifecycle. |
| **P1** | `@copperbox/okf-mcp` | Canonical MCP server (20+7 tools). Multi-bundle, cross-bundle edges, auto-fix registry. The MCP baseline. |
| **P1** | `fabricioctelles/skills` OKF skill | Alternative skill design — includes kcmd integration, conversion guides, bash validator. |
| **P1** | `OpenWiki` (LangChain) | Production-grade producer. Shows how OKF integrates with AGENTS.md/CLAUDE.md injection. |
| **P2** | `superops-team/okf` CLI | Git-aware bundle generation + lint. Complementary to okflint. |
| **P2** | `okapi-okf` | Most complete bundle visualization/editing tool — force-directed graph, CodeMirror editing, AI Q&A. |
| **P2** | `okforge` | Claude Code-specific OKF skill with Stop-hook. Reference for harness-specific skill design. |
| **P3** | `okf-toolkit` | Only RAG-aware OKF library. Relevant if skill suite needs semantic search. |
| **P3** | `signed-okf` | Trust layer for bundle provenance. Relevant if skill suite adds signing/verification. |
