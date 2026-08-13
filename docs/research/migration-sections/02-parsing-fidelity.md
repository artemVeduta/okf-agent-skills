# 02 — Parsing Fidelity: YAML Frontmatter & Markdown Dialects

> Primary-source investigation into parsing fidelity failures during
> content migration between Markdown dialects and YAML frontmatter parsers.
>
> **Claim labels:**
> - **Evidence** — directly supported by the cited specification, library
>   source/documentation, or first-party documentation.
> - **Inference** — interpretation derived from evidence.
> - **Candidate default** — an operational hypothesis requiring fixture benchmarks
>   before adoption.
> - **Decision required** — unresolved semantics that tooling must not invent.

---

## 1. YAML Frontmatter Parsing Edge Cases

### 1.1 Multi-Document Streams

**Evidence:** The YAML 1.2.2 spec supports multiple documents in a single
stream, separated by `---` (document start marker) and terminated by `...`
(document end marker) ([YAML 1.2.2 §9.1.2](https://yaml.org/spec/1.2.2/#912-document-markers)).
A `---` that begins a new document also terminates the previous one.

**Evidence:** The YAML 1.2.2 spec explicitly recognizes "bare documents"
(§9.1.3) — those without explicit `---` markers — as valid when they start a
stream. A stream may therefore begin with either a bare document or an explicit
`%YAML` / `---` preamble.

**Evidence:** js-yaml's `load()` function "does not understand multi-document
or empty sources; it throws an exception on those" while `loadAll()` returns an
array of documents ([js-yaml README](https://github.com/nodeca/js-yaml)).
PyYAML similarly requires `yaml.load_all()` for multi-document streams.

**Evidence:** OKF v0.2 bundles use exactly one YAML frontmatter block per `.md`
file, delimited by opening `---` and closing `---` or `...`. The spec does not
specify multi-document frontmatter ([okf-spec-and-ecosystem.md: §4.1](okf-spec-and-ecosystem.md)).

**Inference:** A file containing a `---` separator *inside the YAML document
body* (e.g., a literal block scalar containing a `---` line) could be
misinterpreted as starting a new YAML document by parsers operating in
multi-document mode. Simpler single-document parsers (e.g.,
`python-frontmatter`, gray-matter) handle this case by splitting on the
first `---` pair.

**Inference:** A source document that accidentally contains two `---`-delimited
YAML blocks (e.g., a migrated Obsidian note with a `---` in the body text that
predates a second frontmatter block) will be silently truncated to the first
block by single-document frontmatter parsers.

**Candidate default:** Migration tools SHOULD parse frontmatter with a
single-document parser and SHOULD warn when a second `---` delimiter is
encountered in the body that could create an ambiguous multi-document boundary.

### 1.2 Anchors and Aliases

**Evidence:** YAML 1.2.2 supports anchors (`&anchor`) and aliases (`*anchor`)
to reference repeated nodes (§3.2.2.2). Anchors are a serialization detail and
MUST be discarded once the representation graph is composed; they are not part
of the data model. Anchor names need not be unique within a serialization tree
(§3.2.2.2).

**Evidence:** js-yaml limits alias resolution via the `maxAliases` option
(default: -1 for unlimited). It can reject all aliases with `maxAliases: 0`
([js-yaml README](https://github.com/nodeca/js-yaml)). PyYAML supports
anchors/aliases but has known issues with cross-document references. The YAML
spec explicitly states: "an alias event refers to the most recent event in the
serialization having the specified anchor" — non-deterministic across
documents.

**Evidence:** The YAML 1.2.2 spec identifies unresolved aliases as a loading
failure point (§3.3.1): "A YAML processor should reject any input stream that
contains an alias node that does not refer to a previous anchor node."

**Inference:** Anchored values that appear in one source document but are
referenced by alias from another are not portable across file boundaries. A
migration that splits a monolithic YAML file into per-concept frontmatter
blocks will break cross-reference aliases.

**Inference:** Merged maps using the YAML 1.1 `<<` merge key (common in
Obsidian templates and Dataview metadata) are not part of the YAML 1.2.2 core
schema. js-yaml requires explicit `mergeTag` in schema for `<<` support
(default `CORE_SCHEMA` excludes it). PyYAML handles `<<` by default but with
varying behavior across versions.

**Candidate default:** Migration tools SHOULD detect anchor/alias usage in
source YAML and either resolve aliases inline during migration or reject them
with a clear error. Merge key `<<` patterns SHOULD be expanded to their
resolved form before writing OKF frontmatter.

### 1.3 Complex Scalars

**Evidence:** YAML 1.2.2 defines five scalar styles with different escaping and
line-folding behavior (§§7.3, 8.1):

| Style | Preserves | Folds newlines | Known parser issues |
|-------|-----------|----------------|---------------------|
| **Plain** (unquoted) | Nothing special | No | Type coercion ambiguity (e.g., `no`, `yes`, `true`, `false`, `null`, numbers, dates) |
| **Single-quoted** | Everything except `''` → `'` | No | Trailing whitespace in some parsers |
| **Double-quoted** | Escape sequences (`\n`, `\t`, `\uXXXX`, `\xXX`) | No | Unicode escape handling varies |
| **Literal** (`\|`) | All newlines preserved, trailing newline stripped | No | Indentation stripping rules (block indentation indicator) |
| **Folded** (`>`) | Newlines folded to spaces, blank lines → paragraph breaks | Yes | Chomping indicator (`+`/`-`/none) behavior varies |

**Evidence:** Plain scalars are subject to type resolution by the schema. The
YAML 1.2.2 core schema resolves `true`, `false`, `null`, numeric patterns, and
infinity/NaN patterns as non-string types (§10.3). This creates a well-known
class of bugs ("the Norway problem" — `no` resolved as `false`, country codes
resolved as booleans) ([YAML 1.2.2 §10.3.2](https://yaml.org/spec/1.2.2/#1032-tag-resolution)).

**Evidence:** js-yaml v5 addresses this: "The default `CORE_SCHEMA` comes
without the `!!merge` tag" and uses a schema system to control which types are
recognized ([js-yaml README](https://github.com/nodeca/js-yaml)).

**Inference:** Frontmatter values that happen to match YAML type patterns
(e.g., `tags: [no, yes]` for a list of country codes, `version: 1.0` as a float
not a string) will be incorrectly typed by parsers using schema-based resolution.
Migration tools must either quote these values explicitly or use a failsafe
schema that treats everything as strings.

**Inference:** Block scalar indentation handling (literal `|` and folded `>`)
differs between PyYAML (YAML 1.1) and js-yaml (YAML 1.2). PyYAML uses
context-relative indentation; YAML 1.2 uses a more precise algorithm with
block indentation indicators (§8.1.1.1).

**Candidate default:** Migration tools SHOULD use a known schema (ideally
configurable: Core, JSON, Failsafe) and SHOULD detect values that would be
type-coerced differently under alternative schemas, offering the option to
force-quote ambiguous values.

### 1.4 Unicode and BOM

**Evidence:** YAML 1.2.2 mandates that the character encoding is UTF-8, UTF-16
(LE or BE), or UTF-32 (LE or BE). UTF-8 is the recommended encoding (§5.2).
A BOM (U+FEFF) at the start of a stream MAY be used to detect encoding and
MUST be stripped before parsing (§5.2).

**Evidence:** YAML 1.2.2 §5.1 defines the allowed character set: "The allowed
character range explicitly excludes the surrogate block #xD800-#xDFFF, #xFFFE,
and #xFFFF." Also, "to ensure readability, non-printable characters should not
be used" (§5.1).

**Inference:** Some older YAML 1.1 parsers (including older PyYAML versions)
do not strip BOM correctly and may produce a leading U+FEFF in the first key
name. This creates a silent mismatch: the key `title` is actually
`\uFEFFtitle`. Migration from UTF-16 sources through tools that don't strip BOM
can introduce invisible corruption.

**Evidence:** The CommonMark spec §2.3 mandates: "For security reasons, the
Unicode character U+0000 must be replaced with the REPLACEMENT CHARACTER
(U+FFFD)." YAML 1.2.2 does not directly address U+0000 but inherits this from
its Unicode foundation.

**Inference:** Files containing null bytes (`\0`) will be silently altered by
CommonMark-compliant Markdown parsers but may pass through unchanged in YAML
parsers, creating a discrepancy between the body and frontmatter portions of a
parsed file.

**Candidate default:** Migration tools SHOULD normalize encoding to UTF-8
without BOM, strip any detected BOM, reject or replace U+0000, and report any
surrogate characters or non-printable characters found in source content.

### 1.5 Line Endings

**Evidence:** YAML 1.2.2 §5.4 defines line breaks as CR, LF, or CRLF.
"All break characters are treated identically by the parser" — CRLF is
normalized to LF during parsing.

**Evidence:** CommonMark §2.1 defines a line ending as "a line feed (U+000A),
a carriage return (U+000D) not followed by a line feed, or a carriage return
and a following line feed." This means bare CR (Mac OS Classic) and CRLF
(Windows) are all valid.

**Inference:** A file with mixed line endings (some CRLF, some LF) will parse
correctly in both YAML and Markdown but may produce git-diff noise and cause
issues with line-number-based error reporting during migration.

**Inference:** Block scalars (literal `|` and folded `>`) preserve line endings
in their canonical content form, meaning a block scalar written on a Windows
system (CRLF) will have different content from one written on a Unix system
(LF), even though both parse identically.

**Candidate default:** Migration tools SHOULD normalize line endings to LF
before parsing and report mixed line endings as informational warnings.

### 1.6 Tags and Directives

**Evidence:** YAML 1.2.2 defines two directives: `%YAML` (version declaration)
and `%TAG` (tag handle shorthand). Directives are presentation details
discarded during composition (§3.2.3.4). Explicit tags use the `!` prefix
with local (`!mytag`) and global (`tag:domain,date:name`) scopes (§§3.2.1.2,
6.9.1).

**Evidence:** js-yaml supports custom tag types through the schema system but
the default `CORE_SCHEMA` does not include YAML 1.1 tags like `!!binary`,
`!!timestamp`, `!!omap`, `!!pairs`, or `!!set` — those require explicit
`YAML11_SCHEMA` ([js-yaml README](https://github.com/nodeca/js-yaml)).

**Inference:** Frontmatter containing YAML 1.1 tags (common in Obsidian
templates via the Dataview and Templater plugins) may fail to parse in strict
YAML 1.2 environments. The `!!timestamp` tag is particularly problematic
because ISO 8601 strings in YAML 1.2 default schema resolve to timestamps
without explicit tags.

**Inference:** Custom tag prefixes defined via `%TAG` directive in one file
are not portable to other files unless the directive is repeated. A migration
that splits a multi-file YAML stream will lose tag handle context.

**Candidate default:** Migration tools using YAML 1.2 parsers SHOULD reject or
explicitly convert YAML 1.1 tags. Custom tag URIs SHOULD be expanded to their
fully qualified form before splitting documents.

---

## 2. Markdown Dialect Differences

### 2.1 CommonMark Baseline

**Evidence:** CommonMark 0.31.2 specifies an unambiguous parsing algorithm and
covers: ATX headings, setext headings, indented code blocks, fenced code blocks,
HTML blocks, link reference definitions, paragraphs, blank lines, block quotes,
list items, inline code spans, emphasis/strong emphasis, links, images,
autolinks, raw HTML, hard/soft line breaks, and textual content
([CommonMark Spec 0.31.2](https://spec.commonmark.org/0.31.2/)).

**Evidence:** CommonMark has NO built-in support for: YAML frontmatter, tables,
strikethrough, task lists, footnotes, definition lists, math, or smart
typography. It also has NO concept of "syntax errors" — every sequence of
characters is a valid CommonMark document (§2.1).

**Inference:** Because CommonMark never produces parse errors, dialect
deviations manifest as structural re-interpretations (e.g., a GFM table parsed
as a paragraph of pipe characters in CommonMark), not as explicit failures.
This is the central migration fidelity challenge: content is never lost but may
be silently restructured.

### 2.2 GFM Extensions (Differences from CommonMark)

**Evidence:** GFM is "a strict superset of CommonMark" and adds the following
extensions ([GFM Spec 0.29-gfm](https://github.github.com/gfm/)):

| Extension | Description | CommonMark behavior |
|-----------|-------------|---------------------|
| **Tables** (§4.10) | Pipe-delimited tables with header row, alignment colons | Renders as literal pipe characters in paragraphs |
| **Strikethrough** (§6.5) | `~~text~~` → `<del>text</del>` | Renders as literal tildes |
| **Task list items** (§5.3) | `- [ ]` / `- [x]` in lists | Renders as literal `[ ]` / `[x]` in list items |
| **Autolinks (extension)** (§6.9) | Bare URLs/emails auto-linked without `<>` | Only `<>`-wrapped URLs auto-linked |
| **Disallowed Raw HTML** (§6.11) | Filters certain HTML tags (`<title>`, `<textarea>`, `<style>`, `<xmp>`, `<iframe>`, `<noembed>`, `<noframes>`, `<script>`, `<plaintext>`) | All HTML tags pass through |

**Evidence:** GFM differs from CommonMark in whitespace handling for ATX
headings: GFM requires a space (not tab) between `#` and content
([GFM §4.2](https://github.github.com/gfm/#atx-headings)), while CommonMark
allows spaces or tabs
([CommonMark §4.2](https://spec.commonmark.org/0.31.2/#atx-headings)).

**Evidence:** GFM uses `gfm_auto_identifiers` for heading ID generation (based
on GitHub's algorithm), while CommonMark uses `auto_identifiers` (a different
algorithm). Pandoc supports both as extensions
([Pandoc Manual](https://pandoc.org/MANUAL.html#extension-gfm_auto_identifiers)).

**Inference:** ATX headings with tab-separated `#` and content (e.g., `#\tHeading`)
will parse as a heading in CommonMark but as a paragraph in GFM. This is a
silent structural change during dialect migration.

### 2.3 Obsidian Markdown Extensions

**Evidence:** Obsidian extends standard Markdown with the following non-portable
syntax elements ([Obsidian Help](https://help.obsidian.md/)):

| Syntax | Description | Portable alternative |
|--------|-------------|---------------------|
| `[[wikilink]]` | Internal link to another note | `[label](path/to/file.md)` |
| `[[wikilink\|alias]]` | Wikilink with display text | `[alias](path/to/file.md)` |
| `[[wikilink#heading]]` | Wikilink to heading | `[label](path/to/file.md#heading)` |
| `![[embed]]` | Embed another note's content | No portable equivalent |
| `> [!note]` / `> [!warning]` | Callouts (blockquotes with type) | Standard blockquote (loses type) |
| `#tag` and `#nested/tag` | Tags in body text | Not portable; frontmatter `tags:` list |
| `%%comments%%` | Inline comments hidden in reading view | HTML `<!-- comments -->` (visible in some renderers) |
| `$inline$` / `$$block$$` | LaTeX math | Not portable to non-math renderers |

**Evidence:** Obsidian supports YAML frontmatter (called "Properties") with
type-specific widgets but the YAML itself is standard and portable
([Obsidian Help: YAML front matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter)).
The frontmatter is delimited by `---`.

**Inference:** Wikilinks are the most frequently encountered Obsidian-specific
syntax in real-world vaults. A migration tool MUST resolve `[[link]]` syntax
to standard Markdown links. Resolution requires: (a) finding the target file
in the vault, (b) determining its path relative to the source, (c) handling
heading anchors, and (d) handling embedded content or converting embeds to
link references.

**Inference:** Obsidian callouts `> [!type]` contain information (the callout
type) that is lost when converting to standard blockquotes. Migration strategies
include: preserving the type as a comment, mapping to admonition syntax, or
accepting the loss and logging it.

### 2.4 Pandoc Markdown Variant Support

**Evidence:** Pandoc supports the following Markdown input variants
([Pandoc Manual: Markdown variants](https://pandoc.org/MANUAL.html#markdown-variants)):

| Variant | Based on | Key differences |
|---------|----------|----------------|
| `markdown` | Pandoc's own extended Markdown | Tables, footnotes, citations, math, YAML metadata, fenced divs, attributes, definition lists |
| `markdown_strict` | Original Markdown.pl | Minimal, no extensions |
| `markdown_phpextra` | PHP Markdown Extra | Tables, definition lists, footnotes, abbreviations |
| `markdown_mmd` | MultiMarkdown | Tables, footnotes, citations, math, metadata |
| `markdown_github` | Deprecated GFM | **Deprecated** — use `gfm` instead |
| `commonmark` | CommonMark 0.31.2 | Strictly spec-compliant |
| `gfm` | GitHub-Flavored Markdown | Tables, strikethrough, task lists, autolinks, disallowed HTML |
| `commonmark_x` | CommonMark + extensions | CommonMark plus many pandoc extensions |

**Evidence:** Pandoc's `yaml_metadata_block` extension works with `commonmark`,
`gfm`, and `commonmark_x` but with restrictions: the YAML block must occur at
the beginning of the document, there can be only one, and leaf nodes of the
YAML structure are parsed in isolation
([Pandoc Manual](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block)).

**Evidence:** Pandoc notes that "pandoc's parsers can exhibit pathological
performance on some corner cases" and recommends the `commonmark` parser
(including `commonmark_x` and `gfm`) for untrusted input because it is "much
less vulnerable to pathological performance than the `markdown` parser"
([Pandoc Manual: Security](https://pandoc.org/MANUAL.html#security)).

**Inference:** Pandoc is the most capable single tool for format-to-format
migration, but its own `markdown` reader accepts syntax that no other tool
supports (e.g., fenced divs, bracketed spans, Pandoc-native citation syntax).
Documents authored for Pandoc's extended Markdown will lose structure when
read by any other Markdown parser.

**Inference:** Pandoc's `gfm` reader is maintained as the canonical GFM
implementation for format conversion, but it may lag behind GitHub.com's
actual rendering (which evolves independently).

### 2.5 Silent Structural Changes Across Dialects

**Evidence:** The following constructs are interpreted differently across
Markdown dialects with no warning from any parser:

| Construct | CommonMark | GFM | Pandoc Markdown | Obsidian |
|-----------|------------|-----|-----------------|----------|
| `\| Header \|` | Paragraph | Table row | Table row | Paragraph (unless plugin) |
| `~~text~~` | Literal tildes | Strikethrough | Strikethrough | Strikethrough |
| `- [ ] item` | List (literal `[ ]`) | Task list | Task list | Task list |
| `www.example.com` | Text | Auto-link | Auto-link (if extension) | Auto-link |
| `[[link]]` | Paragraph text | Paragraph text | Paragraph text | Internal link |
| `#tag` in body | Heading (if at line start) | Heading/paragraph | Heading/paragraph | Tag |
| `$$math$$` | Paragraph text | Paragraph text | Math (if extension) | Math |
| `> [!note]` | Blockquote | Blockquote | Blockquote | Callout |
| `<script>` | Raw HTML pass-through | Filtered HTML | Raw HTML | Raw HTML |

**Inference:** The safest migration target is CommonMark with YAML frontmatter
(which is what OKF specifies). Migration from any richer dialect MUST identify
constructs that have no CommonMark equivalent and either convert, comment,
or log them.

---

## 3. Encoding Detection Issues

### 3.1 Character Encoding Detection Is Fragile

**Evidence:** YAML 1.2.2 §5.2 specifies that encoding is determined by (in
order): BOM, stream start `%YAML` directive encoding parameter, or UTF-8 as
default. YAML supports UTF-8, UTF-16 LE/BE, UTF-32 LE/BE.

**Evidence:** CommonMark §2.1 explicitly does "not specify an encoding; it
thinks of lines as composed of characters rather than bytes."

**Evidence:** Python's `open()` defaults to platform encoding (typically UTF-8
on modern Linux/macOS, but locale-dependent). JavaScript's `fs.readFileSync`
without encoding returns a Buffer; with `'utf8'` it decodes as UTF-8.

**Inference:** A file written as UTF-16 on Windows with a BOM, then read on
Linux by a Python tool using default UTF-8, will produce garbage characters or
fail to find the `---` frontmatter delimiter. The YAML parser may crash with
an encoding error while the Markdown body is silently corrupted.

**Inference:** The combination of YAML (encoding-aware) and Markdown
(encoding-unaware) in a single file creates a dual-parser edge case: the YAML
parser may reject the file as invalid while the Markdown portion (if extracted
as raw bytes) could still be recoverable.

**Candidate default:** Migration tools SHOULD detect encoding via BOM or
chardet/cchardet heuristic before parsing, SHOULD normalize to UTF-8 without
BOM, and MUST NOT silently corrupt content due to encoding mismatch.

### 3.2 BOM Handling Inconsistency

**Evidence:** As noted in §1.4, YAML 1.2.2 requires BOM stripping. Python's
`utf-8-sig` codec handles this; Python's `utf-8` codec does not. Node.js
`fs.readFileSync(file, 'utf8')` strips the BOM since Node v8.11.0.

**Inference:** Round-tripping a file through Python `yaml.load()` +
`yaml.dump()` without using `utf-8-sig` encoding will preserve a BOM
inconsistently: if the parser strips it but the writer does not re-add it,
the output is correct. If the parser does NOT strip it (older PyYAML), the
BOM becomes embedded in the first frontmatter key.

**Candidate default:** Migration tools MUST strip BOM before YAML parsing,
MUST NOT re-add BOM on output, and SHOULD report the presence of a BOM in
source files as information.

---

## 4. Error Recovery Strategies

### 4.1 Fail-Fast vs Best-Effort

**Evidence:** OKF v0.2 §11 specifies consumer obligations: "Consumers MUST NOT
reject missing optional families, unknown types/keys, broken links, or missing
indexes." Consumers SHOULD "attempt best-effort consumption of an unknown
declared version" (§12). No error handling is specified for unparseable YAML
frontmatter — the spec only requires that frontmatter be "parseable YAML" for
producers ([okf-spec-and-ecosystem.md: §2.4 #15](okf-spec-and-ecosystem.md)).

**Evidence:** js-yaml's `load()` "throws `YAMLException` on error" — fail-fast
([js-yaml README](https://github.com/nodeca/js-yaml)). PyYAML similarly raises
`yaml.YAMLError`. python-frontmatter wraps the YAML parse and may raise an
exception.

**Evidence:** Pandoc's Markdown readers have no concept of YAML frontmatter
errors; they simply skip unrecognized YAML or produce a best-effort parse.

**Evidence:** The OKF reference agent validates at write time, not read time —
`write_concept_doc()` validates before writing. This means read-time errors are
minimized by design ([okf-spec-and-ecosystem.md: §3.1](okf-spec-and-ecosystem.md)).

**Inference:** A strict fail-fast approach is appropriate for validating
producers that generate OKF from scratch, but a best-effort approach with
structured error reporting is necessary for migration tools that ingest
arbitrary source content. Migrations encounter known-bad YAML (e.g., unclosed
quotes in Obsidian frontmatter, YAML 1.1 tags, illegal characters).

**Inference:** The absence of OKF-specified error handling for unparseable YAML
means every migration tool makes its own choice. Inconsistent behavior across
tools creates user confusion: one tool rejects a file that another silently
accepts with partial content.

**Decision required:** Define a migration-grade error taxonomy:
- **Fatal** (content cannot be migrated): unparseable YAML, encoding errors
- **Lossy** (migrated with structural change): dialect-specific constructs
  converted to nearest equivalent
- **Lossy-with-comment** (original preserved as HTML comment or code block)
- **Dropped** (information discarded with warning): Obsidian-specific callout
  types, tag prefixes, comments
- **Warning** (migrated fully but worth reviewing): type-coerced values, BOM
  presence, mixed line endings

### 4.2 Partial Extraction Strategies

**Evidence:** When a file's YAML frontmatter fails to parse, the Markdown body
is still intact as raw text. python-frontmatter's `loads()` function parses
only if the first line is `---`; otherwise it returns the entire content as
body with empty metadata.

**Inference:** A migration tool can implement a tiered extraction strategy:
1. Attempt full YAML parse of frontmatter
2. If YAML parse fails, attempt raw text extraction between `---` delimiters
   (capture the raw YAML string as a `_raw_frontmatter` field for manual review)
3. If no `---` delimiter found, treat entire file as Markdown body with empty
   frontmatter and apply default metadata from file name/path
4. If multiple `---` pairs found, use the first pair and report the ambiguity

**Candidate default:** Migration tools SHOULD implement tiered extraction
and MUST never silently skip a file due to frontmatter parse failure.

---

## 5. Content-Loss Examples from Real-World Migration Failures

### 5.1 The Norway Problem (YAML Type Coercion)

**Evidence:** YAML 1.2.2 core schema resolves `yes`, `no`, `true`, `false`,
`on`, `off`, `null`, `~`, numeric strings, hex/octal numbers, and ISO 8601
timestamps to non-string types (§10.3.2). This is the most celebrated
YAML gotcha.

**Known migration failure:** A frontmatter field `country: no` (meaning Norway,
from ISO 3166-1 alpha-2) is parsed as `country: false`. When the migration
writes it back, it becomes `country: false` — the country code is permanently
lost. Similarly, `version: 1.10` may be parsed as the string `"1.10"` or the
float `1.1`, depending on the schema.

**Real-world impact:** Obsidian Dataview metadata in community vaults
frequently contains bare ISO country codes, version strings, and IDs
that match YAML type patterns.

### 5.2 Wikilink Resolution Failures

**Evidence:** Obsidian wikilinks `[[My Note]]` have multiple valid resolution
paths in Obsidian:
1. Exact filename match (case-insensitive on Windows/macOS, case-sensitive on Linux)
2. Shortest unique path match in the vault
3. Heading anchor `[[Note#heading]]`
4. Block reference `[[Note#^blockid]]`

**Known migration failure:** A vault migrated from macOS to Linux (or from
Obsidian to a tool running on Linux) will encounter case-sensitive resolution
failures for `[[my note]]` → `My Note.md`. The wikilink may resolve correctly
in Obsidian on macOS but fail silently in a Linux-based migration tool because
the filesystem is case-preserving but case-insensitive on macOS HFS+/APFS.

**Known migration failure:** Wikilinks to non-existent notes (`[[Future Topic]]`)
are valid in Obsidian (they act as intention markers / placeholder links).
Migration tools that resolve links eagerly will either produce broken links to
files that don't exist, or skip them, losing the intentional placeholder.

### 5.3 YAML Multi-Document Stream Confusion

**Evidence:** YAML `---` serves dual purpose: document separator in YAML streams
AND frontmatter delimiter in Markdown.

**Known migration failure:** A Markdown file containing:
```
---
title: My Note
---
Here is some content.

---
This is a new section with a horizontal rule-like line.
```
Some YAML parsers in multi-document mode interpret the second `---` as a
document separator, splitting the content into two documents. The body text
after the second `---` becomes part of a second (empty) YAML document and may
be lost. Single-document parsers correctly stop at the first `---` pair.

### 5.4 Tab vs Space in ATX Headings

**Evidence:** As noted in §2.2, GFM requires a space between `#` and heading
content; CommonMark allows space or tab.

**Known migration failure:** An Obsidian note containing `#\tMy Heading` (tab
character between `#` and content) renders as a heading in Obsidian
(CommonMark-based) but as a paragraph when viewed on GitHub (GFM). A migration
from Obsidian to a GFM-hosted system silently demotes the heading to body
text.

### 5.5 Callout Type Loss

**Evidence:** Obsidian callouts use the syntax `> [!type] Title` where `type`
is one of: note, warning, danger, tip, info, example, abstract, todo, success,
question, failure, bug, quote. Obsidian renders these as styled blockquotes.

**Known migration failure:** Converting `> [!warning] Critical: do not deploy`
to standard Markdown produces `> Critical: do not deploy`. The warning
semantics are lost. A downstream consumer cannot distinguish this from an
ordinary blockquote. If the migration is lossless at the Markdown level but
lossy at the semantics level, the knowledge degrades.

### 5.6 Frontmatter Type Coercion Accumulation

**Evidence:** Some Obsidian properties use YAML sequences with mixed types,
e.g.:
```yaml
tags: [python, 3.12, ML]
```
PyYAML with default schema resolves `3.12` as a float, producing:
```yaml
tags: [python, 3.12, ML]
```
which looks identical in YAML output but `3.12` is `float(3.12)` not `str("3.12")`.

**Known migration failure:** Round-tripping through a YAML parser that coerces
types and a dumper that writes them back produces output that is syntactically
valid but semantically altered. A migration that passes content through
multiple YAML parse/dump cycles accumulates these changes.

### 5.7 Pandoc-Specific Syntax Loss

**Evidence:** Pandoc's Markdown reader supports syntax with no equivalent in
other dialects: fenced divs (`::: {.class}`), bracketed spans
(`[text]{.class}`), citation keys (`[@smith2004]`), raw inline attributes
(`` `code`{.lang} ``), grid tables, pipe tables with multiline cells, and
definition lists.

**Known migration failure:** Documents authored with Pandoc extensions and
migrated through a CommonMark-only parser will lose:
- Citation keys → become literal `[@smith2004]` text in body
- Div classes → the `:::` fences disappear, content becomes ungrouped paragraphs
- Span classes → bracketed text becomes literal `[text]{.class}`
- Grid tables → cells collapse into unstructured text

---

## 6. Candidate Migration Pipeline Safeguards

### 6.1 Pre-Migration Validation Checklist

**Candidate default:** Before migration, a tool SHOULD:
1. Detect and report file encoding (with confidence score)
2. Scan for BOM presence
3. Count `---` delimiter pairs per file
4. Detect mixed line endings
5. Attempt YAML parse of frontmatter in dry-run mode, reporting parse path
   and any warnings
6. Identify Markdown dialect features in use (wikilinks, callouts, tags,
   strikethrough, tables, task lists, math, raw HTML, comments)
7. Build a link graph of all cross-references (for later wikilink resolution)
8. Report aggregate statistics: files with unparseable YAML, files with
   dialect-specific constructs, files with no frontmatter, files with
   ambiguous `---` delimiters

### 6.2 Round-Trip Fidelity Testing

**Candidate default:** A migration tool SHOULD support a `--verify` mode that:
1. Parses source frontmatter YAML into a data structure
2. Serializes it back to YAML
3. Parses re-serialized YAML
4. Compares the two data structures for semantic equality (not string equality)

Differences indicate type coercion, key reordering, or comment loss during
the YAML parse/dump cycle.

### 6.3 Content-Loss Audit Trail

**Candidate default:** Every lossy conversion SHOULD produce a structured audit
entry containing:
- Source file path and line number
- Construct type (wikilink, callout, tag, table, etc.)
- Original text
- Converted text (or `null` if dropped)
- Loss classification (fatal/lossy/lossy-with-comment/dropped/warning)
- Rationale

This audit trail SHOULD be written as a machine-readable file (JSON or YAML)
alongside the migrated bundle, enabling post-migration review and automated
quality gates.

---

## 7. Library-Specific Compatibility Notes

### 7.1 Python

| Library | YAML Version | Notes |
|---------|-------------|-------|
| **PyYAML** 5.3.1 | 1.1 | Most widely used. Default Loader is unsafe (`yaml.load()`); use `yaml.safe_load()`. Type coercion: yes/no/true/false/numbers. No anchor depth limit by default. |
| **python-frontmatter** | Uses PyYAML internally | Wraps PyYAML. lazy-loads frontmatter from first `---` pair. Returns `Post(metadata, content)`. No dialect conversion in Markdown body. |
| **ruamel.yaml** | 1.2 | Preserves comments, key order, formatting. Better for round-tripping but heavier. |

### 7.2 JavaScript/TypeScript

| Library | YAML Version | Notes |
|---------|-------------|-------|
| **js-yaml** v5 | 1.2 (1.1 via YAML11_SCHEMA) | `load()` for single doc, `loadAll()` for multi-doc. Configurable schema. `maxDepth`, `maxAliases` safety limits. Default CORE_SCHEMA excludes merge keys. |
| **gray-matter** | Uses js-yaml internally | Popular for static site generators. Strips frontmatter from Markdown. Returns `{data, content}`. |
| **front-matter** | Uses js-yaml internally | Lighter alternative. Parse/detect/extract frontmatter from strings. |

### 7.3 Command-Line Tools

| Tool | Role | Notes |
|------|------|-------|
| **Pandoc** 3.x | Universal converter | Supports 8+ Markdown dialects. `yaml_metadata_block` extension. `gfm` reader preferred over deprecated `markdown_github`. `commonmark` reader for strict compliance. |
| **okflint** 0.3.1 | OKF linter | Python, deterministic. 18 rules across 3 tiers. Resolves Obsidian wikilinks. Three-tier rules (OKF Core / Profile / Hygiene). |

### 7.4 Schema Selection Guidance

**Evidence:** The three YAML schemas serve different migration needs:

| Schema | Resolves | Use case |
|--------|----------|----------|
| **Failsafe** | Only `!!map`, `!!seq`, `!!str` | Preserves all values as strings — no type coercion. Safest for unknown content. |
| **JSON** | null, bool, int, float | JSON compatibility. Coerces but does not recognize timestamps, hex/octal, or YAML 1.1 types. |
| **Core** | JSON + broader int/float/boolean/null notations | YAML 1.2 defaults. Recognizes `yes`/`no`, `true`/`false`, hex/octal, infinity, NaN. |

**Inference:** Failsafe schema paired with explicit quoting is the safest
choice for a migration pipeline that must preserve the exact string values of
source frontmatter. Core schema is appropriate for new OKF content generated
by agents that understand the type system.

**Candidate default:** Migration tools SHOULD use Failsafe or a schema
configured to treat all scalars as strings during ingestion, then apply schema
resolution as a separate, auditable pass after verifying no values were
ambiguously coerced.

---

## 8. Summary of Key Risks

| Risk | Severity | Detectable? | Mitigation |
|------|----------|-------------|------------|
| YAML type coercion (norway problem) | High — permanent data loss | Yes, by comparing pre/post parse values | Failsafe schema + explicit quoting |
| Wikilink resolution failure | High — broken link graph | Yes, by link graph comparison | Two-pass: discover all targets, then resolve |
| Multi-document stream confusion | Medium — truncated body | Yes, by counting `---` delimiters | Single-document parser + ambiguity warning |
| Tab-separated ATX headings | Medium — heading → paragraph | Yes, by regex scan | Normalize `#\t` to `# ` |
| Callout type loss | Medium — semantic loss | Yes, by regex scan | Comment-preserving conversion or audit log |
| BOM corruption | Medium — invisible key mangling | Yes, by hex inspection | Strip BOM before parse |
| Encoding mismatch (UTF-16 source) | High — garbage output | Partially, via BOM detection | chardet + explicit UTF-8 normalization |
| Pandoc-specific syntax | Medium — structural loss | Partially, regex patterns | Pandoc pre-conversion to CommonMark |
| Anchor/alias breakage | Medium — partial data loss | Yes, by detecting `&/*` tokens | Resolve aliases inline before migration |
| YAML 1.1 tag incompatibility | Low-Medium | Yes, by detecting `!!` tags | Convert to YAML 1.2 or reject with guidance |
| Comment loss in frontmatter | Low — presentation only | Not detectable by value comparison | Use comment-preserving parser (ruamel.yaml) if comments matter |
| Round-trip type accumulation | Medium — progressive drift | Only via semantic comparison | Single migration pass; verify output |

---

## Sources Referenced

| Source | URL |
|--------|-----|
| CommonMark Spec 0.31.2 | https://spec.commonmark.org/0.31.2/ |
| GitHub Flavored Markdown Spec 0.29-gfm | https://github.github.com/gfm/ |
| YAML 1.2.2 Specification | https://yaml.org/spec/1.2.2/ |
| PyYAML | https://pyyaml.org/ |
| js-yaml README | https://github.com/nodeca/js-yaml |
| Pandoc User's Guide (Markdown variants) | https://pandoc.org/MANUAL.html#markdown-variants |
| Pandoc User's Guide (YAML metadata block) | https://pandoc.org/MANUAL.html#extension-yaml_metadata_block |
| Obsidian Help: YAML front matter | https://help.obsidian.md/Advanced+topics/YAML+front+matter |
| Obsidian Help: Basic formatting syntax | https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax |
| OKF Spec and Ecosystem Report | docs/research/okf-spec-and-ecosystem.md |
| Obsidian Transferable Patterns | docs/research/obsidian-transferable-patterns.md |
