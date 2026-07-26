# OKF Ecosystem Deep-Dive: Agent Skills & Memory Systems

## Table of Contents

1. [rakibtg/okf-skill](#1-rakibtgokf-skill) — Agent Skill for OKF (most important)
2. [fabricioctelles/skills — okf-open-knowledge-format](#2-fabricioctellesskills--okf-open-knowledge-format)
3. [EliaszDev/hermes-okf](#3-eliaszdevhermes-okf) — Agent Memory System
4. [okforge (npm, jetienne)](#4-okforge-npm-jetienne) — Claude Code OKF Skill

---

## 1. rakibtg/okf-skill

- **Repository**: https://github.com/rakibtg/okf-skill
- **Stars**: 4 | **Forks**: 1 | **Commits**: 19 (branch `main`)
- **License**: Apache-2.0 (skill code); vendored SPEC.md is from Google
- **Language**: Python 3 (stdlib only), Markdown

### What it does

The canonical Agent Skill that teaches AI coding agents (Claude Code, OpenCode, Codex) how to read, write, validate, and maintain Open Knowledge Format bundles. It wraps the Google OKF v0.1 spec into a repeatable workflow: scaffold a bundle, create correctly-frontmattered concept docs, regenerate index.md from concept frontmatter, append dated log entries, and validate conformance — all via deterministic, dependency-free Python scripts. It implements the "LLM Wiki" pattern (Karpathy gist) as a structured, interlinked, progressively-disclosed knowledge base.

### Installation

```bash
# Recommended: via skills.sh
npx skills add rakibtg/okf-skill

# Manual: Claude Code (project)
mkdir -p .claude/skills && cp -r skills/okf .claude/skills/okf-skill

# Manual: OpenCode
mkdir -p .opencode/skills && cp -r skills/okf .opencode/skills/okf-skill

# Manual: Codex / generic Agent Skills
mkdir -p .agents/skills && cp -r skills/okf .agents/skills/okf-skill
```

**Compatibility**: `compatibility: general` — works with any agent that supports the Agent Skills format (Claude Code, OpenCode, Codex). Auto-discovered at multiple paths (`.claude/skills`, `.opencode/skills`, `.agents/skills`).

### Project Structure

```
skills/okf/
  SKILL.md                          # Progressive-disclosure skill instructions (~150 lines)
  scripts/                          # Python 3, stdlib only
    _okf_common.py                  # Shared frontmatter/link parsing helpers
    init_bundle.py                  # Scaffold bundle: root index.md + log.md
    new_concept.py                  # Create correctly-frontmattered concept doc
    gen_index.py                    # Regenerate index.md from concept frontmatter
    add_log_entry.py                # Append dated entry to nearest log.md
    validate.py                     # Check §9 conformance + soft warnings + links
  references/
    SPEC.md                         # Vendored full OKF v0.1 spec (from GoogleCloudPlatform/knowledge-catalog)
    cheatsheet.md                   # One-page quick reference
  templates/
    concept.md.tmpl                 # Concept file template with frontmatter placeholders
    index.md.tmpl                   # Index file template
    log.md.tmpl                     # Log file template
```

### SKILL.md Content (Full Summary)

The SKILL.md is a ~150 line progressive-disclosure instruction file. Key sections:

**Frontmatter**:
```yaml
name: okf-skill
description: 'Author, validate, and maintain Open Knowledge Format (OKF) for AI-agent-readable knowledge...'
license: Apache-2.0
compatibility: general
metadata:
  spec: "OKF v0.1 (Google, GoogleCloudPlatform/knowledge-catalog)"
  spec-source: "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"
```

**Auto-trigger logic** (from description):
- BEFORE any non-trivial coding task: check if repo has OKF bundle (look for `index.md`/`log.md` or concept with `type` frontmatter) and read relevant concepts first
- AFTER finishing a task that changes documented things: add log entry and update/create concepts before considering the task done
- Explicit triggers: "OKF", "knowledge bundle", "knowledge catalog", scaffolding, adding concepts, generating index, validating conformance, converting docs

**Core vocabulary** (agent told to memorize, not re-derive):
- **Bundle** = directory tree. **Concept** = one `.md` file.
- **Concept ID** = path minus `.md` (`tables/users.md` → `tables/users`)
- **Reserved**: `index.md` (listing, §6) and `log.md` (change history, §7)
- **Required frontmatter**: only `type` (free-text string). Recommended: `title`, `description`, `resource`, `tags`, `timestamp`
- Conventional body sections: `# Schema`, `# Examples`, `# Citations`
- Links: bundle-root-relative (`/tables/customers.md`) preferred
- **Conformance (§9)**: only 3 hard rules

**Workflow** (7 branches):

1. **Starting a bundle**: `python3 scripts/init_bundle.py <path> [--okf-version 0.1]`
2. **Adding a concept**: `python3 scripts/new_concept.py <bundle_root> <concept/path> --type "..." --title "..." --description "..." [--resource <uri>] [--tags a,b]`
3. **Cross-linking**: always bundle-root-relative paths
4. **Keeping index.md current**: `python3 scripts/gen_index.py <bundle_root> [--dir <subdir>] [--dry-run]`
5. **Recording history**: `python3 scripts/add_log_entry.py <bundle_root> [--dir <subdir>] --kind Update --text "..."`
6. **Validating**: `python3 scripts/validate.py <bundle_root> [--strict] [--check-links]`
7. **Converting existing docs**: map each entity to one concept file

**Guardrails**:
- Never treat unknown `type` values, missing optional fields, or broken links as errors
- Never put frontmatter in non-root `index.md`
- Never fabricate `resource` URIs, schema columns, or citations
- Prefer `validate.py` over eyeballing frontmatter

### Script Descriptions (Key Code Details)

#### `_okf_common.py` — Shared helpers

Implements a **minimal YAML frontmatter parser** sufficient for OKF (flat scalar keys + one level of list values), deliberately not a general YAML parser. Key functions:

- `split_frontmatter(text)` → `(fm_text_or_None, body_text)` — hand-rolled `---` delimiter parser
- `parse_frontmatter(fm_text)` → `dict` — supports scalars, inline lists `[a, b, c]`, and block lists with `- ` indentation
- `dump_frontmatter(fields)` → YAML string from list of `(key, value)` tuples, smart-quoting scalars containing special chars
- `dump_scalar(value)` — quotes strings that look numeric/bool, contain special chars
- `now_iso8601()` → `datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`
- `is_reserved(filename)` → True for `index.md`, `log.md`
- `iter_markdown_files(bundle_root)` → sorted `.md` paths, skipping `.git`, `node_modules`, `.venv`
- `iter_concept_files(bundle_root)` → non-reserved `.md` files
- `extract_links(body_text)` → list of `(link_text, url)` via regex
- `resolve_link(bundle_root, source_path, url)` → absolute filesystem path or None (external)
- `concept_id(bundle_root, path)` → relative path without `.md`

#### `init_bundle.py`

Creates bundle root directory with:
1. **Root `index.md`**: contains `okf_version` frontmatter (if provided, default `"0.1"`) + `# Concepts` placeholder body with comment `<!-- run gen_index.py to populate this automatically -->`
2. **Empty `log.md`**: `# Directory Update Log`

Flags: `--okf-version` (default `0.1`, pass `""` to omit), `--force` (overwrite existing)

#### `new_concept.py`

Creates a correctly-frontmattered concept file. Key behavior:
- Strips `.md` suffix if accidentally provided in concept_path
- Rejects reserved filenames (`index.md`, `log.md`)
- Auto-creates parent directories
- Timestamp defaults to now (UTC, ISO 8601) unless `--no-timestamp`
- Tags parsed from comma-separated `--tags` arg
- Body populated from template with `# Schema` / `# Examples` / `# Citations` placeholder sections (skip with `--no-sections`)
- Warnings printed for missing `--title` or `--description`

Frontmatter order: `type`, `title`, `description`, `resource`, `tags`, `timestamp` (null values omitted via `dump_frontmatter`)

#### `gen_index.py`

Regenerates `index.md` from concept frontmatter. Key behaviors:
- Walks directories recursively (skipping `.git`, `node_modules`, `.venv`)
- For each dir: reads concepts' frontmatter → extracts `title`/`description`; lists subdirectories with their `<!-- description: ... -->` markers
- **Root `index.md`**: preserves `okf_version` frontmatter (read from existing, re-written)
- **Non-root `index.md`**: strictly no frontmatter
- `--dir` flag: regenerate only one directory
- `--describe` flag: set/update a directory's one-line description marker
- `--dry-run`: show what would change without writing
- Reports `[unchanged]` or `[would change]` per file

#### `add_log_entry.py`

Appends to `log.md` with correct §7 formatting. Key behaviors:
- Creates log.md if it doesn't exist (with `# Directory Update Log` header)
- Finds the first `## YYYY-MM-DD` heading. If today's date matches → inserts as first bullet under it. If not → inserts a new date section **newest-first** (before the existing oldest section)
- Entry format: `* **{kind}**: {text}`
- Default `--kind`: `Update`, `--date`: today (local)
- Supports `--dir` for per-subdirectory log.md files

#### `validate.py`

Checks §9 conformance (3 hard rules) + optional soft warnings + link checking. Architecture:

**Rule 1** (parseable frontmatter on every non-reserved `.md`): checks each concept file for `---` delimiters, parseable YAML. Failures reported as `(relpath, reason)`.

**Rule 2** (non-empty `type` field): checks `type` exists and is non-empty string.

**Rule 3** (index.md/log.md shape):
- Non-root `index.md`: must NOT have frontmatter (FAIL)
- Root `index.md`: may have `okf_version` only; other keys → WARNING
- `log.md`: must NOT have frontmatter (FAIL); date headings must be ISO 8601 `## YYYY-MM-DD` (FAIL); newest-first ordering checked (WARNING)

**Soft warnings**: missing `title`/`description` (becomes FAIL in `--strict` mode), non-ISO timestamp, `tags` not a list

**Link check** (`--check-links`): resolves all internal markdown links, reports broken ones (informational only, never FAIL per §5.3/§9)

**Exit code**: 0 if conformant, 1 otherwise

**Output format**:
```
OKF Conformance Report: <root>
  concepts checked: N

Rule 1 (parseable frontmatter on every non-reserved .md): PASS/FAIL
Rule 2 (non-empty `type` field): PASS/FAIL
Rule 3 (index.md/log.md shape, §6/§7): PASS/FAIL

Warnings (soft guidance, never blocking per §9):
  - ...

Link check: N internal link(s) checked, M unresolved (informational only, never a conformance failure)

Overall: CONFORMANT / NOT CONFORMANT
```

### Template Files

#### `concept.md.tmpl`
```yaml
---
type: {{type}}
title: {{title}}
description: {{description}}
resource: {{resource}}
tags: [{{tags}}]
timestamp: {{timestamp}}
---

# Schema
<!-- Table of fields/columns, if this concept describes a structured asset. Delete this section if not applicable. -->
| Field | Type | Description |
|---|---|---|
|  |  |  |

# Examples
<!-- Concrete usage examples. Delete this section if not applicable. -->

# Citations
<!-- Numbered external sources backing claims made above. Delete this section if not applicable.
[1] [Source label](https://example.com) -->
```

#### `index.md.tmpl`
```markdown
# Concepts
* [Title](relative-url.md) - one-line description

# Subdirectories
* [Subdir](subdir/) - one-line description
```

#### `log.md.tmpl`
```markdown
# Directory Update Log

## YYYY-MM-DD
* **Creation**: Established this bundle/directory.
```

### Cheatsheet (`references/cheatsheet.md`)
A 1-page quick reference covering: file roles table (index.md/log.md rules), concept frontmatter fields, conventional body headings, link conventions, index.md/log.md body shapes with examples, and the 3 conformance rules.

### Progressive Disclosure Design

The architecture implements a 3-level progressive disclosure:
1. **SKILL.md** (~150 lines) — agent loads this into context. Contains core vocabulary, workflow branches, and guardrails. References external files for detail.
2. **references/cheatsheet.md** — opened when agent needs a quick rule (frontmatter fields, link format, conformance). Short enough to not blow context.
3. **references/SPEC.md** — full vendored OKF v0.1 spec. Opened only for edge cases or exact conformance rule checking.

### End-to-End Flow: "Write a concept for a BigQuery table"

1. **User says**: "Add a concept for the orders table, it's a BigQuery table, one row per order"
2. **Agent loads** `SKILL.md` → reads core vocabulary and workflow section 2 ("Adding a concept")
3. **Agent identifies**: needs to run `new_concept.py` with `--type "BigQuery Table"`, appropriate title/description
4. **Agent calls**: `python3 scripts/new_concept.py docs/knowledge tables/orders --type "BigQuery Table" --title "Orders" --description "One row per completed customer order." --resource "https://console.cloud.google.com/..." --tags sales,orders`
5. **Script creates**: `docs/knowledge/tables/orders.md` with correct YAML frontmatter (type, title, description, resource, tags, timestamp) and `# Schema` / `# Examples` / `# Citations` placeholder sections
6. **Agent fills in** the placeholder sections with actual schema data the user provided
7. **Agent asks**: "Should I regenerate the index and add a log entry?" — if yes:
   - `python3 scripts/gen_index.py docs/knowledge` → regenerates `index.md` listing the new concept
   - `python3 scripts/add_log_entry.py docs/knowledge --kind Creation --text "Added [orders](/tables/orders.md)."`
8. **Agent validates**: `python3 scripts/validate.py docs/knowledge` → reports conformance status
9. **Agent reports**: bundle is conformant, OR surfaces exact PASS/FAIL/warning lines

### Key Implementation Patterns

1. **Deterministic validation**: `validate.py` implements the spec's 3 hard rules as code, eliminating subjective "eyeballing" of YAML that drifts across long sessions.
2. **No-drift index**: `gen_index.py` rebuilds from concept frontmatter, never hand-edited prose — guarantees consistency.
3. **Zero dependencies**: All scripts use Python 3 stdlib only. No `pip install`, no `requirements.txt` — runs on any machine.
4. **Minimal YAML parser**: `_okf_common.py` implements just enough YAML for OKF frontmatter (flat scalars, inline/block lists). Deliberately not general-purpose — raises `FrontmatterError` on anything unparseable rather than silently misreading.
5. **Token economy**: Fixed-flag scripts eliminate planning overhead (agent doesn't re-derive frontmatter format) and re-verification overhead (agent trusts deterministic output).
6. **Progressive disclosure in skill structure**: SKILL.md keeps context cheap, references/ expand on demand.

---

## 2. fabricioctelles/skills — okf-open-knowledge-format

- **Repository**: https://github.com/fabricioctelles/skills/tree/main/skills/okf-open-knowledge-format
- **Parent repo stars**: 37 | **Forks**: 3
- **License**: Apache-2.0
- **Language**: Shell (validator), Markdown (skill + references)

### What it does

A comprehensive Agent Skill for OKF that focuses on **creation, validation, enrichment, and conversion** of OKF bundles. It provides deep guides for migrating from Notion, Obsidian, and CSV sources, integrates with Google Cloud Knowledge Catalog via `kcmd`, and recommends the `okflint` Python linter for validation. Unlike rakibtg/okf-skill (which ships Python scripts), this skill is primarily **instructional** — it tells the agent what to do in prose and provides a lightweight bash validator as fallback.

### Installation

```bash
npx skills add fabricioctelles/okf-open-knowledge-format
```

### Project Structure

```
skills/okf-open-knowledge-format/
  SKILL.md                # Main skill instructions
  scripts/
    validate.sh           # Bash validator (3 conformance rules + warnings)
  references/
    spec-v01.md           # Vendored OKF v0.1 spec
    conversion.md         # Migration guides (Notion, Obsidian, CSV)
    examples.md           # Domain examples (metrics, tables, APIs)
```

### SKILL.md Content (Full Summary)

**Frontmatter**:
```yaml
name: okf-open-knowledge-format
description: Create, validate, and enrich Open Knowledge Format (OKF) bundles...
metadata:
  author: ft.ia.br
  version: "1.1"
  date: 2026-06-17
  category: library-and-api-reference
```

**Key sections**:

**Design Principles**: Minimally opinionated, Producer/consumer independence, Format not platform.

**Key Terminology**: Bundle, Concept, Concept ID, Frontmatter, Body, Link, Citation — same as rakibtg/okf-skill.

**Quick Reference Table**: `type` (required), `title`/`description`/`resource` (recommended), `tags`/`timestamp` (optional). Reserved filenames table. Conventional body headings (`# Schema`, `# Examples`, `# Citations`).

**Create a Bundle** (8-step workflow):
1. Determine scope and structure (ask user)
2. Create concept documents (minimal example shown)
3. Cross-link concepts (absolute preferred, broken links OK)
4. Generate index.md (no frontmatter, list with descriptions)
5. Generate log.md (newest-first, bold keyword convention)
6. Declare version on root index.md
7. Distribution (git repo recommended)
8. Verify conformance (3 rules)

**Validate a Bundle**:
- **Preferred**: `okflint` (Python linter with 18 rules, manifest-driven profiles, wikilink resolution, JSON output). Agent checks `command -v okflint` first; if missing, offers to install via `uv tool install okflint` or `pip install okflint`.
- **Fallback**: `scripts/validate.sh` (bash script checking 3 core rules).
- Error codes: **E1** (no YAML frontmatter), **E2** (no/missing `type` field), **E3** (reserved file structure error)
- Warning codes: **W1** (missing recommended fields), **W2** (broken cross-link), **W3** (no timestamp), **W4** (no index.md), **W5** (non-ISO date headings)

**Enrich Concepts**: Add schema sections, examples sections, citations, cross-links, fill recommended fields. References the official Google enrichment agent pattern (BQ pass → Web pass).

**Convert Sources to OKF**: Notion (properties → frontmatter, remove UUIDs, convert links), Obsidian (wikilinks → markdown links, ensure `type`, inline `#tags` → frontmatter), CSV (row → concept, columns → fields, first column = filename).

**Serve via Knowledge Catalog**: `kcmd` CLI (bidirectional sync between OKF and Google Cloud Knowledge Catalog), MCP server mode, reference enrichment agent (2-pass: BQ metadata + web crawl).

**Guardrails**: Never invent data, preserve unknown fields, don't impose taxonomy, broken links OK, minimal by default, ask before assuming.

**Output Format**: Directory tree → each file content → conformance check.

### `validate.sh` — Bash Validator

A `#!bash` script that checks:
- **E1** (frontmatter): `head -1 "$file" | grep -q "^---$"`
- **E2** (type field): extracts frontmatter with `sed`, greps for `type:`, checks non-empty
- **E3** (reserved files): non-root `index.md` must not have frontmatter; `log.md` must have `## YYYY-MM-DD` headings
- **Warnings**: missing `title`, missing `description`

Color-coded output (RED fail, GREEN pass, YELLOW warning). Exit code = error count.

**Limitation vs rakibtg/validate.py**: This is a grep/sed-based bash script, not a YAML parser. It cannot:
- Parse block lists (`tags:\n  - a` will be missed)
- Handle quoted strings properly
- Check link integrity
- Validate frontmatter structure beyond basic regex
- Distinguish strict mode vs soft warnings

### Comparison with rakibtg/okf-skill

| Aspect | rakibtg/okf-skill | fabricioctelles/okf-open-knowledge-format |
|--------|------------------|------------------------------------------|
| **Approach** | Scripts-first: 6 Python scripts handle mechanics | Prose-first: SKILL.md is a comprehensive guide; bash validator is fallback |
| **Scripts** | Python 3, stdlib-only, proper YAML parser | Single bash script, grep/sed-based |
| **Validation** | Proper YAML parsing, 3 rules + soft guidance + link checking + strict mode | Regex-based basic checks, recommends external `okflint` tool |
| **Depth** | Deep on deterministic mechanics | Deep on conversion guides, enrichment patterns, Knowledge Catalog integration |
| **Enterprise** | Not covered | Extensive: kcmd, MCP server, Google Cloud Knowledge Catalog, reference enrichment agent |
| **Install** | `npx skills add rakibtg/okf-skill` | `npx skills add fabricioctelles/okf-open-knowledge-format` |
| **Conventions** | Snake case not enforced | Uses standard OKF conventions |
| **Unique features** | gen_index.py (auto-regenerate from frontmatter), add_log_entry.py, no-drift guarantee | okflint integration, Notion/Obsidian/CSV conversion guides, `kcmd` sync |

### End-to-End Flow

1. **Agent loads** `SKILL.md` → reads design principles, terminology, quick reference
2. **User asks**: "Create an OKF bundle for our SaaS metrics"
3. **Agent follows 8-step workflow**:
   - Asks what knowledge to capture (tables, metrics, APIs?)
   - Creates concept `.md` files with correct frontmatter (model-driven, no script)
   - Cross-links with bundle-root-relative paths
   - Generates `index.md` manually (lists with descriptions from frontmatter)
   - Creates `log.md` with creation entries
   - Declares `okf_version: "0.1"` on root `index.md`
   - Validates: tries `okflint` first, falls back to `validate.sh`
   - Presents directory tree + file contents + conformance status

---

## 3. EliaszDev/hermes-okf

- **Repository**: https://github.com/EliaszDev/hermes-okf
- **Stars**: 26 | **Forks**: 2 | **Commits**: 71 (branch `main`)
- **License**: MIT
- **Language**: Python (>=3.9)
- **Package**: `hermes-okf` v0.5.9 on PyPI
- **Dependencies**: `pyyaml>=6.0` (core), optional: `gitpython` (git), `langchain`/`chromadb` (RAG)

### What it does

A universal OKF-based memory system for the Hermes agent ecosystem. It wraps OKF bundles as persistent, structured, version-controlled agent memory — every decision, observation, tool call, session, plan, and project context lives in a filesystem-based knowledge graph (plain `.md` + YAML). Features include a hot/cold memory model, Git-backed history (`GitOKFBundle`), a 15-check configuration validator, Python decorators for agent integration (`@memorize_decision`, `@memorize_tool`), full-text search with optional fuzzy matching, graph extraction from markdown links, and both Hermes plugin and standalone CLI modes.

### Installation

```bash
# Core
pip install hermes-okf

# With Git support
pip install hermes-okf[git]

# With RAG support
pip install hermes-okf[rag]

# Full
pip install hermes-okf[all]
```

### Project Structure

```
src/hermes_okf/
  __init__.py              # Package init, version
  cli.py                   # Standalone CLI (argparse, 22 subcommands)
  bundle.py                # OKFBundle: filesystem I/O, CRUD, logging
  concept.py               # Concept dataclass
  agent.py                 # HermesMemoryMixin + decorators
  memory.py                # HermesMemory: session/decision/observation/project
  git_bundle.py            # GitOKFBundle: auto-commit, diff, revert, git log
  graph.py                 # GraphExtractor: link/graph traversal, tag clustering
  search.py                # SearchIndex: inverted index, fuzzy search
  validators.py            # OKFValidator: conformance checking
  hermes.py                # HermesAgent: full agent state in OKF bundle
  config_validator.py      # ConfigValidator: 15-check Hermes plugin diagnostics
  memory_plugin.py         # HermesOKFMemoryProvider (MemoryProvider ABC)
  plugin.py                # Hermes plugin registration
  hermes_integration.py    # HermesOKFProvider: universal provider
  cli_extension.py         # Hermes CLI extension (hermes okf <sub>)
  install_plugin.py        # Plugin installer/uninstaller
```

### Full CLI Interface

#### Standalone CLI (`hermes-okf`)

| Command | Flags | Description |
|---------|-------|-------------|
| `hermes-okf init [path]` | `--path`, `--force` | Initialize a new OKF bundle with root index.md + log.md + subdirs (projects/, decisions/, context/) |
| `hermes-okf validate` | `--path` | Run OKF conformance validation |
| `hermes-okf validate-config` | (none) | Run 15 checks on Hermes plugin config (~/.hermes/) |
| `hermes-okf list` | `--path`, `--subdir` | List all concept IDs |
| `hermes-okf show <concept_id>` | `--path`, `--json` | Show concept details (metadata + body) |
| `hermes-okf search <query>` | `--path`, `--top-k` | Full-text search (inverted index, TF-like scoring) |
| `hermes-okf log` | `--path`, `--git`, `--oneline`, `--limit` | Show agent log (or Git history with `--git`) |
| `hermes-okf log-append <entry>` | `--path`, `--category` | Append entry to log.md |
| `hermes-okf diff [from_ref] [to_ref]` | `--path` | Show file-level diff between Git refs (defaults: HEAD~1..HEAD) |
| `hermes-okf revert [ref]` | `--path` | Restore OKF bundle to a Git ref (creates new commit) |
| `hermes-okf graph-edges` | `--path` | Extract all markdown links as `source -> target (context)` triples |
| `hermes-okf graph-neighbors <concept_id>` | `--path` | List neighbors of a concept |
| `hermes-okf snapshot` | `--path`, `--note`, `--agent-id` | Save agent state snapshot |
| `hermes-okf context <query>` | `--path`, `--top-k`, `--agent-id` | Build LLM context from bundle (system prompt + active plan + relevant memory + recent log + tools) |
| `hermes-okf sessions` | `--path` | List agent session IDs |
| `hermes-okf plans` | `--path` | List active plans |
| `hermes-okf tools` | `--path` | List registered tools |
| `hermes-okf install-plugin` | (none) | Install hermes-okf as Hermes plugin (~/.hermes/plugins/) |
| `hermes-okf uninstall-plugin` | (none) | Remove plugin from Hermes |
| `hermes-okf --version` | (none) | Print version |

#### Hermes Plugin CLI (`hermes okf`)

| Command | Description |
|---------|-------------|
| `hermes okf search "dark mode"` | Search OKF memory |
| `hermes okf list --type Decision` | List stored concepts |
| `hermes okf show config/agent` | Show concept content (with `--raw` flag for raw output) |
| `hermes okf show sessions/2026-06-14T22-14-58Z` | Show a session |
| `hermes okf snapshot --note "Before deployment"` | Save a snapshot |
| `hermes okf restore` | Restore from last snapshot |

### Key Classes and APIs

#### `Concept` dataclass (`concept.py`)
```python
@dataclass
class Concept:
    id: str                          # "projects/my_project"
    type: str = "Unknown"            # "Decision", "Project", "Metric"
    title: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    resource: str | None = None
    timestamp: str | None = None
    body: str = ""                   # Markdown body
    metadata: dict[str, Any] = field(default_factory=dict)  # Raw frontmatter
```

#### `OKFBundle` (`bundle.py`)
Core bundle manager with filesystem I/O:
- `__init__(root_path)` — creates root if missing, auto-inits minimal OKF structure (index.md with `okf_version`, log.md, subdirs: projects/, decisions/, context/)
- `read_concept(concept_id) → Concept | None` — reads and parses YAML frontmatter + body
- `write_concept(concept_id, body, **frontmatter) → Concept` — writes/overwrites, auto-adds timestamp
- `delete_concept(concept_id) → bool`
- `list_concepts(subdir=None) → list[str]` — returns all non-reserved concept IDs
- `append_log(entry, category="Update")` — appends dated entry to log.md
- `read_log() → str`
- `search_by_tag(tag) → list[Concept]`
- `get_graph_edges() → list[dict]` — extracts all `[text](url)` markdown links as `{source, target, context}` dicts
- `get_neighbors(concept_id) → list[dict]`
- `to_dict(concept_id) → dict | None`

#### `HermesMemory` (`memory.py`)
High-level memory interface:
- `start_session(session_id) → str` / `end_session(session_id)`
- `record_decision(decision, rationale, tags) → Concept` — stores under `decisions/{slug}_{date}`
- `record_observation(observation, category)` — appends to log
- `record_tool_call(tool_name, result_summary)` — appends to log
- `recall(query, top_k=5) → list[Concept]` — full-text search
- `recall_by_tag(tag) → list[Concept]`
- `recall_project(project_name) → Concept | None`
- `get_recent_log(n_lines=50) → str`
- `get_decisions() → list[Concept]`
- `register_project(project_id, title, description, tags, resource) → Concept`
- `update_project(project_id, body, **metadata) → Concept`

#### Decorators (`agent.py`)

**`@memorize_decision`**: Persists a function's return value as a Decision concept. Auto-detects `self.memory` on mixin instances. Captures arguments and return value in the decision body.

**`@memorize_tool`**: Logs each call as a Tool-Call entry in log.md (category: "Tool-Call").

**`@memorize_observation`**: Logs each call as an Observation entry.

**`HermesMemoryMixin`**: Mixin class with convenience wrappers:
- `wrap_decision(fn)`, `wrap_observation(fn)`, `wrap_tool(fn)` — for use in `__init__`
- `with_context(query, top_k=3)` — recall + return relevant context
- Auto-creates `self.memory` (HermesMemory instance)

#### `GitOKFBundle` (`git_bundle.py`)
Git-backed OKF bundle extending `OKFBundle`:
- **Auto-init**: creates `.git` repo with `.gitignore` if not present
- **Auto-commit triggers**: `auto_commit(action, **kwargs)` for `session_end`, `snapshot`, `plan_complete`, `decision`, `memory_write` — structured commit messages with prefixes `[session]`, `[snapshot]`, `[plan]`, `[decision]`, `[memory]`
- `git_log(limit=10) → list[dict]` — reverse chronological commits with hex, message, author, date
- `git_diff(from_ref, to_ref) → list[dict]` — file-level changes with additions/deletions
- `git_revert(ref) → str | None` — checkout files from ref, commit restored state
- `is_git_repo()`, `head_hex()`

#### `SearchIndex` (`search.py`)
Lightweight in-memory search:
- **Inverted index**: `_build_index()` tokenizes (lowercase alphanumeric tokens), builds `token → [concept_ids]` mapping
- **TF-like scoring**: `search(query, top_k=10) → list[(concept_id, score)]` where score = matching_token_count / query_token_count
- **Fuzzy search**: `fuzzy_search(query, threshold=0.6)` — uses `rapidfuzz` if installed, falls back to token overlap ratio
- **Predicate filter**: `filter(predicate: Callable[[Concept], bool])`
- **Invalidation**: `invalidate()` clears index for rebuild

#### `GraphExtractor` (`graph.py`)
Implicit knowledge graph from markdown links:
- `get_edges()` — all markdown links as directed edges
- `get_neighbors(concept_id)` — outgoing edges
- `get_backlinks(concept_id)` — incoming edges
- `get_children(concept_id)` — same-directory peers
- `get_tag_clusters()` — `{tag: [concept_ids]}`
- `traverse(start_id, max_depth=3)` — BFS from concept, returns nested tree
- `to_networkx()` — export to NetworkX DiGraph

#### `HermesAgent` (`hermes.py`)
Full Hermes agent state in OKF bundle:
- **Structure**: auto-creates `config/`, `tools/`, `sessions/`, `plans/`, `plans/archive/` directories; auto-writes `config/agent` concept with model/system prompt
- **Session lifecycle**: `start_session()`/`end_session()` with status tracking (active/completed)
- **Tool registry**: `register_tool(name, description, schema, example)`, `list_tools()`, `get_tool(name)`
- **Plan execution**: `create_plan(task, steps)`, `complete_step(step_index, result)`, `archive_plan(plan_id)` — tracks progress percentage, [ ]/[x] markers
- **Snapshots**: `snapshot(note)` saves JSON state; `restore(snapshot_id)` restores from snapshot
- **Context builder**: `build_context(query, top_k=5) → str` — combines system prompt, active plan, relevant memory, recent log, and tool registry into a single LLM context string

#### `ConfigValidator` (`config_validator.py`)
15 checks for Hermes plugin setup:
1. `hermes_okf` is importable
2. Version ≥ 0.5.0
3. `~/.hermes/` directory exists
4. Plugin directory exists (`~/.hermes/plugins/hermes-okf/`)
5. `plugin.yaml` is valid YAML with `name` field
6. `config.yaml` exists
7. `config.yaml` is parseable YAML
8. `plugins.enabled` is a list (YAML list, not string)
9. `hermes-okf` is in `plugins.enabled`
10. `memory.provider` is set
11. `memory.provider` is `"hermes-okf"`
12. `memory.bundle_path` is set
13. Model is detected from config
14. Bundle directory is writable
15. Git is available (optional, info-level)

Each check produces a `CheckResult(name, passed, severity, message, fix, value)`. Severities: `critical`, `warning`, `info`.

### Hot/Cold Memory Model

The architecture supports a two-tier memory approach:
- **Hot memory** (`HotMemoryBuffer`): In-memory write buffer for fast access during a session. Not yet flushed to disk.
- **Cold memory** (OKF bundle on filesystem): Persistent storage. Contents flushed from hot buffer to OKF bundle.

The `SearchIndex` has `invalidate()` to rebuild when cold memory changes, and `HermesMemory.recall()` calls `invalidate()` before every search.

### Concept Types

The system defines these concept types (stored in the OKF `type` field):
- **Decision** — architectural/strategic decisions (stored under `decisions/`)
- **Observation** — lightweight events appended to log.md
- **Context** — project or domain context (stored under `context/`)
- **Plan** — tracked plans with steps (stored under `plans/`)
- **Session** — agent session records (stored under `sessions/`)
- **ToolCall** — tool invocation records (appended to log.md)
- **Project** — registered projects (stored under `projects/`)
- **AgentConfig** — agent configuration (stored under `config/`)
- **Snapshot** — state snapshots (stored under `snapshots/`)
- **Tool** — tool definitions (stored under `tools/`)
- **Directory** — subdirectory stubs

### RAG Integration (Optional)

```bash
pip install hermes-okf[rag]
```

Uses LangChain + ChromaDB:
1. `DirectoryLoader` loads all `.md` files from the bundle
2. `MarkdownHeaderTextSplitter` splits on headers (`#`, `##`)
3. `Chroma.from_documents()` creates a persistent vector store
4. `retriever.invoke(question)` returns top-k chunks

### Plugin vs Standalone Modes

**Plugin mode** (`hermes-okf install-plugin`):
- Registers `HermesOKFMemoryProvider` (implements `MemoryProvider` ABC)
- Creates `~/.hermes/plugins/hermes-okf/` with `plugin.yaml`
- Auto-updates `~/.hermes/config.yaml`: adds to `plugins.enabled`, sets `memory.provider`, adds `bundle_path`
- CLI extension: `hermes okf search|list|show|snapshot|restore`
- Session lifecycle hooks: `on_session_start`, `on_session_end`, `on_memory_write`, `on_tool_call`, `prefetch`, `recall`

**Standalone mode** (`hermes-okf`):
- Full CLI with 22 subcommands
- Direct `OKFBundle`, `HermesMemory`, `HermesAgent` usage
- Decorators: `@memorize_decision`, `@memorize_tool`, `@memorize_observation`

### End-to-End Flow: Agent runs → memory.write_decision()

1. **Setup**: `pip install hermes-okf`, `hermes-okf install-plugin`, `hermes-okf validate-config` (15 checks pass)
2. **Agent starts**: `hermes` → `HermesOKFMemoryProvider.initialize()` reads model from `config.yaml`, syncs to OKF `config/agent`
3. **Session begins**: `agent.start_session()` → writes `sessions/2026-06-14T22-14-58Z.md` (type: Session, status: active) + log entry `**Session**: Session started: 2026-06-14T22-14-58Z`
4. **Decision made**: `@memorize_decision` decorator or `memory.record_decision()` → creates `decisions/choose_model_2026-06-14.md`:
   ```yaml
   ---
   type: Decision
   title: "choose_model(task='Write a Python script') -> 'anthropic/claude-3.5-sonnet'"
   description: "choose_model(task='Write a Python script') -> 'anthropic/claude-3.5-sonnet'"
   tags: [decision, auto-decision, choose_model]
   timestamp: "2026-06-14T22:15:00Z"
   ---
   # Decision
   choose_model(task='Write a Python script') -> 'anthropic/claude-3.5-sonnet'
   ## Rationale
   Called by hermes-agent-v1
   ```
5. **Search**: `memory.recall("model selection")` → `SearchIndex.search()` → inverted index lookup → returns scored concept IDs
6. **Diff**: `hermes-okf diff HEAD~1 HEAD` → `GitOKFBundle.git_diff()` → file-level changes
7. **Revert**: `hermes-okf revert HEAD~1` → `GitOKFBundle.git_revert()` → checkout files from ref, commit restored state with `[revert] Restored state from HEAD~1`

### Key Implementation Patterns

1. **Filesystem-first, zero-DB core**: Single hard dependency (`pyyaml`). Everything is plain `.md` + YAML.
2. **Composition over inheritance**: `GitOKFBundle` extends `OKFBundle`, `HermesMemory` wraps `OKFBundle`, `HermesAgent` extends `HermesMemoryMixin`.
3. **Two-memory model**: In-memory `HotMemoryBuffer` + filesystem cold storage with explicit flush boundaries.
4. **Implicit knowledge graph**: Markdown links are edges. No RDF, no Cypher — portable conventions.
5. **Config-first diagnostics**: `ConfigValidator` catches 80% of setup issues before the agent even starts.
6. **Plugin architecture**: `MemoryProvider` ABC, entry points, filesystem-based discovery.
7. **Structured commit messages**: `[session]`, `[decision]`, `[plan]`, `[snapshot]`, `[memory]` prefixes enable Git history queries by event type.

---

## 4. okforge (npm, jetienne)

- **npm**: https://www.npmjs.com/package/okforge
- **Version**: 1.0.12 (published 2026-07-02)
- **License**: MIT
- **Language**: TypeScript (node >= 20.12)
- **Dependencies**: `chalk`, `commander`, `marked`, `zod`
- **GitHub**: Repository not publicly accessible under `jetienne/okforge` (may be private or unreleased source)
- **Author**: Jerome Etienne

### What it does

A Claude Code skill and companion TypeScript CLI for maintaining a repository's OKF knowledge bundle under `.okf/`. It introduces the concept of **documentation as a derived artifact**: each OKF concept folder is configured to track specific source files (declared in `.okforge.config.json`), and when source changes, the skill regenerates only the affected docs. Includes a "Stop-hook" nudge mechanism that reminds users to update docs when source changes but docs remain untouched. Ships with a static webview generator for browsing bundles.

### Installation

```bash
npx okforge install .claude
```

This drops the skill prose into `.claude/skills/` AND registers the `npx okforge nudge` Stop hook in `.claude/settings.json` (idempotent, preserves existing settings). For non-`.claude` destinations, copies skills only.

### Project Structure

```
okforge/
  src/
    cli.ts                          # Commander entry; wires subcommands
    misc/
      okf_store.ts                  # Mapping load, stale detection, conformance lint
      okf_graph.ts                  # Read-only concept-graph model (links, neighbors, orphans, paths)
      okf_fetch.ts                  # Download remote bundle by crawling markdown links
    webview/
      template/                     # Static browser app baked into every generated site
    commands/
      map_command.ts                # Print folder-to-source mapping
      folders_command.ts            # List OKF concept folders
      sources_command.ts            # Print a folder's source paths
      stale_command.ts              # Folders whose source changed since HEAD
      check_command.ts              # Conformance + dead-link lint
      graph_command.ts              # Concept-graph queries (overview, concept, neighbors, orphans, broken, path)
      webview_command.ts            # Generate/serve static webview
      nudge_command.ts              # Stop-hook nudge
      install_command.ts            # Copy skills into a target agent folder
  dotclaude_folder/                 # Data shipped to .claude/ by `okforge install`
    skills/
      okforge-maintain/
        SKILL.md                    # Maintain the bundle (scaffold / refresh / check)
      okforge-query/
        SKILL.md                    # Read-only browser for any OKF bundle
        references/okf-rules.md     # OKF v0.1 rules
  contribs/
    webview/                        # GitHub Pages deploy tooling + generated dist/
```

### Full CLI Interface

| Command | Purpose |
|---------|---------|
| `okforge map [<dir>]` | Print the full folder-to-source mapping from `.okforge.config.json` |
| `okforge folders [<dir>]` | List the OKF concept folders |
| `okforge sources <folder> [<dir>]` | Print the source paths a folder is derived from |
| `okforge stale [<dir>]` | List folders whose source changed since HEAD while the folder was not edited |
| `okforge check [<dir>]` | Conformance + dead-link lint; exits non-zero on problems. Checks: snake_case names, non-index `.md` has non-empty `type`, sub-folder `index.md` carry no frontmatter, every bundle-relative `.md` link resolves |
| `okforge graph <op> [args] [--bundle <dir>]` | Read-only concept-graph queries as JSON: `overview`, `concept`, `neighbors`, `orphans`, `broken`, `path` |
| `okforge webview generate [<bundle>] [-o <dir>]` | Bake a bundle into a dependency-free static site. Supports local dir or http(s)/GitHub URLs |
| `okforge webview show [<bundle>]` | Generate site into temp dir and serve over HTTP |
| `okforge nudge` | Stop-hook entry: read hook payload on stdin and maybe remind |
| `okforge install [<agent_folder>]` | Copy bundled okf skills into an agent folder; when `.claude`, also register Stop hook |

### The Stop-Hook ("Nudge") Feature

The `npx okforge nudge` command is registered as a Claude Code Stop hook in `.claude/settings.json`. Behavior:
1. On session Stop, Claude invokes the hook, passing a payload on stdin
2. `okforge nudge` checks: did source files that OKF folders depend on change, while `.okf/` was not touched?
3. If yes → displays a gentle, non-blocking reminder to update docs
4. Silent if `.okf/` was already modified that session
5. At most once per session
6. Reads the same `.okforge.config.json` mapping as the skill — never diverges

### The `.okforge.config.json` Mapping

```json
{
  "folders": {
    "runtime_concepts": ["packages/foo/src/model/", "packages/foo/src/event/"],
    "config_formats": ["packages/foo/data/schemas/thing.schema.json"]
  }
}
```
Each key = an OKF concept folder. Each value = source path prefixes that folder's docs are derived from. This is the only project-specific configuration.

### Three Operational Modes

| User says | Mode | What happens |
|-----------|------|-------------|
| "set up okf", "create an OKF bundle", bundle missing | **scaffold** | Creates `.okforge.config.json`, `.okf/index.md` (with `okf_version`), `.okf/log.md`, the config-mapped folders, refreshes each |
| "the API changed, update okf", "refresh okf for X" | **refresh** | Reads current source for affected folder(s), regenerates only docs whose source changed, grounded in what it read. Draft-then-review loop: skill rewrites, user reviews, then commit |
| "check okf", "is the bundle conformant", "any dead links" | **check** | Runs conformance and dead-link lint via `okforge check` |

### SKILL.md Content (from README description)

Two skills shipped in `dotclaude_folder/skills/`:

1. **okforge-maintain/SKILL.md** — The main workflow skill. Handles scaffold/refresh/check modes. Invoked via `/okforge-maintain` or plain-language requests.

2. **okforge-query/SKILL.md** — Read-only browser for any OKF bundle. References `references/okf-rules.md` for OKF v0.1 rules. Powers concept-graph queries via `okforge graph`.

### Key Conventions

- File/folder names: **snake_case only**. No kebab-case, no spaces (enforced by `check`).
- Every non-index `.md`: YAML frontmatter with non-empty `type`, conventional sections (`# Schema` / `# Examples` / `# Citations`).
- `index.md`: no frontmatter, except root `.okf/index.md` which carries `okf_version: "0.1"` + `type: Bundle Index`.
- Cross-links: relative markdown paths from the doc (`../runtime_concepts/job_store.md`), not bundle-root absolute. Real source file citations: repo-relative (`../../packages/...`).
- Ground every claim in real source. No invented fields, routes, flags, or states.

### Key Implementation Patterns

1. **Docs as derived artifact**: Each OKF folder explicitly maps to source paths. When source changes, only affected docs regenerate. No stale docs.
2. **Deterministic CLI, model-driven prose**: TypeScript CLI handles mechanics (formatting, link resolution, conformance checking, stale detection). The model handles prose (descriptions, analysis, documentation content).
3. **Stop-hook nudge**: Non-blocking reminder that fires after sessions where source changed but docs didn't. Gentle enough to not annoy, persistent enough to prevent drift.
4. **Webview generation**: Bake any bundle into a static HTML site for human browsing. Supports remote bundles (URL/GitHub crawling).
5. **Concept-graph queries**: JSON-based graph API (`overview`, `neighbors`, `orphans`, `broken`, `path`) for programmatic consumption by the query skill.
6. **Zero configuration beyond mapping**: No build step, no manifest beyond `.okforge.config.json`. The bundle is just a subdirectory of the repo.
7. **Dogfooding**: `symlink:dotclaude` script links okforge's own skills into `.claude/` via relative symlinks, so the tool documents itself.

---

## Cross-Project Patterns & Takeaways

### Shared Design Principles

| Principle | rakibtg/okf-skill | fabricioctelles/skills | hermes-okf | okforge |
|-----------|------------------|----------------------|------------|---------|
| **Deterministic mechanics** | Python scripts for all write ops | External `okflint` tool | `OKFBundle` class | TypeScript CLI |
| **Model handles prose** | Agent fills body sections | Agent writes content manually | Agent writes decisions/logs | Agent writes docs, CLI checks |
| **No-drift guarantee** | `gen_index.py` regenerates from frontmatter | Manual index writing | `write_concept()` with auto-timestamp | `okforge check` validates links |
| **Progressive disclosure** | SKILL.md → cheatsheet → SPEC.md | SKILL.md → references/ | Not applicable (library, not skill) | SKILL.md → okf-rules.md |
| **Zero dependencies (core)** | Python 3 stdlib only | Bash (grep/sed) | pyyaml only | Nodes built-ins + 4 deps |
| **Token economy** | Scripts eliminate planning | Prose-first, no scripts | Not applicable | CLI handles format |

### Unique Innovations Worth Adopting

1. **rakibtg/okf-skill**: The minimal YAML frontmatter parser (`_okf_common.py`) — only parses what OKF needs, raises errors on unknowns. The `gen_index.py` auto-regeneration pattern. The `dump_frontmatter` smart-quoting for version strings (`"0.1"`).

2. **fabricioctelles/skills**: The conversion guides (Notion → OKF, Obsidian → OKF, CSV → OKF). The `okflint` integration pattern (check if installed → offer to install → use if available). The error/warning code system (E1/E2/E3, W1-W5).

3. **hermes-okf**: The two-memory model (hot buffer + cold OKF). Structured Git commit messages by event type. The config validator pattern (15 checks, severity levels, fix instructions). Decorators for transparent persistence.

4. **okforge**: Documentation as derived artifact (folder-to-source mapping). The Stop-hook nudge pattern (gentle, non-blocking, once-per-session). Static webview generation from any bundle. Graph queries as JSON API.
