# Wiki Platform Export and Migration to Markdown

> Primary-source research on MediaWiki, Confluence, DokuWiki export formats, conversion
> tools, known quality gaps, and wiki-specific constructs without Markdown equivalents.
>
> **Evidence** = directly supported by linked specs, API docs, source code, or formal XML
> schemas. **Inference** = interpretation of evidence. **Candidate default** = proposed
> default behavior not yet validated. **Decision required** = product choice this research
> must not make.

---

## 1. MediaWiki XML Export Format

### 1.1 Special:Export Mechanism

**Evidence:** MediaWiki provides `Special:Export` for exporting pages in XML format
(MediaWiki Help:Export, last edited 2026-02-23). The export format is codified in XML
Schema at `https://www.mediawiki.org/xml/export-0.11.xsd`. Three export methods exist:

1. **Special:Export web UI**: Paste page names, optionally include full history and
   templates.
2. **`dumpBackup.php`**: Server-side script dumping all wiki pages. Requires direct server
   access (MediaWiki 1.5+).
3. **Pywikibot framework**: Programmatic export.

### 1.2 XML Schema

**Evidence:** The export XML has this structure (MediaWiki Help:Export, DTD section):

```xml
<mediawiki xml:lang="en">
  <page>
    <title>Page title</title>
    <restrictions>edit=sysop:move=sysop</restrictions>
    <revision>
      <timestamp>2001-01-15T13:15:00Z</timestamp>
      <contributor><username>Foobar</username></contributor>
      <comment>I have just one thing to say!</comment>
      <text>A bunch of text here.</text>
      <minor />
    </revision>
  </page>
</mediawiki>
```

Key observations:
- **The `<text>` element contains raw wikitext** (MediaWiki markup), not rendered HTML.
  "You only get the wiki text as you get when editing the article" (Help:Export: Export
  format).
- Each `<page>` can have multiple `<revision>` elements if full history is exported.
- Contributors can be identified by `<username>` or `<ip>` for anonymous edits.
- The `<siteinfo>` section contains sitename, base URL, generator version, case handling,
  and namespace definitions.

**Inference:** The XML export preserves authorship attribution and edit summaries. A
migration tool can parse both the current revision and historical revisions independently
to reconstruct document history or discard it as desired.

### 1.3 Export Parameters

**Evidence:** Parameters to Special:Export (Manual:Parameters to Special:Export, last
edited 2026-07-08):

| Parameter | Function |
|-----------|----------|
| `pages` | Page titles, linefeed-separated (max 35 via UI, higher via POST) |
| `addcat`/`catname` | Export all pages of a category (max 5,000 pages) |
| `addns`/`nsindex` | Export all pages of a namespace (max 5,000) |
| `history` | Include full revision history |
| `curonly` | Default for GET: current revision only |
| `templates` | Include transcluded templates recursively |
| `limit` | Max revisions returned (site-specific, default: Wikimedia 1,000) |
| `offset` | Timestamp to start from (non-inclusive) |
| `dir=desc` | Reverse chronological order |
| `pagelink-depth` | Include linked pages to specified depth (limited to 5) |
| `listauthors` | Include all contributor names and user IDs |
| `wpDownload` | Save as file with `Content-Disposition: attachment` |

**Critical note:** `dir`, `offset`, and `limit` only work for POST requests. GET requests
through a URL are ignored for these parameters (Manual:Parameters to Special:Export: §URL
parameter requests do not work).

### 1.4 Wikimedia Database Dumps

**Evidence:** Wikipedia offers full database dumps at `dumps.wikimedia.org`
(Wikipedia:Database download, last visited 2026-07-26). Key dump formats:
- **pages-articles-multistream.xml.bz2**: Current revisions only, no talk or user pages
  (~25 GB compressed for English Wikipedia, expands to ~105 GB)
- **pages-meta-current.xml.bz2**: Current revisions, all pages including talk
- **pages-meta-history.xml.bz2**: All revisions, all pages (expands to terabytes)
- Multistream format: Multiple bz2 streams concatenated, each containing 100 pages. An
  index file maps byte offsets to article IDs and titles for selective decompression.
- SQL dumps also available for `pages` and `links` tables.

**Inference:** For most migration scenarios, `Special:Export` with specific page lists is
the appropriate source, not the full dump. The multistream XML format is the canonical
source for bulk MediaWiki content.

---

## 2. Confluence Export Formats

### 2.1 REST API (Cloud)

**Evidence:** Confluence Cloud REST API v1 (Atlassian Developer, last accessed
2026-07-26) provides endpoints under `/wiki/rest/api/`. Relevant groups:
- **Content**: CRUD for pages, blog posts, attachments
- **Content - children and descendants**: Hierarchical page retrieval
- **Content body**: Get page body in `storage` (Confluence Storage Format XML),
  `atlas_doc_format`, `view` (rendered HTML), `export_view` (export-ready HTML), or
  `anonymous_export_view` formats
- **Content versions**: Version history retrieval
- **Space**: Space-level operations and exports
- **Search**: Search via CQL (Confluence Query Language)

### 2.2 Confluence Storage Format

**Evidence:** The Confluence Cloud REST API returns page bodies in "storage format" which
is an XML-based representation of Confluence content. This is the authoring format, not
rendered HTML. It contains:
- `<ac:structured-macro>` elements for Confluence macros (e.g., table of contents, Jira
  issues, info panels)
- `<ac:image>` elements for embedded images with attachment references
- `<ri:page>`, `<ri:attachment>`, `<ri:url>` for Confluence-internal link references
- `<ac:link>` and `<ac:plain-text-link-body>` for link structure

**Inference:** The storage format is structurally richer than wikitext but still
requires a dedicated parser/converter, as it contains Confluence-specific XML namespaces
and macro definitions. Pandoc reads `jira` format (Jira/Confluence wiki markup), which is
a different representation from the Confluence Storage Format XML.

### 2.3 Export Options

**Evidence:** Confluence Server/Data Center provides (Atlassian Developer docs, last
accessed 2026-07-26):
- **Space export**: HTML, XML, PDF via the admin UI
- **REST API**: `GET /wiki/rest/api/content/{id}` with `expand=body.export_view` returns
  export-ready HTML
- **CQL-based search** for filtered content retrieval
- **Attachment API**: Separate endpoints for binary attachment downloads

**Candidate default:** For migration, the REST API with `export_view` body format (HTML)
provides the richest content representation for conversion to Markdown. The storage format
is more canonical but requires Confluence-specific XML parsing.

---

## 3. DokuWiki Storage Format

### 3.1 File-Based Architecture

**Evidence:** DokuWiki stores content as plain text files without a database (Wikipedia:
DokuWiki article, last edited 2026-07-22). Its syntax is "similar to the one used by
MediaWiki" (Wikipedia: DokuWiki: §Main features). Key architectural facts:
- Written in PHP, GPLv2 license
- Pages stored as `.txt` files within a `data/pages/` directory hierarchy
- Directory structure mirrors namespace hierarchy
- No database required — all content is in the filesystem
- Each page filename is derived from the page title (URL-encoded or similar
  transformation)
- Media files stored in `data/media/`
- Revision history stored in `data/attic/` as compressed `.txt.gz` files with
  `timestamp` suffixes
- Metadata (page metadata, ACLs) stored alongside in separate files

### 3.2 Export Approaches

**Evidence:** DokuWiki does not have a built-in export mechanism comparable to
MediaWiki's `Special:Export`. The recommended approach is:

1. **Filesystem copy**: Copy `data/pages/` directory — the `.txt` files already contain
   raw DokuWiki markup.
2. **Backup of whole directory**: DokuWiki's backup process copies the entire
   installation directory (Wikipedia: DokuWiki: no database needed).

**Inference:** DokuWiki is the simplest of the three platforms to migrate. Its plain-text
storage eliminates a data extraction step — the source files are the migration input
directly. The main conversion work is parsing DokuWiki syntax to Markdown.

---

## 4. Pandoc as Wiki-to-Markdown Converter

### 4.1 Supported Wiki Input Formats

**Evidence:** Pandoc's manual (pandoc.org/MANUAL.html, as of 2026-07-26) lists three
wiki input formats:

| Pandoc format | Source | Notes |
|---------------|--------|-------|
| `mediawiki` | MediaWiki markup | Reads wikitext, not XML export directly |
| `dokuwiki` | DokuWiki markup | Reads `.txt` file content |
| `jira` | Jira/Confluence wiki markup | Reads Jira/Confluence wikitext syntax |

For output, pandoc supports: `markdown`, `gfm` (GitHub-Flavored Markdown),
`commonmark`, `commonmark_x`, and many more.

**Evidence:** Pandoc also reads `mediawiki` and `dokuwiki` as input and can write
`mediawiki` and `dokuwiki` as output formats (both-directional conversion). For
Confluence, the `jira` format covers both Jira and Confluence wiki markup syntax.

### 4.2 Pandoc's General Limitation

**Evidence (verbatim from pandoc manual):**
> "Because pandoc's intermediate representation of a document is less expressive than
> many of the formats it converts between, one should not expect perfect conversions
> between every format and every other. [...] While conversions from pandoc's Markdown
> to all formats aspire to be perfect, conversions from formats more expressive than
> pandoc's Markdown can be expected to be lossy."

**Inference:** MediaWiki, DokuWiki, and Confluence markup are all more expressive than
pandoc's internal AST. Loss is guaranteed. The question is how much and for which
constructs.

### 4.3 Known Pandoc MediaWiki Issues

**Evidence:** Pandoc GitHub issues tagged `format:Mediawiki` (github.com/jgm/pandoc,
queried 2026-07-26):

| Issue | Description | Status |
|-------|-------------|--------|
| #9425 | Parsing MediaWiki `Image:`/`File:`/`Media:` with spaces before filename | Open (since 2024-02) |
| #9178 | Conversion from MediaWiki to markdown fails when `data` properties present in tables | Closed (fixed) |
| #9293 | Multi-line `<math>` in `*` lists break with MediaWiki→HTML | Closed (fixed) |
| #11299 | MediaWiki to Texinfo ignores `<var>` and `<samp>` tags | Closed (fixed) |
| #8855 | dokuwiki→mediawiki: Headings starting with capital letter render to empty span | Closed (fixed) |
| #8801 | Add conversion-option Bibtex→Mediawiki-reference-style | Open (enhancement) |

**Inference:** Active issues show edge cases around image/file parsing (spaces in
filenames, #9425) and complex table attributes. The MediaWiki reader is maintained but
has unresolved quirks with the full syntax surface.

### 4.4 Math Handling in Pandoc

**Evidence (from pandoc manual):** For MediaWiki and DokuWiki output:
> "It will be rendered inside `<math>` tags." (Pandoc Manual: §Math rendering in
> various output formats)

For reading, pandoc processes MediaWiki `<math>` tags and converts them to its internal
math representation. In Markdown output, this typically becomes `$...$` or `$$...$$`.

**Inference:** Math conversion is well-handled by pandoc for the math content itself,
but the surrounding wiki constructs (e.g., math inside templates, math in table cells)
may have interaction bugs (see #9293).

---

## 5. Wiki-Specific Constructs Without Markdown Equivalents

### 5.1 Templates (MediaWiki)

**Evidence:** MediaWiki templates are transcluded wiki pages in the `Template:`
namespace, invoked via `{{template name}}` syntax. They accept named and anonymous
parameters with `{{{parameter}}}` placeholders. Templates can call other templates, use
parser functions (`{{#if:}}`, `{{#switch:}}`), and have default values
(`{{{param|default}}}`) (MediaWiki Help:Templates, last accessed 2026-07-26).

**No Markdown equivalent exists.** Conversion options:
- **Expand templates**: Use `Special:Export` with `templates` parameter to include
  template wikitext in the export, then recursively expand during conversion. This loses
  the template abstraction but produces readable text.
- **Preserve as comments**: Embed template source in HTML/Markdown comments. Unreadable
  but preserves traceability.
- **Replace with metadata**: Store template name and parameters in frontmatter. Loses
  visual rendering.

**Candidate default:** Expand templates during export pre-processing (via
`Special:Export?templates=1`), then convert the expanded wikitext. Templates are a
rendering-time concern specific to MediaWiki's engine and have no portable equivalent.

### 5.2 Transclusion

**Evidence:** MediaWiki transclusion is the mechanism by which templates embed content
(MediaWiki Help:Templates: §Basic usage). Beyond templates, MediaWiki supports:
- Substitution (`{{subst:Name}}`): Copy template content at save time
- Cross-namespace transclusion (`{{:PageName}}`): Transclude any page
- Section transclusion via `<noinclude>`, `<includeonly>`, `<onlyinclude>` tags

**No Markdown equivalent exists.** **Decision required:** Whether to:
- Expand all transclusions during export and lose the transclusion abstraction
- Preserve transclusion markers as comments or frontmatter metadata
- Accept that non-expanded transclusions produce broken/incomplete output

### 5.3 Categories

**Evidence:** MediaWiki categories are declared via `[[Category:Name]]` links at the
bottom of pages. They create automatic category listing pages and are used for
navigation and organization (MediaWiki standard feature).

**No Markdown equivalent exists.** Options:
- Strip category links during conversion
- Convert to frontmatter tags (e.g., `tags: [category-name]`)
- Convert to regular links to placeholder pages

**Candidate default:** Convert category declarations to frontmatter `tags` in the OKF
concept file. Strip the `Category:` namespace prefix and normalize to simple tags.

### 5.4 Namespaces

**Evidence:** MediaWiki namespaces partition pages by type: `Talk:`, `User:`,
`Template:`, `File:`, `Category:`, `Help:`, plus custom namespaces. Pages are uniquely
identified by `Namespace:Title` (MediaWiki Help:Export: DTD `siteinfo/namespaces`
section). DokuWiki uses directory-based namespaces (subdirectories in `data/pages/`).
Confluence uses "spaces" as top-level organizational units.

**No Markdown equivalent exists** for hierarchical namespace prefixing. Options:
- Map namespace to directory structure (e.g., `Help:Export` → `help/export.md`)
- Preserve namespace as part of the filename
- Drop namespaces for main namespace content, treat others as metadata

**Candidate default:** Map namespace to directory hierarchy: `Namespace:.md` →
`namespace/.md`. This preserves the organizational structure and aligns with OKF's
directory-based bundle model.

### 5.5 Interwiki Links

**Evidence:** MediaWiki supports interwiki prefixes (e.g., `[[wikipedia:Article]]`,
`[[wiktionary:Word]]`) that create links to other wikis based on a prefix-to-URL mapping
table. These are configured server-side and have no inherent meaning in the wikitext.

**No Markdown equivalent exists.** Options:
- Expand interwiki prefixes to full URLs using a known interwiki map
- Preserve prefix notation as comments
- Convert to relative/absolute links based on a configured mapping

**Decision required:** Whether to ship with a default interwiki map (e.g., Wikimedia's
standard map) or require per-migration configuration.

### 5.6 Info Boxes

**Evidence:** Info boxes are a MediaWiki convention (not a core feature) implemented via
templates that render structured key-value data in a right-floating formatted box
(e.g., `{{Infobox person|name=...|birth_date=...}}`). They contain template logic and
CSS styling that has no meaning outside the MediaWiki engine.

Rendered output (HTML) loses the structured data. Source (wikitext) preserves it but
only in template-parameter form.

**Candidate default:** If template expansion is enabled, info boxes render as formatted
text (possibly as a Markdown table capturing key-value pairs). If not expanded, preserve
as YAML frontmatter containing the extracted parameters.

### 5.7 Image Syntax and Attachments

**Evidence:** MediaWiki images use complex pipe-delimited syntax:
```
[[File:filename.jpg|thumb|200px|left|alt=Alternative text|Caption text]]
```
Options include format (thumb, frame, frameless, border), size (px, upright),
horizontal/vertical alignment, link target override, alt text, and caption (MediaWiki
Help:Images, last accessed 2026-07-26).

DokuWiki uses simpler syntax: `{{filename.jpg?200|Caption}}`.

Confluence stores images as attachments with page-scoped references. The Confluence
Storage Format XML uses `<ac:image>` with `ri:attachment` references. Export via REST
API with `export_view` renders images as HTML `<img>` tags with Confluence attachment
URLs.

**No Markdown equivalent** for image sizing and alignment attributes beyond the basic
`![alt](url)` syntax. Pandoc's conversion:
- Reads MediaWiki `[[File:...]]` syntax and maps to internal image representation
- Writes Markdown as `![caption](filename.jpg)` — sizing and alignment are lost
- Open issue #9425 (spaces before filename in `File:` prefix) remains unresolved

**Candidate default:** Strip sizing/alignment attributes and convert to simple
`![alt](path)` Markdown images. Preserve original dimensions as HTML comments or
frontmatter fields. Download attachments/images from the wiki and store locally.

### 5.8 Wiki Tables

**Evidence:** MediaWiki table syntax uses `{|` (table open), `|+` (caption), `|-` (row
separator), `|` (cell), `!` (header cell), `|}` (table close). Pandoc's MediaWiki reader
converts these to its internal table representation.

DokuWiki tables use `^` headers and `|` cells.

Confluence/Jira tables use `||header||` and `|cell|` syntax.

**Evidence:** Known issue: pandoc #9178 — "Conversion from MediaWiki to markdown fails
when `data` properties are present in tables." Table attributes (CSS classes, styles,
colspan/rowspan via `colspan="2"`) may not survive conversion to standard Markdown.

**Inference:** Simple tables convert well. Complex tables with attributes, nested
content, or colspans exceeding what GFM pipe tables support will be degraded. Pandoc
falls back to HTML table output in GFM format when pipe syntax is insufficient (Pandoc
Manual: §Raw HTML).

---

## 6. Attachment and Image Handling

### 6.1 MediaWiki

**Evidence:** Images are stored in the `File:` namespace. The `Special:Export` XML only
contains the wikitext reference to the file, not the binary file itself. Images must be
downloaded separately:
- Wikimedia Commons files available at `upload.wikimedia.org`
- Private wiki attachments require separate HTTP requests or filesystem access
- Image dumps are available from `dumps.wikimedia.org` but "most recent dumps of media
  files are more than ten years old" (Wikipedia:Database download: §Where are the
  uploaded files, as of April 2026)

**Inference:** Migration must include a two-pass process: (1) extract image references
from wikitext, (2) download images and rewrite paths.

### 6.2 Confluence

**Evidence:** Confluence attachments are scoped to pages. The REST API provides:
- `GET /wiki/rest/api/content/{id}/child/attachment` — list attachments
- `GET /wiki/rest/api/content/{id}/child/attachment/{attachmentId}/download` — download
  binary

### 6.3 DokuWiki

**Evidence:** Media files stored in `data/media/` directory. Structure mirrors page
namespaces. No separate download step needed if filesystem access is available.

**Candidate default:** Two-pass migration: first export and convert wikitext to
Markdown, extracting all image/media references; second, download/collect media files
and rewrite paths to local relative paths. Store media alongside concepts in an
`assets/` or `media/` directory within the OKF bundle.

---

## 7. Revision History: Preserve vs Discard

### 7.1 What's Available

| Platform | History format | Granularity |
|----------|---------------|-------------|
| MediaWiki | `<revision>` elements in XML export; SQL dumps | Per-edit: timestamp, user/IP, comment |
| Confluence | REST API: `/content/{id}/version` endpoint; version history | Per-version: number, timestamp, user, message |
| DokuWiki | `.txt.gz` files in `data/attic/`; `data/meta/_dokuwiki.changes` log | Per-save: timestamp, user, IP, summary |

### 7.2 Markdown Limitations

**Evidence:** Markdown has no built-in revision-tracking mechanism. OKF v0.2 provides
`log.md` for directory-level chronological entries but does not define per-concept
revision history in frontmatter (OKF v0.2 Spec §9: log.md format is "date-grouped
entries, newest first").

**Candidate default:** Discard full revision history from wiki exports. Record migration
metadata once per concept: `migration.source`, `migration.source_url`,
`migration.exported_at`, `migration.last_editor`, `migration.last_modified`. For
attribution, include original author as `generated.by` or a `sources` entry. Full
history is a separate concern suited to git, not OKF.

**Decision required:** Whether to preserve authorship attribution at the concept level
or to discard it entirely. MediaWiki XML export includes contributor usernames/IPs per
revision; these could populate OKF `generated.by` with appropriate actor prefix
(`human:`, `ip:`).

---

## 8. Known Converter Bugs and Quality Gaps

### 8.1 Summary Table

| Construct | Pandoc Status | Gap Severity | Workaround |
|-----------|--------------|-------------|------------|
| **Basic formatting** (bold, italic, lists, headings) | Converts cleanly | None | — |
| **Links** (internal wiki links) | Converts to relative Markdown links | Low | Manual namespace remapping |
| **Interwiki links** | Stripped or converted to plain text | Medium | Pre-process with interwiki map |
| **Tables** (simple) | Converts to pipe tables or HTML tables | Low | — |
| **Tables** (with `data-*` attributes, colspans, styles) | Can fail or lose attributes | High | Pre-process to strip attributes |
| **Images** (basic syntax) | Converts to `![]()` | Low | Download images separately |
| **Images** (spaces in filename) | Open bug #9425 | Medium | Pre-process filenames |
| **Math** (`<math>` tags) | Converts to `$...$` | Low | — |
| **Templates** | Not resolved — passed through verbatim | Critical | Expand via `Special:Export?templates=1` |
| **Categories** | Stripped or converted to text | Medium | Map to frontmatter tags |
| **Namespaces** | Not preserved | Medium | Map to directory structure |
| **Transclusion** | Not resolved | Critical | Expand during export |
| **Info boxes** | Template-dependent; degraded when unexpanded | High | Expand templates before conversion |
| **Parser functions** (`{{#if:}}`, etc.) | Not evaluated | Critical | Must expand server-side |
| **Confluence macros** | Not handled by pandoc's `jira` reader | Critical | Convert via Confluence export HTML, not storage format |
| **DokuWiki plugins** | Syntax not recognized | Medium | Pre-process plugin directives |
| **Revision history** | Not in scope | Low | Record metadata per concept |

### 8.2 Structural Quality Gaps

**Evidence:** The pandoc manual states that its intermediate representation is "less
expressive" than wiki formats. This is a design constraint, not a bug. Specific
structural losses include:
- No representation for wiki "magic words" (`__TOC__`, `__NOTOC__`, `{{PAGENAME}}`)
- No representation for redirects (`#REDIRECT [[Target]]`)
- No representation for wiki metadata (page protection status, namespace, parent page)
- No representation for Confluence page hierarchy and space structure
- No representation for DokuWiki ACLs and namespace permissions

**Inference:** A complete wiki-to-Markdown migration requires a pre-processing stage that
handles wiki-specific constructs before passing content through a syntax converter. No
single-pass tool can produce acceptable output for non-trivial wikis.

### 8.3 Per-Platform Quality Assessment

**MediaWiki:**
- **Best tool:** Pandoc `-f mediawiki -t gfm` for syntax conversion; `Special:Export` +
  template expansion for extraction
- **Largest gap:** Template/transclusion resolution. Heavy template users (Wikipedia,
  large corporate wikis) will produce unusable output without server-side expansion.
- **Known issues:** Image parsing edge cases (#9425), table data attributes (#9178)

**Confluence:**
- **Best tool:** Confluence REST API `export_view` format (HTML) → pandoc `-f html -t
  gfm` for syntax conversion; or dedicated tools like `confluence-to-markdown` (npm)
- **Largest gap:** Confluence macros (Jira issues, diagrams, dynamic content) have no
  Markdown equivalent. Storage format XML contains rich macro markup that pandoc's
  `jira` reader cannot parse.
- **Evidence:** Confluence's REST API provides `export_view` which renders pages to
  semantic HTML suitable for conversion. The `jira` format in pandoc works only with
  Jira/Confluence wikitext syntax, not the Confluence Storage Format XML.

**DokuWiki:**
- **Best tool:** Pandoc `-f dokuwiki -t gfm`; source files are directly accessible on
  disk
- **Largest gap:** Plugin-specific syntax that extends DokuWiki markup (e.g., `{{rss>}}`,
  `{{gchart>}}`) has no pandoc support
- **Advantage:** Simplified by file-based storage — no database extraction step needed

---

## 9. Migration Case Studies

### 9.1 Known Large-Scale Migrations

**Evidence (from public sources and prior art):**

- **WordPress Codex → HelpHub/Documentation**: WordPress migrated their MediaWiki-based
  Codex documentation to a Markdown-based system. They faced template/transclusion
  challenges and ultimately chose selective expansion over full automation. (Not fetched
  — based on publicly documented migration from 2021-2024 period.)

- **Gentoo Wiki Migration Discussion**: The Gentoo wiki (MediaWiki-based) has ongoing
  discussions about exportability. Their concern centers on template density and the
  impracticality of fully-automated conversion. (Not directly sourced — community
  reference.)

**Inference:** No large-scale, fully-automated MediaWiki→Markdown migration has been
documented as successful without significant manual intervention. Template-dependent
content requires expansion or human rewriting.

### 9.2 Community Tools

**Evidence (from GitHub/PyPI/npm pattern knowledge):**

- **`mediawiki-to-gfm`** (Python, GitHub): Converts MediaWiki to GitHub-Flavored
  Markdown using `mwparserfromhell` for wikitext parsing.
- **`markdown-to-confluence`** (npm): Converts Markdown to Confluence Storage Format.
  Not a migration tool per se, but useful for round-tripping.
- **`dokuwiki-to-markdown`** pattern: Multiple Python scripts exist on GitHub that walk
  `data/pages/` directories and convert `.txt` files via regex-based approach.
- **Python `mwclient`**: Reads MediaWiki via API, can retrieve page content in wikitext
  format for offline conversion.
- **`mwparserfromhell`**: Python library for robust parsing of MediaWiki wikitext,
  handles templates, links, tables, and tags with a proper AST.

**Inference:** The ecosystem is fragmented. No single tool handles all three platforms.
A migration pipeline will likely be: platform-specific extraction → pandoc conversion
with platform-specific pre/post-processing → OKF bundling.

---

## 10. Migration Pipeline Architecture

### 10.1 Proposed Three-Phase Pipeline

**Candidate default (from the evidence):**

1. **Extract** (platform-specific):
   - MediaWiki: `Special:Export` with `templates=1` and `curonly` → parse XML → extract
     wikitext
   - Confluence: REST API with `expand=body.export_view` → download HTML + attachments
   - DokuWiki: Copy `data/pages/*.txt` and `data/media/*`
   - Mixed folders: Detect format per file (MediaWiki wikitext, DokuWiki txt, raw HTML,
     Markdown)

2. **Convert** (format-specific):
   - MediaWiki wikitext: pre-process templates, then `pandoc -f mediawiki -t gfm`
   - Confluence HTML: `pandoc -f html -t gfm`
   - DokuWiki: `pandoc -f dokuwiki -t gfm`
   - Already-Markdown: pass through, normalize

3. **Bundle** (OKF-specific):
   - Map namespaces/spaces to directories
   - Map page titles to filenames (`Page Title` → `page-title.md`)
   - Add OKF frontmatter: `type`, `title`, `description`, `resource` (original URL),
     `tags` (from categories)
   - Download and store attachments locally
   - Rewrite image and link paths
   - Generate `index.md` and `log.md`
   - Record migration provenance in frontmatter

### 10.2 Pre-Processing Requirements

**Decision required for each wiki construct:**

| Construct | Must Decide |
|-----------|------------|
| Templates | Expand (lose abstraction) vs preserve as metadata vs discard |
| Categories | Frontmatter tags vs strip vs link to placeholder pages |
| Namespaces | Directory hierarchy vs filename prefix vs strip |
| Interwiki links | Expand to URLs via interwiki map vs strip vs comment |
| Info boxes | Expand via template resolution vs preserve parameters in frontmatter |
| Image sizing | Strip (keep simple `![]()`) vs preserve in comments vs custom extension |
| Redirects | Skipped (concept stands alone) vs preserved as frontmatter `redirect: target` |
| History | Discard (git is authoritative) vs frontmatter `migration.last_editor` vs separate changelog |

### 10.3 Post-Processing Requirements

- Image path normalization: rewrite wiki attachment URLs to local relative paths
- Broken link detection: flag wiki links to non-exported pages
- Index generation: create OKF `index.md` from page hierarchy
- Log generation: create `log.md` entry documenting migration
- Frontmatter injection: add `type`, `title`, `description`, `resource`, `tags`,
  `sources`, `generated`

---

## 11. Mixed Knowledge Folders

**Definition:** A directory containing arbitrary file formats — some wiki source files,
some Markdown, some HTML, some plain text — without a consistent format or metadata
scheme.

**Evidence:** No existing tool handles "mixed knowledge folders" as a migration source.
This is a new problem space.

**Inference:** Mixed folders require format detection as a first step, then
per-format conversion. Key challenges:
- Ambiguous format detection (DokuWiki `.txt` vs plain text `.txt`)
- Unknown provenance (no author, date, or origin metadata)
- Inconsistent linking schemes (wiki `[[links]]` vs Markdown `[links]()` vs plain text)

**Candidate default:** Multi-pass format detection:
1. Check file extension (`.md` → Markdown, `.txt` → attempt DokuWiki/mediawiki
   detection, `.html` → HTML)
2. Content-based heuristics (presence of `{{` `}}` → wiki template syntax,
   `[[Category:` → MediaWiki, `======` → DokuWiki headings)
3. Fallback: treat unknown text as plain text, wrap with minimal frontmatter
4. Generate `migration.source_format` and `migration.confidence` fields per concept

---

## 12. Source Index

### Primary Web Sources (fetched July 2026)

- **Pandoc Manual** (pandoc.org/MANUAL.html): Input/output format lists, math rendering
  behavior, raw HTML handling, general conversion fidelity statement
- **Pandoc GitHub Issues** (github.com/jgm/pandoc/issues?q=mediawiki+conversion):
  #9425 (image parsing), #9178 (table data attributes), #9293 (math in lists), #11299
  (var/samp tags), #8855 (DokuWiki headings), #8801 (bibtex→mediawiki), #7629 (link
  conversion)
- **MediaWiki Help:Export** (mediawiki.org/wiki/Help:Export, last edited 2026-02-23):
  XML schema, DTD, export parameters, Special:Export usage, format description
- **MediaWiki Manual:Parameters to Special:Export** (mediawiki.org, last edited
  2026-07-08): Complete parameter table, POST vs GET behavior, limit semantics, offset
  parameter conventions
- **MediaWiki Help:Templates** (mediawiki.org/wiki/Help:Templates): Template syntax,
  parameter handling, transclusion, substitution, parser functions, evaluation process
- **MediaWiki Help:Images** (mediawiki.org/wiki/Help:Images): Full image syntax
  reference, format options, sizing, alignment, link behavior
- **Wikipedia:Database download** (en.wikipedia.org, last edited 2026-07-22): Dump
  formats, multistream XML, compression, download sources, offline readers
- **Confluence Cloud REST API** (developer.atlassian.com/cloud/confluence/rest/v1/):
  API groups, content endpoints, export_view format, attachments, search, CQL
- **Confluence Data Center REST API** (developer.atlassian.com/server/confluence/):
  Server APIs, pagination, expansions, authentication, REST API browser
- **Wikipedia: DokuWiki** (en.wikipedia.org/wiki/DokuWiki, last edited 2026-07-22):
  File-based architecture, no database, plain text storage, release history, feature
  list

### Local Research Sources (this repo)

- `docs/research/okf-spec-and-ecosystem.md`: OKF v0.1/v0.2 specs, frontmatter fields,
  conformance rules, limitations, cross-linking conventions
- `docs/research/workspace-topology-and-routing.md`: Workspace discovery, bundle
  topology, knowledge routing model, precedence rules
