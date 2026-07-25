# OKF Ecosystem: Validators & Toolchain — Deep Investigation

> Generated 2026-07-25 from primary source code, READMEs, and documentation for all three projects.

---

## 1. okflint — The Ruff of Documentation

### Repository
- **URL**: https://github.com/mattdav/okflint
- **Stars**: 4
- **Forks**: 1
- **Commits**: 53
- **License**: MIT
- **Language**: Python (3.12+), typed (py.typed, mypy strict mode, beartype runtime checks)
- **Version**: 0.3.1 (beta)
- **Docs**: https://mattdav.github.io/okflint/ (Sphinx + rtd-theme)
- **PyPI**: `okflint`
- **Topics**: python, cli, linter, okf, open-source

### What It Does
okflint is a deterministic, LLM-free compliance linter for OKF documentary bases. It verifies that Markdown documents conform to OKF v0.1 AND to a framework the base declares itself via a YAML manifest (`okf-base.yaml`). It has three commands: `audit` (descriptive inventory, always exit 0), `validate` (compliance gate, exit 0/1), and `index` (generate OKF §6 index.md files). It is designed for pre-commit hooks and CI. It is a generic engine — it knows no type vocabulary in hard code; the manifest defines the standard.

### Installation

**Prerequisite**: Python 3.12+

```bash
# Via uv (recommended)
uv tool install okflint

# Via pip
pip install okflint

# Development
git clone https://github.com/mattdav/okflint
cd okflint
uv sync --all-extras
uv pip install -e .
```

Source: PyPI (no GitHub-only install needed). Dependencies: `beartype>=0.22.9`, `pyyaml>=6.0.3`. Optional docs extras: `sphinx`, `sphinx-rtd-theme`, `sphinx-autodoc-typehints`.

### Full CLI Interface

**Top-level**: `okflint <command> [options]`

Three sub-commands, Ruff-style:

#### `okflint audit` — Inventory and diagnostic

```
okflint audit [--manifest <path>] [--bundle <path>] [--vault <path>] [--apply]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--manifest <path>` | conditional | Path to `okf-base.yaml`. `base.roots` defines the bundle/vault roots |
| `--bundle <path>` | conditional | Root folder to audit; acts as a sub-filter when `--manifest` is also set |
| `--vault <path>` | conditional | Either a vault folder for wikilink resolution, OR an `okf-vault.json` file for multi-bundle mode |
| `--apply` | no | Write the JSON report to `.okflint/YYYY-MM-DD_audit_vN.json` |

**Resolution matrix** (`--manifest` × `--bundle` × `--vault`):

| `--manifest` | `--bundle` | `--vault` (json) | Behaviour |
|:---:|:---:|:---:|---|
| ✗ | ✗ | ✓ | Full vault (every bundle) |
| ✗ | ✓ | ✓ | `--bundle` only, union index |
| ✓ | ✗ | ✓ | Manifest roots, union index |
| ✓ | ✓ | ✓ | Manifest roots + bundle filter |
| ✓ | ✗ | ✗ | Manifest multi-root |
| ✗ | ✓ | ✗ (folder) | Single-root legacy |

Exit code: always `0` (descriptive). Reports: per-bundle/per-root file counts, OKF status counts (conformant/partial/non_conformant), broken/ambiguous wikilinks, broken markdown links, split candidates, diagnostics summary (by severity, tier, and code).

#### `okflint validate` — Compliance gate

```
okflint validate [--manifest <path>] [--vault <path>] [--json] [targets...]
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--manifest <path>` | no | `okf-base.yaml` | Path to the OKF manifest |
| `--vault <path>` | no | — | `okf-vault.json` file; without `--manifest` validates each bundle with its own manifest using vault union index |
| `--json` | no | — | JSON output instead of human-readable text |
| `targets...` | no | all manifest roots | One or more paths (folders or `.md` files) to validate |

Exit codes:
- `0` — No errors (warnings may still be present)
- `1` — At least one conformance error
- `2` — Invalid or unreadable manifest / vault config error

#### `okflint index` — Generate index.md files

```
okflint index [--manifest <path>] [--vault <path>] [--apply]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--manifest <path>` | conditional | Required unless `--vault` points to an `okf-vault.json` |
| `--vault <path>` | conditional | `okf-vault.json` file for multi-bundle mode |
| `--apply` | no | Write the `index.md` files whose content differs from expected |

Default is dry-run: prints unified diffs only. Idempotent — running `--apply` twice writes nothing the second time.

### Every Lint Rule

Three stages of authority:

| Stage | Authority | Severity | Exit code effect |
|-------|-----------|----------|-----------------|
| OKF core | OKF v0.1 spec §9 | error | `exit 1` |
| Profile | Your manifest | error | `exit 1` |
| Hygiene | Opt-in (stricter than OKF) | warning | `exit 0` |

#### Stage 1 — OKF Core (always active, hardcoded)

| Code | Severity | Source | Summary |
|------|----------|--------|---------|
| **F001** | error | OKF §9.1 | Frontmatter absent or unparsable |
| **F002** | error | OKF §9.2 | `type` field absent or empty |
| **R001** | error | OKF §6, §11 | Frontmatter forbidden in `index.md` (only `okf_version` allowed at root) |
| **R002** | error | OKF §7 | Non-ISO date heading in `log.md` (must be `YYYY-MM-DD`) |

#### Stage 2 — Profile (only when manifest declares `profile` block)

| Code | Severity | Summary |
|------|----------|---------|
| **F101** | error | `type` value not in declared types (`profile.types`) |
| **F102** | error | Missing required field (per type in `profile.types.<Type>.required`) |
| **F105** | error | Value outside controlled vocabulary (`<prop>_values` declared in type config) |
| **F106** | error | Non-normalised `type` spelling (alias used instead of canonical name) |
| **S102** | error | Non-ISO date field (fields listed in `profile.date_fields` must be `YYYY-MM-DD`) |

#### Stage 3 — Hygiene (opt-in, configurable: `off`|`warn`|`error`)

| Code | Default | Summary |
|------|---------|---------|
| **L001** | warn | Broken wikilink `[[Target]]` — target does not exist in the base |
| **L002** | warn | Broken markdown link `[text](/path.md)` — target does not exist |
| **L003** | warn | Ambiguous wikilink — resolves to multiple files |
| **S202** | off | Split candidate — semantic cohesion analysis (TF-IDF cosine clustering) finds >1 connected component |
| **R201** | off | Recommended reserved file missing (`index.md`/`log.md`) |
| **F201** | off | Frontmatter field outside declared schema (fields not in `required ∪ optional`) |

S202 defaults (in `hygiene.split`): `min_lines: 0`, `exempt_types: []`, `exempt_paths: []`, `tau: 0.15`. Tau calibrated via sweep on representative memos (0.13-0.22 range).

Quick reference — all 15 rules: F001, F002, R001, R002, F101, F102, F105, F106, S102, L001, L002, L003, S202, R201, F201.

### How Profiles Work (okf-base.yaml structure)

The manifest is the single source of truth for your conformance standard. Structure:

```yaml
okf_version: "0.1"

base:
  name: "My documentary base"
  roots:
    - path: "."
      exclude_patterns:
        - ".venv/**"
        - "node_modules/**"
  reserved_files:
    index: "index.md"
    log: "log.md"
  link_resolution:
    scope: base
    external_refs: []  # out-of-base file names assumed valid

profile:  # optional
  date_fields: [created, updated]
  types:
    Decision:
      aliases: [adr, ADR]
      required: [type, status, created]
      optional: [updated, tags]
      status_values: [Proposed, Accepted, Deprecated, Superseded]
    Procedure:
      aliases: [runbook]
      required: [type, status, created]
      optional: [updated, tags]
      status_values: [draft, prod, obsolete]

hygiene:  # optional
  broken_links: warn
  split_candidates: warn
  reserved_files: off
  unknown_fields: off
```

Key design: `<prop>_values` is orthogonal to `required`/`optional`. It constrains the VALUE only when the property is present. Any YAML boolean (`off`/`on`/`true`/`false`) is absorbed and coerced to the corresponding level in hygiene settings (PyYAML 1.1 compatibility).

### How Wikilinks Are Resolved

1. `build_file_index(roots)` walks all vault root directories recursively, finds all `.md` files
2. Builds dictionary: `{ stem: [relative_path, ...] }` — stem is filename without `.md` extension
3. Respects `exclude_patterns` from each root's config
4. For each file being validated, `extract_wikilinks(body, vault_index)` uses regex `\[\[([^\[\]#|]+?)(?:#([^\[\]|]*?))?(?:\|([^\[\]]*?))?\]\]`
5. Resolves target stem against vault index:
   - No entry → `broken = True` → L001
   - Multiple entries → `ambiguous = True` → L003
6. Code blocks (fenced and inline) are blanked out before link extraction to prevent false positives
7. Markdown links (`[text](target)`) are resolved against the file system: absolute paths resolved relative to bundle root, relative paths resolved relative to the current file
8. `link_resolution.external_refs` lists out-of-base stems that are assumed valid and never trigger L001

### Index Generation

`okflint index` produces one `index.md` per directory conforming to OKF §6 format:
- **No frontmatter** (except root-level may carry `okf_version` by hand — R001-conformant)
- Lists `.md` files (title from frontmatter + optional description)
- Lists sub-directories that have their own `index.md`
- Case-insensitive alphabetical ordering
- Respects `exclude_patterns` and skips reserved files (`index.md`, `log.md`)
- Dry-run by default — shows unified diffs; `--apply` writes

### End-to-End Flow: `okflint validate`

```
User runs: okflint validate --manifest okf-base.yaml /path/to/my-base
```

1. **Parser**: `argparse` dispatches to `_cmd_validate()`
2. **Resolve implicit targets**: If no targets given, loads manifest via `load_manifest()`, extracts `base.roots[].path` as targets (resolved to absolute against manifest file parent directory)
3. **Build file index**: `build_file_index(manifest_roots)` walks roots recursively, indexes all `.md` files (stem → relative paths), respecting `exclude_patterns`
4. **Manifest loading** (`manifest.py:load_manifest`):
   - Reads YAML, validates structure (must have `base`, `base.roots` non-empty list, `base.reserved_files` with `index`/`log` keys)
   - Parses `profile` block: validates types (required/optional are strings, `∩ = ∅`, `_values` properties exist in required/optional), date_fields list
   - Parses `hygiene` block: coerces levels (off/warn/error), validates split config
   - Resolves paths: relative roots resolved against manifest file directory
   - Warns on unknown `okf_version`
5. **For each target** (directory or .md file):
   - If directory: `rglob("*.md")`, filter by exclusion patterns against the applicable root
   - For each `.md` file, `validate_file(file_path, manifest, base_index)`:
     a. Read file content
     b. Determine applicable root (which `base.roots[].path` the file belongs to)
     c. **Reserved file check** via `dispatch_reserved_file()`:
        - If `file_path.name == reserved_files["index"]` → `check_core_reserved_index()` (R001)
        - If `file_path.name == reserved_files["log"]` → `check_core_reserved_log()` (R002)
        - If neither → concept file, proceed
     d. **Concept file**: `parse_frontmatter()` → YAML block delimited by `---`
        - `check_core_concept()`: F001 (fm absent/unparsable), F002 (type absent/empty)
        - If F001 fired → skip profile/hygiene
     e. **Link extraction**: `blank_code_spans(body)` masks code, then `extract_wikilinks()` + `extract_markdown_links()`
     f. **Profile check** (if manifest.profile exists): `check_profile()`
        - `_resolve_type()`: exact match → case-insensitive → aliases
        - If type unknown → F101
        - If alias used → F106
        - Missing required fields → F102
        - Controlled vocabulary violations → F105
        - Non-ISO dates in date_fields → S102
     g. **Hygiene check** (if manifest.hygiene exists):
        - `check_hygiene_links()`: L001 (broken wikilinks, if target not in `external_refs`), L002 (broken MD links, non-external), L003 (ambiguous wikilinks)
        - `check_hygiene_structure()`: S202 — cohesion analysis pipeline:
          1. `analyze_cohesion()`: parse frontmatter → blank code spans → split into sections at headings → merge micro-sections (<20 tokens) → compute TF-IDF vectors → cosine similarity matrix → connected components at tau threshold
          2. Gates: net content lines > split.min_lines, type not in exempt_types, path not in exempt_paths
          3. If >1 component → S202
        - `check_hygiene_unknown_fields()`: F201 — fields not in required ∪ optional ∪ {"type"} for resolved type
     h. **Reserved hygiene** (`check_hygiene_reserved()`): global check — are index.md/log.md present in each root? → R201
6. **Report**: All diagnostics collected. Human-readable output shows ❌/⚠ markers with code, file path, message. `--json` produces `[{"code": "...", "tier": "...", "severity": "...", "file": "...", "message": "..."}, ...]`
7. **Exit code**: 0 if no `severity=="error"` diagnostics, 1 otherwise

### API / Programmatic Use

Can be imported as a Python library:

```python
from okflint.validate import run_validate, validate_file, Diagnostic
from okflint.manifest import load_manifest, ManifestError
from okflint.audit import run_audit
from okflint.index import generate_indexes
from okflint.scanner import build_file_index, parse_frontmatter, extract_wikilinks
from okflint.vault import load_vault, VaultConfig
from okflint.cohesion import analyze_cohesion

manifest = load_manifest(Path("okf-base.yaml"))
errors, code = run_validate(manifest_path, targets)
```

Type-annotated with full beartype runtime checking. All public dataclasses exported: `Diagnostic`, `ManifestError`, `VaultError`, `VaultConfig`, `BundleEntry`, `Manifest`, `RootConfig`, `FileReport`, etc. Full Sphinx-generated docs at https://mattdav.github.io/okflint/.

### Skills / AI Integration
- No SKILL.md or MCP server exists yet in the repo
- **Track C** on the roadmap explicitly plans an MCP server (stdio) exposing `validate` and `audit` as model-callable tools, plus a standalone binary (PyInstaller/shiv), a Desktop Extension (`.mcpb`), and a remote MCP connector (HTTPS)
- Designed for PostToolUse hooks in Claude Code, Gemini CLI, Cursor
- Designed to be skill-invocable: "a Skill is the natural instruction layer that tells an agent to call the okflint tool after generating Markdown"

### Configuration Files

1. **`okf-base.yaml`** — Declares the conformance standard. Paths: `base.roots[].path`, `base.roots[].exclude_patterns` (fnmatch globs), `base.reserved_files` (index/log filenames), `base.link_resolution.external_refs`, `profile` block (types, date_fields), `hygiene` block (all levels + split config)
2. **`okf-vault.json`** — Multi-bundle workspace descriptor:
   ```json
   {
     "okf_vault_version": "0.1",
     "name": "my-workspace",
     "bundles": [
       { "path": "projects/alpha" },
       { "path": "projects/beta", "manifest": "okf-base.yaml" }
     ]
   }
   ```
   - `path`: absolute or relative to vault file's parent directory
   - `manifest`: filename inside the bundle directory (defaults to `okf-base.yaml`)
3. **`pyproject.toml`** — For development: ruff config (target py312, line-length 88, select E/W/F/I/B/C4/UP), mypy strict mode, pytest with doctest-modules + coverage, commitizen conventional commits

### Output / Side Effects

`okflint audit --apply`:
- Creates `.okflint/` directory
- Writes `.okflint/YYYY-MM-DD_audit_vN.json` (single bundle) or `.okflint/YYYY-MM-DD_vault_audit_vN.json` (multi-bundle)
- JSON format: `{ "generated_at", "bundle_paths", "vault_paths", "roots", "stats", "diagnostics_summary", "files": [...] }`
- Each file entry: `{ "path", "depth", "lines", "chars", "is_reserved", "okf_status", "frontmatter", "wikilinks", "markdown_links", "split_candidate", "diagnostics": [...] }`

`okflint index --apply`:
- Writes `index.md` files into each directory that contains `.md` files
- No other side effects

`okflint validate`:
- No file writes — stdout/stderr only, or `--json` to stdout

### Development
- `inv lint` — ruff + mypy
- `inv clean` — clean build artefacts
- `inv repomix` — pack codebase for LLM
- `inv release` — release via commitizen
- CI: GitHub Actions workflow at `.github/workflows/`

### Architecture (src/okflint/)
```
cli.py        — dispatcher: okflint audit | validate | index
scanner.py    — shared primitives (scan, frontmatter, wikilinks, MD links, headers, code blanking)
audit.py      — audit command (FileReport, compute_stats, run_audit)
validate.py   — validate command (Diagnostic, check_core_*, check_profile, check_hygiene_*, dispatch_reserved_file)
cohesion.py   — S202 semantic-cohesion scorer (Section, Component, analyze_cohesion, TF-IDF, cosine, connected components)
index.py      — index command (IndexEntry, build_index_content, generate_indexes)
vault.py      — okf-vault.json loading (VaultConfig, BundleEntry, load_vault)
manifest.py   — manifest loading + validation (Manifest, RootConfig, BaseConfig, ProfileConfig, TypeConfig, HygieneConfig, SplitConfig)
__main__.py   — python -m okflint
```

---

## 2. superops-team/okf — Go CLI

### Repository
- **URL**: https://github.com/superops-team/okf
- **Stars**: 16
- **Forks**: 0
- **Commits**: 17
- **License**: Apache 2.0
- **Language**: Go 1.25.0
- **Version**: 1.2.0
- **Dependencies**: `gopkg.in/yaml.v3`, `golang.org/x/sys`, `github.com/fsnotify/fsnotify`
- **Topics**: ai-agents, okf, markdown, yaml, knowledge-base, git, lint, search

### What It Does
`okf` is a Go CLI that auto-generates a project-level OKF knowledge base from a Git repository. It scans tracked source code files, analyzes them (file metadata, imports, functions, Go AST-level symbols), and produces Markdown concepts with YAML frontmatter in `.okf/knowledge/`. It supports incremental updates via git commits, git hook installation, lint checking (13 rules), advanced querying (type, tag, full-text, code-level filters), and cross-platform binary releases.

### Installation

**Prerequisite**: Git, shell access.

```bash
# 1. One-click installer (recommended)
curl -fsSL https://raw.githubusercontent.com/superops-team/okf/main/scripts/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/superops-team/okf/main/scripts/install.ps1 | iex

# 2. Via Go
go install github.com/superops-team/okf/cmd/okf@latest

# 3. Manual download from Releases
# https://github.com/superops-team/okf/releases
```

The installer auto-detects OS (Linux/macOS) + CPU (amd64/arm64), downloads the latest pre-built binary, verifies SHA256 checksums, installs to `/usr/local/bin/` or `~/.local/bin/`.

**Cross-platform release matrix**:

| OS | Architecture | Archive |
|----|-------------|---------|
| Linux | amd64, arm64 | `okf_<v>_linux_<arch>.tar.gz` |
| macOS | amd64 (Intel), arm64 (Apple Silicon) | `okf_<v>_darwin_<arch>.tar.gz` |
| Windows | amd64, arm64 | `okf_<v>_windows_<arch>.zip` |

### Full CLI Interface

```
okf <command> [options]
```

#### `okf init` — Initialize knowledge base from Git repository

```
okf init [-repo PATH] [-dir PATH] [-force] [-verbose]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-repo PATH` | CWD | Repository path |
| `-dir PATH` | `.okf/knowledge` | Knowledge output directory |
| `-force` | false | Overwrite existing |
| `-verbose` | false | Verbose output |

Also accepted as `okf generate` (alias).

#### `okf update` — Update knowledge base from latest commit

```
okf update [-repo PATH] [-full] [-verbose]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-repo PATH` | CWD | Repository path |
| `-full` | false | Full regeneration instead of incremental |
| `-verbose` | false | Show changed files |

#### `okf lint` — Check knowledge base for specification compliance

```
okf lint [-path PATH] [-strict] [-verbose]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-path PATH` | CWD | Knowledge base path |
| `-strict` | false | Warnings fail (exit 1) |
| `-verbose` | false | Show all issues including INFO level |

Exit code: 1 if errors detected, or if `--strict` and warnings present.

#### `okf show` — Show knowledge base information

```
okf show [-path PATH] [-detail]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-path PATH` | CWD | Knowledge base path |
| `-detail` | false | Show all concepts listing |

Also accepted as `okf info` (alias).

#### `okf search` — Search the knowledge base

```
okf search [-path PATH] -q QUERY [-type TYPE] [-tag TAG] [code filters...]
```

| Flag | Description |
|------|-------------|
| `-q STRING` | Full-text search query |
| `-type STRING` | Filter by concept type |
| `-tag STRING` | Filter by tag |
| `-code-language STRING` | Filter by code language (e.g., "go", "python") |
| `-code-path STRING` | Filter by repository-relative code path |
| `-code-symbol-kind STRING` | Filter by code symbol kind (e.g., "function", "struct") |
| `-code-qualified-name STRING` | Filter by code qualified name |
| `-code-relation-kind STRING` | Filter by code relation kind |
| `-path PATH` | CWD | Knowledge base path |

At least one of `-q`, `-type`, `-tag`, or code filter must be specified.

#### `okf hook` — Install git hook for automatic knowledge base updates

```
okf hook [-repo PATH] -type HOOK_TYPE [-uninstall] [-force]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-repo PATH` | CWD | Repository path |
| `-type STRING` | `post-commit` | Hook type: `pre-commit`, `post-commit`, `pre-push` |
| `-uninstall` | false | Remove the hook |
| `-force` | false | Overwrite existing hook |

Hook scripts generated:
- **post-commit**: Runs `okf update -verbose` after commits
- **pre-commit**: Runs `okf lint` before commits — blocks if lint fails
- **pre-push**: Runs `okf init -force` before pushes

`okf hook --uninstall` removes the hook file. Only removes if the hook script contains `# OKF Hook` marker or `--force` is used.

#### Other commands

| Command | Description |
|---------|-------------|
| `okf version`, `okf --version`, `okf -v` | Show version |
| `okf help`, `okf --help`, `okf -h` | Show help |
| `okf add` | Import files/directories/archives with smart detection |
| `okf sync` | Synchronize all indexed files |
| `okf watch` | Watch source directories and auto-sync on file changes (requires `.watch.yaml`) |
| `okf metadata` | Manage the metadata index (`inspect|rebuild|clean`) |
| `okf config` | Manage configuration |
| `okf tool` | Agent-facing JSON tool operations (`status|init|refresh|query|context`) |

`okf add` supports `-strategy` (skip/overwrite/merge/patch), `-patch-fields`, `-detect-only`, `-dry-run`, `-force`.

### The 13 Lint Rules

Source: `pkg/lint/lint.go`

| Code | Severity | Description |
|------|----------|-------------|
| **OKF001** | ERROR | `type` field is required and must not be empty |
| **OKF002** | ERROR | `title` field is required and must not be empty |
| **OKF003** | WARNING | `description` is too short (default min: 10 chars) |
| **OKF004** | WARNING | Type should use lowercase alphanumeric (`^[a-z][a-z0-9_]*$`) |
| **OKF005** | WARNING | Timestamp format is invalid (must be ISO 8601: RFC3339, `2006-01-02T15:04:05Z`, or `2006-01-02`) |
| **OKF006** | WARNING | Tags contain uppercase or spaces |
| **OKF007** | WARNING | Content body (markdown after frontmatter) is empty |
| **OKF009** | WARNING | Content lines are too long (default max: 240 chars, caps at 5 reports) |
| **OKF010** | WARNING | Duplicate tags found |
| **OKF011** | WARNING | Required tags are missing (configurable via `Config.RequiredTags`) |
| **OKF013** | WARNING | Duplicate title — two concepts share the same title (cross-file) |

Note: OKF008 and OKF012 are not present in the rules list (possible future slots).

**Config struct**:
```go
type Config struct {
    MaxLineLength        int     // default: 240
    MinDescriptionLength int     // default: 10
    RequiredTags         []string // default: empty
    StrictMode           bool     // warnings cause exit 1
}
```

`Severity` levels: `Info` (0), `Warning` (1), `Error` (2). `LintBundle()` also checks for duplicate titles across the entire bundle (OKF013) outside the per-concept rules.

### How It Scans a Git Repo for Concepts

**`okf init` end-to-end flow:**

1. **Repository validation**: `git rev-parse --show-toplevel` confirms a git repo
2. **Metadata gathering**: `git config user.name` / `user.email` for author info
3. **File listing**: `git ls-files` lists all tracked files
4. **Filtering** (`ShouldInclude`):
   - Includes: `*.go, *.py, *.js, *.ts, *.rs, *.java, *.c, *.cpp, *.h, *.tsx, *.jsx, *.rb, *.sh, *.yml, *.yaml, *.json, *.toml, *.md`
   - Excludes dirs: `.git, node_modules, vendor, dist, build, target, .okf, .venv, __pycache__, .idea, .vscode, .next`
   - Max file size: 100KB (default)
5. **Batch git metadata**: One `git log --format=%h%x1e%an --name-only -- [files...]` call fetches per-file last commit hash, last author, and commit count
6. **Parallel file analysis** (`AnalyzeFilesWithMetadata`, bounded worker pool = `runtime.NumCPU()`):
   - File stats: size, line count, last modified time
   - **Go files**: Full AST parsing via `go/parser` + `go/ast` — extracts imports, function/method/struct/interface declarations with source positions
   - **Other languages**: Regex-based extraction of imports and function definitions (patterns for Python, JS, TS, Java, Rust, C, C++, Ruby)
   - Symbols: `{ Kind, Name, Receiver, Package, FilePath, Exported, StartLine, EndLine }`
7. **Concept generation** (`conceptFromSummary`):
   - Type: `code_file`
   - Title: filename
   - Tags: `["code", "generated", language, sanitized-author, "frequently-modified" (if >10 commits)]`
   - Frontmatter: type, title, description (summary), resource (`code://repo/<path>`), timestamp (RFC3339)
   - Custom fields: `generated: true`, `generator: "okf.git"`, `generator_version: 1`, `source_path`, `source_kind`, `source_commit`
   - Content: Markdown body with metadata (path, language, lines, size, last commit, author, imports table, functions list, symbols list with visibility and position)
8. **Augmented concepts generated** (in order):
   a. **Project Overview** (`project/project_overview.md`, type: `project`): branch, commit, total files, file types breakdown, top 10 contributors
   b. **Project Structure** (`project/structure.md`, type: `system`): indented tree of directories with file counts
   c. **Relationship Graph** (`project/relationships.md`, type: `system`, resource: `okf://relationships`): deduplicated file_import, package_import, file_owns_symbol, package_owns_symbol edges
   d. **Code Repository Concept** (`code_repository.md`, type: `code_repository`): language dimension view with symbol index
   e. **Code Relation Index** (`code_relation_index.md`): all symbols and their relationships
   f. **Contributors** (`project/contributors.md`, type: `people`): ranked by file count
9. **Save**: `SaveKnowledgeBase` writes each concept as a separate `.md` file under `.okf/knowledge/`, preserving directory structure from `concept.FilePath`. State file records `LastIndexedCommit`
10. **Lint**: Runs internal `LintBundle` on all generated concepts after save

### Incremental Updates via Git Hooks

**`okf update -full`**: Full regeneration = `GenerateBundle(cfg, true)` — identical to `okf init` but overwrites everything.

**Incremental mode** (`okf update` default):
1. Reads state file (`.okf/.okf_state.json` — records `LastIndexedCommit`)
2. `UpdateSinceLastIndexedCommit`: `GetLastCommits(repoRoot, 1)` gets the latest commit → files changed (added + modified + deleted)
3. For deleted files: creates `type: deleted` concepts with custom field metadata so `ApplyIncrementalUpdate` can match and remove them
4. For existing changed files: analyzes them (same pipeline as init), produces update concepts
5. `ApplyIncrementalUpdate`:
   - Loads existing bundle from disk
   - Indexes existing concepts by `Resource` (primary) or `FilePath` (secondary)
   - For deleted concepts: removes corresponding `.md` file if it has trusted `generated` metadata (`generator: "okf.git"` + matching `source_path`)
   - For updates: replaces/inlays concepts in the index
   - Rebuilds relationship graph from updated concepts
   - Saves all concepts (existing + updated) to disk
   - Updates state file with new `LastIndexedCommit`

**Git hooks** installed via `okf hook`:
- `post-commit`: runs `okf update -verbose` after each commit
- `pre-commit`: runs `okf lint` and blocks commit if lint fails (exit 1)
- `pre-push`: runs `okf init -force` to regenerate entirely before pushing

### Bundle Structure Produced

```
.okf/knowledge/
├── project/
│   ├── project_overview.md   # type: project
│   ├── structure.md           # type: system
│   ├── relationships.md       # type: system (resource: okf://relationships)
│   ├── contributors.md        # type: people
├── code_repository.md         # type: code_repository
├── code_relation_index.md     # generated relation index
├── pkg/okf/
│   ├── types.md                # type: code_file, tags: [code, generated, go]
│   ├── api.md
│   ├── helpers.md
│   └── ...
├── cmd/okf/
│   └── main.md
└── ...
```

Each concept file format:
```markdown
---
type: code_file
title: types.go
description: GO file: pkg/okf/types.go (123 lines)
resource: code://repo/pkg/okf/types.go
tags:
  - code
  - generated
  - go
timestamp: "2024-01-15T10:30:00Z"
---

## File: `pkg/okf/types.go`
... metadata, imports, functions, symbols ...
```

### API / Programmatic Use

Go module importable:

```go
import (
    okf "github.com/superops-team/okf/pkg/okf"
    "github.com/superops-team/okf/pkg/git"
    "github.com/superops-team/okf/pkg/lint"
    "github.com/superops-team/okf/pkg/parser"
    "github.com/superops-team/okf/pkg/query"
)

// Load an existing knowledge bundle from disk
bundle, err := okf.LoadBundle(".okf/knowledge", okf.DefaultLoadOptions())

// Search concepts
results := bundle.Search("database")
byType := bundle.FilterByType("table")
byTag := bundle.FilterByTag("production")

// Programmatic query
q := query.New().
    WithType("code_file").
    WithCodeLanguage("go").
    WithCodeSymbolKind("function")
matches := q.Build().Execute(queryBundle)

// Generate from Git
cfg := git.DefaultConfig()
cfg.RepoPath = "/path/to/repo"
bundle, err := git.GenerateBundle(cfg, false)

// Lint
lintResult := lint.LintBundle(conceptSlice, lint.DefaultConfig())

// Parse individual concepts
concept, err := parser.ParseConcept("path/to/file.md")
data, err := parser.SerializeConcept(concept, true)
```

Key types: `Concept`, `KnowledgeBundle`, `BundleStats`, `Config` (git), `FileSummary`, `Symbol`, `Commit`, `RelationshipGraph`, `LoadOptions`, `SaveOptions`, `Query`, `Builder`, `SearchResult`, `Concept` (query), `Index`, `SymbolMatch`.

### Skills / AI Integration
- No SKILL.md or MCP server found in the repo
- Has an `okf tool` command described as "Agent-facing JSON tool operations" with sub-operations: `status`, `init`, `refresh`, `query`, `context`
- The `--json` output mode is designed for programmatic consumption by agents

### Configuration Files

**`Config` struct** (Go, compiled; not a config file):
```go
type Config struct {
    RepoPath      string   // default: CWD
    KnowledgeDir  string   // default: ".okf/knowledge"
    IncludeFiles  []string // default: go, py, js, ts, rs, java, c, cpp, h, tsx, jsx, rb, sh, yml/yaml, json, toml, md
    ExcludeDirs   []string // default: .git, node_modules, vendor, dist, build, target, .okf, .venv, __pycache__, .idea, .vscode, .next
    Author        string   // from git config
    Email         string   // from git config
    MaxFileSizeKB int64    // default: 100
    Workers       int      // default: runtime.NumCPU()
}
```

**State file**: `.okf/.okf_state.json` — records `LastIndexedCommit` for incremental update tracking.

**`.watch.yaml`**: Used by `okf watch` command for file-watching configuration.

### Output / Side Effects

`okf init`:
- Creates `.okf/knowledge/` directory tree
- Writes concept `.md` files mirroring repo structure
- Writes project overview, structure, relationships, contributors, code repository, code relation index
- Writes state file `.okf/.okf_state.json`

`okf update`:
- Reads state file
- Patches/removes/adds `.md` files incrementally
- Rebuilds relationship graph and code index concepts
- Updates state file

`okf lint`:
- stdout only — no file writes

`okf hook`:
- Writes executable scripts to `.git/hooks/<hook_type>`
- Scripts are bash with `#!/bin/bash` shebang, marked with `# OKF Hook` header

### Development

```bash
go build ./...           # Build all packages
go build -o okf ./cmd/okf/  # Build CLI binary
go test ./...            # Run all tests
go test -bench=. -benchmem ./...  # Benchmarks
```

Module: `github.com/superops-team/okf`, Go 1.25.0. Dependencies: `gopkg.in/yaml.v3 v3.0.1`, `golang.org/x/sys v0.46.0`, `github.com/fsnotify/fsnotify v1.10.1`.

### Architecture

```
cmd/okf/main.go          — CLI entry point, all sub-command handlers (init, update, lint, show, search, add, sync, watch, metadata, config, tool, hook)
pkg/okf/types.go         — Concept, KnowledgeBundle, LoadOptions, SaveOptions, BundleStats, NewConcept, NewBundle, search/filter methods
pkg/okf/api.go           — LoadBundle, SaveBundle, Exists, IsDirectory, NewQuery
pkg/okf/errors.go        — ParseError type, predefined errors (ErrEmptyType, ErrEmptyTitle, ErrInvalidPath)
pkg/okf/helpers.go       — sanitizeFilename, containsFold, containsString, equalFold
pkg/parser/parser.go     — ParseConcept, ParseConceptBytes, SerializeConcept, frontmatter struct, YAML unmarshal/marshal
pkg/lint/lint.go         — Concept, Config, Rule, Issue, Result, LintConcept, LintBundle (13 rules)
pkg/query/query.go       — Query, Builder, SearchResult, SymbolMatch, Concept, KnowledgeBundle, Index, FilterByType/Tag, Search, SearchWithMatches
pkg/git/git.go           — Config, Commit, FileSummary, Symbol, IsRepo, GetRepoRoot, GetCurrentBranch, GetCurrentCommit, GetLastCommits, ListTrackedFiles, AnalyzeFile, AnalyzeFilesWithMetadata, BatchGitMetadata, ExtractGoSymbolDetails (AST), ExtractImports, ExtractFunctions, ShouldInclude, detectFileType
pkg/git/generator.go     — GenerateBundle, UpdateBundle, ApplyIncrementalUpdate, SaveKnowledgeBase, BuildRelationshipGraphFromSummaries, conceptFromSummary, RelationshipGraph, createProjectOverview, createDirectoryStructure, createContributors, createRelationshipGraphConcept
```

---

## 3. signed-okf — Cryptographic Trust Layer

### Repository
- **URL**: https://github.com/dynamicfeed/signed-okf
- **Stars**: 2
- **Forks**: 0
- **Commits**: 1 (initial commit)
- **License**: Apache 2.0
- **Language**: Python (3.8+, standalone scripts)
- **Topics**: ai-agents, ed25519, knowledge-graph, open-knowledge-format, provenance, signed-data
- **Built by**: Dynamic Feed (https://dynamicfeed.ai)

### What It Does
Signed OKF adds a verifiable, tamper-evident trust layer to OKF bundles. It hashes every file in a bundle SHA-256, wraps the hashes plus a provenance envelope in a signed manifest (`okf.manifest.json`), and Ed25519-signs the canonical manifest. Verification re-hashes files, checks against the manifest, and validates the signature against a published public key (JWKS, served locally or at a URL). It is additive and spec-compliant: uses only optional frontmatter keys and one new filename (`okf.manifest.json`), which is not one of OKF's reserved names. Drop the manifest and you have a plain OKF bundle again.

### Installation

**Prerequisite**: Python 3.8+, `cryptography` library.

```bash
pip install cryptography
```

The two scripts are standalone — download/copy `sign_okf.py` and `verify_okf.py` from the repo. No pip package published (verified as of investigation date — only available via GitHub clone/download). No `pyproject.toml` or `setup.py` exists in the repo.

```bash
git clone https://github.com/dynamicfeed/signed-okf
# or download sign_okf.py and verify_okf.py directly
```

### Full CLI / Script Interface

Two standalone Python scripts, both with argparse:

#### `sign_okf.py` — Signer

```
python sign_okf.py keygen [--out PATH]
python sign_okf.py sign OKF_DIR [--key PATH] [--issuer STRING] [--title STRING] [--source STRING]
```

**`keygen` subcommand:**

| Flag | Default | Description |
|------|---------|-------------|
| `--out PATH` | `issuer.key` | Output path for the private key file |

Generates:
- `<out>` — Private key file (base64url-encoded raw 32 bytes, permissions `0o600`). Keep secret, never commit.
- `<out_without_ext>.pub.json` — Public JWKS file: `{ "kid": "base64url(pub)" }`. Publish this; verifiers use it.
Prints: private key path, public JWKS path, generated `key_id`.

**`sign` subcommand:**

| Flag | Default | Description |
|------|---------|-------------|
| `okf_dir` | (required) | Path to the OKF bundle directory |
| `--key PATH` | `issuer.key` | Path to the private key |
| `--issuer STRING` | `unknown` | Who is signing (e.g., `acme.example`) |
| `--title STRING` | basename of okf_dir | Bundle title in the manifest |
| `--source STRING` | `unspecified` | Data source description (e.g., "ACME Data Warehouse") |

Produces `<okf_dir>/okf.manifest.json`.

#### `verify_okf.py` — Verifier

```
python verify_okf.py OKF_DIR [--jwks PATH_OR_URL]
```

| Flag | Default | Description |
|------|---------|-------------|
| `okf_dir` | (required) | Path to the OKF bundle directory |
| `--jwks PATH_OR_URL` | `issuer.pub.json` | Path to local JWKS file or HTTPS URL (e.g., `https://issuer.example/.well-known/keys`) |

Exit codes: `0` = VALID, `1` = INVALID.

### Manifest Structure (okf.manifest.json)

```json
{
  "schema": "signed-okf/v1",
  "okf_version": "0.1",
  "bundle": {
    "title": "ACME Sales Knowledge",
    "file_count": 2
  },
  "files": [
    { "path": "concepts/orders.md", "sha256": "<hex>" },
    { "path": "index.md", "sha256": "<hex>" }
  ],
  "provenance": {
    "issuer": "acme.example",
    "source": "ACME Data Warehouse",
    "method": "sha256 per file; Ed25519 over the canonical manifest"
  },
  "issued_at": "2026-06-23T09:56:43Z",
  "signature": {
    "alg": "Ed25519",
    "key_id": "ed25519-<12 hex>",
    "canonicalization": "json-sorted-compact",
    "sig": "<base64url no padding>"
  }
}
```

**Rules**:
- `files[]`: one entry per file in bundle except `okf.manifest.json` itself
- `files[].path`: bundle-relative, POSIX separators (`/`)
- `files[].sha256`: hex SHA-256 of raw file bytes
- Files list sorted by `path` alphabetically
- `signature.key_id`: `"ed25519-" + sha256(pub_raw)[:12].hex()`
- `signature.canonicalization`: `json.dumps(manifest_without_signature, sort_keys=True, separators=(",", ":"))`, UTF-8 encoded
- `signature.sig`: base64url (no padding) of Ed25519 signature over canonical bytes

### Ed25519 Signing Flow (End-to-End)

**Key generation** (`sign_okf.py keygen`):
1. `Ed25519PrivateKey.generate()` → 32-byte private key
2. Derive 32-byte public key: `priv.public_key().public_bytes(Raw, Raw)`
3. Compute `key_id` = `"ed25519-" + sha256(pub_raw).hexdigest()[:12]`
4. Write private key as single line of base64url-encoded raw bytes to `issuer.key`
5. Set file permissions `0o600`
6. Write public JWKS as `{ key_id: base64url(pub_raw) }` to `issuer.pub.json`

**Sign a bundle** (`sign_okf.py sign`):
1. Load private key: `Ed25519PrivateKey.from_private_bytes(ub64(file_content))`
2. Derive `key_id` from corresponding public key
3. **Collect files**: Walk `okf_dir` recursively, skip `okf.manifest.json`, compute SHA-256 of every other file
4. Build manifest payload (without signature):
   - `schema`: `"signed-okf/v1"`
   - `okf_version`: `"0.1"`
   - `bundle`: title, file_count
   - `files`: sorted list of `{ path, sha256 }`
   - `provenance`: issuer, source, method
   - `issued_at`: current UTC ISO 8601 timestamp (microseconds truncated, `Z` suffix)
5. **Canonicalize**: `json.dumps(manifest, sort_keys=True, separators=(",", ":"))` → UTF-8 bytes
6. **Sign**: `priv.sign(canonical_bytes)` → 64-byte Ed25519 signature
7. **Attach signature**: `"sig": base64url(signature_bytes)` (no padding)
8. Write complete manifest to `<okf_dir>/okf.manifest.json`

**Verify a bundle** (`verify_okf.py`):
1. Load manifest JSON, pop `signature` object
2. **File integrity check**:
   a. Verify every listed file exists and SHA-256 matches manifest entry
   b. Walk `okf_dir`, verify no unlisted files exist (except `okf.manifest.json`)
   c. Report all failures (missing, altered, extra) together
3. **Signature verification**:
   a. Load JWKS from file or HTTPS URL (15s timeout for URL)
   b. Look up public key by `key_id` in JWKS
   c. Decode base64url signature bytes and public key bytes
   d. Canonicalize manifest (without signature) same way as signer
   e. `Ed25519PublicKey.from_public_bytes(pub_raw).verify(sig_bytes, canonical_bytes)`
4. Print VALID (file count, issuer, source, key_id, issued_at) or INVALID (specific failures)

### JWKS Key Distribution

The public key is distributed as a simple JSON object (not a full RFC 7517 JWKS):

```json
{
  "ed25519-a1b2c3d4e5f6": "base64url_encoded_32_byte_public_key"
}
```

This can be:
- A local file (default: `issuer.pub.json`)
- A URL accessible over HTTPS (verifier fetches with `urllib.request`)

A single file can contain multiple keys from multiple issuers. The `key_id` namespace (`ed25519-<12 hex chars>`) provides collision resistance.

### OriginTrail DKG Anchoring

Mentioned in the README context ("agents increasingly act on shared, machine-curated knowledge") and the Dynamic Feed provenance theme. However, **the current code (v1, single commit) does NOT implement DKG anchoring**. The SPEC.md mentions:
> "Optionally, the manifest's hash MAY be anchored to a public timestamp (e.g. Bitcoin via OpenTimestamps) for proof-of-existence independent of the issuer."

This is a spec-level provision, not yet implemented in the signer/verifier scripts. No DKG-related code exists in `sign_okf.py` or `verify_okf.py`.

### Integration with OKF Bundle (Non-Breaking)

Signed OKF is designed to be **additive and spec-compliant**:

1. **No modifications to existing OKF files**: The signer hashes existing `.md` files but does not modify them
2. **Optional provenance frontmatter**: Per the spec, concept files MAY carry additional provenance keys (`source`, `source_url`, `licence`, `measured_at`). These are distinct from OKF's `timestamp` field. The current signer/verifier scripts do NOT inject these into documents — they only produce the manifest
3. **One new file**: `okf.manifest.json` at the bundle root. This is NOT one of OKF's reserved filenames (`index.md`, `log.md`), so it coexists cleanly
4. **OKF spec compatibility**: Uses §4.1 allowance ("Producers MAY include any additional keys") and consumer tolerance ("SHOULD NOT reject documents with unrecognized fields")
5. **Reversible**: Delete `okf.manifest.json` → plain OKF bundle. No fork, no proprietary format.

### API / Programmatic Use

The scripts are designed as standalone CLI tools, not importable libraries. However, all internal functions are pure Python and could be imported:

```python
from sign_okf import canonical, file_sha256, key_id, collect, load_priv, b64u, ub64
from verify_okf import canonical, file_sha256, load_jwks, ub64
```

No formal Python package structure (no `__init__.py`, no `setup.py`/`pyproject.toml`). The dependency is only `cryptography` (hazmat).

### Skills / AI Integration

None found. No SKILL.md, MCP server, or agent-specific instructions in the repo. The tool is designed for human CLI use and CI/CD pipelines. An agent could invoke it as a subprocess (it follows exit code conventions: 0=valid, 1=invalid).

### Configuration

No configuration files. All configuration is via CLI flags:
- Private key location: `--key` flag (or `issuer.key` default)
- Public key location: `--jwks` flag (or `issuer.pub.json` default, or HTTPS URL)
- Issuer identity: `--issuer` flag
- Source/system: `--source` flag
- Bundle title: `--title` flag

### Output / Side Effects

`sign_okf.py keygen`:
- Creates private key file at `--out` path (chmod 600)
- Creates public JWKS file at `<out_stem>.pub.json`

`sign_okf.py sign`:
- Creates/overwrites `<okf_dir>/okf.manifest.json`
- Prints: file count, output path, issuer, key_id, verify command hint

`verify_okf.py`:
- No file writes — stdout only
- VALID: prints file count, issuer, source, key_id, issued_at
- INVALID: prints specific failure reasons, exits 1

### Example Bundle Structure

```
examples/okf-bundle/
├── concepts/
│   ├── orders.md
│   └── customers.md
├── index.md
```

After signing:
```
examples/okf-bundle/
├── concepts/
│   ├── orders.md
│   └── customers.md
├── index.md
├── okf.manifest.json    # added
```

### End-to-End Flow: Sign a Bundle, Distribute, Verify

**Party A (Issuer)** — signs the bundle:
```bash
# 1. Create keypair (one-time)
python sign_okf.py keygen --out acme.key
# → acme.key (PRIVATE, chmod 600)
# → acme.pub.json (PUBLIC — host this, distribute to verifiers)

# 2. Sign the bundle
python sign_okf.py sign my-knowledge/ \
  --key acme.key \
  --issuer acme.example \
  --source "ACME Data Warehouse"

# Output:
#   Signed 42 files -> my-knowledge/okf.manifest.json
#   issuer: acme.example | key_id: ed25519-a1b2c3d4e5f6
#   verify: python verify_okf.py my-knowledge/ --jwks acme.pub.json
```

**Party A** distributes:
- The entire bundle directory (including `okf.manifest.json`)
- The public JWKS file at a known URL (e.g., `https://acme.example/.well-known/keys`)

**Party B (Verifier)** — verifies before use:
```bash
# Verify against a local JWKS file
python verify_okf.py my-knowledge/ --jwks acme.pub.json
# VALID: 42 files intact, signature verified

# Or verify against a published URL
python verify_okf.py my-knowledge/ --jwks https://acme.example/.well-known/keys
# VALID: 42 files intact, signature verified

# If tampered:
echo "injected" >> my-knowledge/concepts/orders.md
python verify_okf.py my-knowledge/ --jwks acme.pub.json
# INVALID: file integrity failed:
#   - concepts/orders.md (altered)
```

**What verification proves**:
- Every file existed in this exact form when signed
- The bundle was signed by the holder of the named Ed25519 key
- Tamper-evident: any change to any file or the manifest breaks verification

**What it does NOT prove**:
- That the content is true or correct
- That acting on the knowledge is safe
- This is provenance, not omniscience; tamper-evident, not tamper-proof; advisory evidence, not certification
