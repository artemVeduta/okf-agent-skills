# 01 — Corpus Inventory and Classification

> **Superseded in part — 2026-08-01.** The research below is retained unchanged as the record of
> what was believed and why. An adopted ticket resolution always supersedes a research note; this
> note is evidence, never policy. This claim no longer holds:
>
> - **Pandoc as the per-file conversion engine, driven by an inventory pre-pass that classifies
>   MediaWiki, Confluence, DokuWiki and Obsidian corpora for conversion (§1.1 onward)** —
>   superseded by
>   [Define safe migration of existing knowledge into OKF](https://github.com/artemVeduta/okf-agent-skills/issues/19):
>   direct parsing is limited to UTF-8 Markdown, optional YAML frontmatter, and standard Markdown
>   links; no `v0.1.0` parser is added for HTML, PDF, Word, MediaWiki, Obsidian syntax, wikilinks,
>   plugins or Dataview, and those formats remain source material or inert residue. The inventory
>   and classification findings themselves are unaffected.
>
> Research date: 2026-07-26
> Sources: Primary documentation for Pandoc, pathlib, os.walk, git-ls-files,
> Obsidian help, MediaWiki, Confluence; local OKF research files.
>
> **Evidence** = directly supported by the cited primary source.
> **Inference** = interpretation of cited evidence; not established by the source.
> **Candidate default** = proposed operational starting value, not yet benchmarked.
> **Decision required** = unresolved design choice that implementation must not guess.

---

## 1. Input Formats Supported by Existing Migration Tools

### 1.1 Pandoc — Format Detection and Corpus Handling

**Evidence:** Pandoc supports 40+ input formats and determines format explicitly
via `-f`/`--from` or by filename extension guessing. The command
`pandoc --list-input-formats` enumerates all supported readers. When multiple
input files are given, Pandoc concatenates them with blank lines before parsing,
unless `--file-scope` is used to parse each file individually
(https://pandoc.org/MANUAL.html#specifying-formats).

Relevant input formats for knowledge migration include:

| Format | Pandoc name | Corpus scenario |
|--------|------------|-----------------|
| Pandoc's Markdown | `markdown` | Documentation trees, mixed folders |
| CommonMark | `commonmark` | Documentation trees with standard Markdown |
| GitHub-Flavored Markdown | `gfm` | Repo wikis, GitHub docs |
| MediaWiki markup | `mediawiki` | Wiki exports |
| DokuWiki markup | `dokuwiki` | DokuWiki exports |
| Jira/Confluence wiki markup | `jira` | Confluence exports |
| reStructuredText | `rst` | Sphinx docs |
| HTML | `html` | Static site dumps |
| Word docx | `docx` | Word document corpora |
| EPUB | `epub` | E-book corpora |
| Emacs Org mode | `org` | Org-mode vaults |
| Vimwiki | `vimwiki` | Vimwiki vaults |
| JSON (native AST) | `json` | Pandoc intermediate representation |

**Evidence:** Pandoc uses a reader + writer architecture. Readers parse a
specific format into a common AST; writers emit that AST into a target format.
This AST is lossy relative to highly expressive source formats — the
intermediate representation is the least common denominator
(https://pandoc.org/MANUAL.html#description).

**Inference:** Pandoc's format detection is per-file, not corpus-level. It does
not scan a directory tree to classify what kind of corpus it contains. Migration
tools must wrap Pandoc with a pre-pass that identifies the source corpus format
before invoking the appropriate reader.

**Candidate default:** Use Pandoc as the per-file conversion engine, driven by
a separate inventory/classification pre-pass. Never assume corpus format from
directory name alone.

### 1.2 MediaWiki Export Format

**Evidence:** MediaWiki exports pages as XML via `Special:Export`. The XML
format wraps `<page>` elements within a `<mediawiki>` root, with each page
containing `<title>`, `<revision>`, `<contributor>`, `<comment>`, and `<text>`
elements. The text element contains raw wikitext, not rendered HTML. Exports can
include full revision history or only the latest version. Templates can be
optionally included. The XML schema is at
https://www.mediawiki.org/xml/export-0.11.xsd
(https://www.mediawiki.org/wiki/Help:Export).

Key structural signals:
- Root element: `<mediawiki>` with `xml:lang` attribute
- Each `<page>` has a `<title>` with namespace prefix (e.g. `Help:Export`)
- Namespace-to-prefix mapping in `<siteinfo><namespaces>`
- Page restrictions in `<restrictions>` (e.g. `edit=sysop:move=sysop`)

**Inference:** A MediaWiki export is trivially classifiable by checking for the
`<mediawiki>` root element or `.xml` extension with `xmlns` matching the
MediaWiki namespace. Page titles encode namespace (article, user, template,
category etc.), which provides a pre-existing taxonomy that can map to OKF
directory structure.

**Candidate default:** Detect MediaWiki exports by XML root element scan; use
namespace prefixes as directory name candidates. Parse wikitext through Pandoc's
`mediawiki` reader rather than reimplementing wiki syntax conversion.

### 1.3 Confluence Export Formats

**Evidence:** Confluence supports four export formats: HTML (zipped archive),
PDF (single file), XML (space backup), and Word (.doc). The XML space backup
includes all pages, blog posts, comments, attachments, and unpublished changes.
The HTML normal export generates one HTML file per page. The XML export uses a
proprietary Confluence `entities.xml` format within a ZIP (not MediaWiki XML).
Confluence does not export to a flat directory of Markdown files
(https://confluence.atlassian.com/doc/export-content-to-word-pdf-html-and-xml-139475.html).

**Inference:** Confluence migration requires either: (a) Pandoc's `jira` reader
on wiki-markup content extracted from the XML backup, (b) Pandoc's `html` reader
on HTML export pages, or (c) a third-party Confluence-to-Markdown tool. The XML
backup preserves the richest metadata (page hierarchy, labels, permissions,
attachments) but requires an XML parser to extract.

**Candidate default:** Prefer the XML space backup for inventory because it
preserves page hierarchy, labels (tags), and metadata. Use Confluence's REST API
`GET /rest/api/space/{key}/content` for programmatic access when available
(Cloud/Data Center). Fall back to HTML export processed through Pandoc's HTML
reader.

### 1.4 Obsidian Vault Anatomy

**Evidence:** Obsidian stores all data as plain text files in a local folder
("vault"). The `.obsidian/` directory at the vault root contains configuration
(JSON files for plugins, themes, hotkeys, workspace layout). Obsidian accepts
Markdown files and several other formats as "notes" — details at
https://help.obsidian.md/Files+and+folders/Accepted+file+formats. Each vault is
a self-contained directory with no external dependencies by default.

**Inference:** An Obsidian vault is identifiable by the presence of an
`.obsidian/` directory at the root. Vaults may contain non-Markdown files
(images, PDFs, canvas files, Excalidraw drawings) that are conceptually part of
the knowledge graph but not directly convertible to OKF concepts.

**Candidate default:** Classify a directory as an Obsidian vault when
`.obsidian/` exists at the root. Treat `.obsidian/` config as metadata source
(tag groups, plugin-enabled features) but not as content to convert. Resolve
`[[wikilinks]]` to target paths using the vault's flat or hierarchical structure
— wikilink syntax is Obsidian-specific and should be replaced with standard
Markdown links during conversion.

### 1.5 Documentation Trees (General Markdown)

**Evidence:** A documentation tree is a directory hierarchy of Markdown files
(`.md`, `.mdx`, `.markdown`) with config files (`mkdocs.yml`, `docusaurus.config.js`,
`book.toml` for mdBook, `conf.py` for Sphinx, `package.json` with doc tools).
These projects often have a `docs/` or `content/` directory as the root of the
documentation corpus.

**Inference:** Classification as a "documentation tree" requires detecting both
Markdown files and a documentation-framework config. Without a framework config,
the directory is a "mixed knowledge folder" — a catch-all category requiring
more heuristic classification.

**Candidate default:** Detect documentation trees by: (1) volume of `.md` files
vs other file types exceeds a threshold, (2) presence of a known doc-framework
config file. Treat framework config as metadata for site structure (nav,
sidebar) that may inform OKF directory hierarchy.

### 1.6 Mixed Knowledge Folders

**Inference:** A directory containing Markdown files alongside code, config, and
asset files, with no single framework dominating. This category includes
non-Obsidian personal knowledge bases, project wikis (`docs/wiki/`), research
notes directories, and ad-hoc Markdown folders.

**Candidate default:** Classify as "mixed" when: no `.obsidian/` dir, no
doc-framework config found, and Markdown files constitute <70% of all files
(files >1KB to exclude empty placeholders). Mixed folders require the most
conservative inventory — classify each file individually, mark unknowns as
"skip" rather than "error."

---

## 2. Filesystem Inventory Approaches

### 2.1 Python `os.walk`

**Evidence:** `os.walk(top, topdown=True, onerror=None, followlinks=False)`
generates `(dirpath, dirnames, filenames)` tuples by walking a directory tree.
It supports top-down vs bottom-up traversal, directory pruning via
`dirnames[:]` modification, and configurable error handling
(https://docs.python.org/3/library/os.html#os.walk).

Key properties:
- Yields one tuple per directory visited
- `topdown=True`: caller can modify `dirnames` in-place to prune subtrees
- `topdown=False`: yields leaf directories first, cannot prune
- Uses `scandir()` internally on Python 3.5+ (efficient)
- Does NOT resolve symlinks by default
- `onerror` is called on `OSError`; by default errors are silently ignored

**Inference:** `os.walk` provides the lowest-common-denominator inventory
primitive. Its key limitation is that it does not report file metadata (size,
mtime, type) — those require a separate `os.stat()` call per file. For a
migration inventory that needs file-type classification and size estimation, a
single `os.walk` pass collecting metadata is sufficient.

**Candidate default:** Use `os.walk(top, topdown=True)` as the inventory
backbone. Collect `(path, stat_result, relative_path)` tuples in a single pass.
Prune excluded directories (`node_modules/`, `.git/`, etc.) in `dirnames[:]`
during the walk to avoid unnecessary traversal.

### 2.2 Python `pathlib` — `Path.rglob` and `Path.walk`

**Evidence:** `Path.rglob(pattern)` returns a generator of all files matching a
glob pattern recursively, with optional case-sensitivity and symlink control.
`Path.walk(top_down=True, on_error=None, follow_symlinks=False)` is a higher-level
replacement for `os.walk` that yields `(dirpath, dirnames, filenames)` tuples
using `Path` objects (https://docs.python.org/3/library/pathlib.html).

**Evidence:** `Path.iterdir()` iterates a single directory. `Path.glob()` and
`Path.rglob()` support the full glob pattern language including `**` for
recursive matches, character classes, and brace expansion. `Path.stat()` returns
an `os.stat_result` with size, mtime, type bits (https://docs.python.org/3/library/pathlib.html).

**Inference:** `pathlib` provides a more readable API for inventory work.
Pattern-based filtering (`rglob("**/*.md")`) gives a clean way to enumerate
Markdown files. Combined with `p.stat().st_size` and `p.suffix`, a `pathlib`-based
inventory can classify files without additional imports.

**Candidate default:** Use `pathlib.Path.rglob` for targeted inventory passes
(e.g. "find all `.md` files") and `Path.walk` for full corpus cataloging with
metadata collection.

### 2.3 CLI Tools — `tree`, `fd`, `ripgrep`

**Evidence:** `tree` renders a directory hierarchy as ASCII art or machine-parseable
output. `fd` is a fast alternative to `find` with regex/glob support. `ripgrep`
(`rg`) searches file contents with regex at high speed, and can list files
matching patterns without searching content via `rg --files`.

- `tree -J` (JSON output), `tree -X` (XML output), `tree -H` (HTML output)
- `fd -e md` (find Markdown files), `fd --type f --type d` (files + directories)
- `rg --files` (list all files, respecting .gitignore by default)
- `rg --files-with-matches 'pattern'` (list files containing a regex match)

**Inference:** These tools are excellent for dry-run inventory reports and
one-off corpus exploration, but they lack the introspection needed for
classification (no frontmatter parsing, no link extraction). They are useful
as pre-inventory tools but not as primary inventory engines.

**Candidate default:** Use `rg --files` with `.gitignore` respect as an
initial file listing for git-tracked corpora. Use `tree` for human-readable
inventory reports in dry-run output. Do not depend on these tools being
installed — implement a Python fallback.

### 2.4 Git-Aware Inventory — `git ls-files`, `git ls-tree`

**Evidence:** `git ls-files` merges the index (tracked files) with the working
tree listing. Flags `-c` (cached/tracked), `-o` (others/untracked),
`--exclude-standard` (respects `.gitignore`), `--directory`, `--format` for
custom output fields. Can output per-file stage, mode, object name, path
(https://git-scm.com/docs/git-ls-files).

**Evidence:** `git ls-tree -r HEAD` lists all files in the current commit tree
with mode, type, object hash, and path. This provides a snapshot of committed
content regardless of working tree state.

**Inference:** For repositories with large `.gitignore`-excluded directories
(e.g. `node_modules/`, `venv/`), `git ls-files` or `git ls-tree -r HEAD`
provides a far smaller and more relevant file listing than `os.walk`. It is
also authoritative for "what actually matters in this repo" — untracked or
ignored files are typically not knowledge-relevant.

**Candidate default:** Use `git ls-files -co --exclude-standard --directory` for
repo-aware inventory. For non-repo corpora, fall back to `os.walk` with a
hard-coded exclusion list. Prefer git-aware inventory when `.git/` exists and
the user intends repo-scoped migration.

---

## 3. Classification Heuristics

### 3.1 Distinguishing Corpus Types

**Evidence:** The following signals distinguish documentation trees, wiki
exports, Obsidian vaults, and mixed folders (synthesized from §§1.1–1.6 above).

| Signal | Documentation Tree | Wiki Export | Obsidian Vault | Mixed Folder |
|--------|-------------------|-------------|----------------|--------------|
| `.obsidian/` directory | Absent | Absent | **Present** | Absent |
| Doc framework config (`mkdocs.yml`, `docusaurus.config.js`, `conf.py`) | **Present** | Absent | May be absent | Absent |
| XML `<mediawiki>` root | Absent | **Present** (MediaWiki) | Absent | Absent |
| ZIP with `entities.xml` | Absent | **Present** (Confluence) | Absent | Absent |
| `.git/` present | Common | Common | Common | Common |
| MD / total files ratio | High (>80%) | Varies | **Very high (>90%)** | Moderate (30–70%) |
| `index.md` or `README.md` | **Present** | Varies | Varies | Common |

**Inference:** Classification should be a decision tree, not a single metric.
The most reliable signals are: file-extent check for XML exports (MediaWiki XML,
Confluence XML), directory-name check for Obsidian (`.obsidian/`), and
framework-config check for documentation trees. Mixed folders are the fallback
when no specific signal fires.

**Candidate default:** Classification order:
1. Is the top-level path a file with a known export extension? (`.xml` → check
   for MediaWiki/Confluence; `.zip` → check for Confluence backup)
2. Does `input_dir/.obsidian/` exist? → Obsidian vault
3. Does a doc-framework config exist at or within 2 levels of root? → Documentation tree
4. Otherwise → Mixed folder

### 3.2 Classification Granularity

**Inference:** A corpus containing 10,000 files may have sub-trees that are
different types (e.g. a `docs/` directory within a monorepo, an `archive/old-wiki/`
dump alongside a doc tree). Classifying only at the top level loses this
information.

**Candidate default:** Classify at each directory level. Report classification
results at the directory where the signal fires. For example, a monorepo root
may be "mixed," but its `docs/` subdirectory may be "documentation tree." The
inventory report should show a taxonomy tree, not a single label.

**Decision required:** Should sub-directory classification override parent
classification? Or should classification always start fresh at each directory,
with the parent serving only as context? The behavior of nested wiki exports
inside a documentation tree (e.g. a MediaWiki dump saved at `docs/legacy-wiki/`)
must be defined.

### 3.3 Recognized Documentation Framework Configs

**Candidate default:** The following config files signal a known doc framework:

| Framework | Config file(s) |
|-----------|---------------|
| MkDocs | `mkdocs.yml`, `mkdocs.yaml` |
| Docusaurus | `docusaurus.config.js` |
| Sphinx | `conf.py` |
| mdBook | `book.toml` |
| VuePress | `.vuepress/config.js` |
| VitePress | `.vitepress/config.js` |
| Docsify | `index.html` (with `window.$docsify`) |
| Just the Docs (Jekyll) | `_config.yml` with `just-the-docs` theme |
| Antora | `antora.yml`, `antora-playbook.yml` |
| GitBook | `book.json`, `SUMMARY.md` (legacy) |
| HonKit | `book.json` |
| Quarto | `_quarto.yml` |

**Evidence:** Each framework's config file name is documented in its respective
documentation. Framework detection is a checklist match, not heuristic.

---

## 4. File-Type Taxonomy

### 4.1 Primary Categories

**Candidate default:** Classify every file in the corpus into one of the
following categories. Categories are mutually exclusive and exhaustive — every
file must be classified.

| Category | Extensions | Migration Action | Notes |
|----------|-----------|-----------------|-------|
| **Markdown** | `.md`, `.mdx`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdwn`, `.mdtxt`, `.mdtext`, `.rmd` | Convert to OKF concept | Include frontmatter parsing attempt |
| **Org Mode** | `.org` | Convert via Pandoc or org parser | Emacs org-mode vaults |
| **reStructuredText** | `.rst`, `.rest` | Convert via Pandoc or docutils | Sphinx docs |
| **AsciiDoc** | `.adoc`, `.asciidoc`, `.asc` | Convert via Pandoc | Antora/AsciiDoc sites |
| **Textile** | `.textile` | Convert via Pandoc | Redmine wikis |
| **HTML** | `.html`, `.htm` | Extract Markdown via Pandoc | Static site dumps; may be wiki pages or doc exports |
| **MediaWiki XML** | `.xml` (with `<mediawiki>` root) | Parse XML, extract wikitext, convert via Pandoc | Special:Export output |
| **Confluence Backup** | `.zip` (with `entities.xml`) | Extract and convert | Space backup format |
| **CSV / JSON data** | `.csv`, `.tsv`, `.json`, `.jsonl` | Reference as data source, not concept | May inform `Attested Computation` concepts |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.ico`, `.tiff` | Copy to OKF bundle as attachments | Track in `resource` fields |
| **Diagrams** | `.drawio`, `.excalidraw`, `.mmd` (Mermaid), `.puml` (PlantUML), `.d2` | Copy + optionally render to SVG | Mermaid/PlantUML can render inline |
| **PDF** | `.pdf` | Copy as attachment | May need OCR or extraction for content |
| **Office Documents** | `.docx`, `.doc`, `.pptx`, `.xlsx`, `.odt`, `.ods`, `.odp` | Extract text via Pandoc or python-docx | Create concept with attachment ref |
| **Config** | `.yml`, `.yaml`, `.toml`, `.ini`, `.cfg`, `.conf` | Skip or extract metadata | Doc framework configs; may inform structure |
| **Scripts** | `.py`, `.js`, `.ts`, `.sh`, `.bash`, `.rb`, `.pl`, `.go`, `.rs`, etc. | Skip (code-backed project) | Only in knowledge-only: copy as reference |
| **Binary / Unknown** | Everything else | Warn and skip | `file` command can disambiguate some |

**Decision required:** Should `.mdx` files (JSX-enhanced Markdown) be treated
as standard Markdown for conversion (ignoring JSX blocks), or should they
require a warning/skip? MDX components cannot round-trip through Pandoc.

### 4.2 Frontmatter Detection

**Evidence:** OKF requires YAML frontmatter delimited by `---` (OKF v0.2 §4). 
Many Markdown files already use frontmatter for metadata (Jekyll, Hugo, Gatsby,
Obsidian, etc.).

**Inference:** Frontmatter presence is a valuable classification signal. A file
with `---\n...\n---\n` at the start indicates intentional metadata practices and
suggests higher-value knowledge content. Files without frontmatter may be
informal notes or structural documentation that needs more processing.

**Candidate default:** For every Markdown file, attempt YAML frontmatter
extraction. Record in inventory:
- `has_frontmatter: bool`
- `frontmatter_keys: list[str]` (if parseable)
- `has_type_field: bool` — signals pre-existing `type` frontmatter (may already
  be OKF-conformant)
- `frontmatter_parse_error: str | None`

---

## 5. Size Estimation

### 5.1 Metrics to Collect

**Candidate default:** The following metrics should be collected during
inventory and reported in the dry-run:

| Metric | How to compute | Purpose |
|--------|---------------|---------|
| **File count (by category)** | Count per category from §4.1 | Overall corpus size |
| **Markdown file count** | Count `.md` + variants | Conversion workload estimate |
| **Total bytes (by category)** | `sum(st_size)` per category | Storage estimate |
| **Markdown total bytes** | `sum(st_size)` for MD files | Content volume |
| **Directory count** | Count unique `dirpath` values | Structure complexity |
| **Maximum nesting depth** | `len(Path.relative_to(root).parts)` max | Hierarchy depth |
| **Average MD file size (bytes)** | Markdown total / count | Granularity indicator |
| **Files with frontmatter (%)** | Frontmatter files / MD files | Metadata maturity |
| **Files with `type` field (%)** | type-field files / MD files | OKF-readiness |
| **Broken links (if computable)** | Link targets not found in corpus | Migration prep work |
| **Total unique `type` values** | Count distinct `type` in frontmatter | Existing taxonomy depth |
| **Images count + total bytes** | Count/bytes for image files | Asset migration scope |

### 5.2 Candidate Size Thresholds

**Inference (from §3.3.1 of lightweight-durable-context.md):** The
Zettelkasten-de article describes anecdotal structural thresholds: <500 notes =
flat structure sufficient, 500–700 = hub notes, 1000–1500 = MOCs, >1500 =
structural compaction. These are one practitioner's retrospective, not general
thresholds.

**Candidate default:** Use the following as alert thresholds in the inventory
report (not triggers for automatic action):

| Alert threshold | What it means for migration |
|----------------|---------------------------|
| >500 MD files | Bundle will need `index.md` at subdirectory levels |
| >1000 MD files | Consider pre-generating MOC (`type: Map`) during migration |
| >50% files without frontmatter | Large volume of untagged content; migration may lose structure |
| >20% images/assets by file count | Asset-heavy corpus; plan for attachment directory |
| >100MB total corpus | Large migration; consider batching |
| Nesting depth >6 levels | Deep hierarchy; may need flattening for OKF bundle |

**Decision required:** Should these thresholds be hard-coded or configurable?
Should they be policy-based (e.g., "for knowledge-only projects: depth alert at
4")?

---

## 6. Dry-Run Inventory Report

### 6.1 Report Structure

**Candidate default:** The dry-run inventory report should be a structured
output (JSON or YAML) with a human-readable summary section. It must be
generated before any file modification occurs.

```yaml
# Dry-run inventory report — never modifies files
corpus_root: /path/to/corpus
classification: obsidian_vault  # top-level classification
classified_at: 2026-07-26T12:00:00Z
okf_target_version: "0.2"

summary:
  total_files: 1247
  total_dirs: 89
  total_bytes: 45234098
  markdown_files: 312
  markdown_bytes: 8456230
  assets_files: 156
  assets_bytes: 28000000
  other_files: 779

  classification_tree:
    - path: "."
      classification: obsidian_vault
      markdown_files: 312
    - path: "./archive/"
      classification: mixed_folder
      markdown_files: 45
    - path: "./templates/"
      classification: doc_tree
      doc_framework: "obsidian_templates"

  frontmatter:
    has_frontmatter_count: 247
    has_frontmatter_pct: 79.2
    has_type_field_count: 18
    has_type_field_pct: 5.8
    unique_type_values: ["evergreen", "literature-note", "meeting", "daily"]
    frontmatter_parse_errors: 3

  size_alerts:
    - threshold: ">500 markdown files"
      current: 312
      triggered: false
    - threshold: ">50% files without frontmatter"
      current: 20.8
      triggered: false

  link_analysis:
    total_links: 1823
    wiki_links: 1205    # [[double bracket]] links (Obsidian)
    md_links: 543       # [title](url) links
    broken_links: 47    # targets not found in corpus
    external_links: 71  # targets outside corpus

  asset_inventory:
    images: { count: 89, bytes: 45823000 }
    pdfs: { count: 12, bytes: 23400000 }
    diagrams: { count: 7, bytes: 245000 }
    config_files: { count: 5, bytes: 34200 }

  per_file_inventory:
    # One entry per file that will be processed
    - relative_path: "concepts/programming-languages.md"
      category: markdown
      size_bytes: 4523
      has_frontmatter: true
      has_type_field: true
      type_value: "evergreen"
      frontmatter_keys: ["type", "title", "tags", "created", "modified"]
      link_count: 8
      wiki_link_count: 3
      md_link_count: 5
      action: convert_to_concept  # convert | copy_asset | skip | warn_manual

    - relative_path: "assets/architecture-diagram.png"
      category: image
      size_bytes: 452300
      action: copy_asset
```

**Decision required:** The `per_file_inventory` section can be very large for
large corpora (>10K files). Should it be streamed/append-only, split into
chunks, or optional (generated only when `--verbose` flag is used)?

### 6.2 Human-Readable Summary

**Candidate default:** In addition to the structured report, emit a
human-readable summary to stdout:

```
=== Corpus Inventory: /home/user/notes ===

Classification: Obsidian vault (.obsidian/ found at root)

Files scanned:    1,247
Markdown files:     312  ( 8.4 MB)  [79% have frontmatter]
Images:              89  (45.8 MB)
PDFs:                12  (23.4 MB)
Diagrams:             7  (  0.2 MB)
Config/scripts:       5  (  0.03 MB)
Other:              822  ( 12.5 MB)

Link analysis:
  Total links:    1,823
  Wiki links:     1,205  (will be converted to Markdown links)
  Broken links:      47  (targets not found)

Size alerts: none triggered (312 < 500 threshold)

Estimated conversion:
  Concepts to create:  312 MD files
  Assets to copy:      108 files (89 images + 12 PDFs + 7 diagrams)
  Skipped:             827 files
  Manual review:         3 files (frontmatter parse errors)

Directory structure preview (top 3 levels):
  notes/
  ├── concepts/          (182 MD) ──┐
  │   ├── programming/   (45 MD)   │ concepts
  │   ├── design/        (38 MD)   │ by type
  │   └── business/      (29 MD)   │
  ├── daily/              (53 MD) ── daily notes
  ├── templates/          (12 MD) ── Obsidian templates
  ├── archive/            (45 MD) ── mixed folder (wikitext found)
  └── assets/            (108 files) ─ images, PDFs, diagrams

Next steps:
  1. Review broken links (47) — may need manual path mapping
  2. Review 3 files with frontmatter parse errors
  3. Archive directory contains wikitext — may need Pandoc processing
  4. Run: okf migrate --dry-run --all    [to re-verify]
  5. Run: okf migrate --execute --backup first
```

---

## 7. Prior Art in Migration Tool Inventory

### 7.1 Existing OKF Conversion Skill

**Evidence:** The fabricioctelles OKF skill (`okf-open-knowledge-format`)
includes a `references/conversion.md` guide covering Notion exports, Obsidian
vaults, and CSV files. It describes Obsidian conversion as: (1) identifying
vault root, (2) resolving `[[wikilinks]]`, (3) converting frontmatter, (4) copying
attachments. No automated inventory step is documented — the guide assumes the
user knows what's in their vault (file:
`docs/research/okf-spec-and-ecosystem.md`, §4.3).

**Inference:** Existing OKF tools assume the user has already surveyed their
corpus. A systematic inventory step fills a gap — it provides the structured
data needed to make migration decisions before conversion begins.

### 7.2 `okflint` Linter's Inventory-like Behavior

**Evidence:** `okflint` scans directories of Markdown files and validates OKF
conformance. It resolves Obsidian wikilinks, checks frontmatter, and generates
indexes. While designed for post-migration validation, its scanning behavior is
reusable as a pre-migration inventory primitive
(file: `docs/research/okf-spec-and-ecosystem.md`, §4.2 — Validators).

**Inference:** The okflint scanning pass is a proven pattern: walk a directory
tree, parse frontmatter from each `.md` file, classify by `type`. The same
algorithm can drive inventory before any conversion occurs.

### 7.3 General-Purpose Documentation Crawlers

**Evidence:** Tools like `gatsby-transformer-remark`, `Astro content
collections`, and `Next.js MDX` all implement directory scanning + frontmatter
extraction. These are not migration tools but demonstrate the established
pattern of: (1) glob for `.md` files, (2) parse YAML frontmatter, (3) collect
into a typed list.

**Inference:** The pattern is battle-tested. An OKF migration inventory is
essentially a specialized form of this pattern, with additional classification
heuristics and conversion-action assignment.

---

## 8. Open Questions

1. **Classification vs manual override:** Should the dry-run report always be
   emitted before the first file is converted, or can users skip it via
   `--no-dry-run`? **Candidate default:** Always emit dry-run; it is the safety
   net.

2. **Incremental inventory:** If the user modifies the source corpus after
   inventory but before conversion, should the tool detect and re-run?
   **Candidate default:** Compute a content hash of the inventory and warn if
   any inventoried file's mtime differs from the recorded mtime.

3. **Large corpus performance:** For corpora >50K files, file-by-file `stat()`
   calls may be slow. **Candidate default:** Use `os.scandir()` (which
   `os.walk` uses internally) to avoid separate `stat()` calls. Batch-stat may
   help but requires benchmarking.

4. **Corpus language detection:** Knowledge corpora may contain content in
   multiple languages. Should the inventory detect language per file?
   **Candidate default:** Not in v1. Defer to migration phase or content-aware
   processing.

---

## Sources

- Pandoc User's Guide — input formats, format detection:
  https://pandoc.org/MANUAL.html#specifying-formats
- Python `os.walk` documentation:
  https://docs.python.org/3/library/os.html#os.walk
- Python `pathlib` documentation — `Path.rglob`, `Path.iterdir`, `Path.walk`:
  https://docs.python.org/3/library/pathlib.html
- Git `git-ls-files` documentation:
  https://git-scm.com/docs/git-ls-files
- Obsidian Help — How Obsidian stores data:
  https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data
- Obsidian Help — Accepted file formats:
  https://help.obsidian.md/Files+and+folders/Accepted+file+formats
- MediaWiki Help:Export:
  https://www.mediawiki.org/wiki/Help:Export
- Confluence Data Center — Export Content:
  https://confluence.atlassian.com/doc/export-content-to-word-pdf-html-and-xml-139475.html
- Local: `docs/research/okf-spec-and-ecosystem.md` — OKF specification,
  ecosystem tools, reference implementation
- Local: `docs/research/workspace-topology-and-routing.md` — workspace
  discovery, manifest, directory exclusion
- Local: `docs/research/lightweight-durable-context.md` — Zettelkasten
  thresholds, lifecycle dimensions, candidate defaults
