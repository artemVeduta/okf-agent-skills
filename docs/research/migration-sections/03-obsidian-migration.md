# 03 — Obsidian Vault Migration to OKF

> Research into the challenges, existing tools, and recommended strategies for
> migrating an Obsidian vault to OKF, a Markdown format that does not support
> Obsidian-specific syntax extensions.

## Claim labels

- **Evidence** — a statement supported by the cited source.
- **Inference** — an interpretation not directly established by the source.
- **Candidate default** — an operational hypothesis requiring fixture benchmarks.
- **Decision required** — unresolved semantics that tooling must not invent.

---

## 1. Wikilinks

### 1.1 Syntax Variants

Obsidian wikilinks use `[[double bracket]]` syntax with several forms:

| Form | Example | Meaning |
|------|---------|---------|
| Simple | `[[Note Name]]` | Link to a note by its filename (without `.md`) |
| Alias | `[[Note Name\|Display Text]]` | Link with custom display text |
| Heading target | `[[Note Name#Heading]]` | Link to a specific heading within a note |
| Block target | `[[Note Name#^block-id]]` | Link to a block with a specific block ID |
| Heading + alias | `[[Note Name#Heading\|Display]]` | Heading target with custom text |

**Evidence:** The fabricioctelles OKF skill's `conversion.md` explicitly documents wikilink-to-standard-link mapping as the first step of Obsidian migration (fabricioctelles/skills, `references/conversion.md`, section "From Obsidian Vault"). The `obsidian-export` tool's README confirms it "Supports `[[note]]`-style references as well as `![[note]]` file includes" and converts them to CommonMark (zoni/obsidian-export README, "Basic usage").

**Evidence:** `okflint` treats wikilink resolution as a first-class feature: its `--vault` argument defines "the root folder(s) of all your Markdown" used "only to resolve `[[...]]` wikilinks" (mattdav/okflint README, "Key concepts — vault"). This demonstrates that even OKF-native tooling must understand wikilinks during migration.

### 1.2 Rewrite Strategy

**Candidate default — rewrite to OKF bundle-relative paths:**

| Wikilink | OKF equivalent |
|----------|---------------|
| `[[Note Name]]` | `[Note Name](/path/to/note-name.md)` |
| `[[Note Name\|Display]]` | `[Display](/path/to/note-name.md)` |
| `[[Note Name#Heading]]` | `[Note Name](/path/to/note-name.md#heading)` |
| `[[Note Name#^block-id]]` | Rewrite to `[Note Name](/path/to/note-name.md)` with a warning; see §3 (block references) |

OKF v0.2 specifies bundle-relative absolute paths (`/path/to/concept.md`) as the recommended form for stability when documents move (okf-spec-and-ecosystem.md, §2.1 "Cross-linking"). Relative paths (`./neighbor.md`) are also valid.

**Candidate default — use absolute (bundle-relative) paths.** This insulates links from file moves within the bundle, matching OKF's recommendation.

### 1.3 Ambiguous Name Resolution

Wikilinks identify targets by filename without extension or path. This creates ambiguity when multiple files share the same base name in different directories (e.g., `projects/Overview.md` and `meetings/Overview.md`).

**Evidence:** `obsidian-export` resolves links by searching the vault for matching filenames. When multiple matches exist, it picks the first found — a documented limitation (zoni/obsidian-export README: "It supports most but not all of Obsidian's Markdown flavor").

**Candidate default:** During migration, detect ambiguous wikilinks (same base name in multiple locations), emit warnings, and use the shortest relative path match. Require manual resolution for all ambiguities.

**Decision required:** Choose resolution priority: shortest path first, nearest-directory first, or prompt for every ambiguity. A migration script should not silently pick.

### 1.4 Broken and Non-Existent Links

A wikilink to a note that does not exist in the vault produces no hyperlink in Obsidian — it displays as plain text with a "create note" affordance.

**Evidence:** OKF v0.2 Normative rule: "Consumers MUST tolerate broken links. A link to a non-existent target may represent not-yet-written knowledge" (okf-spec-and-ecosystem.md, §2.1 "Cross-linking").

**Candidate default:** Preserve broken wikilinks as standard Markdown links pointing to the expected target path. OKF requires consumers to tolerate broken links, so `[Note Name](/expected/path/note-name.md)` remains conformant even if the target does not exist. Migrate the link and let OKF tooling surface it as a planned-but-unwritten document.

---

## 2. Callouts

### 2.1 Obsidian Callout Syntax

Obsidian callouts use the `> [!type]` blockquote syntax. The official documentation lists 12 built-in types: `note`, `abstract`/`summary`/`tldr`, `info`/`todo`, `tip`/`hint`/`important`, `success`/`check`/`done`, `question`/`help`/`faq`, `warning`/`caution`/`attention`, `failure`/`fail`/`missing`, `danger`/`error`, `bug`, `example`, `quote`/`cite` (Obsidian Help, "Editing and formatting / Callouts").

Obsidian callouts support:
- **Foldable callouts**: `> [!note]-` (collapsed by default) or `> [!note]+` (expanded by default)
- **Custom titles**: `> [!warning] System Overloaded`
- **Custom type aliases**: Users can define arbitrary `> [!my-custom-type]` via CSS snippets
- **Nesting**: Callouts can contain other callouts, lists, code blocks, and any other Markdown

**Evidence:** The fabricioctelles conversion guide explicitly says to "Remove Obsidian-specific syntax" including "`> [!callout]` → convert to blockquote or heading" (fabricioctelles/skills, `references/conversion.md`, "Remove Obsidian-specific syntax").

### 2.2 GFM Alert Compatibility

GitHub Flavored Markdown (GFM) defines five alert blockquote types: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` (GitHub Markdown specification, "Alerts" extension).

**Evidence:** GFM alerts use `> [!TYPE]` format (capitalized type). **Inference:** This is syntactically identical to the Obsidian callout format but uses different type string cases and names. GFM renderers may handle Obsidian's lowercase types differently.

**Inference — partial overlap:**

| Obsidian | GFM equivalent | Compatible? |
|----------|---------------|-------------|
| `[!note]` | `[!NOTE]` | Type string differs in case |
| `[!tip]` / `[!hint]` / `[!important]` | `[!TIP]` | Case mismatch |
| `[!warning]` / `[!caution]` / `[!attention]` | `[!WARNING]` | Case mismatch |
| `[!danger]` / `[!error]` | `[!CAUTION]` | Different type name |
| `[!success]` / `[!check]` / `[!done]` | None | No GFM equivalent |
| `[!question]` / `[!help]` / `[!faq]` | None | No GFM equivalent |
| `[!abstract]` / `[!summary]` / `[!tldr]` | None | No GFM equivalent |
| `[!bug]` | None | No GFM equivalent |
| `[!example]` | None | No GFM equivalent |
| `[!quote]` / `[!cite]` | None | No GFM equivalent |
| Custom (`[!foo]`) | None | No GFM equivalent |

### 2.3 Migration Strategy

**Candidate default — two-tier approach:**

1. **GFM-mapped types** (`[!note]`, `[!tip]`, `[!warning]`, `[!danger]`): Normalize to GFM uppercase types (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]`). GFM renderers will display these as styled alerts; non-GFM Markdown renderers will fall back to blockquotes.

2. **Non-GFM types** (`[!success]`, `[!question]`, `[!bug]`, custom types): Convert to standard blockquotes with a bold header line indicating the original type. Example:
   ```markdown
   > **Success:** The migration completed without errors.
   ```
   Or preserve the original callout syntax as a blockquote that standard Markdown renders as a blockquote, with the `[!type]` text visible.

**Candidate default:** For foldable callouts, remove the `+`/`-` fold indicator and convert normally. Folding state cannot be represented in standard Markdown. Add a migration note in the log.

**Decision required:** Whether to normalize to GFM types (better rendering in GitHub, fewer renderers support GFM alerts) or convert everything to plain blockquotes with bold headers (maximum portability). This affects all callouts, not just the non-overlapping types.

---

## 3. Block References

### 3.1 Obsidian Block Reference Syntax

Block references in Obsidian have two parts:

1. **Block ID definition**: A `^block-id` at the end of any paragraph or list item in a note. The ID is unique within the file.
   ```markdown
   This is a reusable insight. ^insight-01
   ```

2. **Block reference**: `[[Note Name#^insight-01]]` links to and may embed (with `!`) the block content.

**Evidence:** Obsidian Help documentation on Internal links, section "Link to a block in a note" (help.obsidian.md). The `obsidian-export` tool handles block references by converting them to standard links targeting the containing note with a heading anchor, but cannot reproduce block-level embedding in standard Markdown.

### 3.2 Migration Challenge

There is no portable Markdown equivalent for block references:
- Standard Markdown has no block-addressing mechanism
- `#^block-id` is not a valid fragment identifier in any Markdown spec
- Embedding a block `![[Note#^block-id]]` has no CommonMark equivalent

### 3.3 Migration Strategy

**Candidate default — best-effort with transparent degradation:**

1. **Block references as links**: Rewrite `[[Note#^block-id]]` to `[Note → referenced block](/path/to/note.md)`. The link target is the containing note; the block ID is encoded in the link text. The block ID information is preserved for tooling that might scan for `^block-id` patterns, but standard renderers will navigate to the note root, not the specific block.

2. **Block embeds**: For `![[Note#^block-id]]`, extract the referenced block content and inline it as a blockquote with source attribution:
   ```markdown
   > This is a reusable insight.
   >
   > — From [Note Name](/path/to/note.md)
   ```
   **Inference:** This produces correct rendered content at the cost of duplication. If the source block changes, the inlined copy becomes stale.

3. **Heading-based fallback**: If a block reference targets a block immediately following a heading, rewrite it as a heading anchor: `[[Note#Heading]]` → `[Note](/path/to/note.md#heading)`.

**Candidate default — emit migration warnings** for every block reference encountered. These are high-loss conversions. A migration manifest should list all block references so a human can verify the result.

**Decision required:** Whether to inline block content (duplication risk, staleness) or preserve as a plain link with block ID in text (information preservation, no inlining). The choice determines whether block content is readable post-migration or requires opening the source note.

---

## 4. Embedded Content

### 4.1 Obsidian Embed Syntax

Obsidian supports embedding files using `![[filename]]` syntax:
- **Note embeds**: `![[Note Name]]` — renders the entire note inline
- **Section embeds**: `![[Note Name#Heading]]` — renders a specific section
- **Block embeds**: `![[Note Name#^block-id]]` — renders a specific block
- **Media embeds**: `![[image.png]]`, `![[audio.mp3]]`, `![[video.mp4]]`, `![[document.pdf]]`

Obsidian also supports embedding with standard Markdown image syntax (`![alt](path)`) and special `![[...]]` embed for supported media types.

**Evidence:** Obsidian Help, "Linking notes and files / Embedding files" (help.obsidian.md).

### 4.2 Media Embed Strategy

| Embed type | Behavior outside Obsidian | Migration action |
|-----------|---------------------------|-----------------|
| `![[image.png]]` | Renders as broken link in most renderers | Convert to `![alt](./image.png)` |
| `![[image.png\|300]]` | Custom width not supported | Strip width parameter: `![alt](./image.png)` |
| `![[audio.mp3]]` | No native Markdown audio support | Convert to HTML `<audio>` or plain link |
| `![[video.mp4]]` | No native Markdown video support | Convert to HTML `<video>` or plain link |
| `![[document.pdf]]` | Cannot embed PDF in Markdown | Convert to `[PDF: document](./document.pdf)` link |

**Evidence:** The fabricioctelles conversion guide maps this directly: "`![[image.png]]` — keep as standard markdown image `![](./image.png)`" and "`![[Note]]` — convert to a regular link or inline the content" (fabricioctelles/skills, `references/conversion.md`, "Handle embeds").

**Candidate default — image embed rewrite:**
- Convert `![[image.png]]` to `![image](./path/to/image.png)` (standard Markdown)
- Convert `![[image.png\|300]]` to `![image](./path/to/image.png)` (drop width; Markdown images don't support dimension parameters)
- For audio/video/PDF, convert to standard Markdown links: `[filename.ext](./path/to/file.ext)` with type label

### 4.3 Note Embed Strategy

Note embeds (`![[Note Name]]`) inline the entire content of another note. Outside Obsidian, this has no rendering equivalent.

**Candidate default:** Convert note embeds to prominent link blocks:
```markdown
> **Embedded content:** See [Note Name](/path/to/note-name.md) for the referenced content.
```

**Inference:** This loses the seamless content inclusion but preserves the semantic intent (referenced material) and the navigable link. Actual content inlining is possible but creates duplication and staleness problems (same as block embeds in §3.3).

**Evidence — recursive embed guard:** The `obsidian-export` tool encounters "recursive embeds" when two notes embed each other. By default it errors; with `--no-recursive-embeds` it inserts a link instead. A migration tool must handle this case (zoni/obsidian-export README, "Recursive embeds").

---

## 5. Attachments

### 5.1 Obsidian Attachment Configuration

Obsidian provides configurable attachment storage (Obsidian Help, "Editing and formatting / Attachments"):
- **Default**: Attachments saved in the vault root
- **Configurable**: Users can specify a subfolder (e.g., `attachments/`, `assets/`)
- **Per-note folders**: Attachments can be saved in a folder named after the current note

**Evidence:** The Okflint tool uses a "vault" concept specifically for resolving references to files, including attachments (mattdav/okflint README, "Key concepts — vault").

### 5.2 Attachment Relocation Strategy

**Evidence:** The `obsidian-export` tool copies attachments to the export destination, rewriting embed paths to maintain relative references (zoni/obsidian-export README).

**Candidate default — relocate to bundle root or per-directory attachments:**

1. **Scan**: Discover the vault's attachment configuration (check `.obsidian/app.json` for `attachmentFolderPath`)
2. **Collect**: Identify all referenced attachments by scanning for `![[*.ext]]` patterns and standard `![](path)` image syntax
3. **Copy**: Copy all referenced attachments into the OKF bundle, maintaining a flat structure under `<bundle>/attachments/`
4. **Rewrite**: Update all embed paths to point to `attachments/filename.ext` using bundle-relative paths

**Unreferenced attachments:** Obsidian vaults often contain attachment files that are no longer referenced by any note. **Candidate default:** Do not copy unreferenced attachments. Include a report of orphaned attachments in the migration summary.

### 5.3 Path-to-Link Rewriting

After relocating attachments, all references must be updated:

| Original reference | After relocation |
|-------------------|-----------------|
| `![[image.png]]` | `![image](/attachments/image.png)` |
| `![](./assets/image.png)` | `![](/attachments/image.png)` |
| `[download](assets/file.pdf)` | `[download](/attachments/file.pdf)` |

**Candidate default:** Path rewriting is deterministic and reversible. Include a manifest mapping old→new paths for auditability.

---

## 6. Obsidian Properties → YAML Frontmatter

### 6.1 Property Type System

Obsidian Properties provides a graphical editor for YAML frontmatter with typed fields: text, number, checkbox (boolean), date, date & time, tags (list), and aliases. Underneath, these are stored as standard YAML in the note's frontmatter block.

**Evidence:** Obsidian Help, "Editing and formatting / Properties" (help.obsidian.md). The Dataview plugin documentation (blacksmithgu.github.io/obsidian-dataview) further extends this with implicit field types.

### 6.2 Field Mapping

Since Obsidian Properties are stored as standard YAML frontmatter, they are mostly compatible with OKF out of the box. The primary migration concerns are:

| Obsidian Property Type | YAML Representation | OKF Compatibility |
|-----------------------|--------------------|--------------------|
| Text | `property: value` | Fully compatible |
| Number | `property: 42` | Fully compatible |
| Checkbox | `property: true` / `property: false` | Fully compatible |
| Date | `property: 2024-01-15` | Compatible (OKF uses YYYY-MM-DD) |
| Date & time | `property: 2024-01-15T14:30:00` | Compatible (OKF expects ISO 8601) |
| List / Tags | `property: [a, b, c]` | Fully compatible |
| Aliases | `aliases: [alt1, alt2]` | No OKF equivalent; preserve in frontmatter |

**Evidence:** OKF v0.2 frontmatter is standard YAML. Unknown keys are tolerated and consumers SHOULD preserve them when round-tripping (okf-spec-and-ecosystem.md, §2.3 "Consumer obligations"). This means all Obsidian frontmatter fields can be carried forward in the OKF bundle.

### 6.3 Required Field Gap

The critical migration gap is the `type` field. OKF requires every concept to have a non-empty `type` in its frontmatter. Obsidian has no equivalent requirement — most vault notes lack a `type` field entirely.

**Evidence:** "The only always-required key" in OKF is `type` (okf-spec-and-ecosystem.md, §2.1 "Frontmatter fields"). The fabricioctelles conversion guide lists this as step 2: "Ensure `type` field exists in every frontmatter block" and provides a mapping table (fabricioctelles/skills, `references/conversion.md`, "From Obsidian Vault").

**Candidate default — type inference from context:**

| Obsidian pattern | Suggested OKF `type` | Basis |
|-----------------|---------------------|-------|
| Tagged `#moc` or filename "MOC" | Redirect to OKF `index.md` | MOCs are navigation, not concepts |
| Daily notes / journal entries | `Log` | Temporal record, fits log pattern |
| Literature notes (tagged `#literature-note`) | `Reference` | External source annotation |
| Permanent notes (tagged `#permanent-note`) | `Reference` | General knowledge concept |
| Template files (in `templates/`) | Exclude from bundle | Not knowledge content |

**Decision required:** Whether to auto-assign types based on heuristics or require a human to assign types as a migration pre-step. Auto-assignment creates a valid bundle quickly but may misclassify content.

---

## 7. Unsupported Obsidian Features

### 7.1 Features with NO OKF Equivalent

| Feature | Obsidian syntax | Why unsupported | Migration action |
|---------|----------------|-----------------|-----------------|
| **Dataview queries** | `` ```dataview TABLE ...``` `` | Dynamic query language, no OKF equivalent | Remove; log what was removed |
| **Inline Dataview** | `` `= this.file.name` `` | Inline expression evaluation | Remove; log |
| **Comments** | `%%hidden text%%` | Not part of any Markdown spec | Remove |
| **Tags in body** | `#tag` inline | Not an OKF linking pattern | Move to frontmatter `tags: [tag]` |
| **Canvas** | `.canvas` JSON files | Visual graph format, not text | Skip; log as excluded |
| **Community plugin syntax** | Various | Plugin-specific, non-portable | Remove; log |
| **Properties UI** | Typed editor widgets | Not content; UI only | N/A (YAML carries over) |
| **Graph view** | Built-in visualization | Application feature | N/A |
| **Obsidian URI** | `obsidian://` links | Application-specific protocol | Remove or convert to text |
| **Sliding panes / tabs** | Layout feature | Application UI | N/A |
| **Community themes** | CSS | Styling only | N/A |

**Evidence:** The existing research explicitly lists these as "Do Not Adopt" patterns (obsidian-transferable-patterns.md, §"Do Not Adopt"). The fabricioctelles conversion guide instructs: "`%%comments%%` → remove", "Dataview queries → remove (dynamic, not portable)" (fabricioctelles/skills, `references/conversion.md`, "Remove Obsidian-specific syntax").

### 7.2 Dataview — Special Case

Dataview queries are the most impactful removal. A vault using Dataview for automatic MOC generation, freshness checking, or task aggregation will appear broken after migration — the queries produce no output.

**Evidence:** The Dataview plugin is the most installed community plugin in the Obsidian ecosystem (Obsidian Community Plugins page). Its removal from migrated content represents the largest functional gap.

**Inference — three mitigation strategies:**

1. **Pre-migration rendering**: Render all Dataview queries in Obsidian (export to Markdown after Dataview has evaluated them) so static output is preserved. This requires Obsidian + the Dataview plugin during migration.

2. **Post-migration reconstruction**: Replace Dataview queries with OKF-native `index.md` files that achieve the same structural role. For freshness queries, OKF v0.2's `stale_after` field covers the same semantic space. For task aggregation, OKF has no equivalent.

3. **Accept loss**: Document what was removed and why. Dataview is irreducibly dynamic; static replacement is a different product.

**Candidate default — strategy 1 + 2 combined:** Pre-render for immediate completeness, then progressively replace with native OKF structures (index.md, `stale_after`, `status`) during ongoing bundle maintenance.

### 7.3 Inline Tags

Obsidian supports `#tag` syntax in body text. These function as implicit links and search facets, but they have no meaning in standard Markdown (they render as literal `#tag` text).

**Candidate default:** Extract all inline `#tag` patterns from body text, remove them from prose, and aggregate into the frontmatter `tags` list. For tags that are meaningful *within* the sentence (e.g., "this is a `#critical` issue"), preserve the word but strip the `#` prefix or replace with emphasis.

**Decision required:** Whether to strip inline tags aggressively (cleaner prose) or preserve them as text (no information loss, but visible `#tag` artifacts in rendered output).

---

## 8. Attachment Relocation — Detailed Strategy

### 8.1 Discovery

**Evidence:** The `obsidian-export` tool recursively walks the vault, resolving all `![[file]]` embeds for non-Markdown files as attachment references (zoni/obsidian-export README, "Basic usage — Exporting notes").

**Candidate default — three-pass discovery:**

1. **Scan frontmatter** for attachment folder configuration (`.obsidian/app.json` → `attachmentFolderPath`)
2. **Scan all notes** for embed patterns:
   - `![[*.png]]`, `![[*.jpg]]`, `![[*.gif]]`, `![[*.svg]]` → images
   - `![[*.mp3]]`, `![[*.wav]]`, `![[*.ogg]]` → audio
   - `![[*.mp4]]`, `![[*.mov]]`, `![[*.webm]]` → video
   - `![[*.pdf]]`, `![[*.docx]]`, `![[*.xlsx]]` → documents
   - Standard Markdown `![](path)` images
3. **Resolve paths** relative to each note's location and the attachment folder configuration

### 8.2 Relocation

**Candidate default:**

1. Create `<okf-bundle>/attachments/` directory
2. Copy all referenced attachments to this directory using filename-only naming (strip paths)
3. For filename collisions, append a numeric suffix (`image-1.png`, `image-2.png`)
4. Rewrite all embed references to `/attachments/filename.ext`
5. Include an unreferenced-attachment report in migration summary

**Inference — filename collisions require renaming.** Obsidian allows `projects/images/screenshot.png` and `meetings/images/screenshot.png` to coexist because wikilinks resolve by vault search including subdirectories. A flat `attachments/` directory would collide. The numeric suffix approach is lossy but deterministic.

**Decision required:** Whether to preserve original directory structure under `attachments/` (preserves paths, longer URL) or flatten with collision resolution (simpler, shorter paths, renaming may break discoverability).

### 8.3 Special Files

| File | Handling |
|------|----------|
| `.obsidian/` | Skip entirely. Application configuration, not knowledge. |
| `.trash/` | Skip entirely. Deleted notes. |
| `.obsidian/plugins/` | Skip entirely. Plugin code. |
| `.obsidian/themes/` | Skip entirely. CSS themes. |
| `.gitignore` | Copy to bundle root if present (useful for git-based bundles) |
| `.export-ignore` | Skip (obsidian-export specific) |

---

## 9. Existing Converter Tools — Survey

### 9.1 obsidian-export (Rust)

**Evidence:** zoni/obsidian-export README; v25.3.0, 1.3k stars, 96 forks.

| Attribute | Value |
|-----------|-------|
| **Type** | CLI program + Rust library |
| **License** | BSD-2-Clause Plus Patent |
| **Output** | CommonMark |
| **Handles** | `[[wikilinks]]`, `![[embeds]]`, frontmatter, recursive embed detection |
| **Does NOT handle** | Callout normalization, Dataview, block references beyond link conversion, Properties UI types |
| **Exclusion** | `.export-ignore` + `.gitignore` patterns |
| **Partial vault** | `--start-at` flag for exporting subsets |
| **Frontmatter options** | `--frontmatter=always|never|auto` |
| **Recursive embed policy** | Default: error; `--no-recursive-embeds`: insert link instead |
| **Post-processing** | Library supports custom `Postprocessor` functions for additional transformations |

**Inference:** `obsidian-export` is the most mature converter and the best starting point for a migration pipeline. A custom `Postprocessor` can handle callout normalization and attachment relocation on top of its wikilink/embed conversion. Its Rust library interface makes it embeddable in a migration tool.

### 9.2 okflint (Python)

**Evidence:** mattdav/okflint README; v0.3.1.

| Attribute | Value |
|-----------|-------|
| **Type** | Linter with wikilink resolution |
| **Wikilinks** | Resolves `[[wiki-links]]` via `--vault` flag; validates that targets exist |
| **Usage** | `okflint audit --bundle <path> --vault <vault>` scans an Obsidian vault and reports broken wikilinks |
| **Output** | JSON audit report with broken links, statistics, split candidates |
| **OKF integration** | Generates `index.md` files (OKF §6); validates against manifest-declared types |

**Inference:** `okflint` is a migration *diagnostic* tool rather than a converter. Use it after `obsidian-export` to validate the migrated bundle's link integrity and type conformance.

### 9.3 Other Converters

| Tool | Description | Migration relevance |
|------|-------------|-------------------|
| **Quartz** (jackyzha0/quartz) | Static site generator that renders Obsidian-flavored Markdown | Rendering, not migration. Can serve migrated content with Obsidian flavor. |
| **Perlite** (secure-77/Perlite) | Web-based Markdown viewer optimized for Obsidian | Rendering only. |
| **obyde** (khalednassar/obyde) | Converts Obsidian vault to Jekyll/Hugo blog | Publishing-focused; handles path rewriting for static site generators. |
| **Obsidian Importer** (official plugin) | Converts *from* other formats *into* Obsidian | Not relevant for export. |
| **PKMigrator** (AnweshGangula/PKMigrator) | Migrates between PKM tools (Roam, Remnote, Obsidian, Org-roam) | Handles inter-PKM conversion. May be useful for Roam→OKF migration. |

### 9.4 OKF Skill Conversion Guide

**Evidence:** The fabricioctelles OKF skill includes a `conversion.md` reference with explicit Obsidian→OKF steps (fabricioctelles/skills, `references/conversion.md`, "From Obsidian Vault"). Its approach:

1. Convert wikilinks to standard links
2. Add `type` field everywhere
3. Convert inline tags to frontmatter
4. Handle embeds (note embeds → link; image embeds → standard Markdown)
5. Remove Obsidian-specific syntax (comments, callouts, Dataview)

**Inference:** This is a manual process guide, not an automated converter. It covers the semantic mapping but lacks details on edge cases (block references, ambiguous wikilinks, attachment relocation).

---

## 10. Failure Modes — What Breaks in Practice

### 10.1 Silent Data Loss

| Failure | Cause | Detection |
|---------|-------|-----------|
| **Inline Dataview expressions** render as raw `= this.file.name` text | Query syntax removed but expression left behind | Scan for `` `= `` patterns post-migration |
| **Folded callouts lose hidden content** | Fold state not representable; `[!note]-` treated as plain blockquote | Scan for `[!type]-` and `[!type]+` remnants |
| **Block references become dead links** | `#^block-id` not a valid fragment | Scan for `#^` in link targets |
| **Comment-removed content** | `%%comments%%` stripped but context may rely on them | N/A — comments are intentionally non-visible |

### 10.2 Structural Breakage

| Failure | Cause | Detection |
|---------|-------|-----------|
| **Embedded note content not included** | `![[Note]]` converted to link — structure around embed collapses | Scan for `![[` remnants; review manually |
| **MOC pages broken** | MOCs that used Dataview to auto-populate link lists become empty | MOCs will have headings but no list content |
| **Tag-based navigation broken** | Inline `#tag` removed; frontmatter `tags` don't create navigable structures | OKF has no tag-page generation; needs index.md |
| **Aliases lost from discovery** | `aliases: [...]` preserved in frontmatter, but no tooling uses them | OKF has no alias resolution; cross-links must use canonical filenames |

### 10.3 Attachment Failures

| Failure | Cause | Detection |
|---------|-------|-----------|
| **Broken image references** | Attachment paths rewritten incorrectly; image moved but link not updated | Broken link scan |
| **Filename collision on flatten** | Two files `screenshot.png` in different dirs → only one survives | Pre-relocation scan for duplicate base names |
| **Unsupported media silently dropped** | `.key`, `.pages`, `.numbers`, `.heic` files have no migration | Scan for unsupported extensions per allowlist |
| **Git LFS pointers not dereferenced** | Large files stored as Git LFS pointers, not actual content | Check for `.gitattributes` with LFS patterns |

### 10.4 Migration-Tool-Specific Failure Modes

**Evidence:** The `obsidian-export` README documents several limitations:

- **Non-UTF8 encoding**: "All text and file handling performs lossy conversion to Unicode strings." Files with non-UTF8 encoding may produce corrupted output (zoni/obsidian-export README, "Character encodings").
- **Single-note export**: When exporting a single file, "references to other notes won't be resolved" because the tool needs the full vault context (zoni/obsidian-export README, "Exporting notes").
- **Path resolution**: Wikilink resolution is filename-based, not path-based. Multiple notes with the same name may resolve incorrectly.
- **Windows path separators**: On Windows, backslash path separators may cause issues if the vault was created on another OS.

---

## 11. Recommended Migration Pipeline

**Candidate default — three-stage pipeline:**

### Stage 1: Pre-flight (Diagnostic)

1. **Inventory the vault** using `okflint audit` with `--vault` pointing to the vault root
2. **Collect statistics**: file count, wikilink count, Dataview query count, callout count, attachment count
3. **Identify problematic patterns**: ambiguous wikilinks, block references, custom callout types, plugin-specific syntax
4. **Produce a migration plan** listing what will be rewritten, removed, or flagged for review

### Stage 2: Conversion (Automated)

1. **Run `obsidian-export`** to convert wikilinks and basic embeds to CommonMark
2. **Apply post-processing** for:
   - Callout normalization (GFM types → uppercase; non-GFM types → blockquote + bold header)
   - Inline tag extraction → frontmatter `tags`
   - Comment removal (`%%...%%`)
   - Block reference conversion (link + warning)
   - Attachment relocation and path rewriting
   - Pre-rendered Dataview output inclusion (if Obsidian is available)
3. **Add `type` field** to every concept. Use per-directory or per-tag heuristics; flag unresolvable files

### Stage 3: Validation (Gate)

1. **Run `okflint validate`** against an OKF manifest to confirm all concepts have valid `type` and no broken OKF links
2. **Diff against the original vault** to verify no content was silently lost
3. **Generate index.md files** with `okflint index --apply`
4. **Generate log.md** with migration record

---

## 12. Summary — Handling by Strategy

| Approach | Best for | Cost |
|----------|----------|------|
| **Rewrite** (wikilinks → standard links) | Core linking; highest fidelity | Low — deterministic transformation |
| **Rewrite** (callouts → GFM alerts) | GFM-mapped callout types | Low — simple string normalization |
| **Rewrite** (image embeds → `![](path)`) | All image embeds | Low — regex replacement |
| **Rewrite + warn** (block refs → links) | Block references | Medium — block ID information preserved in link text but navigation degrades |
| **Filter** (Dataview queries, comments) | Non-portable dynamic content | High — content loss; pre-render or accept |
| **Filter + log** (plugin syntax, Canvas) | Plugin-specific features | Low — few vaults use these heavily |
| **Relocate** (attachments) | Referenced media files | Medium — path rewriting is deterministic but requires full vault scan |
| **Add** (`type` field) | All concepts | High manual effort; heuristics help but accuracy varies |

---

## 13. Open Decisions

| # | Decision | Stakes |
|---|----------|--------|
| D1 | Ambiguous wikilink resolution priority (shortest path vs nearest directory vs prompt) | Affects all vaults with duplicate filenames |
| D2 | Callout conversion strategy (normalize to GFM types vs convert to plain blockquotes) | Affects readability in GitHub vs any renderer |
| D3 | Block embed handling (inline content vs link with label) | Affects content duplication and staleness risk |
| D4 | Inline tag treatment (strip `#` vs preserve as text vs remove entirely) | Affects body prose cleanliness |
| D5 | Attachment relocation structure (flat vs preserve hierarchy) | Affects URL length and collision rate |
| D6 | Auto-type assignment during migration vs pre-migration manual classification | Affects migration automation level |
| D7 | Whether to pre-render Dataview queries (requires Obsidian) or accept query loss | Affects content completeness |

---

## Sources Referenced

| Source | URL |
|--------|-----|
| Obsidian Help — Internal Links | https://help.obsidian.md/Linking+notes+and+files/Internal+links |
| Obsidian Help — Callouts | https://help.obsidian.md/Editing+and+formatting/Callouts |
| Obsidian Help — Embedding Files | https://help.obsidian.md/Linking+notes+and+files/Embedding+files |
| Obsidian Help — Properties | https://help.obsidian.md/Editing+and+formatting/Properties |
| Obsidian Help — Attachments | https://help.obsidian.md/Editing+and+formatting/Attachments |
| Obsidian Help — Markdown Syntax | https://help.obsidian.md/Editing+and+formatting/Markdown+syntax |
| zoni/obsidian-export | https://github.com/zoni/obsidian-export |
| obsidian-export crate docs | https://docs.rs/obsidian-export/latest/obsidian_export/ |
| mattdav/okflint | https://github.com/mattdav/okflint |
| fabricioctelles/skills — conversion.md | https://github.com/fabricioctelles/skills (okf-open-knowledge-format/references/conversion.md) |
| kmaasrud/awesome-obsidian | https://github.com/kmaasrud/awesome-obsidian |
| Dataview Plugin Documentation | https://blacksmithgu.github.io/obsidian-dataview/ |
| OKF Specification v0.2 | GoogleCloudPlatform/knowledge-catalog, okf/SPEC.md (analyzed in okf-spec-and-ecosystem.md) |
| Obsidian Transferable Patterns Research | docs/research/obsidian-transferable-patterns.md (local) |
| Obsidian Community Plugins | https://obsidian.md/plugins |

