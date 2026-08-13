# 08 — Post-Migration Conformance Checking and Validation

> **Superseded in part — 2026-08-01.** The research below is retained unchanged as the record of
> what was believed and why. An adopted ticket resolution always supersedes a research note; this
> note is evidence, never policy. This claim no longer holds:
>
> - **L4 semantic fidelity established by random sampling of N concepts, optionally supported by
>   embedding similarity and LLM-assisted review (§5)** — superseded by
>   [Define safe migration of existing knowledge into OKF](https://github.com/artemVeduta/okf-agent-skills/issues/19):
>   structural checks, parse-tree round trips, file counts, link handling and conformance checks do
>   not establish semantic fidelity, and a semantic-fidelity claim requires explicit human review
>   of **all** conflicts and residue plus representative high-risk conversions. Without that
>   evidence, semantic fidelity is reported as not assessed rather than sampled.
>
> The L1–L3 structural, conformance and link-validation findings are unaffected.

**Date:** 2026-07-26
**Source:** wayfinder:research sub-agent
**Method:** Primary-source capability research — tools, spec text, and proven validation patterns

> Every claim is tagged: **Evidence** (primary source), **Inference** (derived from
> evidence), **Candidate default** (reasonable default to prototype), **Decision
> required** (product choice this research must not make).

---

## 1. Validation Layers for a Post-Migration OKF Bundle

A migration from a source format (e.g. Notion export, Obsidian vault, MDX docs
site, raw Markdown) into OKF v0.2 must be validated at five layers:

| Layer | What it checks | When applied |
|-------|---------------|-------------|
| **L1: Conformance** | The bundle satisfies OKF v0.2 normative rules and conditional obligations | Immediately after migration, CI on every commit |
| **L2: Completeness** | No content was lost in transit (file count, content size, attachment parity) | Immediately after migration |
| **L3: Link integrity** | All internal cross-links resolve within the migrated bundle; external links alive | Migration gate, CI recurring |
| **L4: Semantic fidelity** | The meaning of the migrated content matches the source | Sampling-based, before approval |
| **L5: Diff review** | Human-readable structural comparison source↔migrated | Before approval |

---

## 2. L1 — OKF Conformance Validation

### 2.1 Normative bundle tests (v0.2 §11)

The OKF v0.2 specification defines three bundle-conformance tests. A validator
MUST NOT reject a bundle for optional-family absence or unmet SHOULD
recommendations.

**Evidence** — OKF v0.2 spec §11, reproduced in `okf-spec-and-ecosystem.md` §2.3:

| # | Test | Source |
|---|------|--------|
| 1 | Every non-reserved `.md` file has parseable YAML frontmatter | v0.2 §11 |
| 2 | Every such frontmatter block has a non-empty `type` | v0.2 §11 |
| 3 | Present reserved files follow `index.md` (§8) and `log.md` (§9) structures | v0.2 §11 |

**Evidence** — The v0.2 spec defines two reserved filenames that MUST NOT be used
as concept documents: `index.md` and `log.md` (v0.2 §3.1, `okf-spec-and-ecosystem.md`
§2.1). `index.md` carries no frontmatter except the bundle-root version
declaration; `log.md` uses `YYYY-MM-DD` date headings with newest-first entries
(§7, §9).

**Conditional producer obligations (Evidence — v0.2 §§3.1, 5.1, 5.2, 7, 9, 10.2):**

| Condition | Obligation |
|-----------|------------|
| A reserved filename is present | MUST NOT be used as a concept document |
| `log.md` is present | Date headings MUST use `YYYY-MM-DD` |
| A `sources` entry is present | MUST include `resource`; `id` is SHOULD |
| A `generated` mapping is present | MUST include `by`; `at` is optional |
| `type: Attested Computation` | MUST include `runtime` |
| Human author/confirmer | MUST use `human:` actor prefix |

### 2.2 Existing OKF validators

**Evidence** — Ecosystem analysis in `okf-spec-and-ecosystem.md` §4.2:

| Validator | Description | Target | Source |
|-----------|-------------|--------|--------|
| **okflint** (Python) | 18 rules, 3 tiers (Core/Profile/Hygiene), v0.2 partial, manifest profiles, Obsidian wikilink resolution, index generation | v0.1/v0.2 | github.com/mattdav/okflint |
| **@copperbox/okf-mcp** | `validate_bundle` over MCP transport | v0.1/v0.2 | npm: @copperbox/okf-mcp |
| **caedora-mcp** | `lint_bundle` over MCP transport | v0.1 | npm: caedora-mcp |
| **openknowledgeformat.com** | Browser-based frontmatter validator | v0.1 | openknowledgeformat.com |
| **fabricioctelles validate.sh** | 3 core conformance checks, zero dependencies | v0.1 | github.com/fabricioctelles/skills |

**Inference:** okflint is the most mature deterministic validator with partial v0.2
support. `@copperbox/okf-mcp` exposes validation as an MCP tool. No tool fully
validates all v0.2 conditional obligations (trust tiers, `sources` credibility
signals, lifecycle fields).

**Evidence** — okflint supports v0.2 trust/lifecycle fields only partially
(`okf-spec-and-ecosystem.md` §4.4).

### 2.3 JSON Schema for YAML frontmatter

**Evidence** — JSON Schema (draft 2020-12, `json-schema.org`) provides a
vocabulary for annotating and validating JSON documents. It defines `type`,
`properties`, `required`, `items`, `$ref`, `pattern`, `enum`, and conditional
subschemas (`if/then/else`) that can validate YAML frontmatter after
YAML→JSON conversion.

**Evidence** — The community remark-lint plugin `remark-lint-frontmatter-schema`
by JulianCataldo validates YAML frontmatter against a JSON Schema, showing this
pattern is proven in Markdown linting workflows (`remarkjs/remark-lint` community
rules list).

**Candidate default:** Define an OKF v0.2 JSON Schema covering:
- Required `type` (non-empty string)
- Optional `title`, `description`, `resource` (string), `tags` (list of strings)
- `sources` array with required `resource` per entry
- `generated` with required `by`, optional `at`
- `verified` with proper list normalization
- `status` enum `draft | stable | deprecated`
- `stale_after` date string `YYYY-MM-DD`
- Conditional: `type: Attested Computation` → required `runtime`

**Decision required:** Whether to publish this schema as the canonical OKF v0.2
schema, or treat it as a non-normative validation aid.

### 2.4 Markdown-level linting

**Evidence** — Two major Markdown linting ecosystems exist:

1. **markdownlint (Node.js):** 50+ rules on `micromark`/CommonMark parser, tags for
   grouping (`headings`, `links`, `tables`, `whitespace`), inline disable/enable
   comments, custom rules, VS Code + pre-commit + GitHub Action integrations
   (`github.com/DavidAnson/markdownlint`). Key rules relevant to migration: MD042
   (no-empty-links), MD051 (link-fragments valid), MD052 (reference links/images
   need defined label), MD053 (unused link/image reference definitions), MD001
   (heading increment), MD024 (no duplicate headings).

2. **remark-lint (Node.js):** ~70 rules on unified/mdast AST, presets (consistent,
   recommended, markdown-style-guide), community rules including
   `remark-lint-frontmatter-schema`, `remark-lint-no-dead-urls`,
   `remark-lint-are-links-valid`. Built on remark/unified ecosystem
   (`github.com/remarkjs/remark-lint`).

**Inference:** Both can catch migration artifacts: broken Markdown syntax,
malformed links, duplicate headings, missing blank lines, inconsistent
formatting. markdownlint has better CI/integration support; remark-lint has
better community rule extensions including frontmatter-schema.

**Candidate default:** Run markdownlint with a minimal ruleset (MD042, MD051,
MD052, MD001, MD024) as a post-migration CI check. Offer remark-lint with
`remark-lint-frontmatter-schema` as an alternative for projects already in the
unified ecosystem.

---

## 3. L2 — Completeness Verification

### 3.1 File-count and content-size parity

**Evidence** — No OKF-specific completeness tool exists. The pattern is well
established in migration tooling:

- Pandoc's test suite (`jgm/pandoc/test/`) uses paired native-format test
  cases: each format has a source file (e.g., `*-reader.txt`) and a canonical
  `.native` representation. Correctness is `pandoc --to native` matching the
  expected `.native` file. This is a **reference-oracle** pattern: convert to
  a known-good intermediate and compare.

- `git diff --stat` provides a coarse completeness signal: file count, total
  additions/deletions, binary file presence.

**Candidate default (Inference):**

Completeness metrics to compute:

| Metric | How | Warning threshold |
|--------|-----|-------------------|
| **File count parity** | Count non-index, non-log `.md` files in source manifest vs migrated bundle | Any mismatch |
| **Content size parity** | Sum of body content length (excluding frontmatter) source vs migrated | >5% deviation |
| **Attachment parity** | Count binary/asset files by extension source vs migrated | Any missing or extra |
| **Frontmatter presence** | Count of files with missing `type` (conformance gap) | >0 |
| **Description coverage** | Count of concepts with `description` field | <80% covered |

### 3.2 Manifest-based verification

**Inference — Candidate default:** Generate a source manifest (CSV or JSON)
during the export/extraction phase listing every source item: path, title, type
hint, attachment references, checksum. After migration, cross-reference each
manifest entry against the migrated bundle. Flag:

- Source items with no corresponding migrated concept
- Migrated concepts with no source origin (potential orphan or wrongly-attributed content)
- Content size delta per item exceeding threshold

### 3.3 Checksum-based integrity

**Candidate default:** For binary attachments (images, PDFs), compute SHA-256
checksums on source and migrated copies. This is a well-understood pattern from
backup and replication tooling. Not applicable to textual content where format
conversion may produce semantically equivalent but byte-different output.

---

## 4. L3 — Link Integrity Checking

### 4.1 Internal link resolution

**Evidence** — OKF v0.2 defines two link forms (§6, `okf-spec-and-ecosystem.md` §2.1):
- Absolute (bundle-relative): `[label](/path/to/concept.md)` — recommended
- Relative: `[label](./neighbor.md)` — standard Markdown

**Evidence** — OKF v0.2 normatively states: "Consumers MUST tolerate broken
links. A link to a non-existent target may represent not-yet-written knowledge"
(§6).

**Inference:** Link checking for an OKF bundle must distinguish between:
1. **Broken internal links** — link target does not exist on filesystem, resolution fails
2. **Broken link fragments** — target file exists but `#heading` fragment not found
3. **Potentially-intentional broken links** — may represent planned/wip concepts

**Candidate default:** Check all bundle-internal `.md`→`.md` links and report as
warnings, not errors (per spec). For link fragments, parse headings from target
files and validate `#fragment` references.

### 4.2 External link checking

**Evidence — Three major tools exist:**

1. **markdown-link-check** (Node.js, 712 stars): Extracts links from Markdown
   text, checks HTTP status (200 OK = alive). Configurable: timeout, HTTP
   headers, ignore patterns, replacement patterns, `aliveStatusCodes`,
   retry-on-429, JUnit reporter. Available as CLI, API module, pre-commit hook,
   GitHub Action, Docker image. Supports `<!-- markdown-link-check-disable -->`
   inline comments (`github.com/tcort/markdown-link-check`).

2. **htmltest** (Go, 378 stars): Tests generated HTML for broken links, images,
   scripts, meta tags, favicons, anchors. Not Markdown-native but relevant for
   bundles rendered to HTML. YAML config, external URL caching (`refcache.json`),
   per-document or per-file checking. Checks: `<a href>`, `<link>`, `<img src>`,
   `<script src>`, external HTTP status, internal hash fragments, HTTPS
   enforcement, alt attributes (`github.com/wjdp/htmltest`). Reportedly checked
   2000+ files in 8.6s vs html-proofer's 3+ minutes.

3. **remark-lint-no-dead-urls** (community rule): Checks external links within
   the remark/unified pipeline (`github.com/davidtheclark/remark-lint-no-dead-urls`).

4. **remark-lint-are-links-valid** (community rule): Checks link reachability
   and uniqueness (`github.com/wemake-services/remark-lint-are-links-valid`).

**Candidate default:** Use `markdown-link-check` for external link validation
in post-migration CI. Configure `aliveStatusCodes: [200, 301, 302]` and ignore
patterns for internal bundle-relative links (which need separate resolution).
Run with `--reporters junit` for CI integration.

### 4.3 Link rewriting validation

**Inference:** For migrations that rewrite links (e.g., `[[wikilink]]` →
`[label](./path.md)`, or Notion links → bundle-relative), validate:

- Every source link has a corresponding link in the migrated document
- Rewritten internal links resolve to existing target files
- No link targets point outside the bundle without annotation
- External URLs are preserved unchanged (not truncated, not encoded)

---

## 5. L4 — Semantic Fidelity (Spot-Checking)

### 5.1 Sample-based manual review

**Candidate default:** Randomly sample N concepts from the migrated bundle (N
= max(10, 10% of total)) and manually compare against source. Check:

- Title, description match source
- Key facts/figures preserved
- Structural elements (tables, code blocks, lists) intact
- Attribution (sources, citations) preserved
- Body prose substantially equivalent

Flag a concept as `needs-review` if any check fails. Sample size scales with
bundle size but caps at 50.

### 5.2 Embedding-based similarity scoring

**Inference:** Compute text embeddings (e.g., all-MiniLM-L6-v2) for source and
migrated content bodies. Cosine similarity < 0.85 flags a potential semantic
drift. This is a **regression test pattern**: establish a similarity baseline
from a golden-source migration, then detect regressions when the migration
pipeline changes.

**Evidence (prior art):** Embedding-based similarity is used in:
- RAG pipeline evaluation (answer faithfulness)
- Translation quality assessment (source↔target cosine similarity)
- Document deduplication
- Semantic search relevance scoring

**Candidate default:** Embedding similarity as an optional check, not a gating
criteria. Threshold varies by content type (prose > 0.85, code blocks > 0.95,
tables > 0.90). Embedding-based scoring is cheap (~100ms per document) and
automated, but it correlates with lexical overlap as much as semantic similarity.

### 5.3 LLM-assisted review

**Inference:** An LLM can compare source and migrated concept documents and
report:

- Facts dropped, added, or altered
- Structure changes (list → paragraph, table → code block)
- Link target mismatches
- Formatting loss (bold, italic, headings level)
- Trust-tier appropriateness (does a machine-generated concept claim
  `human-reviewed`?)

**Candidate default:** LLM-assisted review as an optional approval gate for
high-value or high-risk concepts (security, compliance, critical domain
knowledge). The LLM should produce a structured checklist per concept, not a
freeform opinion. This is not a substitute for manual review but a triage aid.

**Decision required:** Whether LLM review is a default gate or an opt-in for
specific content classes.

---

## 6. L5 — Diff-Based Review Strategies

### 6.1 Git-native diff

**Evidence:** OKF bundles are designed to be diffable in version control
(git-native, plain Markdown in directory hierarchy — `okf-spec-and-ecosystem.md` §2.1).
The OKF reference agent enforces canonical key ordering for consistent diffable
output (`03-reference-agent.md`).

**Candidate default — three diff views:**

| View | Command | What it shows |
|------|---------|---------------|
| **File tree** | `git diff --stat` | Files added, removed, modified; total line counts |
| **Content diff** | `git diff` | Full line-level changes; best for detailed review |
| **Name-only** | `git diff --name-status` | Classifies files: Added (A), Modified (M), Deleted (D), Renamed (R) |

**Inference:** For a migration review, the key signals in `git diff --stat`:
- Deleted source files with no corresponding migrated files → content loss
- New files with no source counterpart → migration artifacts or wrongly-scoped content
- Unusually large diffs in a single file → bulk-import that should be split
- Zero-diff files → content that migrated verbatim (no format conversion needed)

### 6.2 Structured frontmatter diff

**Inference:** A standard `git diff` is poor for YAML frontmatter changes
because key reordering and insignificant whitespace changes produce noise.
A structured frontmatter diff should:

1. Parse YAML frontmatter from source and migrated files
2. Sort keys canonically (or use the reference agent's `_PREFERRED_KEY_ORDER`)
3. Deep-compare the resulting objects
4. Report only semantic differences (not key ordering or whitespace)

**Candidate default:** Implement a frontmatter-only diff as a preprocessing step
before the full-content git diff. This catches: missing `type`, missing
`title`/`description`, `sources` truncation, trust-tier loss.

### 6.3 Content-aware Markdown diff

**Inference:** Line-level `git diff` can produce noise when Markdown is
reformatted (e.g., line wrapping, list punctuation style). Content-aware diffs:

- Ignore whitespace: `git diff -w` or `--ignore-all-space`
- Ignore blank lines: tolerate `\n\n` vs `\n\n\n`
- Use `diffsitter` (AST-based diff, tree-sitter grammars) for semantic
  comparison of Markdown structures rather than text lines
- Use `semanticdiff` or `grapheme-splitter` for Unicode-aware comparison

**Candidate default:** `git diff -w` as the default reviewer view, with a
content-aware fallback for files where whitespace changes dominate the diff.

---

## 7. Regression Test Patterns for Format Converters

### 7.1 Pandoc's test oracle approach

**Evidence:** Pandoc's test suite (`jgm/pandoc/test/`) is the canonical example
of format conversion testing. Key patterns:

- **Paired source/expected files:** Each reader test has source
  (`*-reader.txt`) + expected canonical representation (`*-reader.native`).
- **Canonical intermediate format (`.native`):** Pandoc converts everything
  to its internal AST representation (native), then compares against the
  expected native format. This isolates reader correctness from writer
  correctness.
- **Per-format test directories:** `docx/`, `epub/`, `ipynb/`, `pptx/`,
  `rtf/`, `media/` — each format gets its own test suite.
- **Golden-file regression:** Any change that alters the `.native` output
  for an existing input is a regression.

**Inference for OKF migration:** Apply the same pattern:
1. Define a canonical intermediate representation (could be a simplified
   Markdown with YAML frontmatter, or the OKF document model as JSON).
2. For each source format (Notion MD, Obsidian, raw MD, CSV, MDX):
   - Create a small test corpus (10-20 representative files)
   - Migrate each to the canonical intermediate
   - Store the expected output as a "golden file"
   - On every migration pipeline change, re-run and diff against golden files
3. Golden files are committed to the repository. Test failures = regression.

### 7.2 Round-trip testing

**Inference:** Not applicable to OKF (there is no "back-translation" target),
but worth noting: pandoc tests round-trip conversion (A→B→A) to verify no
information loss. For OKF migration, the equivalent is **migration replay**:
migrate the same source corpus with multiple versions of the migration pipeline
and produce a diff report.

### 7.3 Snapshot/inline test patterns

**Evidence:** Many JavaScript/TypeScript projects use inline snapshot testing
(Jest, Vitest) where the first run writes expected output to a `.snap` file and
subsequent runs compare. This is a lighter-weight variant of golden-file testing
with less manual file management.

**Candidate default:** Use golden files for stable, committed regression tests;
use snapshots for rapid prototyping of new migration rules (until stabilized,
then promote to golden files).

---

## 8. Approval Gates Before Accepting Migration

### 8.1 Gate hierarchy

**Inference — Candidate default:**

```
┌─────────────────────────────────────────────────────┐
│ GATE 1: Conformance (L1)                            │
│ ├─ All .md files have parseable YAML frontmatter    │
│ ├─ All frontmatters have non-empty `type`           │
│ ├─ Reserved files follow §8/§9 structure            │
│ └─ FAILURE → BLOCK (cannot proceed)                 │
├─────────────────────────────────────────────────────┤
│ GATE 2: Completeness (L2)                           │
│ ├─ File count parity ≥ tolerance                    │
│ ├─ Content size parity ≥ tolerance                  │
│ ├─ Attachment parity                                 │
│ └─ FAILURE → BLOCK (content loss suspected)         │
├─────────────────────────────────────────────────────┤
│ GATE 3: Link Integrity (L3)                         │
│ ├─ Internal links resolve to existing files         │
│ ├─ Link fragments resolve to existing headings      │
│ ├─ External links are alive (HTTP 2xx/3xx)          │
│ └─ FAILURE → WARN (consumer MUST tolerate per spec) │
├─────────────────────────────────────────────────────┤
│ GATE 4: Diff Review (L5)                            │
│ ├─ Frontmatter diff shows no missing type/title     │
│ ├─ Content diff is reviewable and reasonable        │
│ └─ FAILURE → HUMAN DECISION                         │
├─────────────────────────────────────────────────────┤
│ GATE 5: Semantic Spot-Check (L4)                    │
│ ├─ Sample-based manual review passes                │
│ ├─ Embedding similarity above threshold             │
│ ├─ LLM review (opt-in) passes                       │
│ └─ FAILURE → HUMAN DECISION                         │
└─────────────────────────────────────────────────────┘
```

### 8.2 Blocking vs advisory

| Gate | Knowledge-only project | Code-backed project |
|------|------------------------|---------------------|
| G1 (Conformance) | **Blocking** | **Blocking** |
| G2 (Completeness) | **Blocking** | Advisory nudge |
| G3 (Link integrity) | Warning (per spec) | Warning (per spec) |
| G4 (Diff review) | **Blocking** | Advisory nudge |
| G5 (Semantic) | Sample review required | Optional |

**Inference:** Based on `workspace-topology-and-routing.md` §5.5: knowledge-only
projects have blocking pre-PR checks because "OKF IS the source of truth";
code-backed projects have non-blocking advisory nudges.

### 8.3 Trust-tier gating of review

**Candidate default:** Concepts with `verified: human:` require sample-based
manual verification of migrated content (the human verified the original, so the
migration must preserve what was verified). Concepts with no `verified` or only
`process:` verification can rely on automated gates alone.

---

## 9. Tool Implementation Candidates

### 9.1 What exists (can be composed)

| Capability | Existing tool | Coverage |
|-----------|---------------|----------|
| OKF conformance | okflint, @copperbox/okf-mcp | Partial v0.2 |
| Markdown syntax lint | markdownlint, remark-lint | Full |
| YAML validation | JSON Schema + ajv/yup | Full |
| External link check | markdown-link-check | Full |
| Internal link check | Custom (no ready tool for bundle-relative `.md` paths) | None |
| Completeness metrics | Custom (file count, size diff) | None |
| Embedding similarity | sentence-transformers, openai embeddings | Pattern proven |
| Diff review | git diff, diffsitter | Full |

### 9.2 What needs building

**Inference — Three missing components for a complete validation pipeline:**

1. **OKF link resolver:** Walks bundle tree, extracts all `[label](path.md)`
   links, resolves relative to containing file's directory, checks target
   existence on filesystem, validates `#heading` fragments. Must handle:
   absolute bundle-relative (`/path/to/concept.md`), relative
   (`./concept.md`, `../sibling.md`), and `.md` extension variance.

2. **Completeness reporter:** Takes source manifest (from export phase) +
   migrated bundle, produces: file-count delta, content-size delta, orphan
   detection, attachment checksum report.

3. **Frontmatter structured differ:** Parses YAML frontmatter from source +
   migrated, deep-compares, reports only semantic field-level diffs.

**Decision required:** Whether these should be standalone scripts (Python
stdlib, similar to `validate.sh`), integrated into an existing tool, or exposed
as MCP tools.

---

## 10. CUE-Style Validation Lattice (Future Direction)

**Evidence:** CUE's value lattice (`cuelang.org/docs/concept/the-logic-of-cue/`)
defines a partial order where types *are* values and every two values have a
unique greatest lower bound (meet) and least upper bound (join). This maps
naturally to OKF validation:

- **Subsumption as conformance check:** An OKF bundle is an instance of the OKF
  schema if the schema subsumes the bundle. Backwards compatibility is the
  inverse: a new schema subsumes the old one.
- **Constraint merging as multi-source validation:** `schema & frontmatter_rules
  & link_rules & content_rules` composes independent validators without order
  dependence.
- **Error as bottom (⊥):** Conflicting constraints (e.g., missing required
  `type` + required `type: Attested Computation`) resolve to ⊥, a single
  bottom value. This yields unified error reporting.

**Inference:** This is a longer-term architectural direction, not an immediate
tool. CUE is a separate language with a learning curve. The migration validator
should use simpler composition first (JSON Schema + per-check scripts) and
consider CUE if multi-source constraint pipelines become a core need.

---

## 11. Source Index

### Primary Web Sources (fetched July 2026)
- OKF v0.2 spec — via `okf-spec-and-ecosystem.md` §2.2–2.4 (local research)
- markdownlint — `github.com/DavidAnson/markdownlint`
- markdown-link-check — `github.com/tcort/markdown-link-check`
- remark-lint — `github.com/remarkjs/remark-lint`
- htmltest — `github.com/wjdp/htmltest`
- pandoc test suite — `github.com/jgm/pandoc/tree/main/test`
- JSON Schema getting started — `json-schema.org/learn/getting-started-step-by-step`
- CUE value lattice — `cuelang.org/docs/concept/the-logic-of-cue/`

### Local Research Sources (this repo)
- `docs/research/okf-spec-and-ecosystem.md` — OKF v0.1/v0.2 specs, conformance rules (§2.3), ecosystem validators (§4.2), reference agent patterns (§3.1), underspecified areas (§2.4)
- `docs/research/workspace-topology-and-routing.md` — Trust-tier gates (§5.5), per-project validation blocking vs advisory
- `docs/research/03-reference-agent.md` — Canonical key ordering, validation-at-write-time, permissive consumption model (referenced from okf-spec-and-ecosystem)
