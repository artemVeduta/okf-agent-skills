# fabricioctelles/skills Repository — Deep Analysis

## Repository Overview

**fabricioctelles/skills** is a **skill marketplace** — a curated collection of 20 reusable [Agent Skills](https://agentskills.io) created by [ft.ia.br](https://ft.ia.br) (Fabricio Telles). Each skill is a folder with a `SKILL.md` file that uses progressive disclosure to teach AI agents (Kiro, Cursor, Windsurf, Claude Code, and others) how to perform specialized tasks.

- **Repository**: https://github.com/fabricioctelles/skills
- **Homepage**: https://skill.dev.br
- **Stars**: 36 | **Forks**: 3
- **License**: Apache 2.0 (with per-skill exceptions)
- **Primary Language**: Python
- **Created**: Feb 2026 | **Size**: ~2.6MB
- **Install via**: `npx skills add https://github.com/fabricioctelles/skills`

The repo is NOT specifically an OKF implementation — it is a general-purpose skill registry that happens to include an OKF skill. It serves as an ecosystem of agent capabilities covering marketing, DevOps, security, design, writing, career tools, and knowledge management.

## okf.md Site Source

The public evidence does not identify the deployed site's source repository.
Two different links must be kept separate:

- **okf.md** has an "Install Skill" button that links directly to `fabricioctelles/skills` → `skills/okf-open-knowledge-format/SKILL.md`
- The site footer credits: "OKF v0.1 · 2026 · MIT licensed · Based on the Google Cloud Markdown spec · GitHub · Spec · Terms · Privacy"
- The footer's "GitHub" link points to `fabricioctelles/skills`
- The spec page's source link points to
  `GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md`
- The okf.md site has pages: Spec, Quickstart, Examples, Tools, Ecosystem Map, FAQ
- Site features a **browser-based validator** (zero install, paste/upload bundle)

**Evidence (2026-07-26):** The current public tree of
`fabricioctelles/skills` contains skills and registry metadata, but no Astro
application or okf.md page sources. Therefore the footer link establishes
affiliation/distribution, not that this repository builds the deployed site.

**Inference:** The rendered site appears to use Astro. Hosting provider,
deployment topology, and whether `astro-webmcp` powers okf.md are not
established by the audited source and are intentionally left unclaimed.

## Skills Implemented

The repo contains 20 skills organized into 9 categories (per `skills.sh.json`):

### Agent Protocols & Knowledge (OKF-relevant)
| Skill | Category | Description |
|-------|----------|-------------|
| **okf-open-knowledge-format** | library-and-api-reference | Create, validate, enrich OKF bundles; validate.sh + conversion guides |
| **auth-md** | library-and-api-reference | Agent Authentication Protocol (auth.md generator/validator) |

### Writing & Humanization
| Skill | Description |
|-------|-------------|
| **humanizar** | PT-BR AI text humanizer (55+ patterns, 10 voice profiles) |
| **human-ai** | English AI text humanizer (43 patterns, 7 voice presets) |

### Marketing & SEO
| Skill | Description |
|-------|-------------|
| **geo-optimization** | Generative Engine Optimization for AI visibility |
| **substack-expert** | Substack newsletter platform expert |

### DevOps & Cloud
| Skill | Description |
|-------|-------------|
| **coolify-operator** | Coolify self-hosted PaaS management |
| **pier-cloud** | Pier Cloud (Lighthouse) FinOps API |
| **astro-sites-manager** | Astro v7 full lifecycle management |

### Security
| Skill | Description |
|-------|-------------|
| **security-specialist** | Full-stack app security (SAST/DAST/pentest/threat model) |

### Web Quality & Standards
| Skill | Description |
|-------|-------------|
| **skill-evaluation** | Skill quality scorecard against merged Anthropic + Matt Pocock framework |
| **slop-eval** | Design slop evaluator (UI quality scoring) |
| **design-md-validator** | Google design.md specification validator |
| **agent-ready-cloudflare** | Cloudflare agent readiness scanner (20 implementation sub-skills) |

### Design
| Skill | Description |
|-------|-------------|
| **ultimate-design-system-master** | Design system generation (10 role-play prompts) |

### Career & Workflows
| Skill | Description |
|-------|-------------|
| **resume-ats-beater** | ATS-optimized resume + LinkedIn profile audit |
| **ralph-loop-kiro-specs** | Automated iterative agent runner for Kiro specs |
| **loop-architect** | Agent loop design coach (cross-model review gates) |

### Startup & Strategy
| Skill | Description |
|-------|-------------|
| **startup-idea** | Paul Graham + Dan Koe + Seth Godin startup analysis |
| **revenue-centric-design** | 101 evidence-backed SaaS design principles |

### Retired/Migrated Skills
- **Front-End Checklist** → moved to thedaviddias/Front-End-Checklist
- **Website Spec** → moved to specification.website official skill
- **LGPD Check** → moved to lgpd-app/skills

## OKF Skill Deep Dive (`skills/okf-open-knowledge-format/`)

### Structure
```
okf-open-knowledge-format/
├── SKILL.md              (14.7 KB — main skill with 8-step workflow)
├── references/
│   ├── spec-v01.md       (15 KB — complete OKF v0.1 specification)
│   ├── examples.md       (6.4 KB — 3 domain-specific bundles with full markdown)
│   └── conversion.md     (4.2 KB — Notion, Obsidian, CSV conversion guides)
└── scripts/
    └── validate.sh       (bash script — 3 core conformance checks)
```

### What it teaches agents
1. **Create bundles** — 8-step workflow: scope → concepts → cross-links → index.md → log.md → version → distribution → validation
2. **Validate bundles** — prefers okflint (Python, 18 rules, 3 tiers), falls back to built-in `validate.sh`
3. **Enrich concepts** — add schema, examples, citations, cross-links, recommended fields
4. **Convert sources** — detailed guides for Notion, Obsidian, CSV
5. **Serve via Google Cloud Knowledge Catalog** — kcmd CLI, MCP server, enrichment agent

### Key integration points
- **okflint** (github.com/mattdav/okflint) — dedicated Python linter (preferred over bash script)
- **kcmd CLI/MCP** — Google Cloud Knowledge Catalog sync tool
- **Knowledge Catalog** — enterprise path for serving OKF to agents
- **Enrichment Agent** (Python, ADK, Gemini) — auto-generates OKF bundles from BigQuery metadata

## Ecosystem Map Source

The ecosystem map data lives **on the okf.md website** (https://okf.md/ecosystem-map), not in this repository. Map organizes ~25 tools across two axes: **Maturity** (Concept/PoC → Released/GA) × **Barrier to Entry** (Zero setup → Requires cloud infra).

### Tools listed (partial):
| Tool | Maturity | Description |
|------|----------|-------------|
| Enrichment Agent | Functional PoC | BigQuery → OKF auto-generator |
| viz.html | Ready | Bundle visualizer |
| kcmd CLI | Early product | Metadata-as-code sync tool |
| Knowledge Catalog | GA | GCP enterprise knowledge store |
| Obsidian | Native | Personal knowledge tool |
| GitHub Actions | DIY | CI pipeline integration |
| MCP Server (kcmd) | Functional | Agent integration |
| WordPress Plugin | Ready | WP site OKF export |
| okf CLI | Released | CLI bundle tools (superops-team) |
| okflint | Released | Python OKF linter (18 rules) |
| Kiso | Released | Publishing engine (bundles → sites) |
| LangChain OpenWiki 0.2 | Production | Agent-readable codebase docs |
| signed-okf | Early | Verifiable provenance |
| hermes-okf | Functional | Hermes agent integration |
| OriginTrail DKG + OKF | Concept | Web3/trust-critical use cases |
| openknowledgeformat.com | Ready | Browser-based validator + templates |
| leadcraft | Early | Auto-generated bundles |
| pi-openwiki | Fresh port | IBM PI ecosystem |

### Timeline
- Apr 2026: Karpathy LLM Wiki gist
- Jun 12, 2026: OKF v0.1 spec published (Google Cloud) + enrichment agent + viz.html + Knowledge Catalog + kcmd
- Jun 13–14: First independent implementations
- Jun 15: Search Engine Journal coverage
- Jun 19: W3C Holon CG inaugural meeting
- Jun 23: Ontologist "Format Convergence" — DataBook profile proposed
- Jun 27: okflint v0.1.0 released
- Jul 11: Kiso v0.1.5 publishing engine
- Jul 13: openknowledgeformat.com validator + templates live
- Jul 14: LangChain OpenWiki 0.2 with native OKF support
- Jul 16: @hwchase17 announces OKF as "open standard for memory"

## Tools Provided

### In-repo tools:
| Tool | Type | Location |
|------|------|----------|
| `validate.sh` | Bash script | `skills/okf-open-knowledge-format/scripts/` |
| `scripts/measure.py` | Python (zero deps) | `skills/human-ai/scripts/` |
| `scripts/score.py` | Python | `skills/slop-eval/scripts/` |
| `validate-findings.cjs` | Node.js (zero deps) | `skills/security-specialist/scripts/` |

### Referenced external tools:
- **okflint** (mattdav) — Python linter, 18 rules, manifest profiles
- **kcmd** (Google Cloud) — CLI + MCP server for Knowledge Catalog
- **Ralph Loop** (mreferre) — bash loop automation for Kiro specs
- **Looper** (ksimback) — loop design framework

## Integration Points (Agent Harnesses)

The skills work across multiple agent platforms:

| Platform | Installation method |
|----------|-------------------|
| **Kiro** | `cp -r skills/<name> .kiro/skills/` |
| **Cursor** | `cp -r skills/<name> .cursor/skills/` |
| **Windsurf** | Implied (via Agent Skills standard) |
| **Claude Code** | `cp -r skills/<name> .claude/skills/` |
| **OpenCode** | Implied (via Agent Skills standard) |
| **Any compatible agent** | `npx skills add https://github.com/fabricioctelles/skills` |

Supported installers:
- **Skills.sh**: `npx skills add https://github.com/fabricioctelles/skills`
- **Agent Skills CLI**: `npm install -g agent-skills-cli`

The repo itself uses:
- `skills-lock.json` — dependency lock file with SHA-256 hashes per skill (for `skills.sh` installer)
- `skills.sh.json` — grouping/categorization metadata for the skill directory UI

### Specific harness integrations:
- **Kiro**: Ralph Loop skill wraps `kiro-cli` in self-correcting bash loops
- **Claude Code**: skills follow Anthropic's skill category framework (9 types)
- **Google Chrome**: agent-ready-cloudflare skill targets WebMCP protocol (Chrome 149+)

## Other fabricioctelles OKF Repos

### fabricioctelles repos (4 total):
| Repo | Stars | Description | Relevance to OKF |
|------|-------|-------------|-------------------|
| **skills** | 36 | Agent skills marketplace | Contains the OKF skill |
| **astro-webmcp** | 12 | Astro WebMCP integration | Likely powers okf.md's agent-ready features |
| **dh** | 2 | Dreamhost DNS dashboard | Not OKF-related |
| **fabricioctelles** | 1 | Profile repo | Not OKF-related |

### Notable: NO separate okf-validator repo exists
A query to `api.github.com/repos/fabricioctelles/okf-validator` returns 404. OKF validation tools exist as:
1. `validate.sh` — embedded in the skills repo (`skills/okf-open-knowledge-format/scripts/`)
2. `okflint` — separate repo by **mattdav** (not fabricioctelles)
3. Browser validator — on the okf.md website itself

## Observations

### Architecture patterns
1. **Progressive disclosure**: All skills follow the Agent Skills format — SKILL.md as entry point with `references/`, `scripts/`, `templates/`, `schemas/` directories loaded on demand
2. **Local-first development**: `skills-lock.json` references `/home/fabricio/GIT/skills` — developed locally and published to GitHub
3. **Quality gates**: The `skill-evaluation` skill self-validates the entire collection against Anthropic's best practices + Matt Pocock's methodology (18 scored criteria, 4 axes, empirical trigger testing)
4. **Per-skill versioning**: Each skill has independent version numbers (e.g., humanizar v1.3, startup-idea v1.3)

### What's reusable for OKF agent skills
1. **OKF skill itself** (`skills/okf-open-knowledge-format/`) — a historical OKF v0.1 agent-skill implementation
2. **validate.sh** — portable bash validator, zero dependencies, checks 3 core conformance rules
3. **spec-v01.md** — complete embedded copy of the OKF v0.1 specification
4. **conversion.md** — production-tested migration patterns (Notion, Obsidian, CSV)
5. **examples.md** — 3 domain-validated bundles (E-commerce, SaaS incidents, API docs)
6. **skill-evaluation framework** — reusable meta-skill for evaluating other OKF-related skills

### Deployment/operations patterns
1. **Dual installer support**: Both `skills.sh` (npm) and `agent-skills-cli` supported
2. **Hash integrity**: `skills-lock.json` with SHA-256 for skill integrity verification
3. **Site stack**: rendered markup indicates Astro; hosting/deployment was not verified from source
4. **Browser-based validator**: okf.md's validator runs entirely client-side (zero backend/install)
5. **CI-integration design**: Scripts produce structured output (`--json` flags) and meaningful exit codes for CI pipelines

### Key insight about the OKF ecosystem
The fabricioctelles/skills repo serves as the **primary distribution channel for the OKF agent skill**, but the OKF ecosystem is much broader:
- **Spec origin**: Google Cloud (GoogleCloudPlatform/knowledge-catalog/okf/)
- **Official linter**: mattdav/okflint
- **Marketing website**: okf.md; footer links to this repository, but its deployed source location is unverified
- **Browser validator**: openknowledgeformat.com
- **Enterprise integration**: Google Cloud Knowledge Catalog + kcmd

fabricioctelles acts as an **ecosystem champion** — curating, documenting, and distributing OKF tooling through their skill marketplace, but not as the spec owner or primary tool author (except the bash validator).
