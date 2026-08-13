# OKF Website — Complete Content Audit

## All Discovered Pages

Discovered via sitemap.xml, robots.txt, and navigation menus.

\* = Portuguese localization available (/privacidade/, /termos/, /validador/)

| URL | Title | Summary |
|-----|-------|---------|
| https://okf.md/ | Homepage | Landing page: "The open spec for knowledge that ships." Explains why OKF exists, shows bundle structure example, links to validator, skill, and quickstart. |
| https://okf.md/spec/ | Open Knowledge Format (OKF) — An Annotated Guide | Full spec v0.1 with commentary. 11 sections + 3 appendices. Covers motivation, terminology, bundle structure, concept documents, conformance rules. |
| https://okf.md/quickstart/ | Your First OKF Bundle in 5 Minutes | Step-by-step walkthrough building a SaaS metrics bundle (MRR, Churn, NPS). Creates 3 concepts + index.md + log.md. |
| https://okf.md/examples/ | OKF Bundle Examples | 8 full production-ready example bundles: SaaS App, Data Warehouse, Laravel App, WordPress Site, API Docs, Company Knowledge, AI Agent Context, Astro Site. |
| https://okf.md/tools/ | OKF Ecosystem Tools | Comprehensive inventory of 20+ tools: enrichment agent, visualizer, kcmd CLI, Knowledge Catalog, Obsidian integration, GitHub Actions, community tools, validators, publishing engines, trust layer, agent memory, skills. |
| https://okf.md/ecosystem-map/ | Ecosystem Map | Visual maturity × ease-of-use chart + maturity table for all tools + timeline from Apr 2026–Jul 2026 + "What's Missing" gap list. |
| https://okf.md/faq/ | FAQ | 22 questions answered: what OKF is, who created it, comparison with AGENTS.md/Obsidian/schema.org/llms.txt/Knowledge Graphs/RAG, validation, git, MCP integration, discovery, W3C involvement, future, commercial bundles. |
| https://okf.md/validator/ | Validator — Coming Soon | Client-side browser validator (not yet launched). Paste markdown or upload ZIP, checks 3 conformance rules. Links to GitHub to follow. |
| https://okf.md/skill/ | OKF Skill — Install & Use | Agent skill for Claude, Codex, Cursor, Kiro, Windsurf. Install via `npx skills add`, manual clone, or raw URL reference. 6 capabilities: Create, Validate, Enrich, Generate, Convert, Serve. |
| https://okf.md/terms/ | Terms of Use | MIT license for site content. OKF spec maintained by Google Cloud. As-is warranty. $0 liability. Governed by Brazilian law (São Paulo). |
| https://okf.md/privacy/ | Privacy Policy | Plausible Analytics (self-hosted, cookie-free) + Google Analytics 4 (anonymized). No personal data collected. 14-month GA4 retention. LGPD-compliant. |
| https://okf.md/privacidade/ * | Política de Privacidade (PT-BR) | Portuguese version of privacy policy. |
| https://okf.md/termos/ * | Termos de Uso (PT-BR) | Portuguese version of terms. |
| https://okf.md/validador/ * | Validador (PT-BR) | Portuguese version of validator page ("Em Breve" = Coming Soon). |

### Sitemap Summary

- **sitemap-index.xml** points to **sitemap-0.xml**
- **sitemap-0.xml** lists 14 URLs (English + Portuguese versions)
- **robots.txt**: All user-agents allowed. Content-Signal: `ai-train=yes, search=yes, ai-input=yes`. Explicitly allows GPTBot, ClaudeBot, PerplexityBot, GoogleOther, CCBot.

No hidden/undocumented pages discovered beyond the Portuguese localizations.

---

## Landing Page (https://okf.md/)

Slogan: **"The open spec for knowledge that ships."**

Core pitch: A directory of markdown files. YAML frontmatter. Three rules. That's the entire format.

Three key guarantees:
1. **One index, one truth** — Every bundle has an `index.md` that lists what's inside.
2. **Typed frontmatter** — Each file declares its `type` (concept, howto, reference, decision, metric).
3. **Git-native history** — Diff, branch, review knowledge like code. Semver protects your investment.

CTA buttons: "Read the Spec", "Build a Bundle", "Open Validator", "Install Skill", "Ship your first bundle in two minutes"

Footer: OKF v0.1 · 2026 · MIT licensed · Based on the Google Cloud Markdown spec

---

## Spec (/spec) — Full Specification v0.1

**Canonical v0.1 source snapshot:** [GoogleCloudPlatform/knowledge-catalog —
`okf/SPEC.md` at the June 12, 2026 commit](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/ee67a5ca27/okf/SPEC.md).
The `main` URL now serves v0.2.

The okf.md version is a **community annotated guide** based on v0.1, with
additional developer commentary (“opinions included”); it is not the canonical
Google-hosted specification.

### Structure (11 sections + 3 appendices):

1. **Motivation** — Readable, parseable, diffable, portable. Goals: universal format for enrichment agents, consumer agents, exchange, standardize required fields. Non-goals: fixed taxonomy, storage infrastructure, replacing domain schemas.

2. **Terminology** — Bundle, Concept, Concept ID (file path minus `.md`), Frontmatter, Body, Link, Citation.

3. **Bundle Structure** — Directory tree of markdown files. Reserved files: `index.md` (directory listing), `log.md` (update history). Distribution: git repo (recommended), tarball/zip, subdirectory. Tags are first-class but no separate tag format.

4. **Concept Documents** — UTF-8 markdown. Two parts: YAML frontmatter + markdown body.

   - **§4.1 Frontmatter** — Required: `type` only. Recommended:
     `title`, `description`, `resource`, `tags`, `timestamp`.
   - **§4.2 Body** — Standard Markdown; conventional headings include
     `# Schema`, `# Examples`, and `# Citations`.

5. **Cross-linking** — Absolute and relative Markdown links; broken links tolerated.

6. **Index Files** — Sections grouping linked concepts.

7. **Log Files** — Date-grouped entries; dates use `YYYY-MM-DD`.

8. **Citations** — Numbered list under `# Citations`.

9. **Conformance** — Three bundle rules: parseable frontmatter, non-empty
   `type`, and valid present reserved files. Consumer leniency is separate.

10. **Relationship to Other Formats** — Comparison with adjacent tools/formats.

11. **Versioning** — `<major>.<minor>` and optional root `okf_version`.

### Appendices:

- **A — Minimal Example Bundle** — Full file tree + sample files
- **B — Adoption Guide** — 5-step path: pick scope → create structure → write first concept → automate (CI check + index.md generator) → distribute (git push)
- **C — Design Opinions** — Critique: untyped links limiting, no body schema both strength/weakness, `resource` field underspecified, frontmatter-only validation is genius

### Three Design Principles:

1. **Minimally opinionated** — Only `type` is required. Everything else is up to the producer.
2. **Producer/consumer independence** — Clean separation. A bundle authored by a human can be consumed by an AI. A bundle generated by export can be browsed in a visualizer.
3. **Format, not platform** — Not tied to any cloud, database, model provider, or agent framework.

**Creators:** Sam McVeety & Amir Hormati, Tech Leads, Data Analytics Engineering, Google Cloud. Announced June 12, 2026. Published under Apache 2.0.

---

## Quickstart (/quickstart)

**"Your First OKF Bundle in 5 Minutes"**

Builds a `saas-metrics/` bundle documenting MRR, Churn Rate, and NPS.

### Bundle definition:
"A folder with `.md` files. Each file is a concept. Every concept has YAML frontmatter with at least a `type` field. Done. That's OKF."

### Final structure:
```
saas-metrics/
├── index.md
├── log.md
├── mrr.md
├── churn.md
└── nps.md
```

### Steps:

1. `mkdir saas-metrics && cd saas-metrics`
2. Create `mrr.md` — frontmatter with type:Metric, formula, variations table, cross-links to churn.md and nps.md, citations
3. Create `churn.md` — formulas for logo churn and revenue churn, benchmarks table by stage, cross-links
4. Create `nps.md` — formula, segmentation table (Promoters/Passives/Detractors), cross-links
5. Create `index.md` — simple list with links and descriptions
6. Create `log.md` — ISO 8601 date headers, entry list

### Quick validation (3 checks):
1. Every non-reserved `.md` has parseable YAML frontmatter
2. Every frontmatter has a `type` field
3. `index.md` and `log.md` follow defined structure

### Next steps suggested:
- Add subfolders (`operational/`, `financial/`, `product/`)
- Put `resource:` in frontmatter for dashboard-attached metrics
- Version with git
- Run the validator

### Key quote:
"Any agent that understands markdown + YAML can: list concepts via index.md, understand each concept's kind via type, navigate relationships via cross-links, check history via log.md."

---

## Examples (/examples)

"Eight production-ready bundles you can steal, adapt, and ship today."

**Quality heuristic:** "A good bundle passes the 'new hire' test. Someone opens `index.md` and understands the domain in 30 seconds."

### 1. SaaS Application
- **Scenario:** SaaS team documenting revenue metrics, subscriptions, operational playbooks
- **Structure:** `metrics/` (MRR, churn), `tables/` (subscriptions), `playbooks/` (revenue-review)
- **Key concept:** `metrics/monthly-recurring-revenue.md` — type:Metric, SQL as source of truth, cross-links

### 2. Data Warehouse
- **Scenario:** New analyst onboarding to BigQuery schema
- **Structure:** `datasets/` (sales), `tables/` (orders, customers), `metrics/` (gross-revenue)
- **Key concept:** `tables/orders.md` — type:BigQuery Table, full schema table, join docs, SQL examples

### 3. Laravel Application
- **Scenario:** Dev team documenting models, routes, policies, jobs
- **Structure:** `models/` (user), `routes/` (api-users), `policies/` (user-policy), `jobs/` (sync-stripe-customer)
- **Key concept:** `models/user.md` — type:Laravel Model, responsibilities, schema, relationships, cross-links to policy → route → job
- **Pattern:** `resource: repo://app/Models/User.php` — points to source file

### 4. WordPress Site
- **Scenario:** Freelancer inheriting site or agent understanding content architecture
- **Structure:** `post-types/` (product), `taxonomies/` (product-category), `acf/` (product-fields), `templates/` (single-product)
- **Key concept:** `post-types/product.md` — type:WordPress Post Type, connects all four WordPress abstraction layers

### 5. API Documentation
- **Scenario:** "What happens when you use it wrong" and "why does this endpoint exist" — not OpenAPI replacement
- **Structure:** `endpoints/` (create-customer, list-customers), `schemas/` (customer), `errors/` (rate-limit)
- **Key concept:** `endpoints/create-customer.md` — type:API Endpoint, request format, response codes, error table (highest-value section)

### 6. Company Knowledge
- **Scenario:** AI support agent answering refund questions, knowing who owns billing
- **Structure:** `teams/` (support), `policies/` (refunds), `systems/` (billing), `playbooks/` (incident-response)
- **Key concept:** `policies/refunds.md` — type:Policy, decision matrix (condition → action → approver), process steps, cross-links

### 7. AI Agent Context
- **Scenario:** An OKF bundle an agent reads about itself — what it can/cannot do
- **Structure:** `systems/`, `tools/` (stripe), `playbooks/` (support-triage), `constraints/` (agent-safety-rules)
- **Key concept:** `constraints/agent-safety-rules.md` — type:Constraint, 5 core rules, prohibited actions, escalation triggers

### 8. Astro Site
- **Scenario:** Developer documenting Astro site pages, components, collections, integrations
- **Structure:** `pages/` (docs-slug, blog-index), `components/` (header), `collections/` (docs, blog), `integrations/` (starlight, sitemap)
- **Key concept:** `pages/docs-slug.md` — type:Astro Page, routing, data flow, code example

### Eight Cross-Cutting Patterns:
1. `type` is domain-specific — no fixed list
2. Cross-links are generous — every bundle is a graph
3. `index.md` is a map, not a junk drawer
4. Extra frontmatter fields are free
5. `# Citations` at the end
6. Body is structured — headings, tables, code blocks
7. One concept per file
8. The `resource` field anchors to reality

---

## Tools (/tools)

"An honest inventory of what exists today (Jun 2026) around the Open Knowledge Format."

### 1. Reference Enrichment Agent (BigQuery → OKF Bundles)
- **Stack:** Python 3.13, Google ADK, Gemini
- **What it does:** Pulls metadata from BigQuery, emits OKF bundle. Web pass: LLM crawls seed URLs, enriches/mints/skips.
- **Sample bundles:** GA4 e-commerce, Stack Overflow, Bitcoin
- **Limitations:** BigQuery only, requires Gemini API key, web pass burns tokens, no incremental updates
- **Maturity:** 🟡 Functional PoC
- **Link:** [github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)

### 2. Static HTML Visualizer (viz.html)
- **What it does:** `visualize` subcommand → self-contained HTML with force-directed graph (Cytoscape.js), detail panel, search, filters, backlinks
- **Limitations:** Heavy at large scale (500+ concepts), CDN dependency for libraries
- **Maturity:** 🟢 Ready
- **Link:** Same repo as Enrichment Agent

### 3. kcmd CLI + MCP Server (Metadata as Code)
- **What it does:** Bidirectional sync between local filesystem and Google Cloud Knowledge Catalog. "Git for metadata."
- **Site claim:** TypeScript library, standalone CLI, MCP server; five MCP tools
- **Primary-source correction (2026-07-26):** `mcp.ts` registers three tools:
  `list-entries`, `lookup-entry`, and `modify-entry`. `pull` and `push` are CLI
  commands. No public npm package named `kcmd` was present when checked, so the
  repository package must be built from source.
- **Compatible with:** Gemini CLI, Claude Desktop, Cursor, any MCP agent
- **Maturity:** 🟡 Early product
- **Link:** [github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode)

### 4. Google Cloud Knowledge Catalog (The Backend)
- **What it is:** GCP product (formerly Dataplex). The repository contains a
  demo-specific OKF adapter; generic, full-field native ingestion is not
  established by that demo.
- **Features:** Auto-harvesting (BigQuery, AlloyDB, Spanner, Cloud SQL, Firestore, Looker), 3rd-party integrations, Gemini enrichment, semantic search, Context APIs, data products
- **Pricing:** Free tier (100 DCU-hour/mo + 1 MiB storage + 1M API calls). Standard: $0.06/DCU-hour. Premium: $0.089/DCU-hour. Storage: $2/GiB/month.
- **Maturity:** 🟢 GA
- **Link:** [cloud.google.com/products/knowledge-catalog](https://cloud.google.com/products/knowledge-catalog)

### 5. Possible Integrations

#### 5.1 Obsidian
- **Status:** No official plugin. Works natively (OKF = markdown + YAML). Open bundle as vault → graph view, tags, links all work.
- **Maturity:** 🟢 Native compatibility

#### 5.2 GitHub Actions
- **Status:** No official Action. Scriptable with example workflows (validate on PR, weekly enrichment).
- **Maturity:** 🟡 DIY

#### 5.3 Coding Agents (Claude, Codex, Cursor, Gemini)
- **Status:** No official skill published. OKF README + SPEC.md are readable by LLMs. Skill pattern used internally by toolbox.
- **Maturity:** 🟡 Clear opportunity

### 6. Community Tools

#### Generators & Producers
| Tool | Description | Maturity | Link |
|------|-------------|----------|------|
| AgentFitech | OKF producer + consumer, built in 24 hours | 🟡 Fast prototype | [medium.com/@AgentFitech](https://medium.com/@AgentFitech) |
| kb.duyet.net | Personal knowledge base converted to OKF | 🟢 Live | [kb.duyet.net](https://kb.duyet.net/m/tech-okf-open-knowledge-format) |

#### Standards & Profiles
| Tool | Description | Maturity | Link |
|------|-------------|----------|------|
| W3C Holon CG (DataBook) | OKF profile: IRI identity, RDF/SPARQL/SHACL | 🟡 Proposal | [The Ontologist](https://ontologist.substack.com/p/the-format-convergence) |

#### Publishing & Visualization
| Tool | Description | Maturity | Link |
|------|-------------|----------|------|
| Suganthan Web Converter | URL/sitemap → OKF bundle zip with visual graph | 🟡 Functional | [suganthan.com](https://suganthan.com/free-seo-tools/okf-generator/) |
| Suganthan WordPress Plugin | Auto-generates OKF from WP posts/pages at /okf/ | 🟢 Ready | [uploads.suganthan.com](https://uploads.suganthan.com/4AECBACE-open-knowledge-format.zip) |
| superops-team/okf CLI | Go CLI: `okf init/lint/search/hook` — git-aware bundle generator | 🟢 Released (v1.2.0) | [github.com/superops-team/okf](https://github.com/superops-team/okf) |

#### Validators & Linters
| Tool | Description | Maturity | Link |
|------|-------------|----------|------|
| okflint | Python linter: 3-tier system (Core/Profile/Hygiene), 18 rules, JSON output | 🟢 Released (v0.1.0) | [github.com/mattdav/okflint](https://github.com/mattdav/okflint) |
| Kiso | Java CLI publishing engine: `check` + `build` → static site + llms.txt + sitemap | 🟢 Released (v0.1.5) | [github.com/oak-invest/kiso](https://github.com/oak-invest/kiso) |
| OpenWiki 0.2 (LangChain) | Reads codebase → OKF wiki → wires into CLAUDE.md, .cursorrules, AGENTS.md | 🟢 Production | [github.com/langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) |

#### Trust & Provenance
| Tool | Description | Maturity | Link |
|------|-------------|----------|------|
| signed-okf (DynamicFeed) | Site claims signatures + OriginTrail anchoring; source implements Ed25519/JWKS only | 🟡 Early | [github.com/dynamicfeed/signed-okf](https://github.com/dynamicfeed/signed-okf) |

#### Agent Memory & Skills
| Tool | Description | Maturity | Link |
|------|-------------|----------|------|
| hermes-okf | Filesystem memory for HermesAgent as OKF concept files | 🟡 Functional | [github.com/EliaszDev/hermes-okf](https://github.com/EliaszDev/hermes-okf) |
| Inkeep Open Knowledge | Docs editor with OKF starter pack, frontmatter validation, concept graph | 🟡 Preview (v0.9) | [github.com/inkeep/open-knowledge](https://github.com/inkeep/open-knowledge) |
| knowledge-template (Science) | Conformant OKF template for scientific research (hypothesis, method, dataset, finding, review) | 🟢 Ready (v1.0) | [github.com/open-science-pillars/knowledge-template](https://github.com/open-science-pillars/knowledge-template) |
| OriginTrail DKG + OKF | OKF bundles as verifiable on-chain assets via DKG | 🟡 Concept | Prototypr blog URL captured; automated checker returned 403 |
| openknowledgeformat.com | Browser-based validator + starter templates | 🟢 Ready | [openknowledgeformat.com](https://openknowledgeformat.com/) |
| okf-skill (rakibtg) | Single SKILL.md for Claude Code/Cursor/Hermes agents | 🟡 Functional | [github.com/rakibtg/okf-skill](https://github.com/rakibtg/okf-skill) |
| leadcraft | Repo → OKF bundle generator | 🟡 Early | [github.com/dskst/leadcraft](https://github.com/dskst/leadcraft) |
| pi-openwiki | OpenWiki ported to IBM PI harness | 🟡 Fresh port | [github.com/barvhaim/pi-openwiki](https://github.com/barvhaim/pi-openwiki) |

### 7. Emerging Patterns (Not Yet Tools)
- **OKF + llms.txt Discovery** — speculation that llms.txt will point agents to OKF bundles (Marie Haynes, StartupHub)
- **OKF Marketplace / Bundle Commerce** — speculation that bundles become sellable products (lawyers, accountants, SEOs)
- **OKF + Obsidian as IDE** — Karpathy framing: "Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase."

### Two Layers:
1. **Portable layer (pure OKF):** Format spec + enrichment agent + visualizer. No GCP required.
2. **Enterprise layer (Knowledge Catalog):** kcmd + catalog enrichment + GCP product. Requires Google Cloud.

---

## Ecosystem Map (/ecosystem-map)

### Visual Map (Maturity × Ease of Use)

**Top-right (sweet spot):** Obsidian, viz.html, WP Plugin, okflint, okf CLI, MCP Server, GitHub Actions, Enrichment Agent, kcmd CLI, Knowledge Catalog, Agent Skills, Kiso, OpenWiki 0.2, signed-okf, hermes-okf, Inkeep, Science Template, OriginTrail DKG, okformat.com, okf-skill, leadcraft, pi-openwiki

### Maturity Table (complete)

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
| Kiso (publishing) | 🟢 Released | Yes | Anyone wanting a site from a bundle |
| OpenWiki 0.2 (LangChain) | 🟢 Production | Yes | Devs wanting agent-readable codebase docs |
| signed-okf (DynamicFeed) | 🟡 Early | Yes | Teams needing verifiable provenance |
| hermes-okf | 🟡 Functional | Yes | Hermes Agent users |
| Inkeep Open Knowledge | 🟡 Preview | Yes | Teams starting fresh knowledge bases |
| knowledge-template (Science) | 🟢 Ready | Yes | Researchers / academia |
| OriginTrail DKG + OKF | 🟡 Concept | Partially | Web3 / trust-critical use cases |
| openknowledgeformat.com | 🟢 Ready | Yes | Anyone (browser-based) |
| okf-skill (rakibtg) | 🟡 Functional | Yes | Agent builders |
| leadcraft | 🟡 Early | Partially | Devs wanting auto-generated bundles |
| pi-openwiki | 🟡 Fresh port | Yes (with PI) | IBM PI ecosystem users |
| Coding Agent Skills | 🟡 Partially filled | Yes | Agent builders |

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
| Jul 11 | Kiso v0.1.5 released | Community |
| Jun 14 | hermes-okf v0.4.4 published on PyPI | Community |
| Jun 20 | signed-okf published (DynamicFeed) | Community |
| Jul 3 | open-science-pillars/knowledge-template scaffold | Community |
| Jul 4 | OriginTrail DKG + OKF integration announced | Community |
| Jul 7 | Inkeep Open Knowledge with OKF starter pack | Community |
| Jul 13 | openknowledgeformat.com validator + templates live | Community |
| Jul 14 | LangChain OpenWiki 0.2 with native OKF support | Community |
| Jul 16 | @hwchase17 announces OKF as "open standard for memory" | Community |

### What's Missing (gap analysis)

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

22 questions answered:

1. **What is OKF?** — Folder of Markdown files with YAML frontmatter. Three conformance rules. That's it.

2. **Who created OKF?** — Sam McVeety & Amir Hormati (Google Cloud), announced June 12, 2026. Apache 2.0.

3. **What's the "LLM Wiki" pattern?** — OKF formalizes the pattern from Karpathy's LLM Wiki gist and GAINS.md/CLAUDE.md conventions. "OKF is the missing interoperability layer."

4. **Do I need an SDK?** — No. Text editor to produce, eyes to consume, 3 rules to validate.

5. **How is it different from AGENTS.md?** — AGENTS.md = behavior ("here's how to act"). OKF = knowledge ("here's what we know"). Friends, not competitors.

6. **How does it compare to Obsidian?** — Same DNA (Markdown + frontmatter), different species. Obsidian = personal tool. OKF = interchange spec. Uses standard links, not wikilinks.

7. **What about DESIGN.md?** — DESIGN.md is a document. OKF is a format. DESIGN.md becomes one concept in an OKF bundle.

8. **Does it work with Claude/GPT/Gemini?** — Yes, all of them. Model agnosticism is foundational.

9. **How do I validate a bundle?** — Check 3 rules. Bash one-liner provided. Browser validator at /validator.

10. **Will OKF replace data catalogs?** — No. Catalogs = platforms. OKF = exchange format. Complementary.

11. **Is it only for BigQuery?** — No. `type` field is free-form. Any organizational knowledge.

12. **How do I contribute?** — GitHub repo, issues/PRs, Apache 2.0.

13. **Do I need a backend?** — No. Pure filesystem. Zero databases, APIs, infra.

14. **Does it work with git?** — "Works beautifully." Clean diffs, commit history, PRs for knowledge changes.

15. **What's the future of OKF?** — Speculation: short-term (Knowledge Catalog integration, official CLI), medium-term (cross-provider adoption, registry). Risk: Google product graveyard.

16. **OKF vs llms.txt vs schema.org?** — Three specs, three jobs. schema.org = rich results. llms.txt = navigation for LLM crawlers. OKF = canonical source of organizational truth. They stack.

17. **Can I sell OKF bundles?** — Yes. Apache 2.0 governs the *spec*, not what you produce.

18. **How do agents discover my OKF?** — No official mechanism. Patterns: llms.txt, auth.md, .well-known/okf, MCP server card, direct path.

19. **Does OKF replace RAG?** — No. Known facts → OKF (direct read). Unknown/exploratory → RAG (retrieval). Complementary.

20. **What's the W3C doing with OKF?** — Holon CG (30+ participants). DataBook profile: IRI, RDF, SPARQL, SHACL. Optional layer.

21. **What if Google abandons OKF?** — Apache 2.0 → fork and maintain. Format is just Markdown files. W3C CG provides independent governance. "Worst-case scenario is 'you have good documentation.'"

22. **OKF vs knowledge graph?** — OKF = implicit graph (prose + links). KG = formal graph (typed triples, SPARQL). Complementary.

23. **Does OKF help with SEO?** — No. Not a search ranking signal. For SEO use schema.org + llms.txt.

24. **How does OKF work with MCP?** — The page says kcmd exposes five tools.
    Current source registers three (`list-entries`, `lookup-entry`,
    `modify-entry`); `pull` and `push` are CLI-only.

---

## Validator (/validator)

**Status: Coming Soon (not yet launched)**

### Features promised:
- **Paste & validate** — Paste frontmatter or full files directly in browser
- **Upload a bundle** — Drop a ZIP, validate entire bundle
- **Get a badge** — Generate SVG conformance badge for README
- **Client-side only** — Nothing leaves the browser. Zero backend.

### Example output shown:
```
✓ All .md files have YAML frontmatter
✓ All frontmatter has non-empty 'type' field
✓ index.md and log.md follow structure rules

PASS — bundle is OKF v0.1 conformant
```

### CTA: "Star on GitHub to follow" → links to [github.com/fabricioctelles/skills](https://github.com/fabricioctelles/skills)

### Alternative: Manual validation with the 3 rules, or the bash one-liner from FAQ.

### Portuguese version: /validador/ — identical content, titled "Em Breve" (Coming Soon).

---

## Skill (/skill)

**"OKF Skill — Install & Use"**

An agent skill that teaches coding agents (Claude, Codex, Cursor, Kiro, Windsurf) to create, validate, and enrich OKF bundles.

### Installation Methods

**Claude Code / Kiro CLI:**
```bash
npx skills add fabricioctelles/skills/okf-open-knowledge-format
```
Or manually:
```bash
git clone https://github.com/fabricioctelles/skills.git ~/.skills
```
Then add to `.claude/settings.json` or `AGENTS.md`:
```json
{"skills": ["~/.skills/skills/okf-open-knowledge-format/SKILL.md"]}
```

**Cursor / Windsurf:** Add to project rules:
```
Read and follow: https://raw.githubusercontent.com/fabricioctelles/skills/main/skills/okf-open-knowledge-format/SKILL.md
```

**Direct reference (any agent):**
```
https://raw.githubusercontent.com/fabricioctelles/skills/main/skills/okf-open-knowledge-format/SKILL.md
```

### Capabilities

| Capability | Description |
|------------|-------------|
| Create | Generate conformant OKF bundles from scratch |
| Validate | Check 3 conformance rules, report errors and warnings |
| Enrich | Add schema, citations, cross-links, fill recommended fields |
| Generate | Auto-create index.md and log.md files |
| Convert | Transform Notion exports, Obsidian vaults, or CSVs into OKF |
| Serve | Push bundles to Google Cloud Knowledge Catalog via kcmd CLI/MCP |

### Included Resources

| File | Content |
|------|---------|
| references/spec-v01.md | Full OKF v0.1 spec (451 lines) |
| references/examples.md | 3 complete example bundles |
| references/conversion.md | Conversion guides (Notion, Obsidian, CSV) |
| scripts/validate.sh | Bash validator script (zero dependencies) |

### The validate.sh script:
```bash
chmod +x scripts/validate.sh
./scripts/validate.sh ./my-bundle/
# Output: ✅ Bundle is OKF v0.1 conformant  / ⚠️ 2 warning(s)
```

### Knowledge Catalog Integration:
The skill describes pushing bundles via kcmd. Current source supports
`kcmd init/push` for catalog snapshots and a separate bounded OKF demo adapter,
not a generic arbitrary-field OKF push contract.

### Source repo:
[github.com/fabricioctelles/skills/tree/main/skills/okf-open-knowledge-format](https://github.com/fabricioctelles/skills/tree/main/skills/okf-open-knowledge-format)

---

## Site Infrastructure

### How the site is built:
- **Framework:** Astro (v7) with Starlight docs theme
- **Footer repository link:** [github.com/fabricioctelles/skills](https://github.com/fabricioctelles/skills)
- **Source caveat:** the current public tree of that repository contains the
  skills registry but no Astro application/page sources. The deployed site's
  source repository and hosting pipeline are therefore unverified.
- **Analytics:** Plausible Analytics (self-hosted in Brazil) + Google Analytics 4
- **Search:** Client-side search (⌘K bar) — likely Pagefind or similar
- **License:** MIT (site content), Apache 2.0 (repo)
- **Domain:** okf.md (primary), okf.ia.br (Brazilian domain)
- **Badges on repo:** Cloudflare, Astro, Coolify, Google Analytics, Google Search Console, Substack, SEO/GEO, AI Agents, LGPD/Privacy, Security
- **Number of commits:** 86 (as of last fetch)
- **Stars:** 36
- **Forks:** 3
- **SEO:** Google Search Console integrated
- **Content-Signal header:** `ai-train=yes, search=yes, ai-input=yes`
- **GDPR/LGPD Compliance:** Documented privacy policy, cookie-free Plausible, GA4 with IP anonymization

### Repo structure (relevant paths):
```
skills/
├── skills/
│   ├── okf-open-knowledge-format/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── spec-v01.md
│   │   │   ├── examples.md
│   │   │   └── conversion.md
│   │   └── scripts/
│   │       └── validate.sh
│   ├── (14 other skills)
├── README.md
├── LICENSE
├── skills-lock.json
├── skills.sh.json
└── og-image.png
```

The rendered pages are consistent with Astro/Starlight, but the assertion that
they are built from the public `fabricioctelles/skills` repository is not
supported by its current tree.

### Portuguese Localization:
- `/termos/` — Portuguese terms of use (Brazilian law, São Paulo jurisdiction)
- `/privacidade/` — Portuguese privacy policy (LGPD complaint)
- `/validador/` — Portuguese validator page

---

## All External Links

### Specification & Source
- [GoogleCloudPlatform/knowledge-catalog — okf/SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) — Official spec source
- [GoogleCloudPlatform/knowledge-catalog/tree/main/okf](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) — OKF tooling (enrichment agent, visualizer)
- [GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode) — kcmd CLI source
- [cloud.google.com/products/knowledge-catalog](https://cloud.google.com/products/knowledge-catalog) — GCP Knowledge Catalog product page
- [GitHub — fabricioctelles/skills](https://github.com/fabricioctelles/skills) — footer-linked agent skills repository; not verified as deployed site source

### Community Tools
- [github.com/superops-team/okf](https://github.com/superops-team/okf) — Go CLI for Git-based knowledge bases
- [github.com/mattdav/okflint](https://github.com/mattdav/okflint) — Python linter
- [mattdav.github.io/okflint/](https://mattdav.github.io/okflint/) — okflint API docs
- [pypi.org/project/okflint/](https://pypi.org/project/okflint/) — okflint on PyPI
- [github.com/oak-invest/kiso](https://github.com/oak-invest/kiso) — Java publishing engine
- [oak-invest.github.io/kiso/](https://oak-invest.github.io/kiso/) — Kiso website
- [github.com/langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) — OpenWiki 0.2
- [www.langchain.com/blog/openwiki-0-2-adds-okf-support](https://www.langchain.com/blog/openwiki-0-2-adds-okf-support) — OpenWiki OKF announcement
- [github.com/dynamicfeed/signed-okf](https://github.com/dynamicfeed/signed-okf) — Cryptographic trust layer
- [dynamicfeed.ai](https://dynamicfeed.ai) — DynamicFeed site
- [github.com/EliaszDev/hermes-okf](https://github.com/EliaszDev/hermes-okf) — Agent memory
- [pypi.org/project/hermes-okf/](https://pypi.org/project/hermes-okf/) — hermes-okf on PyPI
- [github.com/inkeep/open-knowledge](https://github.com/inkeep/open-knowledge) — Inkeep editor
- [open-knowledge-docs.preview.inkeep.com](https://open-knowledge-docs.preview.inkeep.com) — Inkeep docs preview
- [github.com/open-science-pillars/knowledge-template](https://github.com/open-science-pillars/knowledge-template) — Science template
- [github.com/rakibtg/okf-skill](https://github.com/rakibtg/okf-skill) — Agent skill
- [github.com/dskst/leadcraft](https://github.com/dskst/leadcraft) — leadcraft
- [github.com/barvhaim/pi-openwiki](https://github.com/barvhaim/pi-openwiki) — IBM PI port
- [openknowledgeformat.com](https://openknowledgeformat.com/) — Browser validator + templates
- [suganthan.com/free-seo-tools/okf-generator/](https://suganthan.com/free-seo-tools/okf-generator/) — Web converter
- [suganthan.com/blog/open-knowledge-format/](https://suganthan.com/blog/open-knowledge-format/) — WP plugin blog post
- [uploads.suganthan.com](https://uploads.suganthan.com/4AECBACE-open-knowledge-format.zip) — WP plugin download
- [wordpress.org/plugins/search/open-knowledge-format/](https://wordpress.org/plugins/search/open-knowledge-format/) — WP plugin directory

### Articles & Coverage
- [cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) — Google Cloud announcement
- [gist.github.com/karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Karpathy's LLM Wiki gist
- [medium.com/@AgentFitech](https://medium.com/@AgentFitech/google-just-standardized-how-ai-agents-read-the-web-heres-how-we-shipped-it-in-a-day-6bbfd3024320) — AgentFitech launch post
- [kb.duyet.net](https://kb.duyet.net/m/tech-okf-open-knowledge-format) — Duyet's knowledge base conversion
- [ontologist.substack.com/p/the-format-convergence](https://ontologist.substack.com/p/the-format-convergence) — W3C Holon CG / DataBook proposal
- `https://blog.prototypr.io/googles-okf-comes-to-the-origintrail-dkg-a-memory-ai-agents-can-trust-43c6d87e1de8`
  — OriginTrail integration article; 403 to automated link checking on
  2026-07-26
- [tropes.fyi](https://tropes.fyi) — AI writing pattern directory
- [www.theregister.com/2026/02/16/semantic_ablation_ai_writing/](https://www.theregister.com/2026/02/16/semantic_ablation_ai_writing/) — Semantic ablation article
- [www.youtube.com/watch?v=0vphxNt4wyk](https://www.youtube.com/watch?v=0vphxNt4wyk) — Philipp Schmid "Don't Ship Skills Without Evals"

### Standards & Specs Referenced
- [agentskills.io](https://agentskills.io) — Agent Skills specification
- [agentskills.io/what-are-skills.md](https://agentskills.io/what-are-skills.md) — What are Agent Skills?
- [agentskills.io/specification.md](https://agentskills.io/specification.md) — Agent Skills specification
- [agentskills.io/skill-creation/best-practices](https://agentskills.io/skill-creation/best-practices) — Best practices
- [agentskills.io/skill-creation/evaluating-skills](https://agentskills.io/skill-creation/evaluating-skills) — Evaluating skills
- [auth-md.com](https://auth-md.com) — auth.md protocol
- [github.com/google-labs-code/design.md](https://github.com/google-labs-code/design.md) — DESIGN.md specification
- [opensource.org/licenses/MIT](https://opensource.org/licenses/MIT) — MIT License
- [policies.google.com/privacy](https://policies.google.com/privacy) — Google Privacy Policy

### SaaS / External Tools
- [skent.com](https://www.forentrepreneurs.com/saas-metrics-2/) — David Skok SaaS metrics
- `https://www.lennysnewsletter.com/p/what-is-good-retention-rate` — link
  captured from the site; returned 404 when rechecked on 2026-07-26
- [hbr.org/2003/12/the-one-number-you-need-to-grow](https://hbr.org/2003/12/the-one-number-you-need-to-grow) — HBR NPS article
- [docs.astro.build/en/guides/routing/](https://docs.astro.build/en/guides/routing/) — Astro routing
- [docs.astro.build/en/guides/content-collections/](https://docs.astro.build/en/guides/content-collections/) — Astro content collections
- [kiro.dev](https://kiro.dev) — Kiro CLI
- [github.com/mreferre/ralph-loop-kiro-specs](https://github.com/mreferre/ralph-loop-kiro-specs) — Ralph Loop
- [github.com/ksimback/looper](https://github.com/ksimback/looper) — Looper (loop design)
- [github.com/blader/humanizer](https://github.com/blader/humanizer) — Humanizer skill (10.6K stars)
- [github.com/brandonwise/humanizer](https://github.com/brandonwise/humanizer) — Humanizer alternative
- [github.com/Aboudjem/humanizer-skill](https://github.com/Aboudjem/humanizer-skill) — Humanizer with 43 patterns
- [github.com/smallnest/goal-workflow](https://github.com/smallnest/goal-workflow/blob/master/skills/humanize-it/SKILL.md) — humanize-it by @smallnest
- [github.com/thedaviddias/Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist/tree/main/skills) — Front-End Checklist skills
- [specification.website](https://specification.website/.well-known/agent-skills/specification-website/SKILL.md) — Website Specification skill
- [isitagentready.com](https://isitagentready.com) — Cloudflare agent-ready scanner
- [heliocosta-dev/revenue-centric-design](https://github.com/heliocosta-dev/revenue-centric-design) — Original RCD skill
- [pols.dev/slop.md](https://pols.dev/slop.md) — Anti-slop design law
- [skills.sh](https://skills.sh) — Skills.sh registry

### People
- [github.com/fabricioctelles](https://github.com/fabricioctelles) — Site owner, skill author
- [github.com/mreferre](https://github.com/mreferre) — Ralph Loop author
- [github.com/ksimback](https://github.com/ksimback) — Looper author
- [github.com/blader](https://github.com/blader) — Humanizer author
- [github.com/mattdav](https://github.com/mattdav) — okflint author
- [x.com/richardrx](https://x.com/richardrx) — Revenue-Centric Design original author
- [github.com/heliocosta-dev](https://github.com/heliocosta-dev) — RCD skill adapter

### Brazilian Resources
- [ft.ia.br](https://ft.ia.br) — Fabrício Telles (site author)
- [github.com/lgpd-app/skills](https://github.com/lgpd-app/skills) — LGPD Check skill
- [claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills) — Anthropic skill creation guide
- [claude.com/blog/lessons-from-building-claude-code-how-we-use-skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills) — Claude Code skills patterns

### Contact
- [contato@okf.md](mailto:contato@okf.md) — Site contact / privacy / DPO

---

## Summary Statistics

- **Total unique pages (English):** 10
- **Portuguese localizations:** 3 (terms, privacy, validator)
- **Total tools/implementations documented:** 22
- **Example bundles:** 8
- **FAQ questions:** 22 (24 counting sub-questions)
- **Timeline events:** 19
- **Community tool links:** 30+
- **GitHub repos referenced:** 25+
- **External articles/blog posts:** 8+
- **Site created by:** Fabrício Telles (ft.ia.br)
- **Site repo:** github.com/fabricioctelles/skills (86 commits, 36 stars, 3 forks)
- **Stack:** Astro v7 + Starlight + Cloudflare + Coolify
- **Analytics:** Plausible (self-hosted, Brazil) + GA4 (anonymized)
