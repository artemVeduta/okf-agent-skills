# Obsidian Transferable Knowledge Management Patterns

Research into transferable knowledge management practices from the
Obsidian ecosystem that can inform how agent-facing durable context
should be structured -- without adopting Obsidian syntax, wikilinks,
plugins, or application integration.

### Claim labels

- **Evidence** — a statement supported by the cited source.
- **Inference** — a transfer interpretation, not established by the source.
- **Candidate default** — an operational hypothesis requiring fixture benchmarks.
- **Decision required** — unresolved semantics that tooling must not invent.

Zettelkasten sources in this report describe particular authors' methods and,
in the structural-layers article, one practitioner's vault history. They are
anecdotal design inputs, not controlled validation. All numeric counts,
percentages, ages, limits, and retention intervals are candidate benchmark
values only.

---

## 1. Zettelkasten Method (Atomic Notes)

### Principle of Atomicity: One Concept Per Note

The core of the Zettelkasten method is that each note captures exactly
one thought or concept. Luhmann wrote each idea on a single index card,
enabling individual referencing and re-combination. As the
Zettelkasten.de introduction states:

> The principle of atomicity is one of the core tenets of the
> Zettelkasten Method. Atomicity refers to the idea that knowledge is
> made up of discrete building blocks.

_Source: https://zettelkasten.de/introduction/ (section "A Zettelkasten
Is a Personal Tool for Thinking and Writing")_

Andy Matuschak's "Evergreen notes should be atomic" adds:

> It's best to create notes which are only about one thing -- but
> which, as much as possible, capture the entirety of that thing. This
> way, it's easier to form connections across topics and contexts.

_Source: https://notes.andymatuschak.org/zNUaiGAXp21eorsER1Jm9yU_

### How to Decide When to Split vs Keep Together

The Zettelkasten.de article on when to start a new note states:

> put things which belong together in a single note, give it an ID, but
> limit its content to that single topic.

**Inference:** Reuse potential is a useful split question: if a component
could be referenced or combined independently, it may merit a separate
note. The cited sources do not establish a deterministic split rule or
prove that more atomic notes improve every retrieval task.

_Source: https://zettelkasten.de/posts/create-zettel-from-reading-notes/_

Matuschak notes there is no clear litmus test; it's a trade-off. Too
broad and links are muddied; too fragmented and the link network
fragments. The analogy is to the software engineering principle of
**separation of concerns**.

_Source: https://notes.andymatuschak.org/zNUaiGAXp21eorsER1Jm9yU_

### Concept Depth: Fleeting → Literature → Permanent → Structure

Luhmann distinguished three kinds of notes (as summarized by Ahrens via
Tiago Forte):

1. **Fleeting notes**: Quick, informal, temporary -- reminders of what
   is in your head. Discarded after processing.
2. **Literature notes**: Brief, selective notes in your own words about
   a source, capturing what you don't want to forget.
3. **Permanent notes**: The long-term knowledge store. Written in full
   sentences as if for someone else, with sources disclosed.

Above these sits the **structure note** (or MOC): a note *about* other
notes and their relationships.

_Source: https://fortelabs.com/blog/how-to-take-smart-notes/ (sections
"Luhmann's slip-box" and "The 8 Steps")_

Zettelkasten.de adds that the body of each Zettel must be written **in
your own words** -- one of the core rules to make the system work.
Copying/pasting bypasses the understanding that makes the system
effective.

_Source: https://zettelkasten.de/introduction/ (section "The Body of
the Zettel")_

### How Atomicity Affects Discoverability and Maintainability

Atomic notes create a web of individually addressable units. Each unit
can be found independently and recombined in novel ways. Luhmann
described this as "internal growth" (or "organic growth" in
translation). The source presents this as supporting internal growth; it
does not prove automatic scaling or eliminate reorganization in other vaults.

_Source: https://zettelkasten.de/introduction/ (section "The Fixed
Address of Each Note")_

Matuschak observes that atomic notes are "like APIs": a stable title
and address for a concept that other notes can reference without
breakage.

_Source: https://notes.andymatuschak.org/zDh1yhNFQNxDEre12B4zd8k_

---

## 2. Maps of Content (MOCs)

### What MOCs Are and How They Differ from Folders/Tags

Maps of Content (MOCs) are navigational notes that curate and sequence
links to other notes around a topic. They differ from folders in that
they are content (notes themselves), not containers. They differ from
tags in that they impose a deliberate, human-curated structure
(sometimes hierarchical, sometimes sequential), rather than a flat
matching set.

> A structure note is a meta-note: it is a Zettel about other Zettels
> and their relationships.

_Source: https://zettelkasten.de/introduction/ (section "Structure
Notes")_

Nick Milo's LYT framework (Linking Your Thinking) popularized the term
"MOC" in the Obsidian community, describing them as "curated note[s]
that link to other notes, creating a navigable structure."

_Source: https://notes.linkingyourthinking.com/Home/Concepts/Maps+of+Content_

### How They Enable Progressive Disclosure (Surface → Deep)

MOCs provide a bird's-eye view entry point into a topic. The top-level
MOC links to sub-MOCs and key notes. A visitor (or agent) starts at the
surface and follows links to increasing detail. This is the same
mechanism Luhmann used with his register (keyword index) as entry
points into the hypertext of his Zettelkasten.

_Source: https://zettelkasten.de/introduction/ (section "The Fixed
Address of Each Note" -- Luhmann's register as entry points)_

### When to Create vs When to Let Emerge

The Zettelkasten.de structural layers article describes three layers
that emerged organically:

1. **Bottom Layer**: Content notes
2. **Middle Layer**: Structure notes (tables of contents for content)
3. **Top Layer**: Main structure notes and double-hash tags (structure
   notes that organize other structure notes)

The key insight: these layers were not planned. "I didn't plan them in
advance. It rather was an organic process."

In this single reported vault, hub-like notes appeared around 500–700
notes and structure notes around 1,000–1,500 notes. These are anecdotal
observations, not necessity thresholds or general triggers. The author
reports waiting for organizational pain before introducing structure.

_Source: https://zettelkasten.de/posts/three-layers-structure-zettelkasten/_

Matuschak's principle "Prefer associative ontologies to hierarchical
taxonomies" reinforces this: "let structure emerge organically. When
it's imposed from the start, you prematurely constrain what may emerge."

_Source: https://notes.andymatuschak.org/z8SU3r8xyZyvwRhyDdJasJ2_

### How MOCs Handle Growth (Splitting, Nesting)

When a structure note becomes too large, sub-MOCs are extracted. The
example from Zettelkasten.de: a training structure note linked to
strength, endurance, sprint, strongman, mobility training. When topics
like "physical work" and "chronic sitting" didn't fit, a new umbrella
MOC "Human Movement" emerged above the original.

_Source: https://zettelkasten.de/posts/three-layers-structure-zettelkasten/
(section "Top Layer: Main Structure Notes and Double Hashes")_

### Relationship to "Index" Patterns

Luhmann's register functioned as his index: a keyword-to-entry-point
mapping, not a full tag system. Each keyword had only one or very few
references -- just enough to enter the hypertext. From there, links
carried the navigation forward.

_Source: https://zettelkasten.de/introduction/ (section "The Fixed
Address of Each Note")_

In the Obsidian community, an "index note" is functionally identical to
a top-level MOC: a curated table of contents for a major domain.

---

## 3. Metadata and Properties

### YAML Frontmatter Conventions

Obsidian and the Dataview plugin rely heavily on YAML frontmatter for
metadata. The Dataview documentation describes the format:

```
---
alias: "document"
last-reviewed: 2021-08-17
thoughts:
  rating: 8
  reviewable: false
---
```

Fields are automatically typed (text, date, number, list, object) based
on YAML syntax conventions.

_Source: https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/_

### What Metadata Proves Most Useful for Navigation and Freshness

The Dataview implicit fields (available without user annotation) reveal
what the tooling itself treats as universally useful:

- `file.cday` / `file.mtime` -- creation and modification dates
- `file.outlinks` / `file.inlinks` -- outgoing and incoming links
- `file.etags` -- extracted tags
- `file.tasks` -- all tasks in the file

_Source: https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/
(section "Implicit fields")_

Community conventions frequently use:
- `aliases` -- alternative names for a note (discoverability)
- `tags` -- topic classification
- `created` / `modified` -- provenance timestamps
- `status` -- workflow state (draft, review, published)
- `reviewed` or `last-reviewed` -- freshness tracking

The Dataview query language enables freshness queries such as:
```dataview
LIST FROM #topic WHERE !last-reviewed OR last-reviewed < date(today) - dur(1 year)
```

_Source: https://blacksmithgu.github.io/obsidian-dataview/queries/structure/
(section "Filter, sort, group or limit results")_

### Community Conventions for Concept Type Classification

**Inference:** Examples in the reviewed Obsidian and Dataview material
include the following type-classification conventions; the evidence does
not establish community-wide convergence:

1. **Note type** via tag or property: `#permanent-note`,
   `#literature-note`, `#fleeting-note`, `#moc`
2. **Maturity level**: `#seedling`, `#budding`, `#evergreen` (popularized
   by Andy Matuschak and Nick Milo)
3. **Domain classification**: hierarchical tags like `#psychology/memory`,
   `#cs/algorithms`

Aliases are one documented synonym-management mechanism. Their use is
not universal, and alias resolution is not the same as immutable concept
identity.

_Source: Inferred from Dataview annotation conventions and the tagging
practices described at https://blacksmithgu.github.io/obsidian-dataview/queries/structure/_

### How Properties Support Automated Tooling

Dataview's entire value proposition is automated tooling over
structured metadata. Its query language can:
- List all stale notes (not reviewed in X days)
- Aggregate task completion rates
- Build dynamic MOCs from tags
- Surface orphaned or under-linked notes

The key enabling factor is **machine-parseable, structured metadata**
that follows consistent conventions. Without this, automation is
limited to full-text search.

_Source: https://blacksmithgu.github.io/obsidian-dataview/ (README,
section "Usage")_

---

## 4. Growth Management

### Anecdotal Growth Observations

The Zettelkasten.de structural-layers article reports one author's
experience:

- **fewer than roughly 500 notes**: the author used simpler navigation
- **roughly 500–700 notes**: the author introduced hub-like notes
- **roughly 1,000–1,500 notes**: the author observed structure notes
- **beyond that range**: the author added structure notes that organize
  other structure notes

_Source: https://zettelkasten.de/posts/three-layers-structure-zettelkasten/
(sections "Bottom Layer" and "Middle Layer")_

**Inference:** Opacity is one reported failure mode at scale. The source
does not establish a universal note count at which navigation fails.

**Candidate default:** Use these counts only to construct benchmark
fixtures. Select production prompts or warnings from measured retrieval
recall, precision, navigation effort, latency, and user feedback—not
from concept count alone.

### Compaction Strategies: Merging, Summarizing, Archiving

The reviewed Zettelkasten sources describe several approaches, but do
not define OKF-safe merge, split, redirect, or archival operations:

1. **Synthesis notes**: When multiple notes cover overlapping ground, a
   new note may synthesize them while originals remain as evidence.
2. **Buffer notes**: Temporary collection points for related material
   that will later be rearranged into permanent notes. Described as
   "temporary buffer notes to collect stuff that you can later
   re-arrange."
3. **Layers of Evidence**: Three layers emerge naturally: (1) data
   description, (2) interpretation, (3) synthesis. Higher layers
   compact lower layers.

_Source: https://zettelkasten.de/overview/ (section "Scaling your note
archive")_

### Candidate Signals for Maintenance

The following are inferences and candidate signals, not community-
validated triggers:

- **Search result review cost**: Benchmark whether candidate result sets
  such as 50–100 items become impractical for target users and agents.
- **Dead links accumulate**: Linked-to notes that no longer exist signal
  decay.
- **Unlinked mentions grow**: Content referencing a concept without
  explicit links signals an emerging cluster that needs a home.
- **Orphan notes**: Notes with zero inbound links may be dead or
  candidates for archiving.

_Source basis: inference from the structural-layers article and MOC
examples; no numeric trigger is established by those sources._

### Loss Prevention: Version Control, Backup

The reviewed sources support plaintext portability and redundant
identifiers, but they do not establish a universal Obsidian-community
backup policy. Candidate safeguards include:

- **Git for vaults**: Committed content gains version history and diffs.
  Recovery still depends on commits, retained objects and refs, and a
  surviving repository or verified backup.
- **Regular exports**: Markdown exports to portable formats.
- **Redundant ID storage**: Zettelkasten.de recommends placing the note
  ID in both the filename and the file body to survive tool changes.

_Source: https://zettelkasten.de/introduction/ (section "The Archive"
-- discussion of redundancy and software independence)_

**Candidate default:** Before any automated merge, split, path move,
archive, purge, or format migration, require a dry-run manifest, a
snapshot or full backup, backup verification, and a tested restore into
a disposable location.

### Archival Patterns

The Zettelkasten method treats notes as never truly deleted -- they are
part of the permanent record. Archival, when done, follows:

- **Fleeting notes**: Deleted after processing
- **Literature notes**: Filed in a reference system, never discarded
- **Permanent notes**: If superseded, linked to the superseding note
  with an explanation. The old note remains as part of the provenance
  chain.

Matuschak's evergreen notes similarly accumulate indefinitely: "Evergreen
notes are written and organized to evolve, contribute, and accumulate
over time, across projects."

_Source: https://notes.andymatuschak.org/Evergreen_notes_

---

## 5. Linking and Navigation

### Backlinks as Automated Navigation

Backlinks (links from other notes *to* the current note) are one of the
most impactful Obsidian features for knowledge discovery. When you view
a note, Obsidian shows all notes that link to it, creating automated
reverse navigation without any manual maintenance.

> Often the context in which we are working suggests a multiplicity of
> links to other notes. In such cases it is important to capture the
> connections radially, but at the same time also by right away
> recording backlinks in the slips that are being linked to.

_Source: Luhmann, "Communicating with Slip Boxes" (1992), translated
at http://luhmann.surge.sh/communicating-with-slip-boxes, cited at
https://notes.andymatuschak.org/zF8xCU4BwXwbmSyp7tmff9i_

### Unlinked Mentions as Discovery

Obsidian's "Unlinked Mentions" feature surfaces places where a note's
title appears in other notes without an explicit link. This provides an
automated signal for missed connections. It is the filesystem
equivalent of noticing that concept X is discussed in three different
documents that never cross-reference each other.

The concept maps directly to static analysis of document text for
concept name references.

### Graph Analysis for Orphan/Concept Drift Detection

Obsidian's graph view visualizes the link structure, making it possible
to:
- Identify **orphan notes** (no incoming links) at a glance
- Spot **over-connected hubs** that may need child nodes
- Detect **emerging topic clusters** that could become a new MOC
- Find **dead-end chains** where a line of thought stops

_Source: Obsidian graph view documentation,
https://help.obsidian.md/Plugins/Graph+view_

### Path-based vs Tag-based vs Link-based Organization

The Zettelkasten tradition is explicit in its recommendations:

**DO NOT use categories/folders.** Zettelkasten.de states this as a
principle: "Don't use categories. Use tags instead."

_Source: https://zettelkasten.de/overview/ (section "Common Questions"_
and article https://zettelkasten.de/posts/no-categories/)

**Tags vs Links**: Tags are entry points (beginning of navigation).
Links are the navigation mechanism itself. "Search alone is not enough.
Connections will do, especially in the long run."

_Source: https://zettelkasten.de/posts/search-alone-is-not-enough_

Matuschak goes further: "Tags are an ineffective association structure"
and recommends "Prefer fine-grained associations" (explicit links with
context) over tags.

_Source: https://notes.andymatuschak.org/zojJRcfGstU2Ss6JRMzd15_

**Links with context**: The Zettelkasten.de introduction emphasizes
that every link should carry an explicit explanation of *why* the
connection was made. This is "link context" -- "you create knowledge"
by making the relationship explicit. Without it, "your future self has
no idea why he should follow the link."

_Source: https://zettelkasten.de/introduction/ (section "Connecting
Zettel")

### Translation to Filesystem-Only Approaches

All of these navigation patterns can translate to filesystem-only
approaches:

1. **Backlinks**: A build-time or runtime tool that scans all files for
   references to a given file path/ID and compiles a reverse index.
2. **Unlinked mentions**: Full-text search for a concept name across
   all files, filtered to exclude existing explicit links.
3. **Graph analysis**: Static analysis of all `.md` files, constructing
   a link graph from explicit file references.
4. **MOCs**: Ordinary files that contain ordered lists of file
   references, functioning as human-curated navigation indices.

**Decision required:** Choose identity separately from routing. A
bundle-relative path is a useful locator but is not stable under rename,
move, archive, split, or merge. Tooling needs explicit semantics for
immutable IDs versus path identity, aliases, redirects, redirect chains
and cycles, link rewriting, and broken targets.

---

## 6. Provenance and Freshness

### How Obsidian Users Track Source of Information

The Zettelkasten method prescribes explicit source tracking:

1. **Reference section on every note**: The bottom of each Zettel
   contains the source, either a bibliographic citekey or a link to
   another Zettel that inspired the thought.
2. **Separate bibliographic slip-box**: Luhmann kept a second Zettelkasten
   purely for bibliographic references.
3. **Citekey conventions**: The community uses reference management
   tools (BibDesk, Zotero) that produce stable citekeys like
   `[#lastnameYEAR]`.

_Source: https://zettelkasten.de/introduction/ (sections "Reference"
and "The Anatomy of a Zettel")_

### Dataview for Freshness Queries (Concept, Not Plugin Adoption)

The *concept* of automated freshness queries (not the plugin) is
transferable. Dataview enables queries like:

- Find all notes not reviewed in the last year:
  ```dataview
  LIST WHERE !last-reviewed OR last-reviewed < date(today) - dur(1 year)
  ```
- List recently modified orphan notes (flagged for review):
  Combine `file.mtime` sorting with `length(file.inlinks) = 0`
- Find notes with the most backlinks (hub candidates):
  ```dataview
  LIST SORT length(file.inlinks) DESC LIMIT 20
  ```

_Source: https://blacksmithgu.github.io/obsidian-dataview/queries/structure/
and https://blacksmithgu.github.io/obsidian-dataview/reference/expressions/_

The transferable concept is: if durable context carries structured
metadata (dates, status, review records), automated tooling can surface
staleness, orphans, hubs, and emerging clusters.

### Template-Driven Metadata Consistency

Obsidian's Templates plugin enables inserting pre-defined metadata
structures into new notes. This ensures:

1. Every new note of a given type starts with the same metadata schema
2. Required fields are never forgotten
3. Metadata format is consistent across the vault, making automation
   reliable

_Source: https://help.obsidian.md/Plugins/Templates_

The transferable concept: a template file (or scaffolding script) that
pre-populates durable context documents with required metadata fields,
ensuring machine-readability.

### Community Conventions for "Last Reviewed" or "Stale" Signals

Common Obsidian community conventions for freshness:

| Field | Purpose |
|-------|---------|
| `created` | When the note was first written |
| `modified` | Explicitly tracked modification timestamp |
| `reviewed` or `last-reviewed` | Date of last human review |
| `status` | Workflow state: `draft`, `review`, `stable`, `archived` |
| `confidence` | How certain the author is (subjective rating) |

Dataview's own documentation uses `last-reviewed` as the canonical
example of a freshness field in its annotation examples.

_Source: https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/_

---

## Transferability Assessment

For each pattern, rated on transferability to agent-facing durable
context in a filesystem-based system (plaintext Markdown, no Obsidian).

### Candidate High Transferability

| Pattern | Rationale |
|---------|-----------|
| **Atomicity (one concept per file)** | Directly applicable. Small, single-concept files are easier for both humans and agents to navigate, reference, and recombine. |
| **Maps of Content (index files)** | Ordinary Markdown files listing links to other files. Requires no tooling beyond a file editor. The most important transferable pattern. |
| **YAML frontmatter for structured metadata** | Plaintext YAML is universally parseable. Agents can read/write it trivially. No Obsidian dependency. |
| **Unique stable identifiers per document** | **Decision required:** filename/path identity conflicts with moves; benchmark immutable IDs plus routing/alias metadata against path identity. |
| **Link context (explain why links exist)** | The practice of annotating links with rationale is pure content discipline, not tooling. |
| **Template-driven consistency** | A scaffolding script that pre-populates metadata fields. Simple automation, no Obsidian required. |
| **Progressive disclosure via index → sub-index → leaf** | Works with any filesystem. Top-level MOC lists sub-MOCs; sub-MOCs list content pages. |
| **Freshness metadata (`reviewed`, `status`, `confidence`)** | Simple YAML fields. Agents can query/update them. Enables automated staleness detection. |
| **Associative over hierarchical organization** | Files don't need to live in a single folder. Links create the structure; folders are secondary. |
| **Write in your own words** | Critical for durable context: agents should synthesize understanding, not copy-paste. |
| **Organic structure emergence** | **Candidate default:** start flat and introduce MOCs when fixture metrics show search/navigation degradation. |

### MEDIUM Transferability

| Pattern | Rationale |
|---------|-----------|
| **Backlinks as automated reverse navigation** | Requires a build-step tool that scans all files and constructs a reverse index. Simple to implement (grep + reverse map), but not zero-effort. |
| **Unlinked mentions detection** | Requires full-text indexing. Medium effort but conceptually simple. |
| **Automatic freshness queries** | Requires a scheduled job or agent command that inspects metadata. Medium implementation effort. |
| **Graph-based orphan detection** | Requires constructing and analyzing a link graph. Medium complexity. |
| **Three-layer structural emergence** | Anecdotal pattern only. Candidate counts such as 500 and 1,000 belong in fixtures; an agent must not act on count alone. |
| **Buffer notes for staged processing** | The concept is simple but requires a defined workflow of buffer → permanent note. |
| **Separating reference management from content** | Useful but adds a second system. Worth it only when source count is high. |

### LOW Transferability

| Pattern | Rationale |
|---------|-----------|
| **Graph visualization** | Nice-to-have but requires a visual interface. Not practical for CLI/agent-only interaction. |
| **Real-time backlink sidebar** | Requires a live editor with a sidebar UI. Not applicable to agent context. |
| **Dataview query language (DQL)** | The query language itself is Obsidian-specific. Equivalent functionality would need custom implementation. |
| **Folgezettel (sequential note numbering with branching)** | Luhmann's specific numbering system (1, 1a, 1a1, 1b, 2, ...) was designed for paper. Digital systems don't need it. Timestamps or UUIDs are simpler. |
| **Obsidian Canvas (visual note arrangement)** | Requires a graphical interface. Not transferable to text-only agent context. |

---

## Do Not Adopt

These Obsidian-specific features should not be borrowed into an
agent-facing durable context system:

1. **Wikilinks (`[[double bracket]]` syntax)**: Obsidian-specific
   Markdown extension. Prefer standard relative file paths or
   concept-ID-based references that work in any plaintext renderer.

2. **Obsidian URI scheme** (`obsidian://` links): Application-specific
   URL protocol that requires Obsidian to resolve.

3. **Dataview inline queries (`= this.file.name`)**: Plugin-specific
   syntax that only works within Obsidian. The *concept* of metadata
   querying is transferable; the *syntax* is not.

4. **Plugins as a dependency model**: The Obsidian plugin ecosystem
   (Dataview, Templater, Calendar, Kanban) works because it's
   integrated into a single application. An agent-facing system should
   be self-contained, not dependent on a plugin architecture.

5. **Tab-based navigation**: Obsidian's multi-tab interface for
   parallel note viewing has no equivalent in a filesystem+agent model.

6. **`.obsidian/` configuration directory**: Application-specific
   settings storage. Configuration relevant to agents should be
   co-located with the documents (e.g. per-directory config files).

7. **Frontmatter as Obsidian Properties (the UI)** : Obsidian's
   graphical property editor with type-specific widgets. The YAML
   itself is transferable; the UI is not.

8. **Live Preview / WYSIWYG editing**: The editing experience is not
   relevant to agent-mediated document maintenance. Plaintext
   authoring is the norm.

9. **Graph view animations and styling**: Visual graph exploration is
   not applicable. A textual summary (orphan count, hub list, cluster
   names) delivers the same information.

10. **Obsidian Sync / Obsidian Publish**: Vendor-locked cloud services
    for vault syncing and publishing. Git-based version control and
    static site generation serve the same purposes without lock-in.

---

## Candidate Design Premises

The patterns that transfer most directly to agent-facing durable context
all share these characteristics:

1. **Inference — plaintext portability**: Markdown with YAML
   frontmatter is broadly supported, but parser/schema compatibility
   still requires tests.
2. **Decision required — identity and addressing**: Select immutable
   identifiers, path identity, and alias/redirect routing semantics
   explicitly; do not call paths stable by default.
3. **Links with intent over bare connections**: The *why* of a
   connection is the knowledge.
4. **Candidate default — emergent structure**: Create MOCs when measured
   navigation pain is felt, not at an anecdotal note count.
5. **Metadata that enables automation**: Consistent, structured
   frontmatter makes tooling possible.
6. **Atomicity as a discipline, not a rule**: One concept per file is a
   guideline, adjusted based on reuse potential.
7. **Candidate default — freshness metadata**: Record review evidence
   where useful; a timestamp alone does not prove that content is
   current.
8. **Decision required — merge and split**: Define source/target
   identity, inbound-link behavior, redirects, trust/provenance,
   duplicate bodies, and rollback before automating compaction.

---

## Sources Referenced

| Source | URL |
|--------|-----|
| Zettelkasten.de Introduction | https://zettelkasten.de/introduction/ |
| Zettelkasten.de Structural Layers | https://zettelkasten.de/posts/three-layers-structure-zettelkasten/ |
| Zettelkasten.de Principles | https://zettelkasten.de/overview/ |
| Zettelkasten.de Create Zettel from Reading Notes | https://zettelkasten.de/posts/create-zettel-from-reading-notes/ |
| Zettelkasten.de Tags vs Categories | https://zettelkasten.de/posts/no-categories/ |
| Zettelkasten.de Search Alone Is Not Enough | https://zettelkasten.de/posts/search-alone-is-not-enough |
| Andy Matuschak, Evergreen Notes | https://notes.andymatuschak.org/Evergreen_notes |
| Andy Matuschak, Atomic Notes | https://notes.andymatuschak.org/zNUaiGAXp21eorsER1Jm9yU |
| Andy Matuschak, Concept-Oriented | https://notes.andymatuschak.org/z2hQEhqWkdRLL9JUwfawZZx |
| Andy Matuschak, Densely Linked | https://notes.andymatuschak.org/zF8xCU4BwXwbmSyp7tmff9i |
| Andy Matuschak, Associative Ontologies | https://notes.andymatuschak.org/z8SU3r8xyZyvwRhyDdJasJ2 |
| Tiago Forte / Sönke Ahrens: How to Take Smart Notes | https://fortelabs.com/blog/how-to-take-smart-notes/ |
| Dataview Plugin Documentation | https://blacksmithgu.github.io/obsidian-dataview/ |
| Dataview Add Metadata | https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/ |
| Dataview Query Structure | https://blacksmithgu.github.io/obsidian-dataview/queries/structure/ |
| Dataview Expressions | https://blacksmithgu.github.io/obsidian-dataview/reference/expressions/ |
| Luhmann's Zettelkasten (Schmidt) | https://pub.uni-bielefeld.de/download/2942475/2942530/jschmidt_2016_niklas%20luhmanns%20card%20index.pdf |
| Luhmann, Communicating with Slip Boxes | http://luhmann.surge.sh/communicating-with-slip-boxes |
| Obsidian Help, Graph View | https://help.obsidian.md/Plugins/Graph+view |
| Obsidian Help, Templates | https://help.obsidian.md/Plugins/Templates |
| Matt Pocock, `writing-great-skills` (pinned upstream snapshot) | https://github.com/mattpocock/skills/tree/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/writing-great-skills |
