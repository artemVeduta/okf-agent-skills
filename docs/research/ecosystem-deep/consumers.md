# OKF Ecosystem Projects — Deep Investigation

> Generated: 2026-07-25

---

## 1. Kiso — Publishing Engine for OKF Bundles

### Repository
- **URL**: <https://github.com/oak-invest/kiso>
- **Website**: <https://oak-invest.github.io/kiso/>
- **Stars**: 16
- **Commits**: 225 (on `development` branch)
- **License**: Apache-2.0
- **Language**: Java 21 (Maven multi-module)
- **Owner**: oak-invest (Stéphane Traumat)
- **GroupId**: `com.oakinvest.kiso`
- **Version**: 0.1.6-SNAPSHOT

### What it does
Kiso is a static site generator that turns OKF bundles (directories of Markdown with YAML frontmatter) into navigable HTML websites for both humans and AI agents. It generates rendered HTML pages from OKF frontmatter and Markdown body, includes an `llms.txt` for LLM consumption, a `sitemap.xml`, a full-text search index (MiniSearch), and supports configurable DaisyUI themes. It is "the Hugo of AI-oriented knowledge bases."

### Installation

**Download pre-built JAR** (recommended):
```bash
# Download from GitHub releases: https://github.com/oak-invest/kiso/releases
curl -L -o kiso-cli.jar https://github.com/oak-invest/kiso/releases/download/v0.1.5/kiso-cli.jar
java -jar kiso-cli.jar check --source=./my-bundle
```

**Build from source** (requires Java 21, Maven):
```bash
git clone https://github.com/oak-invest/kiso.git
cd kiso
mvn clean package -pl applications/kiso-cli -am
# JAR at: applications/kiso-cli/target/kiso-cli-0.1.6-SNAPSHOT-executable.jar
```

**Prerequisites**: Java JRE 21+ (Eclipse Temurin/Adoptium)

### Full CLI Interface

The CLI is built with **picocli** (v4.7.7). Entry point: `com.oakinvest.kiso.cli.Application`
Binary name: `kiso-cli` (or `java -jar kiso-cli.jar`)

**Subcommands**:

| Command | Description |
|---------|-------------|
| `check` | Validates Markdown files in an OKF bundle and reports formatting/structural errors |
| `build` | Generates a static website including HTML pages, llms.txt, sitemap.xml, and search index |

**`check` command flags**:

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--source` | No | `.` | Directory containing the Markdown files to validate |

**`build` command flags**:

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--source` | Yes | `.` | Directory containing the Markdown files to read |
| `--destination` | No | `public` | Directory where generated files are created |
| `--profile` | No | _(none)_ | Publishing profile loaded from `.kiso/<profile>/configuration.yaml` |

### How validation works (`check` command)

The `check` command (implemented in `CheckCommand.java`) loaded via `kiso-core` validation package:
1. Walks the source directory for `**/*.md` files
2. Parses YAML frontmatter (delimited by `---`) from each file
3. Validates structural requirements:
   - Frontmatter must have required fields per OKF spec (`type`, `id`, `title`)
   - Markdown links between files must resolve correctly
   - Frontmatter YAML must be valid
4. Reports errors with file path and line/field context
5. Non-zero exit code if validation fails

The `validation` package in `kiso-core` contains the validation logic: it checks frontmatter presence, structure, cross-file link resolution (strip fragments, resolve absolute/relative path, reject `..` escapes), and logs warnings for non-conformance. Files not starting with `---` have no frontmatter and produce a warning.

### How HTML generation works (`build` command)

The `build` command:
1. **Copy phase**: Copies the source bundle to destination, applying `content.ignorePatterns` exclusions
2. **Configuration loading**: Reads `.kiso/configuration.yaml` (or profile-specific `.kiso/<profile>/configuration.yaml`)
3. **Markdown parsing**: Uses **commonmark-java** (v0.29.0) with extensions:
   - `commonmark-ext-autolink` — auto-linking of URLs
   - `commonmark-ext-gfm-tables` — GitHub Flavored Markdown table support
4. **Template rendering**: Uses **JTE** (Java Template Engine, gg.jte v3.2.4) for server-side HTML generation
5. **Page types rendered**:
   - `index.jte` — Root index page listing all concepts
   - `concept.jte` — Individual concept page with frontmatter metadata + rendered body
   - `social-preview.svg.jte` — SVG social preview images (generated via Apache Batik)
6. **Additional generators**:
   - `IndexGenerator.java` — Index pages for directories
   - `LlmsTxtGenerator.java` — `llms.txt` and `llms-full.txt` (concatenated markdown for LLMs)
   - `SearchIndexGenerator.java` — JSON search index for MiniSearch (client-side full-text search)
   - `SitemapXmlGenerator.java` — `sitemap.xml` with URLs, lastmod timestamps
7. **Asset bundling**: Copies packaged frontend assets (DaisyUI CSS, Tailwind CSS Browser v4.3.2 runtime, MiniSearch v7.2.0, i18next v26.3.6) into destination `assets/`

### Generated output directory structure

```
public/
├── index.html               # Root page (list of concepts)
├── llms.txt                 # LLM context (compact)
├── llms-full.txt            # LLM context (full bodies)
├── sitemap.xml              # Sitemap with URLs
├── assets/
│   ├── css/
│   │   ├── daisyui.css      # DaisyUI v5.7.0
│   │   └── themes.css       # All DaisyUI themes
│   ├── js/
│   │   ├── browser.js       # Tailwind CSS browser runtime
│   │   ├── minisearch.js    # MiniSearch index
│   │   └── i18next.js       # i18next runtime
│   └── ... (images, custom assets)
├── concepts/
│   ├── index.html           # Concept listing
│   └── <slug>/              # One directory per concept
│       └── index.html       # Rendered concept page
└── <original-markdown-files>/  # Original .md files copied for inspection
```

### Configuration file (`.kiso/configuration.yaml`)

```yaml
site:
  baseUrl: https://knowledge.example.com/
  name: Example Knowledge Base
  language: en
  title: My knowledge base
  description: Documentation for humans and AI agents

theme:
  name: corporate   # Any DaisyUI theme name

content:
  ignorePatterns:
    - README.md
    - drafts/**
    - private/**
```

**Configuration sections**:

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `site` | `baseUrl` | _(required)_ | Public base URL prepended to generated links and sitemap entries |
| `site` | `name` | _(required)_ | Site name for social share/OG tags |
| `site` | `language` | `en` | HTML lang attribute |
| `site` | `title` | _(required)_ | Page title for root index |
| `site` | `description` | _(required)_ | Page description for root index |
| `theme` | `name` | `light` | DaisyUI theme name (e.g. `corporate`, `dark`, `cupcake`, `cyberpunk`, etc.) |
| `content` | `ignorePatterns` | `[]` | Glob patterns for files/dirs to exclude. Evaluated relative to bundle root. E.g. `drafts/**` excludes the `drafts/` directory. Source bundle is never modified; exclusions applied during copy to destination. |

### Publishing profiles

Profiles are stored in `.kiso/<profile-name>/configuration.yaml`. When `--profile` is passed, Kiso loads only that profile's configuration (the default `.kiso/configuration.yaml` is NOT merged).

```bash
kiso-cli build --profile public    # loads .kiso/public/configuration.yaml
kiso-cli build --profile internal  # loads .kiso/internal/configuration.yaml
kiso-cli build                     # loads .kiso/configuration.yaml (no profile)
```

### DaisyUI theme system

Kiso bundles DaisyUI v5.7.0 as a WebJar (Maven dependency `org.webjars.npm:daisyui:5.7.0`). The `theme.name` config value is injected into the `<html data-theme="...">` attribute. All 30+ DaisyUI themes are available (light, dark, cupcake, bumblebee, emerald, corporate, synthwave, retro, cyberpunk, valentine, halloween, garden, forest, aqua, lofi, pastel, fantasy, wireframe, black, luxury, dracula, cmyk, autumn, business, acid, lemonade, night, coffee, winter, dim, nord, sunset).

### llms.txt generation

The `LlmsTxtGenerator.java` produces two files:
- **`llms.txt`** — Compact index listing all concept titles, IDs, types, and brief descriptions
- **`llms-full.txt`** — Full concatenation of all concept markdown bodies, for LLM context windows

Both files follow the [llmstxt proposal](https://llmstxt.org/) convention.

### sitemap.xml generation

The `SitemapXmlGenerator.java` generates a standard XML sitemap containing:
- `<url>/<loc>` — Full URL constructed from `site.baseUrl` + concept path
- `<url>/<lastmod>` — Last modified timestamp (if available from filesystem/git)
- One entry per concept page + root index

### GitHub Action (`oak-invest/kiso/applications/kiso-cli-action@v0.1.4`)

Composite GitHub Action that:
1. Downloads Eclipse Temurin JRE 21 for Linux x64 via Adoptium API
2. Downloads `kiso-cli.jar` from GitHub Releases at the specified version
3. Runs the Kiso CLI with the provided arguments

**Action inputs**:

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `version` | No | `v0.1.5` | Kiso CLI version |
| `command` | No | `build` | Kiso command: `build` or `check` |
| `source` | No | `.` | Source directory for Markdown files |
| `destination` | No | `public` | Output directory |
| `profile` | No | `""` | Publishing profile name |

**Example workflow**:
```yaml
- name: Build with Kiso
  uses: oak-invest/kiso/applications/kiso-cli-action@v0.1.4
  with:
    command: build
    source: examples/kb-google-example
    destination: website/examples/kb-google-example-latest
```

### content.ignorePatterns

Glob patterns evaluated against paths relative to the bundle root. Examples:
- `README.md` — Excludes only the root README, not `subdir/README.md`
- `drafts/**` — Excludes the entire `drafts/` directory
- `private/**` — Excludes all files under `private/`
- `*.tmp.md` — Excludes temporary markdown files

Applied during the copy phase (source → destination), before loading, validating, and publishing. Source bundle is never modified.

### Skills/AI Integration (`AGENTS.md`)

Kiso's `AGENTS.md` redirects to `.github/copilot-instructions.md`. The project includes a `CLAUDE.md` at root. No MCP server is included. Kiso is a **publishing engine** that produces AI-consumable output (`llms.txt`, original markdown in output), not an agent tool itself.

### Module structure

```
kiso/
├── pom.xml                          # Parent POM (group: com.oakinvest.kiso)
├── libraries/
│   └── kiso-core/                   # Core library: parser, renderer, publisher, validation, loader, model
│       └── src/main/jte/            # JTE templates (concept.jte, index.jte, social-preview.svg.jte)
│           ├── layouts/             # Layout templates
│           ├── partials/            # Partial templates
│           └── assets/              # Static assets (CSS, JS, images)
└── applications/
    ├── kiso-cli/                    # CLI application (picocli commands)
    └── kiso-cli-action/             # GitHub Action (composite)
        └── action.yml
```

### End-to-end flow: `kiso-cli build`

```bash
$ kiso-cli build --source=examples/kb-google-example --destination=public
```

1. **Load configuration** — reads `.kiso/configuration.yaml` (or profile variant) from source
2. **Copy source** — copies `examples/kb-google-example` to `public/`, skipping files matching `content.ignorePatterns`
3. **Walk markdown** — discovers all `**/*.md` files in the copied bundle
4. **Parse frontmatter** — splits each file on `---`, parses YAML frontmatter with Jackson
5. **Parse markdown body** — renders body to HTML AST via commonmark-java (with autolink + GFM tables extensions)
6. **Generate HTML pages**:
   - `index.html` (root) — lists all concepts with links, using JTE `index.jte` template
   - `concepts/<slug>/index.html` — one page per concept, using JTE `concept.jte` template
7. **Generate auxiliary files**:
   - `llms.txt` — compact catalog
   - `llms-full.txt` — full concatenated bodies
   - `sitemap.xml` — standard XML sitemap with baseUrl prefix
   - `search-index.json` — MiniSearch-compatible JSON index
8. **Copy assets** — DaisyUI CSS, Tailwind runtime, MiniSearch, i18next to `public/assets/`
9. **Result**: A complete static website in `public/`, ready to serve via any HTTP server or open locally

---

## 2. @docmd/plugin-okf — OKF Bundle Generator for docmd

### Repository
- **URL**: <https://github.com/docmd-io/docmd> (monorepo; plugin lives under `packages/`)
- **npm**: <https://www.npmjs.com/package/@docmd/plugin-okf>
- **Stars**: 2.2k (docmd monorepo)
- **Commits**: 2,383 (docmd monorepo)
- **Version**: 0.8.17
- **Weekly Downloads**: ~2,599
- **License**: MIT
- **Language**: TypeScript
- **Owner**: docmd-io (mgks/ghsp)

### What it does

`@docmd/plugin-okf` is a core plugin for the [docmd](https://docmd.io) documentation engine. At build time, it generates a complete OKF bundle from a docmd site's pages, making the documentation consumable by AI agents (Gemini, Claude, GPT, Cursor) via the vendor-neutral OKF spec. The bundle contains markdown concept files with YAML frontmatter, a typed manifest (`okf.yaml`), an optional interactive graph viewer, and a machine-readable bundle summary. The bundle sits alongside the built site (e.g. in `site/okf/`).

### What docmd is

docmd is a zero-config Node.js documentation engine (TypeScript) that turns Markdown files into production-ready static websites. Key features:
- ~18 KB JavaScript payload, instant SPA navigation
- Built-in offline search (MiniSearch + optional semantic via `docmd-search` gem)
- Native versioning, i18n, multi-project workspaces
- AI-native: built-in `llms.txt` generation, MCP server (`docmd mcp`), agent skills
- Plugin system with per-hook return-type validation
- `@docmd/plugin-okf` is a **core plugin** (included by default, enabled by default)

### Installation

```bash
npm install @docmd/plugin-okf
# or (it's a core plugin shipped with docmd):
npm install @docmd/core
```

This plugin is part of the docmd monorepo at `packages/plugin-okf/`. It is enabled by default when using docmd — no explicit installation needed when using `@docmd/core`.

### Configuration

In `docmd.config.json`:
```json
{
  "plugins": {
    "okf": {
      "outputDir": "okf",
      "bundleName": "my-knowledge-base",
      "defaultType": "concept",
      "graph": false
    }
  }
}
```

**Full configuration options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `'okf'` | Bundle directory, relative to site output |
| `bundleName` | `string` | slugified `config.title` | Name used in `okf.yaml` and graph viewer title |
| `defaultType` | `string` | `'concept'` | Type assigned to pages with no explicit type |
| `typeField` | `string` | `'type'` | Frontmatter field name for OKF type |
| `warnOnMissingType` | `boolean` | `true` | Emit TUI warning for pages falling back to `defaultType` |
| `includeFullMarkdown` | `boolean` | `true` | Copy raw `.md` body into each concept file |
| `graph` | `boolean` | `false` | Emit `graph/` subdirectory with interactive viewer (opt-in since v0.8.8) |
| `localeStrategy` | `enum` | `'default-only'` | How to handle multi-locale: `default-only`, `folders`, `mixed`, `latest-only` |
| `versionStrategy` | `enum` | `'latest-only'` | How to handle multi-version: `folders`, `mixed`, `latest-only` |
| `excludePatterns` | `string[]` | `[]` | Additional glob patterns to exclude pages |

### Output structure

```
site/okf/                          # Always emitted
├── okf.yaml                       # Typed manifest (bundle summary)
├── index.md                       # Karpathy-style catalog grouped by type
├── concepts/
│   └── <slug>.md                  # One markdown file per page
└── _meta/
    ├── bundle.json                # JSON mirror of okf.yaml
    └── lint-report.txt            # Warnings produced during generation

# Emitted only when `plugins.okf.graph: true`
└── graph/                         # Interactive viewer (open /okf/graph/)
    ├── index.html                 # Force-directed graph viewer
    ├── graph.json                 # Graph data (nodes + edges)
    ├── graph.js                   # Viewer runtime (vanilla, no CDN deps)
    └── graph.css                  # Viewer styles (theme-aware)
```

### Type resolution precedence

For every page, the plugin picks a type in this order:
1. `frontmatter.okf.type` (nested)
2. `frontmatter.type` (top-level)
3. `frontmatter.okfType` (legacy)
4. Path-prefix inference (e.g. `/guides/foo` → `guide`)
5. `defaultType` (with a warning if `warnOnMissingType` is `true`)

Path-prefix map covers: `guides/` → `guide`, `api/` → `api`, `reference/` → `reference`, `concepts/` → `concept`, `runbooks/` → `runbook`, `datasets/` → `dataset`, `metrics/` → `metric`, `tables/` → `table`.

### Per-page opt-out

```yaml
---
noindex: true   # excludes from OKF bundle, sitemap, llms.txt, etc.
---
```
or:
```yaml
---
okf: false      # only excludes from the OKF bundle
---
```

### End-to-end flow

```bash
# 1. Create a docmd site
mkdir my-docs && cd my-docs
echo '{"title":"My Docs","url":"https://docs.example.com"}' > docmd.config.json
mkdir docs
echo '---
type: concept
id: getting-started
title: Getting Started
---
# Welcome
This is my documentation.' > docs/getting-started.md

# 2. Build the site (OKF plugin runs automatically)
npx @docmd/core build

# 3. Output:
site/                           # The docmd static site (HTML, SPA)
site/okf/                       # The OKF bundle
  ├── okf.yaml                  # Bundle manifest
  ├── index.md                  # Catalog
  ├── concepts/
  │   └── getting-started.md    # Concept file
  └── _meta/
      ├── bundle.json            # JSON manifest
      └── lint-report.txt        # Warnings
```

Each concept file carries the OKF-required `type` field in frontmatter plus the original markdown body verbatim. An agent can navigate the manifest (`okf.yaml` or `index.md`) and read full concept pages.

### Skills/AI Integration

- docmd itself has built-in MCP server (`docmd mcp`) and agent skills (<https://github.com/docmd-io/docmd-skills>)
- The OKF bundle is consumed by AI agents directly — Gemini, Claude, GPT, Cursor, etc.
- No separate SKILL.md for the plugin itself; the bundle IS the AI interface

---

## 3. okf-viewer — Read-Only OKF Bundle Browser

### Repository
- **URL**: <https://github.com/manojbajaj95/okf-viewer>
- **npm**: <https://www.npmjs.com/package/okf-viewer>
- **Stars**: 1
- **Commits**: 20
- **Version**: 0.4.1
- **Weekly Downloads**: ~133
- **License**: MIT
- **Language**: TypeScript (Next.js 16.2.10, React 19)
- **Owner**: manojbajaj95
- **Node requirement**: >=22.14.0

### What it does

OKF Viewer is a read-only local browser for OKF bundles. It provides a CLI (`okf-viewer open`) that starts a local Next.js web server, opens the bundle in the browser, and presents a directory tree sidebar, index-first browsing, concept view with rendered markdown, a cross-link knowledge graph, backlinks, and OKF conformance validation (`okf-viewer validate`). It works entirely offline with no upload or remote fetch. It is best-effort: any folder of markdown works; valid concepts get full Concept View while other `.md` files stay readable.

### Installation

```bash
# Zero-install (npx):
npx okf-viewer@latest open /path/to/bundle

# Global install:
npm i -g okf-viewer
okf-viewer open /path/to/bundle
```

**Prerequisites**: Node.js >= 22.14.0

### Full CLI Interface

Binary: `okf-viewer` (entry: `./bin/okf-viewer.mjs`)

| Command | Description |
|---------|-------------|
| `okf-viewer open [path]` | Browse OKF bundle in browser (default path: `.`) |
| `okf-viewer validate <dir>` | OKF v0.1 Section 9 conformance check |

**`open` flags**:

| Flag | Description |
|------|-------------|
| `--bind <ip>` | Listen address (default: `localhost`) |
| `--port <number>` | Listen port (default: `3847`) |

Example:
```bash
okf-viewer open ./my-bundle --bind 0.0.0.0 --port 3847
```

**`validate` flags**: Takes a directory argument; checks OKF v0.1 Sec 9 conformance. CLI only (open mode stays best-effort). No additional flags documented.

### What the viewer shows (browser interface)

When you run `okf-viewer open`, the browser shows a Next.js SPA with:

1. **Directory Tree** (sidebar) — folders and concept files from the bundle, for orientation and direct jumps. When a directory contains `index.md`, opening it prefers the Index over a file listing.

2. **Index-first browsing** — directories with `index.md` show the index content rather than raw file listings.

3. **Concept View** — for valid concepts (with frontmatter):
   - Title, type, tags, description from frontmatter
   - Fully rendered markdown body (tables, code, GFM via `react-markdown` + `remark-gfm`)
   - Backlinks: shows other concepts that link to this one
   - In-bundle links navigate within the Viewer; external URLs open in new tab

4. **Bundle Links** — in-bundle `.md` links stay in the Viewer; external URLs open outside; missing targets show a "missing concept" state rather than 404.

5. **Knowledge Graph** — accessible from sidebar:
   - Nodes = concepts, edges = markdown links between them
   - Search by title, Concept ID, or tag
   - Filter by frontmatter type (type-colored nodes)
   - Switchable layouts: vertical and horizontal
   - Node selection shows type, ID, description, tags before opening full Concept View
   - Built with `@xyflow/react` + `@dagrejs/dagre`

6. **Tags and Types views** — frontmatter grouping for browsing by tag or type.

7. **Light/Dark theme** — toggle with persistent preference.

8. **Best-effort mode** — any folder of `.md` files opens. Only valid Concepts get Concept View; other files stay readable.

### Architecture

Monorepo with:
- **CLI** (`bin/okf-viewer.mjs`, `src/lib/cli-args.mjs`) — CLI argument parsing and Next.js server startup
- **Bundle parser** (`src/lib/bundle/filesystem.mjs`) — filesystem walking, frontmatter parsing via `gray-matter`
- **Validator** (`src/lib/bundle/validate-bundle.mjs`) — OKF v0.1 Sec 9 conformance checking
- **Next.js app** (`src/app/`, `src/components/`, `src/hooks/`) — React SPA with shadcn/ui components
- **Link extraction**: uses `remark` + `unist-util-visit` for markdown AST link extraction

**Dependencies**: Next.js 16.2.10, React 19.2.4, react-markdown 10.1.0, @xyflow/react 12.11.2, @dagrejs/dagre 3.0.0, gray-matter 4.0.3, shadcn/ui, Tailwind CSS v4, lucide-react icons.

### Configuration

No config file needed. The viewer reads directly from the bundle directory. Uses Next.js `next.config.ts` for framework config. Light/dark theme toggle is user-persisted in the browser.

### Skills/AI Integration

The repository includes:
- `AGENTS.md` — custom instructions for AI agents working on the codebase
- `CLAUDE.md` — Claude-specific instructions
- `CONTEXT.md` — durable context file (OKF-aware language)

No explicit MCP server or SKILL.md for downstream AI integration. The viewer itself is a human-facing tool; it doesn't generate AI-consumable output (unlike Kiso's `llms.txt`).

### End-to-end flow

```bash
# 1. Point the CLI at any OKF bundle directory
$ okf-viewer open ./path/to/okf-bundle

# 2. A Next.js server starts on localhost:3847
# 3. Browser opens automatically
# 4. User sees:
#    - Left sidebar: Directory tree of all markdown files
#    - Main area: Index page or concept view
#    - Click any concept: Shows frontmatter metadata + rendered markdown body
#    - Click any in-bundle link: Navigates to that concept
#    - Click "Graph" in sidebar: Force-directed graph of all concept links
#    - Search/filter graph by title, ID, or type
#    - Toggle light/dark theme
# 5. All browsing is read-only, offline, no upload/remote fetch
```

```bash
# Validation
$ okf-viewer validate ./path/to/okf-bundle
# Reports OKF v0.1 §9 conformance errors with exit code 1 if non-conformant
```

---

## 4. Okapi (okapi-okf) — OKF Knowledge Studio

### Repository
- **URL**: <https://github.com/sebastienfi/okapi-okf-knowledge-studio>
- **npm**: <https://www.npmjs.com/package/okapi-okf>
- **Stars**: 2
- **Commits**: 22
- **Version**: 0.2.1
- **Weekly Downloads**: ~16
- **License**: MIT
- **Language**: TypeScript (pnpm monorepo, pure ESM)
- **Owner**: sebastienfi (Sébastien Fichot)
- **Node requirement**: >=20

### What it does

Okapi is a full-featured OKF Knowledge Studio — an interactive browser-based tool to visualize, explore, audit, edit, and query any OKF bundle. It renders an interactive force-directed graph of all concepts, provides rich detail panels with rendered markdown, enables in-browser editing of `.md` source files (live preview), computes insights (orphans, broken links, disconnected groups, stale timestamps, type distribution), and offers an opt-in AI "Ask the bundle" feature with citations. It includes `okapi lint` for OKF conformance checking. Everything works offline except the optional AI feature.

### Installation

```bash
# Zero-install (npx):
npx okapi-okf ./path/to/bundle

# Global npm install:
npm i -g okapi-okf
okapi ./bundle

# Homebrew (macOS/Linux):
brew install sebastienfi/tap/okapi

# Prebuilt binary (no Node required):
# Download from: https://github.com/sebastienfi/okapi-okf-knowledge-studio/releases
```

**Prerequisites**: Node.js >= 20 (or none for prebuilt binary)

### Full CLI Interface

Binary: `okapi` (published as `okapi-okf`)

**`okapi [bundle] [options]`** — Start knowledge studio

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `bundle` | positional | `"."` | Path to an OKF bundle directory |
| `-p, --port <number>` | number | `4317` | Preferred port (auto-increments if taken) |
| `--host <host>` | string | `127.0.0.1` | Host to bind |
| `--no-open` | flag | _false_ | Don't open the browser automatically |
| `--no-watch` | flag | _false_ | Don't watch the bundle for file changes |
| `--ai` | flag | _false_ | Enable AI features (needs `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) |
| `--provider <name>` | string | auto-detect | AI provider: `openai` or `anthropic` (default: `openai` if its key is set) |
| `-v, --version` | flag | — | Print version |

**`okapi lint [bundle] [--strict] [--check-links] [--json]`** — OKF conformance check

| Flag | Description |
|------|-------------|
| `bundle` | Path to bundle (default `"."`) |
| `--strict` | Enable strict conformance checking |
| `--check-links` | Verify cross-file links resolve correctly |
| `--json` | Output results as JSON |

Exit code 1 if not conformant.

### What the studio shows (browser interface)

When you run `okapi ./bundle`, the browser opens with:

1. **Interactive Force-Directed Graph** (canvas using `react-force-graph-2d`):
   - Every concept as a node, sized by degree (how connected it is)
   - Colored by type (per-type color mapping)
   - Hover highlights the node's neighborhood
   - Click focuses on a node
   - Filter by type, hide structural files, search by name
   - Nodes persist positions across data refetches

2. **Rich Detail Panel**:
   - Frontmatter metadata (type, ID, title, description, tags, all unknown keys preserved)
   - Fully rendered markdown body (tables, code syntax highlighting with `rehype-highlight`, GFM)
   - In-app navigation between linked concepts (internal `.md` links navigate the graph)
   - Backlinks and neighbor information

3. **In-Browser Editing**:
   - CodeMirror 6 editor with edit/split/preview modes
   - Live preview as you type
   - Save writes directly to the `.md` file on disk
   - Atomic saves with hash-based conflict detection (409 on stale hash)

4. **Insights Panel**:
   - **Orphans** — concepts with no incoming or outgoing links
   - **Broken links** — links to missing in-bundle `.md` files
   - **Disconnected groups** — components in the graph not connected to the main cluster (computed via union-find)
   - **Stale timestamps** — concepts not updated recently
   - **Type distribution** — count of concepts per type
   - All computed client-side from the graph payload
   - Click any insight to focus the graph on affected nodes

5. **Ask the Bundle (AI)**:
   - Opt-in only (requires `--ai` flag + API key)
   - Streams `POST /api/ai/ask` via SSE (Server-Sent Events)
   - Renders answer as markdown with citation chips that focus the cited node in the graph
   - **Supported providers**: OpenAI (default model: `gpt-5.5`) or Anthropic (default model: `claude-opus-4-8`)
   - Model overridable via `OKAPI_MODEL` env var
   - **Privacy**: Only concept text + question sent to provider; everything else works fully offline

### Architecture

```
packages/core   Pure parser: walk → frontmatter → markdown-AST link extraction → resolve → graph + conformance
packages/cli    Hono server (graph/node/save/watch/AI) + the `okapi` CLI (published as "okapi-okf")
apps/web        React + Vite SPA: force-directed graph, detail panel, editor, insights, Ask
```

**Parser pipeline** (`packages/core`):
1. **Walk** — `fast-glob` for `**/*.md`, symlinks not followed
2. **Frontmatter** — split on `---`, parsed with `js-yaml`. Mirrors OKF reference validator: file not starting with `---` has no frontmatter; unterminated block or non-mapping yields a parse error (never a crash). Bundle-root `index.md`'s `okf_version:` line is special-cased
3. **Link extraction** — body parsed to markdown AST via `remark`; only `link`/`definition` nodes produce edges. Code fences and inline code **never** produce edges (Cypher and code samples generate zero edges by construction)
4. **Resolution** — mirrors `validate_okf.py`: skip external/anchor links, strip fragments, resolve `/`-absolute from bundle root and relative from file directory, reject `..` escapes, keep only in-bundle `.md`. A missing in-bundle `.md` target is a **broken link** recorded on the source node, never a dangling edge
5. **Nodes** carry `type` (drives color), `degree` (drives size), `conformance` status, `brokenLinks`, and all unknown frontmatter keys preserved verbatim

**Server** (`packages/cli`): Hono HTTP server with these API routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/graph` | GET | Nodes + edges + bundle meta (no bodies) |
| `/api/node?path=` | GET | One node: raw content, frontmatter, neighbors, hash |
| `/api/node?path=` | PUT | Save (atomic, path-guarded, 409 on stale hash) |
| `/api/report` | GET | Health report |
| `/api/lint` | GET | OKF conformance check |
| `/api/events` | GET | SSE — bundle-changed notifications (file watch via chokidar) |
| `/api/ai/status` | GET | AI feature availability |
| `/api/ai/ask` | POST | AI question (streams SSE response) |
| `/api/files/*` | GET | Non-MD assets referenced by markdown |
| `*` | GET | The built SPA (with fallback) |

**Frontend** (`apps/web`): React + Vite SPA with:
- TanStack Query (server cache)
- Zustand (ephemeral UI state)
- URL hash (deep-linkable selection)
- CSS variables for light/dark theme swap
- `react-markdown` + `rehype-highlight` for concept body rendering
- `react-force-graph-2d` for graph (canvas)
- CodeMirror 6 for editing

**Packaging**: Web app builds into `packages/cli/dist/public`; `tsup` bundles the CLI (with `@okapi/core` inlined) into `dist/cli.js`. `npx okapi-okf` needs no build step.

### Configuration

All configuration via environment variables (no config file):

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENAI_API_KEY` | OpenAI key for `--ai` feature | — |
| `ANTHROPIC_API_KEY` | Anthropic key for `--ai` feature | — |
| `OKAPI_PROVIDER` | `openai` or `anthropic` when both keys set | `openai` |
| `OKAPI_MODEL` | Model for AI answers (must match provider) | provider default |

### Skills/AI Integration

- No explicit SKILL.md in the repo
- The tool itself is an AI-augmented tool: the "Ask the bundle" feature is the AI integration
- No MCP server; the tool is a standalone Hono server
- The project includes `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`

### End-to-end flow

```bash
# 1. Start the studio against any OKF bundle
$ npx okapi-okf ./path/to/bundle

# 2. Server starts on http://127.0.0.1:4317
# 3. Browser opens automatically showing:
#    - Center: Force-directed graph of all concepts (nodes sized by degree, colored by type)
#    - Click a node: Detail panel opens with metadata + rendered markdown
#    - Navigate: Click internal links to jump between concepts
#    - Edit: Switch to edit mode, modify .md source, live-preview, save to disk
#    - Insights: View orphans, broken links, disconnected groups, stale timestamps, type distribution
#    - Filter: Filter graph by type, search by name
# 4. Changes detected in real-time (chokidar file watch → SSE → browser refetch)

# 5. With AI enabled:
$ export OPENAI_API_KEY=sk-...
$ okapi ./bundle --ai
#    - "Ask the bundle" panel appears
#    - Type a question: receives streaming markdown answer with citation links
#    - Click a citation: navigates graph to the cited concept

# 6. Lint the bundle:
$ okapi lint ./bundle --strict --check-links
#    - Checks OKF conformance
#    - Verifies cross-file links
#    - Exit code 1 if non-conformant
```
