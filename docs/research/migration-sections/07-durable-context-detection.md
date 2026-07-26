# 07 — Durable Context Detection: Distinguishing Non-Recoverable Knowledge from Code-Repeat Documentation

> Research date: July 2026
> Primary sources: ADR format (Nygard 2011, AWS PG, adr.github.io), design rationale literature (Zdun et al. 2014, Lee 1997, Wikipedia design rationale), software documentation taxonomy (Wikipedia), program comprehension (Storey 2005, Letovsky 1987), Matt Pocock transcript (see §1 of lightweight-durable-context.md), AI coding platform documentation (see durable-context-platforms.md), CONTEXT.md definitions

### Claim labels

- **Evidence** — directly supported by the cited primary source
- **Inference** — interpretation of cited evidence; not established by the source
- **Candidate default** — proposed operational value; requires benchmarking
- **Decision required** — unresolved semantics an implementation must not assume

---

## 1. Documentation Type Taxonomy — A Recoverability Spectrum

**Evidence:** Wikipedia's Software documentation taxonomy identifies five canonical types: Requirements documentation, Architecture design documentation, Technical documentation (code/API), End user documentation, and Marketing documentation. [Wikipedia: Software documentation, "Types" section]

**Evidence:** The ADR format (Nygard 2011) defines a distinct category — one ADR per "architecturally significant" decision capturing Context, Decision, Status, and Consequences. Nygard explicitly argues these are NOT code documentation: "Understanding why the team made the decision makes it easier for other team members to adopt the decision, and prevents other architects who weren't involved in the decision-making process to overrule that decision in the future." [Nygard 2011, "Context" section]

**Evidence:** Pocock (2026) categorizes documentation into three space: alternatives considered (ADRs), domain language (glossary), and navigation (thin index). He argues against any documentation that creates a "dual-source-of-truth" with code. [lightweight-durable-context.md §1, transcript 00:39–01:57]

**Evidence:** The AI platform documentation collectively warns against documenting structural facts. Claude Code's `/doctor` (v2.1.206+) identifies and trims CLAUDE.md content "Claude can derive from code." Windsurf docs: "no need to add generic rules (e.g. 'write good code'), as these are already baked into Cascade's training data." [durable-context-platforms.md §2, §7]

**Inference:** A recoverability spectrum emerges, ordered from code-inferable to irrecoverable:

### Spectrum: Code-Recoverable → Semi-Recoverable → Durable Context

| Recoverability | Content Type | What code provides | What code DOES NOT provide |
|---|---|---|---|
| **Code-recoverable** | API reference docs, function signatures, type definitions | Names, signatures, parameter lists, return types, invariants expressed in types | Why this API exists, what problem it solves, edge-case behavior not tested |
| **Code-recoverable** | Class/component hierarchy diagrams | Abstract syntax tree, import graph, class inheritance | Architectural intent behind the decomposition, why this layering was chosen |
| **Code-recoverable** | Directory structure documentation | Filesystem tree | Rationale for the module boundaries, what each directory conceptually contains |
| **Code-recoverable** | Configuration value listings | Config files, environment variable declarations | Why these values were chosen, constraints from external systems, alternatives tested |
| **Code-recoverable** | Build/test command listings | package.json, Makefile, pyproject.toml, CI configs | Historical context for tool choices, migration plans from old toolchains |
| **Code-recoverable** | Behavior descriptions testable from code | Test assertions, property-based test invariants | Why the behavior was specified this way, rejected specifications |
| **Semi-recoverable** | Architecture overviews, component interaction diagrams | Dependency graph, call graph, IPC patterns | Architectural style justification (why microservices not monolith), explicit non-goals, technology selection rationale |
| **Semi-recoverable** | Domain model (structural) | Entity names, field names, relationship cardinalities from ORM/DB schema | Domain term definitions, ambiguous term disambiguation, conceptual boundaries |
| **Durable context** | Design rationale (ADRs) | None — code shows the outcome only | Forces considered, alternatives evaluated, rejected options, trade-off analysis, decision drivers |
| **Durable context** | Domain glossary | Some term names appear in code identifiers | Precise definitions, scope of meaning, non-obvious mappings to domain concepts |
| **Durable context** | Constraints/invariants | Some expressed in types or tests | Business rules, regulatory compliance requirements, policy constraints, performance SLAs, security boundaries |
| **Durable context** | Rejected alternatives with reasons | None — only the chosen design remains | What was considered and WHY it was rejected, avoiding future rediscovery of dead ends |
| **Durable context** | Operational runbooks | Some scripts may exist | Incident patterns, escalation paths, known failure modes not exercised in tests, manual recovery procedures |
| **Durable context** | Troubleshooting guides | Stack traces and logs are machine-readable | Symptom→cause mappings, common misconfigurations, workarounds, historical bug context |
| **Durable context** | Navigation/metadata (Maps of Content) | Directory structure | Conceptual groupings, topic relationships, curator judgment about what's important |

**Evidence:** Zdun et al. (2014) identify five sustainability criteria for architectural decisions: strategic (long-term impact), measurable/manageable (objective criteria), achievable/realistic (pragmatic, not over/under-engineered), rooted in requirements (domain/context grounded), and timeless (based on durable knowledge). [Zdun et al. 2014, "Decision Sustainability Criteria" section] These criteria themselves encode what code cannot express.

**Inference:** The core distinguishing criterion: **If the information can be mechanically extracted from the codebase (name resolution, type analysis, dependency graphs, AST traversal) and the code is authoritative for that fact, then it is code-recoverable.** If the information expresses intent, context, alternatives, or domain meaning not encoded in any single code artifact, it is durable context.

---

## 2. Classification Heuristics for Migration Filtering

### 2.1 Signals of Code-Recoverable Content

**Evidence:** Claude Code's `/doctor` implementation (v2.1.206+) provides the most explicit operational precedent — it "identifies content Claude can derive from the codebase and proposes trimming it from CLAUDE.md." [durable-context-platforms.md §2]

**Candidate default — code-recoverable signals (progressive confidence):**

| Signal | Confidence | Basis |
|---|---|---|
| File contains function/class/method signatures matching code | High | Mechanical verification possible via AST comparison |
| File lists directory structure or file hierarchy | High | `tree`/`ls` output comparison |
| File contains import statements or dependency lists | High | `package.json` / `requirements.txt` comparison |
| File names specific code artifacts (functions, classes, files) by exact identifier | Medium-High | Can be verified via grep against codebase; may still encode non-obvious relationships |
| File contains version strings, config values, or environment variables | Medium-High | Can diff against actual configs |
| File documents "how to build/test/run" from standard tooling | Medium | Package manager commands are inferable from tool configs; custom scripts may not be |
| File describes behavioral properties testable from code | Medium | Test coverage analysis; descriptions of untested behavior are durable |
| File uses backtick code references matching code identifiers | Medium | Pattern match; surrounding prose may add non-recoverable rationale |
| File has frontmatter `type` matching a code artifact category (e.g., `type: API Reference`) | Low-Medium | Taxonomy hint, not content signal |

**Evidence:** The Wikipedia software documentation taxonomy notes that "code documents are often organized into a reference guide style, allowing a programmer to quickly look up an arbitrary function or class" and that tools like Doxygen, Javadoc extract these directly from source. [Wikipedia: Software documentation, "Technical documentation" section]

**Inference:** Javadoc/Doxygen-style API reference is the canonical code-recoverable content type — it is mechanically generated from comments co-located with code, and the structural content (signatures, parameters, return types) comes from the compiler/parser, not the document author.

### 2.2 Signals of Durable Context

**Evidence:** The ADR format's five sections (Context, Decision, Status, Consequences — plus the earlier Nygard "Title" field) each target non-recoverable knowledge. The "Context" section captures forces and tensions. The "Consequences" section captures trade-offs and future implications. Neither can be inferred from code structure. [Nygard 2011; AWS Prescriptive Guidance ADR Process]

**Evidence:** The design rationale literature formalizes what content is non-recoverable: "the reasons behind a design decision, the justification for it, the other alternatives considered, the trade-offs evaluated, and the argumentation that led to the decision." [Wikipedia: Design rationale, "Overview" section; Lee 1997]

**Evidence:** Zdun et al.'s (WH)Y statement format explicitly ties rationale to requirements: "In the context of <use case/user story u>, facing <concern c> we decided for <option o> to achieve <quality q>, accepting <downside d>." [Zdun et al. 2014, "Initially Apply Lean, Minimalistic Decision Documentation" section]

**Candidate default — durable context signals (progressive confidence):**

| Signal | Confidence | Basis |
|---|---|---|
| File contains explicit rationale or motivation language ("because", "we chose X over Y", "in order to") | High | Linguistic pattern matching; semantic analysis further improves precision |
| File enumerates alternatives considered with pros/cons | High | Structural pattern (lists with comparison operators); code only shows the chosen one |
| File defines domain terms with precise, non-code-extractable definitions | High | Domain glossary content — names may appear in code but meanings often don't |
| File has frontmatter `type: Decision`, `type: ADR`, `type: Term`, or equivalent | Medium-High | Taxonomy hint; still requires content validation |
| File contains architecture style justification ("why monolith", "why event-driven") | Medium-High | Code structure implies these choices but not the reasoning |
| File documents constraints NOT enforceable in code (business rules, compliance, regulatory) | Medium-High | By definition, these live outside the executable system |
| File documents rejected alternatives with reasoning | High | Code preserves no trace of rejection |
| File contains narrative about historical context, migration plans, or roadmap intent | Medium-High | Cannot be deduced from current code state |
| File documents known failure modes, troubleshooting steps, or operational procedures | Medium-High | These are experiential knowledge; code may encode recovery logic but not symptoms or common pitfalls |
| File has `resource` frontmatter pointing to an external source | Low-Medium | Useful metadata but doesn't guarantee content durability |
| File has `sources` frontmatter with credibility signals | Low-Medium | Provenance signal, not content signal |
| File contains stakeholder names, approval records, or decision timestamps | Medium | Historical/process metadata — not code-recoverable |
| File uses comparative, evaluative, or normative language ("prefer X", "avoid Y", "should VS must") | Medium-High | Linguistically distinct from declarative code-mirroring prose |

**Evidence:** The (WH)Y format provides a template-level detection signal: any content matching the pattern "In the context of..., facing..., we decided for..., to achieve..., accepting..." is durable context by construction. [Zdun et al. 2014]

### 2.3 Boundary Cases

**Decision required:** The following boundary cases require explicit classification policy:

| Boundary Case | Code-Recoverable Aspects | Durable Aspects | Recommended Default |
|---|---|---|---|
| **API reference docs** | Function signatures, parameter names, return types | Why the API exists, design rationale for parameter choices, usage constraints | Classify as code-recoverable unless rationale/trade-off prose exceeds 30% of content |
| **README with setup instructions** | Dependency list from `package.json` | "Why these dependencies," architecture overview, troubleshooting | Partial migration — extract rationale sections, discard install commands derivable from tool configs |
| **Architecture decision records** | Chosen implementation (visible in code) | Context, forces, alternatives, consequences | **Always migrate** — ADRs are canonical durable context |
| **Domain model diagrams** | Entity relationships derivable from DB schema | Conceptual boundaries, bounded contexts, rationale for aggregates | Migrate conceptual prose, discard structural diagrams regeneratable from code |
| **Coding conventions** | Rules like "use tabs" may be inferable from `.editorconfig` | "Why tabs over spaces," historical convention migration plan, exceptions | Migrate rationale and exceptions; config-equivalent rules are discardable |
| **Deployment runbooks** | Automated deployment steps in CI | Manual interventions, rollback procedures, incident response patterns | Migrate manual/decision portions, not automatable scripts |
| **Test plan documents** | Test coverage is code-detectable | Test strategy (why these tests, test philosophy, untestable assumptions) | Migrate strategy/rationale, not test case enumeration |

**Evidence:** The CONTEXT.md definition of durable context explicitly excludes "documentation of the code, prose mirror" and includes "domain language, intent, rationale, constraints, invariants, or workflows without duplicating implementation." [CONTEXT.md]

---

## 3. Classification Methodology — Prior Art

### 3.1 Linguistic Heuristics

**Inference:** Technical prose that mirrors code uses distinct linguistic patterns from durable context prose:

**Code-mirroring patterns (likely recoverable):**
- Declarative/descriptive: "The `UserService` class has methods `create`, `update`, `delete`..."
- Enumeration: "The project has the following modules: auth, billing, notifications..."
- Signatures: "`authenticate(token: string): Promise<User>` returns the authenticated user..."
- Direct reference to code artifacts by fully-qualified name
- Present-tense descriptions of current state without judgment or alternatives

**Durable context patterns (likely non-recoverable):**
- Causal/rationale: "We chose... because...", "In order to... we decided..."
- Counterfactual: "We considered... but rejected it because..."
- Evaluative: "X is preferable to Y for this use case because..."
- Temporal: "This will be migrated to... once..."
- Constraint-based: "Must not exceed...", "Required by SOC2..."
- Domain-defining: "In this project, a 'Session' means..."
- Normative: "Should prefer... over... when..."

**Evidence:** The (WH)Y format demonstrates this linguistically — it forces the presence of rationale language ("to achieve", "accepting") that distinguishes durable from code-mirroring prose. [Zdun et al. 2014]

**Decision required:** Whether to use LLM-based semantic classification, regex-based keyword matching, or a hybrid approach. LLM classification is more accurate for nuanced prose but introduces non-determinism and cost. Regex classification is fast and reproducible but produces false negatives for implicit rationale.

### 3.2 Structural Heuristics (Frontmatter/Format-Based)

**Evidence:** OKF v0.2 provides several frontmatter fields that directly signal durable context content:
- `type: Decision`, `type: ADR` → intentional durable context
- `verified` with `human:` prefix → human-reviewed, higher trust
- `sources` with credibility signals → provenance chain
- `stale_after` → content with a known review deadline (often rationale that ages)

[okf-spec-and-ecosystem.md §2.2]

**Inference:** OKF bundles that already use these mechanisms have self-classified their durable content. Migration from non-OKF sources lacks this metadata.

**Candidate default:** During migration, auto-populate `type` based on content classification. Reserve `type: Decision` for rationale content, `type: Term` for glossary entries, `type: Overview` for architectural overviews, `type: Reference` for external-source pointers.

### 3.3 Cross-Referencing Heuristics (Static Analysis)

**Candidate default — operational detection workflow:**

```
1. EXTRACT identifiers from candidate document (regex for `backtick code`, CamelCase, snake_case)
2. MATCH against codebase AST (function names, class names, module paths, type names)
3. If >60% of substantive paragraphs contain ≥1 code-verifiable identifier match → CODE-RECOVERABLE
4. If document contains no code-verifiable identifiers → likely DURABLE (but may be high-level overview)
5. If document contains code identifiers but surrounding prose adds rationale/alternatives → HYBRID (extract rationale portions)
6. Apply linguistic heuristics (§3.1) to remaining ambiguous cases
```

**Evidence:** This approach is modeled on Claude Code's `/doctor` which "identifies content Claude can derive from the codebase and proposes trimming it." The ratio threshold (60%) is a **candidate default**, not validated. [durable-context-platforms.md §2]

### 3.4 Link Density and Direction Heuristics

**Inference:** Files that primarily link *to* code artifacts (source files, API endpoints) with descriptive text are more likely code-recoverable. Files that primarily link *to* other durable context documents (other ADRs, glossary terms, design docs) are more likely durable context themselves.

**Candidate default:** Compute the link-type ratio. If >50% of links point to files outside the documentation tree (to source code), flag as potentially code-recoverable. If >80% of links point within the documentation/knowledge bundle, treat as durable context cluster.

---

## 4. Code-Backed vs. Knowledge-Only Project Differences

**Evidence:** CONTEXT.md defines the distinction: "Code-backed project: code is authoritative for behavior, while OKF records durable context that cannot be recovered adequately from the code." vs. "Knowledge-only project: OKF bundle is the complete source of truth." [CONTEXT.md]

### 4.1 What's Durable in Each Mode

**Evidence:** The lifecycle research (§5.1 of lightweight-durable-context.md) establishes different operational patterns for each mode, built from platform documentation and community patterns.

| Aspect | Code-Backed Project | Knowledge-Only Project |
|---|---|---|
| **Source of truth** | Code is authoritative for executable behavior | OKF is the complete source of truth |
| **Glossary scope** | Only ambiguous terms. Code is the primary glossary. | Every term must be defined |
| **Rejected alternatives** | Durable — code cannot preserve these | Durable — but also the primary artifact |
| **Architecture rationale** | Durable for significant decisions (ADR threshold) | Durable and often the main content |
| **API reference** | Discardable — code IS the API reference | N/A — no code to recover from |
| **Build/test commands** | Semi-durable — `package.json` scripts are recoverable, custom build logic may not be | Durable — these are operational knowledge |
| **Directory structure docs** | Discardable — code IS the structure | Durable — directory IS the content structure |
| **Deployment procedures** | Semi-durable — CI config is recoverable, manual steps are durable | Durable — all procedures must be documented |
| **Troubleshooting guides** | Durable — experiential, not code-embedded | Durable — primary artifact |
| **Configuration documentation** | Discardable if config files have comments; durable for constraints and rationale | Durable — no executable config to recover from |

**Candidate default:** The classification threshold should differ by project mode:
- **Code-backed**: Default to DISCARD; require evidence of durability. A document must demonstrate that it contains rationale, constraints, domain meaning, alternatives, or intent not recoverable from code. The burden of proof is on migration.
- **Knowledge-only**: Default to MIGRATE; only discard content that is demonstrably auto-generated boilerplate, stale/corrupted, or structural duplicates.

---

## 5. Agent vs. Human Maintainability of Different Content Types

### 5.1 What Agents CAN Maintain

**Evidence:** From the platform analysis, agents demonstrate capability at:
- Generating index files from bundle structure (reference agent's `regenerate_indexes()`)
- Extracting structural information from code (Claude Code's `/doctor`, repo maps, codebase indexing)
- Writing and updating Markdown files (all platforms support this)
- Validating against format constraints (okflint, reference agent's `write_concept_doc()`)
- Cross-referencing documentation against code for drift detection
- Summarizing and synthesizing (auto-memory, topic files)

[durable-context-platforms.md; okf-spec-and-ecosystem.md §3]

### 5.2 What Agents CANNOT Reliably Maintain

**Evidence:** Agents lack:
- **Domain judgment**: Cannot independently determine if a domain term definition is correct without human verification
- **Intent verification**: Cannot verify that documented rationale matches actual human intent (can only verify consistency with code)
- **Stakeholder negotiation**: Cannot resolve conflicting requirements or approve trade-offs
- **Authority to reject**: Cannot independently reject a proposed architectural alternative without human criteria

**Evidence:** The OKF trust tier system (unverified → machine-confirmed → human-reviewed) explicitly encodes this capability boundary. Only `human:` actors can promote to `human-reviewed`. [okf-spec-and-ecosystem.md §2.2, Trust tiers]

### 5.3 Content-Type Maintainability Matrix

| Content Type | Agent Can Generate? | Agent Can Verify? | Agent Can Detect Drift? | Needs Human Review? |
|---|---|---|---|---|
| API reference (from code) | Yes (mechanical) | Yes (compare to code) | Yes (code change → diff) | No |
| Structural diagrams | Yes (code graph → diagram) | Yes (compare to code) | Yes (code change) | No |
| ADR (initial draft) | Yes (from design discussion context) | Partial (can verify consistency with code) | Partial (can detect if chosen design changed) | **Yes** — intent verification |
| Domain glossary (initial draft) | Yes (from code identifiers + context) | Partial (can check usage consistency) | **No** — can't detect meaning drift | **Yes** — domain expertise |
| Constraints documentation | Partial (can extract from tests, types, config) | Partial (can verify test coverage) | Partial (can detect if types changed) | **Yes** — business context |
| Rejected alternatives | Partial (can record, cannot invent) | **No** — "what wasn't chosen" has no code artifact to compare | **No** — nothing to drift against | **Yes** — completeness |
| Operational runbooks | Partial (from incident logs) | **No** — requires operational experience | **No** — requires operational validation | **Yes** — experiential |
| Troubleshooting guides | Partial (from bug tracker) | **No** — depends on user reports | **No** — requires field data | **Yes** — experiential |
| Navigation/MOCs | Yes (from link density analysis) | Yes (compare to actual bundle graph) | Yes (graph change) | No (can be auto-generated) |

**Candidate default:** Auto-classify content that agents can both generate AND verify as code-recoverable. Content requiring human review for verification is durable context.

---

## 6. Existing Tool Precedents

### 6.1 Claude Code `/doctor`

**Evidence:** Claude Code v2.1.206+ includes `/doctor` which "identifies content in checked-in CLAUDE.md files that Claude can derive from the codebase and proposes trimming suggestions." This is the closest existing implementation to automated durable-context detection. [durable-context-platforms.md §2]

**Inference:** The `/doctor` approach is keyword/pattern-based matching against code artifacts, not semantic understanding. It operates on the principle: "if the code can tell me this, the docs shouldn't duplicate it."

### 6.2 OpenCode `/init`

**Evidence:** OpenCode's `/init` "scans project, creates or improves AGENTS.md with build/lint/test commands, architecture notes, conventions, and references." It writes only what code inspection cannot adequately capture. [durable-context-platforms.md §1]

### 6.3 Kiso OKF Static Site Generator

**Evidence:** Kiso (`oak-invest/kiso`) is a Java tool that reads OKF bundles and generates static sites with llms.txt and sitemap.xml. It demonstrates a consumer-side view: it reads whatever frontmatter types exist and renders accordingly, without a fixed taxonomy. This permissive consumption model means classification can be advisory rather than blocking. [okf-spec-and-ecosystem.md §4.2]

### 6.4 Reference Agent's Four-Gate Web Enrichment Test

**Evidence:** The reference agent's web enrichment pass applies a four-gate test before minting new concepts from crawled pages. This is conceptually similar but in the reverse direction — judging whether external content is worthy of becoming OKF, rather than whether existing content is worthy of migration. [okf-spec-and-ecosystem.md §3.1; lightweight-durable-context.md §4.4]

---

## 7. Recommended Classification Algorithm

**Candidate default:** A two-phase approach: fast syntactic pre-filter followed by semantic validation for ambiguous cases.

### Phase 1: Syntactic Pre-Filter (fast, deterministic)

```
For each candidate document:

1. FRONTMATTER CHECK:
   - If type in {Decision, ADR, Term, Constraint, Runbook} → DURABLE (migrate)
   - If type in {API Reference, Schema, Example} → CODE-RECOVERABLE (discard)
   - If no type or unknown type → continue

2. IDENTIFIER DENSITY:
   - Extract all code artifact references (backtick, CamelCase, snake_case identifiers)
   - Match against codebase AST exports
   - If >60% of paragraphs contain ≥1 matched identifier → likely CODE-RECOVERABLE
   - If 0 matched identifiers → likely DURABLE

3. LINGUISTIC SIGNAL CHECK:
   - Count rationale signals per paragraph (because, chose, decided, in order to, rejected, preferred, must not, constraint)
   - Count declarative signals per paragraph (is, has, contains, consists of, includes, located in)
   - If rationale_ratio > 0.3 → DURABLE
   - If declarative_ratio > 0.7 AND identifier_density > 0.6 → CODE-RECOVERABLE

4. LINK ANALYSIS:
   - Classify link targets as code (source files), config, docs, or bundle-internal
   - If >50% code links → likely CODE-RECOVERABLE

5. CLASSIFY:
   - Clear DURABLE or CODE-RECOVERABLE → assign
   - Ambiguous → mark for Phase 2
```

### Phase 2: Semantic Validation (LLM-based, for ambiguous cases)

```
For each ambiguous document, prompt:

"Classify whether this document is:
 A) DURABLE CONTEXT — contains rationale, intent, alternatives, constraints, or domain
    meaning that cannot be recovered from the attached codebase
 B) CODE-RECOVERABLE — describes facts, structure, behavior, or configuration that can
    be mechanically extracted from the codebase
 C) HYBRID — contains both (identify durable sections for extraction)

Provide: classification, confidence (0-1), rationale, and for HYBRID: line ranges of durable sections."
```

**Decision required:** Whether to implement Phase 2 at all vs. relying solely on syntactic heuristics. LLM-based classification adds cost, latency, and non-determinism but significantly improves accuracy on nuanced content. A practical migration tool should make Phase 2 optional.

**Decision required:** The thresholds (60% identifier density, 0.3 rationale ratio, 50% link ratio) are **candidate defaults**. They must be benchmarked against representative fixtures from both code-backed and knowledge-only projects before adoption.

---

## 8. Open Questions

1. **Decision required:** What is the minimum viable classification accuracy for automated migration? Human-in-the-loop review of all DISCARD decisions is a safety net but adds process overhead.

2. **Decision required:** How should classification handle multi-file documents (e.g., a README that links to separate ADR files)? Should classification operate at the file level, section level, or paragraph level?

3. **Decision required:** What happens when a document was code-recoverable at migration time but the code later changes in a way that removes the recoverable information? Should migration preserve a snapshot, or should the principle be "if it's recoverable now, it's recoverable always (via git history)"?

4. **Candidate default:** Paragraph-level classification (Phase 2 HYBRID extraction) produces the highest-quality result but the highest implementation complexity. File-level classification with HYBRID files migrated in their entirety (conservative approach: "when in doubt, keep") is a simpler starting point.

5. **Decision required:** For knowledge-only projects, is there any content that should be classified as discardable? Purely auto-generated boilerplate with no semantic content may qualify, but the boundary is project-specific.

---

## Sources

1. Michael Nygard, "Documenting Architecture Decisions," Cognitect Blog, November 2011. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
2. AWS Prescriptive Guidance, "Architectural Decision Record Process." https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html
3. adr.github.io, "Architectural Decision Records — Motivation and Definitions." https://adr.github.io/
4. Rafael Capilla, Uwe Zdun, Huy Tran, Olaf Zimmermann, "Sustainable Architectural Design Decisions," IEEE Software / InfoQ, March 2014. https://www.infoq.com/articles/sustainable-architectural-design-decisions
5. Wikipedia, "Design rationale." https://en.wikipedia.org/wiki/Design_rationale
6. J. Lee, "Design Rationale Systems: Understanding the Issues," IEEE Expert 12(3), 1997.
7. Wikipedia, "Software documentation." https://en.wikipedia.org/wiki/Software_documentation
8. Wikipedia, "Program comprehension." https://en.wikipedia.org/wiki/Program_comprehension
9. Matt Pocock, "Delete (most of) your docs," YouTube, July 2026. https://www.youtube.com/watch?v=Fj8DKMbdIzU (transcript analyzed in lightweight-durable-context.md §1)
10. CONTEXT.md — this repo root
11. lightweight-durable-context.md — this repo, docs/research/
12. durable-context-platforms.md — this repo, docs/research/
13. okf-spec-and-ecosystem.md — this repo, docs/research/
14. Anthropic, Claude Code Memory documentation. https://docs.anthropic.com/en/docs/claude-code/memory
15. OpenCode documentation. https://opencode.ai/docs/
