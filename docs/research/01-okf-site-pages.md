# OKF Site Pages — Research Findings

> Date researched: 2026-07-25
> Base URL: https://okf.md
> Spec version referenced throughout: OKF v0.1 (Draft)

---

## Quickstart (/quickstart)

### Summary
A step-by-step walkthrough ("Your First OKF Bundle in 5 Minutes") building a SaaS metrics knowledge bundle with three concepts: MRR, Churn Rate, and NPS. Practical, tutorial-style, editorial voice.

### Normative Spec Requirements
1. Every `.md` file (except `index.md` and `log.md`) must have parseable YAML frontmatter
2. Every frontmatter must have a non-empty `type` field
3. `index.md` and `log.md` follow a defined structure (no frontmatter)
4. Recommended frontmatter: `title`, `description`, `tags`, `timestamp` — but not required for conformance

### Editorial Claims & Opinions
- "If `cat` works, OKF works." — No SDK, no schema registry, no build step required
- "The kind of thing an AI agent can read, navigate, and use to give you real answers"
- "No database, no API, no vendor lock-in. Knowledge stays as portable as a repo"
- "Actual time spent: probably under 5 minutes. If it took longer, blame your editor, not the format"
- NPS passives are "invisible. Like that colleague who never comments on code reviews"

### Bundle Definition
A folder with `.md` files. Each file is a **concept**. Every concept has YAML frontmatter with at least a `type` field. No SDK, no schema registry, no build step.

### Final Structure Example
```
saas-metrics/
├── index.md          ← lists what's in the bundle
├── log.md            ← change history
├── mrr.md            ← concept: Monthly Recurring Revenue
├── churn.md          ← concept: Churn Rate
└── nps.md            ← concept: Net Promoter Score
```
"Flat. No subfolders. For a small bundle, you don't need more."

### Concept Properties Illustrated
- **type:** `Metric`
- **title:** Human-readable name (e.g., "MRR — Monthly Recurring Revenue")
- **description:** Single-line summary
- **tags:** Array of strings `[revenue, saas, finance]`
- **timestamp:** ISO 8601 (e.g., `2026-06-13T10:00:00Z`)

### Cross-Linking Pattern
Relative links between concepts: `[churn](./churn.md)`, `[NPS](./nps.md)`. "That's the OKF knowledge graph."

### log.md Pattern
Most recent entries first, grouped by ISO 8601 date. Example:
```
## 2026-06-13
* **Creation**: Initial bundle with three core SaaS metrics.
```
Each entry links back to concepts: `[MRR](./mrr.md)`

### Validation Checklist
1. Every `.md` that isn't `index.md` or `log.md` has parseable YAML frontmatter
2. Every frontmatter has a `type` field filled in
3. `index.md` and `log.md` follow the structure defined in the spec

### Next Steps Suggested
- Add subfolders when bundle grows (`operational/`, `financial/`, `product/`)
- Put `resource:` in frontmatter when a metric has a real dashboard attached
- Version with git
- Run the validator at [okf.md/validator](https://okf.md/validator)

### External Links
- [SaaS Metrics 2.0 — David Skok](https://www.forentrepreneurs.com/saas-metrics-2/)
- What is Good SaaS Churn Rate — Lenny Rachitsky. The URL captured from the
  site returned 404 on 2026-07-26:
  `https://www.lennysnewsletter.com/p/what-is-good-retention-rate`
- [The One Number You Need to Grow — HBR](https://hbr.org/2003/12/the-one-number-you-need-to-grow)
- [GitHub repo](https://github.com/fabricioctelles/skills)

### Page Metadata
OKF v0.1 · 2026 · MIT licensed · Based on the Google Cloud Markdown spec · GitHub: github.com/fabricioctelles/skills

---

## Examples (/examples)

### Summary
Eight production-ready bundle examples with full file contents. Each demonstrates domain-specific `type` values, cross-linking patterns, and folder structures. Editorial tone (e.g., "A good bundle passes the 'new hire' test").

### Normative Patterns Demonstrated
- Every concept file has YAML frontmatter with `type`, `title`, `description`, `tags`, `timestamp`
- `resource:` field included as pointer to the actual thing (`repo://`, `dashboard://`, URLs)
- Cross-links use `[display text](/relative/path.md)` pattern
- Body uses structured content: headings, tables, code blocks
- `# Citations` section at end of each concept for external validation links
- Index files are flat lists with one line per item + description

### Editorial Claims & Opinions
- "A good bundle passes the 'new hire' test. Someone opens `index.md` and understands the domain in 30 seconds. If they need a guide to navigate it, the structure failed."
- "The SQL is the source of truth. No ambiguity about 'what counts as recurring' — the query answers it"
- "The error table is the highest-value section. 'What goes wrong and how to fix it' is exactly what an agent (or a frustrated developer at 2am) needs"
- "Body is structured. Headings, tables, code blocks. More structure = better retrieval by agents. Prose paragraphs are noise"
- "One concept per file. Never mix concerns"

### 8 Patterns Across All Bundles (Editorial)
1. `type` is domain-specific — no fixed list
2. Cross-links are generous — concepts form a graph, not just a folder
3. `index.md` is a map, not a junk drawer
4. Extra frontmatter fields are free (any additional key allowed)
5. `# Citations` at the end — external links for verification
6. Body is structured (headings, tables, code blocks)
7. One concept per file — never mix concerns
8. `resource` field anchors to reality — points to actual thing

### Individual Bundles Documented

#### 1. SaaS Application
- **Domain:** SaaS team documenting revenue metrics, subscriptions, operational playbooks
- **Types used:** `Metric`
- **Structure:**
  ```
  saas-app/
  ├── index.md
  ├── log.md
  ├── metrics/
  │   ├── index.md
  │   ├── monthly-recurring-revenue.md
  │   └── churn-rate.md
  ├── tables/
  │   ├── index.md
  │   └── subscriptions.md
  └── playbooks/
      ├── index.md
      └── revenue-review.md
  ```
- **Notable:** Uses `resource: dashboard://revenue/mrr` custom URI scheme, SQL examples inline

#### 2. Data Warehouse
- **Domain:** Data team documenting BigQuery tables, datasets, metrics
- **Types used:** `BigQuery Table`
- **Structure:**
  ```
  data-warehouse/
  ├── index.md
  ├── log.md
  ├── datasets/
  │   ├── index.md
  │   └── sales.md
  ├── tables/
  │   ├── index.md
  │   ├── orders.md
  │   └── customers.md
  └── metrics/
      ├── index.md
      └── gross-revenue.md
  ```
- **Notable:** Schema tables with column descriptions, FKs, SQL join examples, BigQuery console URLs as `resource`

#### 3. Laravel Application
- **Domain:** Dev team documenting models, routes, policies, jobs
- **Types used:** `Laravel Model`
- **Structure:**
  ```
  laravel-app/
  ├── index.md
  ├── log.md
  ├── models/
  │   ├── index.md
  │   └── user.md
  ├── routes/
  │   ├── index.md
  │   └── api-users.md
  ├── policies/
  │   ├── index.md
  │   └── user-policy.md
  └── jobs/
      ├── index.md
      └── sync-stripe-customer.md
  ```
- **Notable:** `resource: repo://app/Models/User.php` — points to codebase file; "Related" section weaves graph: model → policy → route → job (4 concepts, 8+ cross-links)

#### 4. WordPress Site
- **Domain:** WordPress custom post types, taxonomies, ACF fields, templates
- **Types used:** `WordPress Post Type`
- **Structure:**
  ```
  wordpress-site/
  ├── index.md
  ├── log.md
  ├── post-types/
  │   ├── index.md
  │   └── product.md
  ├── taxonomies/
  │   ├── index.md
  │   └── product-category.md
  ├── acf/
  │   ├── index.md
  │   └── product-fields.md
  └── templates/
      ├── index.md
      └── single-product.md
  ```
- **Notable:** `resource: wp-admin/edit.php?post_type=product` — admin URLs; "WordPress's content model is infamously scattered across CPTs, taxonomies, ACF groups, and template files. A single OKF bundle connects all four"

#### 5. API Documentation
- **Domain:** REST API with contextual knowledge beyond OpenAPI
- **Types used:** `API Endpoint`
- **Structure:**
  ```
  api-docs/
  ├── index.md
  ├── log.md
  ├── endpoints/
  │   ├── index.md
  │   ├── create-customer.md
  │   └── list-customers.md
  ├── schemas/
  │   ├── index.md
  │   └── customer.md
  └── errors/
      ├── index.md
      └── rate-limit.md
  ```
- **Notable:** Errors as first-class concepts with their own files; `resource: https://api.example.com/v1/customers`

#### 6. Company Knowledge
- **Domain:** Ops teams documenting teams, policies, systems, escalation playbooks
- **Types used:** `Policy`
- **Structure:**
  ```
  company-knowledge/
  ├── index.md
  ├── log.md
  ├── teams/
  │   ├── index.md
  │   └── support.md
  ├── policies/
  │   ├── index.md
  │   └── refunds.md
  ├── systems/
  │   ├── index.md
  │   └── billing.md
  └── playbooks/
      ├── index.md
      └── incident-response.md
  ```
- **Notable:** Decision matrix in table form — unambiguous rules for agents; `resource: docs://policies/refunds`; "This is the kind of doc that makes an AI support agent actually useful"

#### 7. AI Agent Context
- **Domain:** Bundle defining what an AI agent can do, tools it can use, boundaries
- **Types used:** `Constraint`
- **Structure:**
  ```
  ai-agent-context/
  ├── index.md
  ├── log.md
  ├── systems/
  │   ├── index.md
  │   └── billing.md
  ├── tools/
  │   ├── index.md
  │   └── stripe.md
  ├── playbooks/
  │   ├── index.md
  │   └── support-triage.md
  └── constraints/
      ├── index.md
      └── agent-safety-rules.md
  ```
- **Notable:** Meta-example — "an OKF bundle describing the agent's own operating boundaries"; Prohibited actions list; Escalation triggers; "No system prompt gymnastics. Just files it can `cat`"

#### 8. Astro Site
- **Domain:** Development team documenting Astro site's pages, components, content collections, integrations
- **Types used:** `Astro Page`, `Content Collection`
- **Structure:**
  ```
  astro-site/
  ├── index.md
  ├── log.md
  ├── pages/
  │   ├── index.md
  │   ├── docs-slug.md
  │   └── blog-index.md
  ├── components/
  │   ├── index.md
  │   └── header.md
  ├── collections/
  │   ├── index.md
  │   ├── docs.md
  │   └── blog.md
  └── integrations/
      ├── index.md
      ├── starlight.md
      └── sitemap.md
  ```
- **Notable:** Astro code examples inline; Zod schema definitions; `resource: repo://src/pages/docs/[...slug].astro`; Data flow explicitly described (collection → page → component)
- **External links:** [Astro routing docs](https://docs.astro.build/en/guides/routing/), [Astro content collections](https://docs.astro.build/en/guides/content-collections/)

---

## Tools (/tools)

### Summary
"Inventory of what exists today (Jun 2026) around the Open Knowledge Format." Organized into Google-maintained tools, community tools (6 categories), and emerging patterns. Maturity ratings: 🟢 Ready/GA/Released/Production, 🟡 PoC/Preview/Early/Functional. Page clearly marked as "v1.0 DRAFT, WORK IN PROGRESS — Last updated: July 2026."

### Google-Maintained Tools

#### 1. Reference Enrichment Agent (BigQuery → OKF Bundles)
- **Description:** Agent that pulls metadata from a pluggable source (currently only BigQuery) and emits OKF bundles
- **Two passes:**
  - BQ pass: Generates one OKF doc per concept using BigQuery metadata alone
  - Web pass: LLM (Gemini via ADK) crawls seed URLs, enriches/mints/skips pages
- **CLI flags:** `--source bq`, `--dataset`, `--web-seed`, `--web-seed-file`, `--web-max-pages`, `--web-allowed-host`, `--no-web`, `--out`
- **Stack:** Python 3.13, Google Agent Development Kit (ADK), Gemini
- **Sample bundles included:** `bundles/ga4/` (GA4 e-commerce), `bundles/stackoverflow/` (Stack Overflow public dataset), `bundles/crypto_bitcoin/` (Bitcoin blocks/transactions)
- **Link:** https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
- **Limitations:** BigQuery only source, requires Gemini API key or Vertex AI, web pass token-intensive, no incremental updates
- **Maturity:** 🟡 Functional proof of concept

#### 2. Static HTML Visualizer (viz.html)
- **Description:** `visualize` subcommand producing self-contained HTML file with interactive concept graph
- **Features:** Force-directed graph (Cytoscape.js), side panel with rendered frontmatter+markdown, navigable internal links, "Cited by" backlinks, search by title/ID/tags, alternative layouts (cose, concentric, breadthfirst, circle, grid)
- **Usage:** `.venv/bin/python -m enrichment_agent visualize --bundle ./bundles/ga4`
- **Link:** https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf#visualize
- **Limitations:** Large bundles produce heavy HTML, minimal SPA, depends on CDN for Cytoscape.js and marked.js
- **Maturity:** 🟢 Actually works

#### 3. kcmd CLI + MCP Server (Metadata as Code)
- **Description:** Bidirectional sync tool between local metadata (YAML/markdown) and Google Cloud Knowledge Catalog. "git for metadata"
- **Distribution claimed by page:** TypeScript library, standalone CLI, MCP server
- **Commands:** `kcmd init --bigquery-dataset`, `kcmd pull`, `kcmd status`, `kcmd push --dry-run`, `kcmd push`
- **Page claim:** MCP tools are `pull`, `push`, `list-entries`, `lookup-entry`, `modify-entry`
- **Primary-source correction (2026-07-26):** the current `mcp.ts` registers only `list-entries`, `lookup-entry`, and `modify-entry`; `pull` and `push` are CLI commands. The public npm registry has no `kcmd` package, so users must build this repository source.
- **Link:** https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode
- **Plug-in targets:** Gemini CLI / Google AI Studio, Claude Desktop (MCP config), Cursor / VS Code, Custom agents (LangChain, ADK)
- **Limitations:** Requires GCP project with Knowledge Catalog, `gcloud` auth only, format differs from pure OKF (Dataplex-oriented), sparse docs
- **Maturity (site editorial):** 🟡 Early product

#### 4. Google Cloud Knowledge Catalog (The Backend)
- **Description:** GCP product (formerly Dataplex) — AI-powered metadata catalog, "official backend"
- **OKF evidence:**
  - Repository demo maps a bounded OKF subset into a custom Dataplex aspect and back; it is not evidence of a generic full-fidelity product importer
  - Automatic harvesting from BigQuery, AlloyDB, Spanner, Cloud SQL, Firestore, Looker
  - Third-party integrations: Ab Initio, Anomalo, Atlan, Collibra, Datahub
  - Native Gemini enrichment
  - Sub-second semantic search
  - Context APIs + MCP tools
  - Data products (asset packaging with SLAs)
- **Pricing:** Free tier: 100 DCU-hour/month + 1 MiB storage + 1M API calls/month; Standard: $0.06/DCU-hour; Premium: $0.089/DCU-hour; Storage: $2/GiB/month
- **Link:** https://cloud.google.com/products/knowledge-catalog
- **Demo/reference:** https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode/demo
- **Limitations:** GCP vendor lock-in, pricing scales with DCU-hour usage, native format is NOT OKF (OKF is portable interop layer)
- **Maturity:** 🟢 GA Google Cloud product

#### 5. Possible Integrations (Google-identified gaps)

##### 5.1 Obsidian
- **Status:** No official plugin but deliberately compatible
- **Why it works:** Bundles are directories of `.md` with YAML frontmatter — Obsidian's native format; relative paths for links; frontmatter tags show natively
- **How to use:** Open bundle directory as vault in Obsidian
- **What a plugin would add:** Inline validation, templates for new concepts, sync with Knowledge Catalog via kcmd
- **Maturity:** 🟢 Natural compatibility

##### 5.2 GitHub Actions
- **Status:** No official Action published but every command is scriptable
- **Example workflows shown:** `okf-validate.yml` (validate on push/PR), `okf-enrich.yml` (scheduled enrichment → PR)
- **Maturity:** 🟡 High potential, zero official implementation

##### 5.3 Coding Agents (Claude, Codex, Cursor, Gemini)
- **Status:** No official skill published — "most obvious gap"
- **What exists:** OKF README as agent docs, SPEC.md readable enough for LLMs
- **What's missing:** Standalone `.md` skill, generation-time validation, reusable templates
- **Maturity:** 🟡 Clear opportunity

### Community Tools

#### Generators & Producers

##### AgentFitech
- Built OKF support (producer + consumer) within 24 hours of spec release
- **Link:** `https://medium.com/@AgentFitech/google-just-standardized-how-ai-agents-read-the-web-heres-how-we-shipped-it-in-a-day-6bbfd3024320`
  (Medium returned 403 to the automated link checker on 2026-07-26)
- **Takeaway:** Format simple enough for small team to go zero-to-conformant in one sprint
- **Maturity:** N/A (blog post)

##### kb.duyet.net
- Developer Duyet converted existing knowledge base to strict-conformant OKF
- **Link:** https://kb.duyet.net/m/tech-okf-open-knowledge-format
- **Takeaway:** Converting existing markdown docs to OKF is trivial — just add `type` to frontmatter

#### Standards & Profiles

##### W3C Holon CG (DataBook)
- **Description:** W3C Holon Community Group (30+ participants at inaugural meeting, June 19, 2026) proposing DataBook as formal OKF profile for semantic web
- **What DataBook adds:** IRI-based identity (`id:` field), version tracking and author provenance, typed fenced blocks carrying RDF (Turtle, JSON-LD), SPARQL, SHACL, push to SPARQL triplestore, SHACL validation gating deployment
- **Status:** Proposal stage, filing issue on OKF GitHub repo
- **Link:** https://ontologist.substack.com/p/the-format-convergence
- **Maturity:** 🟡 Proposal

#### Publishing & Visualization

##### Suganthan Web Converter
- **Description:** Paste URL/sitemap, crawls up to 100 pages, converts each to OKF with cross-links, returns zip. Visual graph shows orphan pages.
- **Link:** https://suganthan.com/free-seo-tools/okf-generator/
- **Maturity:** 🟡 Functional — works at page level, true concept extraction is harder next step

##### Suganthan WordPress Plugin
- **Description:** WordPress plugin serving OKF at `/okf/`. Watches publish/edit events, rebuilds bundle automatically. Dashboard shows internal link graph.
- **Features:** Posts/pages → OKF concepts; served at `yoursite.com/okf/` or `yoursite.com/?okf=index.md`; include/exclude by post type; GPL, free, open source, read-only
- **Requirements:** WordPress 6.0+, PHP 7.4+, pretty permalinks
- **Install:** Upload zip from https://uploads.suganthan.com/4AECBACE-open-knowledge-format.zip
- **Links:**
  - https://suganthan.com/blog/open-knowledge-format/
  - https://uploads.suganthan.com/4AECBACE-open-knowledge-format.zip
  - https://wordpress.org/plugins/search/open-knowledge-format/ (submitted, pending review)
- **Maturity:** 🟢 Ready

##### superops-team/okf CLI
- **Description:** Go CLI scanning git repos and generating OKF bundles from source code
- **Commands:** `okf init`, `okf hook -type post-commit`, `okf lint`, `okf search -q "query"`
- **Features:** Incremental updates via git hooks, built-in linter (13 rules), query engine (by type, tags, full-text)
- **Install:** `curl | bash` one-liner, `go install`, or pre-built binaries (Linux, macOS, Windows — amd64/arm64)
- **Stack:** Go, Apache 2.0, v1.2.0 (released Jun 16, 2026)
- **Install script:** https://raw.githubusercontent.com/superops-team/okf/main/scripts/install.sh
- **Link:** https://github.com/superops-team/okf
- **Maturity:** 🟢 Functional, released

##### Kiso (Publishing Engine)
- **Description:** Java CLI (Apache-2.0) turning OKF bundles into static websites for humans and AI. Two commands: `check` (validates), `build` (generates site). Automatically includes `llms.txt` and `sitemap.xml`.
- **Features:** GitHub Action for CI, DaisyUI themes, publishing profiles (`.kiso/<profile>/configuration.yaml`), multiple output configs from one bundle
- **Quick start:** `./kiso-cli check --source=my-bundle`, `./kiso-cli build --source=my-bundle --destination=public`
- **GitHub Action:** `oak-invest/kiso/applications/kiso-cli-action@v0.1.3`
- **Configuration:** `.kiso/configuration.yaml` — site metadata (baseUrl, language, title), theme (corporate), content ignore patterns
- **Stack:** Java, Apache-2.0, v0.1.5 (Jul 2026)
- **Links:** https://github.com/oak-invest/kiso · https://oak-invest.github.io/kiso/
- **Maturity:** 🟢 Released

#### Validators & Linters

##### okflint
- **Description:** Python deterministic linter (zero LLM) — "Ruff for documentation." Three-tier rule system.
- **Commands:** `okflint audit` (X-ray, always exit 0), `okflint validate` (CI gate, exit 0 or 1)
- **Three tiers:**
  - **OKF Core (§9):** Spec rules, non-negotiable → errors → exit 1 (F001, F002, R001, R002)
  - **Profile:** User's manifest rules → errors → exit 1 (F101–F106, S101–S102)
  - **Hygiene:** Opt-in, stricter → warnings → exit 0 (L001–L003, S201, R201, F201)
- **Manifest:** `okf-base.yaml` for team-specific rules (e.g., "every ADR needs a `created` field", "status can only be draft/prod/obsolete")
- **Obsidian support:** Resolves `[[wikilinks]]` against entire vault
- **Install:** `uv tool install okflint` or `pip install okflint`
- **CI example:** `pip install okflint && okflint validate --manifest docs/okf-base.yaml docs/`
- **Stats:** 18 documented rules, JSON output for pipeline parsing
- **Stack:** Python 3.12+, MIT, v0.1.0 (released Jun 27, 2026)
- **Links:** https://github.com/mattdav/okflint · https://pypi.org/project/okflint/ · https://mattdav.github.io/okflint/
- **Author:** mattdav (https://github.com/mattdav)
- **Relationship to superops-team/okf:** Complementary — Go CLI generates, okflint validates
- **Maturity:** 🟢 Released

##### openknowledgeformat.com
- **Description:** Browser-based validator — paste YAML frontmatter for instant validation. Also has starter templates and interactive examples.
- **Link:** https://openknowledgeformat.com/
- **Maturity:** 🟢 Ready to use today

#### Trust & Provenance

##### signed-okf (DynamicFeed)
- **Site description:** Cryptographic signatures with optional OriginTrail
  anchoring.
- **Primary-source correction:** `signed-okf` implements Ed25519/JWKS signing
  and verification only; its repository contains no OriginTrail integration.
- **Commands:** `signed-okf sign`, `signed-okf verify`, `signed-okf anchor`
- **Stack:** Python, Apache 2.0, v0.2.1 (Jul 2026)
- **Links:** https://github.com/dynamicfeed/signed-okf · https://dynamicfeed.ai
- **Maturity:** 🟡 Early but solving real gap

#### Agent Memory & Skills

##### hermes-okf
- **Description:** Filesystem-based memory system storing agent decisions, observations, context, plans as OKF concept files
- **Types:** decisions, observations, context, plans — cross-linked with internal references
- **Usage:** `pip install hermes-okf`, `hermes-okf init --project my-app`, `MemoryStore("./memory/")`
- **Stack:** Python, MIT, v0.4.4 (Jul 2026)
- **Links:** https://github.com/EliaszDev/hermes-okf · https://pypi.org/project/hermes-okf/
- **Maturity:** 🟡 Functional, niche audience

##### LangChain OpenWiki 0.2
- **Description:** Reads codebase, generates structured wiki in OKF format, wires into agent instruction files (CLAUDE.md, .cursorrules, AGENTS.md)
- **Commands:** `pip install openwiki`, `openwiki init --path .`, `openwiki sync`, `openwiki wire --target claude,cursor`
- **Stack:** Python, MIT, v0.2 (Jul 2026)
- **Links:** https://github.com/langchain-ai/openwiki · https://www.langchain.com/blog/openwiki-0-2-adds-okf-support
- **Quote:** Harrison Chase: "there needs to be an OPEN standard for memory. OKF is one such standard" (@hwchase17, Jul 16)
- **Maturity:** 🟢 Production-ready

##### Inkeep Open Knowledge
- **Description:** Documentation editor built for LLM era. `okf` starter pack generates conformant OKF knowledge base from first commit.
- **Features:** Live frontmatter validation, internal link resolution, concept graph sidebar
- **Usage:** `npx create-open-knowledge my-kb --template okf && npm run dev`
- **Stack:** TypeScript/React, MIT, v0.9 (Jul 2026)
- **Links:** https://github.com/inkeep/open-knowledge · https://open-knowledge-docs.preview.inkeep.com
- **Maturity:** 🟡 Promising, pre-1.0

##### knowledge-template (Open Science)
- **Description:** Conformant empty OKF bundle for scientific knowledge management. One annotated example per concept type (hypothesis, method, dataset, finding, review).
- **Conformance target:** OKF v0.1 core + Open Science Pillars requirements from SPECIFICATION.md §5
- **Usage:** `gh repo create my-research-kb --template open-science-pillars/knowledge-template`
- **Stack:** Markdown (no runtime), CC-BY-4.0, v1.0 (Jul 3, 2026)
- **Link:** https://github.com/open-science-pillars/knowledge-template
- **Maturity:** 🟢 Ready to use

##### OriginTrail DKG + OKF
- **Description:** Connects OKF bundles to OriginTrail Decentralized Knowledge Graph for on-chain provenance and trust verification
- **Stack:** TypeScript, MIT, v0.1 (Jul 2026)
- **Link:** `https://blog.prototypr.io/googles-okf-comes-to-the-origintrail-dkg-a-memory-ai-agents-can-trust-43c6d87e1de8`
  (Prototypr returned 403 to automated link checking on 2026-07-26)
- **Maturity:** 🟡 Concept proven, not production-hardened

##### okf-skill (rakibtg)
- **Description:** Single markdown file acting as Agent Skill for Claude Code, Cursor, Hermes — teaches agents to produce/consume OKF bundles
- **Usage:** `git clone https://github.com/rakibtg/okf-skill .agents/skills/okf-skill`
- **Stack:** Markdown (Agent Skill), MIT, v1.0 (2026)
- **Link:** https://github.com/rakibtg/okf-skill
- **Maturity:** 🟡 Works, scope is narrow

##### leadcraft
- **Description:** Analyzes repository, generates OKF v0.1 conformant Knowledge Bundles
- **Usage:** Clone and run against repo
- **Link:** https://github.com/dskst/leadcraft
- **Maturity:** 🟡 Early stage, limited docs

##### pi-openwiki (IBM PI)
- **Description:** LangChain OpenWiki ported to PI (IBM) harness — generates and maintains codebase docs using Pi's AI
- **Link:** https://github.com/barvhaim/pi-openwiki
- **Stack:** Python, v0.1 (Jul 2026)
- **Maturity:** 🟡 Fresh port, narrow audience

### Emerging Patterns (Not Yet Tools)

1. **OKF + llms.txt Discovery:** Speculation that `llms.txt` will point agents to OKF bundles. No official mechanism. Pattern would be a `## Knowledge Bundle` section in llms.txt linking to `/knowledge/index.md`. Status: speculation (Marie Haynes, StartupHub).

2. **OKF Marketplace / Bundle Commerce:** Marie Haynes speculates OKF bundles will become sellable products. Status: pure speculation.

3. **OKF + Obsidian as IDE:** Karpathy's framing: "Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase." Status: working pattern, no dedicated plugin but zero friction.

### Two-Layer Architecture (Editorial Claim)
1. **Portable layer (pure OKF):** Format spec + enrichment agent + visualizer. Works standalone, no GCP. Where community opportunities live.
2. **Enterprise layer (Knowledge Catalog):** kcmd + catalog enrichment + GCP product. Works in production, demands Google Cloud infrastructure.

---

## Ecosystem Map (/ecosystem-map)

### Summary
Visual map plotting tools on maturity-vs-ease-of-use axes. Table of all tools with maturity, readiness, and target audience. Timeline of events. "What's Missing" gap list.

### Maturity Table (COMPLETE)

| Tool | Maturity | Works today? | Who's it for? |
|------|----------|-------------|---------------|
| Enrichment Agent (OKF) | 🟡 Functional PoC | Yes, with setup | Data engineers exploring |
| Visualizer (viz.html) | 🟢 Ready | Yes | Anyone with a bundle |
| kcmd (Metadata as Code) | 🟡 Early product | Yes, with GCP | Teams using Knowledge Catalog |
| Knowledge Catalog (GCP) | 🟢 GA | Yes | Enterprise |
| Obsidian | 🟢 Native | Yes | Anyone |
| GitHub Actions | 🟡 DIY | Scriptable | DevOps/SRE |
| MCP Server (kcmd) | 🟢 Functional | Yes | Agent builders |
| WordPress Plugin | 🟢 Ready | Yes | WP site owners |
| okf CLI (superops-team) | 🟢 Released | Yes | Devs with Git repos |
| okflint (linter) | 🟢 Released | Yes | Devs/CI pipelines |
| Kiso (publishing engine) | 🟢 Released | Yes | Anyone who wants a site from a bundle |
| LangChain OpenWiki 0.2 | 🟢 Production | Yes | Devs who want agent-readable codebase docs |
| signed-okf (DynamicFeed) | 🟡 Early | Yes | Teams needing verifiable provenance |
| hermes-okf | 🟡 Functional | Yes | Hermes Agent users |
| Inkeep Open Knowledge | 🟡 Preview | Yes | Teams starting fresh knowledge bases |
| knowledge-template (Open Science) | 🟢 Ready | Yes | Researchers / academia |
| OriginTrail DKG + OKF | 🟡 Concept | Partially | Web3 / trust-critical use cases |
| openknowledgeformat.com | 🟢 Ready | Yes | Anyone (browser-based) |
| okf-skill (rakibtg) | 🟡 Functional | Yes | Agent builders |
| leadcraft | 🟡 Early | Partially | Devs wanting auto-generated bundles |
| pi-openwiki | 🟡 Fresh port | Yes (with PI) | IBM PI ecosystem users |
| Coding Agent Skills | 🟡 Partially filled | Yes | See okf-skill |

### Timeline

| Date | Event | Layer |
|------|-------|-------|
| Apr 2026 | Karpathy publishes LLM Wiki gist | Community |
| Jun 12, 2026 | OKF v0.1 spec published | Portable |
| Jun 12, 2026 | Enrichment agent + viz.html shipped | Portable |
| Jun 12, 2026 | Knowledge Catalog OKF ingestion | Enterprise |
| Jun 12, 2026 | kcmd CLI + MCP server | Enterprise |
| Jun 13–14 | First independent implementations | Community |
| Jun 15 | Search Engine Journal coverage | Community |
| Jun 19 | W3C Holon CG inaugural meeting | Community |
| Jun 23 | Ontologist "Format Convergence" — DataBook profile proposed | Community |
| Jun 27 | okflint v0.1.0 released | Community |
| Jul 11 | Kiso v0.1.5 — publishing engine | Community |
| Jun 14 | hermes-okf v0.4.4 on PyPI | Community |
| Jun 20 | signed-okf published (DynamicFeed) | Community |
| Jul 3 | open-science-pillars/knowledge-template | Community |
| Jul 4 | OriginTrail DKG + OKF integration announced | Community |
| Jul 7 | Inkeep Open Knowledge with OKF starter pack | Community |
| Jul 13 | openknowledgeformat.com validator + templates | Community |
| Jul 14 | LangChain OpenWiki 0.2 with native OKF support | Community |
| Jul 16 | @hwchase17 announces OKF as "open standard for memory" | Community |

### Gap Analysis — "What's Missing"

| Gap | Who should build it | Difficulty |
|-----|-------------------|------------|
| Snowflake/Databricks producer | Data platform teams | Medium |
| PostgreSQL/MySQL producer | Any backend dev | Low |
| Obsidian plugin (validation + templates) | Plugin devs | Low |
| VS Code extension (lint + preview) | Extension devs | Medium |
| Public bundle registry/gallery | Community | Medium |
| OKF → schema.org/JSON-LD bridge | SEO tools | Medium |
| Multi-source enrichment (beyond BQ) | Google or community | High |

---

## FAQ (/faq)

### Summary
"Frequently asked questions, answered by a human who's read the spec more times than is probably healthy." 23 Q&A pairs. Mixture of normative answers and clearly marked editorial opinions. Strong editorial voice throughout.

### Normative Claims

**Q: What is OKF?**
- A folder of Markdown files representing what your organization knows
- Each `.md` is a "concept" with YAML frontmatter (at least `type`)
- Structure is hierarchical and git-friendly
- Three mandatory rules: (1) `.md` files except `index.md`/`log.md` need parseable YAML frontmatter, (2) non-empty `type` field, (3) reserved files follow defined structure

**Q: Who created OKF?**
- Sam McVeety and Amir Hormati (Tech Leads, Data Analytics Engineering, Google Cloud)
- Announced June 12, 2026 via [Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)
- Published under Apache 2.0 in GoogleCloudPlatform/knowledge-catalog repo
- Born inside Knowledge Catalog (formerly Dataplex), but spec is vendor-neutral
- Current version: 0.1 (Draft)

**Q: What's the "LLM Wiki" pattern?**
- OKF formalizes the idea of giving AI agents a shared markdown library
- Andrej Karpathy's [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): "LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass"
- Same idea appears as Obsidian vaults wired to coding agents, AGENTS.md/CLAUDE.md, repos full of index.md and log.md, "metadata as code" in data teams
- OKF is the "missing interoperability layer" — pins down minimal conventions so wikis from different producers can be consumed by different agents

**Q: Do I need an SDK?**
- No. "If you need an SDK to write Markdown files, we have bigger problems to discuss"
- To produce: text editor. To consume: eyes. To validate: check 3 rules.
- Tooling exists but none required

**Q: How is it different from AGENTS.md?**
- AGENTS.md = "Here's how to act" (one repo, coding agents)
- OKF = "Here's what we know" (all org knowledge, any agent or human)
- Complementary — AGENTS.md can say "check OKF bundle at /knowledge"

**Q: How does it compare to Obsidian?**
- Same DNA (Markdown + frontmatter + links), different species
- Obsidian = personal knowledge tool (wikilinks, graph view, plugins, one human)
- OKF = interchange spec (standard markdown links, mandatory `type`, reserved files, programmatic consumption)
- Can edit OKF bundles in Obsidian — coexist peacefully

**Q: What about DESIGN.md?**
- DESIGN.md is a document. OKF is a format.
- Converted DESIGN.md → one concept in a bundle (maybe `type: Architecture Decision`)
- "OKF is the container; DESIGN.md is something that lives inside it"

**Q: Does it work with Claude/GPT/Gemini?**
- Yes, all of them. Any LLM that can read text handles OKF natively
- Claude/Cursor: drop bundle in project context
- GPT/ChatGPT: upload .md files or ZIP
- Gemini: natural fit via Knowledge Catalog, works standalone
- Any MCP agent: serve as resource
- "Model agnosticism is a foundational requirement of the spec"

**Q: How do I validate a bundle?**
- Check 3 things (same as spec)
- Bash one-liner provided: `for f in $(find ./bundle -name "*.md" ! -name "index.md" ! -name "log.md"); do head -50 "$f" | grep -q "^type:" || echo "FAIL: $f missing type"; done`
- Client-side validator at /validator

**Q: Will OKF replace data catalogs?**
- No — explicitly listed as non-goal in spec
- Catalogs = platforms (UI, API, governance, lineage, permissions)
- OKF = export/exchange format
- "Different layers, complementary roles"

**Q: Is it only for BigQuery?**
- Examples use BigQuery because that's where it was born. Format doesn't care.
- `type` field is free-form: PostgreSQL Table, API Endpoint, Runbook, "Your Mom's Recipe — technically valid"
- `resource` field is generic URI — Grafana, Snowflake, Confluence, whatever
- "OKF documents any organizational knowledge, not just data assets"

**Q: How do I contribute?**
- Repo: https://github.com/GoogleCloudPlatform/knowledge-catalog
- Open issues, submit PRs, contribute examples in `samples/` and `toolbox/`
- License: Apache 2.0
- v0.1 Draft — "best possible time to shape where it goes"
- CONTRIBUTING.md in repo

**Q: Do I need a backend?**
- No. Bundle = folder of `.md` files
- Static file server, git, ZIP — all work
- Validator runs client-side in browser
- "Zero databases, zero APIs, zero infra"
- "Refreshingly boring technology"

**Q: Does it work with git?**
- Works "beautifully" with git — recommended distribution method
- Markdown = clean diffs, commit history = who changed what, branches = knowledge PRs
- `log.md` slightly redundant with git but exists for when bundles travel without VCS history
- "Organizational knowledge managed with the same practices we already use for code"

**Q: Does OKF help with SEO?**
- No — Google explicit: OKF is not a search ranking signal
- For SEO: schema.org (structured data), llms.txt (AI crawlers), clean content
- OKF = internal agent knowledge, private by default, search engines never see it
- "Don't confuse 'made by Google' with 'helps you rank on Google'"

**Q: How does OKF work with MCP?**
- Site claim: `kcmd` is an MCP server with five tools. Source correction:
  `mcp.ts` registers `list-entries`, `lookup-entry`, and `modify-entry`;
  `pull`/`push` are CLI commands.
- Any MCP server can expose OKF bundle as resources (serve as `resource://` URIs)
- "MCP + OKF is the cleanest integration path"
- MCP config example provided
- "It just works because both sides agreed that 'files with frontmatter' is a perfectly good data format"

**Q: Does OKF replace RAG?**
- No — changes what RAG has to work for
- Known facts → OKF (direct read, no embedding, no hallucination risk)
- Dynamic queries → RAG (embedding + search + re-rank)
- Karpathy framing: "build the knowledge artifact once and read it directly"
- Comparison table: OKF = zero latency, exact accuracy, update .md; RAG = embedding+search+re-rank, probabilistic accuracy, re-embed
- "OKF handles the 'known knowns.' RAG handles the 'I know it's somewhere.' Use both"

**Q: OKF vs knowledge graph?**
- OKF = implicitly a graph (prose with links)
- Knowledge graph = formally a graph (typed triples, SPARQL/Cypher/Gremlin, ontology, graph DB)
- OKF is graph-adjacent — concepts link, but no formal querying without DataBook profile
- "If you need formal reasoning, build a knowledge graph. If you need 'give my agent context,' OKF is simpler"
- Many teams will do both: OKF as authoring layer, KG as inference layer

**Q: OKF vs llms.txt vs schema.org?**
- Three specs, three jobs, zero conflict
- schema.org: search engines, embedded in HTML, rich results/knowledge panels, JSON-LD/Microdata, public/indexable
- llms.txt: AI crawlers, public file at site root, navigation map, markdown URL list, public/crawlable
- OKF: your agents, internal bundle, canonical organizational truth, markdown with YAML frontmatter, private by default
- "They stack, they don't compete"
- llms.txt can link to a public OKF bundle; schema.org can describe assets documented in OKF

### Editorial/Opinion Claims (explicitly marked)

**Q: What's the future of OKF?**
- ⚠️ Marked "Opinion — speculation ahead, not confirmed roadmap"
- "It's v0.1 Draft. Google Cloud is testing the waters"
- Short term likely: Knowledge Catalog integration, official CLI/validator, MCP support
- Medium term: other providers adopt, enrichment agents, public bundle registry
- Author's bet: "OKF could become the 'Markdown of organizational knowledge'"
- Risk: "if Google doesn't push cross-cloud adoption, it joins the graveyard of Google formats"
- Practical advice: "just start using it. The cost is literally zero"

**Q: Can I sell OKF bundles?**
- Apache 2.0 governs the *spec*, not what you produce
- Feasible: lawyers (case-law bundles), SEOs (keyword knowledge), data teams (curated domain models), analysts (structured research)
- Missing: registry, licensing convention, discovery layer
- Author's take: "someone will build 'npm for OKF bundles' within a year"

**Q: How do agents discover my OKF?**
- No official discovery mechanism. Bundles explicitly loaded, not crawled.
- Common patterns: llms.txt, auth.md, `.well-known/okf` convention, MCP server card, direct path
- Author's take: "discovery will probably converge on llms.txt for public bundles and MCP manifests for private ones"
- "This is a feature, not a bug. You want to control which agents get which knowledge"

**Q: What's the W3C doing with OKF?**
- "My take: This is how OKF avoids becoming another Google-only format. W3C engagement signals long-term commitment to open governance"
- "Whether most teams will need RDF/SPARQL is another question — but having the bridge ready matters for enterprise adoption"

**Q: What if Google abandons OKF?**
- "Honest answer: it's a real risk. Google's product graveyard is famous for a reason"
- Risk factors: single-vendor origin, Google track record (AMP), v0.1 could stall
- Mitigating factors: Apache 2.0 (anyone can fork), just Markdown files (zero proprietary tooling), W3C Holon CG (independent governance), cost zero in/out
- "Even if Google walks away tomorrow, your OKF bundles are still a folder of well-organized Markdown with YAML frontmatter"
- "The real question isn't 'what if they abandon it?' — it's 'is the format useful enough that the community maintains it independently?' Given that it's literally just Markdown conventions… yes"

**Q: More questions?**
- Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- Reference site: https://okf.md
- Validator: "coming soon"

---

## Validator (/validator)

### Summary
"Coming Soon" page for a browser-based OKF bundle validator. Not yet launched as of research date.

### Key Claims
- "Validate your OKF bundle in seconds. Zero backend"
- Paste markdown or upload ZIP — checks all 3 OKF conformance rules client-side
- "nothing leaves your browser"

### Features Advertised
1. **Paste & validate:** Paste frontmatter or full files directly
2. **Upload a bundle:** Drop a ZIP, validate entire bundle at once
3. **Get a badge:** Generate SVG conformance badge for README

### Example Output (mockup)
```
✓ All .md files have YAML frontmatter
✓ All frontmatter has non-empty 'type' field
✓ index.md and log.md follow structure rules

PASS — bundle is OKF v0.1 conformant
```

### Call to Action
"Want to know when it launches? [Star on GitHub to follow](https://github.com/fabricioctelles/skills)"

### Editorial Note
"Meanwhile, you can validate manually with the
[3 rules in the quickstart](https://okf.md/quickstart)"

---

## Skill (/skill)

### Summary
"OKF Skill — Install & Use" page documenting an agent skill that teaches coding agents (Claude, Codex, Cursor, Kiro, Windsurf) to create, validate, and enrich OKF bundles.

### Installation Methods

#### Claude Code / Kiro CLI
```
npx skills add fabricioctelles/skills/okf-open-knowledge-format
```
Or manual:
```
git clone https://github.com/fabricioctelles/skills.git ~/.skills
```
Settings config:
```
{
  "skills": ["~/.skills/skills/okf-open-knowledge-format/SKILL.md"]
}
```

#### Cursor / Windsurf
Add to project rules/instructions:
```
Read and follow: https://raw.githubusercontent.com/fabricioctelles/skills/main/skills/okf-open-knowledge-format/SKILL.md
```

#### Direct Reference (any agent)
```
https://raw.githubusercontent.com/fabricioctelles/skills/main/skills/okf-open-knowledge-format/SKILL.md
```

### Capabilities Table

| Capability | Description |
|------------|-------------|
| Create | Generate conformant OKF bundles from scratch |
| Validate | Check the 3 conformance rules, report errors and warnings |
| Enrich | Add schema, citations, cross-links, fill recommended fields |
| Generate | Auto-create index.md and log.md files |
| Convert | Transform Notion exports, Obsidian vaults, or CSVs into OKF |
| Serve | Push bundles to Google Cloud Knowledge Catalog via kcmd CLI/MCP |

### Usage Examples
- **Create:** `"Create an OKF bundle documenting our API endpoints: /users, /orders, /payments"`
- **Validate:** `"Validate this folder against OKF spec"`
- **Convert:** `"Convert my Obsidian vault at ./knowledge/ to OKF format"` — converts wikilinks to standard links, ensures `type` fields exist, generates index/log

### Included Resources (bundled with skill)
| File | Content |
|------|---------|
| `references/spec-v01.md` | Full OKF v0.1 spec (451 lines) |
| `references/examples.md` | 3 complete example bundles |
| `references/conversion.md` | Conversion guides (Notion, Obsidian, CSV) |
| `scripts/validate.sh` | Bash validator script (zero dependencies) |

### validate.sh Script
```
chmod +x scripts/validate.sh
./scripts/validate.sh ./my-bundle/
```
Output:
```
✅ Bundle is OKF v0.1 conformant
⚠️  2 warning(s)
```

### Knowledge Catalog Integration
- Skill claims a direct OKF-to-Knowledge-Catalog workflow. Current source
  supports `kcmd init/push` for catalog snapshots plus a separate demo adapter;
  it does not establish a generic direct push for arbitrary OKF bundles.
- Guides through `kcmd init`, `kcmd push`, MCP server setup
- Lists five kcmd MCP tools, but current source registers only
  `list-entries`, `lookup-entry`, and `modify-entry`

### Links
- Skill source: https://github.com/fabricioctelles/skills/tree/main/skills/okf-open-knowledge-format
- OKF Spec v0.1: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- What are Agent Skills?: https://agentskills.io/what-are-skills.md

---

## Cross-Cutting Observations

### Site Architecture
- Built with a doc framework (search bar with keyboard nav, "On this page" sidebar)
- Footer: OKF v0.1 · 2026 · MIT licensed · "Based on the Google Cloud Markdown spec"
- GitHub link in footer: https://github.com/fabricioctelles/skills. The
  current public tree does not contain the deployed site source, so this is a
  destination/affiliation link, not proof that it is the site's source repo.

### Key GitHub Repositories Identified
1. **OKF Spec:** https://github.com/GoogleCloudPlatform/knowledge-catalog (Apache 2.0)
2. **Site-linked skills repository:** https://github.com/fabricioctelles/skills
   (deployed site source location unverified)
3. **kcmd/MCP:** https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode
4. **Enrichment agent:** https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
5. **okf CLI (Go):** https://github.com/superops-team/okf (Apache 2.0, v1.2.0)
6. **okflint:** https://github.com/mattdav/okflint (MIT)
7. **Kiso:** https://github.com/oak-invest/kiso (Apache-2.0)
8. **OpenWiki:** https://github.com/langchain-ai/openwiki (MIT)
9. **signed-okf:** https://github.com/dynamicfeed/signed-okf (Apache 2.0)
10. **hermes-okf:** https://github.com/EliaszDev/hermes-okf (MIT)
11. **Inkeep:** https://github.com/inkeep/open-knowledge (MIT)
12. **knowledge-template:** https://github.com/open-science-pillars/knowledge-template (CC-BY-4.0)
13. **okf-skill:** https://github.com/rakibtg/okf-skill (MIT)
14. **leadcraft:** https://github.com/dskst/leadcraft
15. **pi-openwiki:** https://github.com/barvhaim/pi-openwiki

### Key External Links
- Google Cloud Blog announcement: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
- Karpathy LLM Wiki gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- W3C/DataBook coverage: https://ontologist.substack.com/p/the-format-convergence
- AgentFitech Medium:
  `https://medium.com/@AgentFitech/google-just-standardized-how-ai-agents-read-the-web-heres-how-we-shipped-it-in-a-day-6bbfd3024320`
  (403 to automated link checking on 2026-07-26)
- kb.duyet.net: https://kb.duyet.net/m/tech-okf-open-knowledge-format
- Suganthan web converter: https://suganthan.com/free-seo-tools/okf-generator/
- Suganthan blog: https://suganthan.com/blog/open-knowledge-format/
- Suganthan WP plugin zip: https://uploads.suganthan.com/4AECBACE-open-knowledge-format.zip
- openknowledgeformat.com: https://openknowledgeformat.com/
- OriginTrail blog:
  `https://blog.prototypr.io/googles-okf-comes-to-the-origintrail-dkg-a-memory-ai-agents-can-trust-43c6d87e1de8`
  (403 to automated link checking on 2026-07-26)
- LangChain blog: https://www.langchain.com/blog/openwiki-0-2-adds-okf-support
- Agent Skills info: https://agentskills.io/what-are-skills.md

### Normative vs Editorial Classification
The okf.md site blends spec requirements with editorial commentary freely. However:
- **Normative Spec:** The 3 conformance rules, `type` field requirement, reserved file structure, YAML frontmatter requirement — repeated verbatim across Quickstart, FAQ, and Examples
- **Spec References:** SPEC.md, okf-base.yaml profiles, the 18 okflint rules
- **Editorial:** Everything else — including patterns described as "takeaway", maturity ratings, opinions on what should be built, the "Hot take" callouts, and all "My take"/"My bet" sections in FAQ
- The FAQ explicitly marks opinion sections with ⚠️ and phrases like "Opinion — speculation ahead" and "My read on what's likely"

### Version Status
OKF v0.1 is consistently described as "Draft" and "Early" throughout. Published June 12, 2026. Multiple places emphasize "the best possible time to shape where it goes" and "early, but usable today."
