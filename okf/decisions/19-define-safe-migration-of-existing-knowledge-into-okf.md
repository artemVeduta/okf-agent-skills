---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/19
status: draft
type: Decision
---

# Define safe migration of existing knowledge into OKF

Status: Closed.

## Question

How should a user safely migrate an existing documentation corpus—such as a docs folder, wiki export, Obsidian vault, or unstructured Markdown tree—into the project's OKF format without losing knowledge, provenance, navigation, or user-authored meaning and without bulk-copying implementation details that violate the code/non-duplication boundary?

This decision is blocked by **Research safe migration of existing knowledge corpora into OKF** and by the identity, routing, conformance, and merge/split decisions shown in GitHub's dependency graph.

The decision must cover code-backed and knowledge-only projects; corpus inventory and classification; source-to-OKF mapping; glossary and concept extraction; duplicate and conflict detection; frontmatter conversion; standard links and Obsidian wikilinks; attachments and unsupported file types; provenance; dry-run previews; approval boundaries; preservation of originals; independent backups and tested restoration; incremental/resumable/idempotent execution; validation; migration reports; and post-migration semantic verification.

Treat migration as manual-only. Determine whether it belongs inside `init`, is a separate `migrate` skill with the approved invocation guard for each harness, or uses another boundary. The result must favor compact durable context over mechanically converting every source file. Git history, reflogs, and `git archive` are not sufficient as the sole loss-prevention mechanism.

## Comment by artemVeduta

Correction carried from [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29): migration preview completeness must be propagated as explicit data. An incomplete preview cannot mint a confirmation, and execution must freshly recheck completeness rather than relying on a fake-planner sentinel.

## Comment by artemVeduta

## Resolution

Migration is a manual, explicitly requested `okf-lifecycle` operation. It is not automatic lifecycle synchronization, a new skill, a CLI, or an implicit part of initialization. The operation emits OKF v0.2 and uses the approved portable guard contract from [Prototype the portable manual-operation guard state machine](https://github.com/artemVeduta/okf-agent-skills/issues/29).

### Scope and authority

- A request names one source root, one explicit project mode, and explicit include/exclude rules. The operation does not scan an entire workspace or discover sources implicitly.
- External source roots are allowed only when the active harness already grants read access and the canonical path passes existing trust and containment checks. Migration never widens access, follows an escaping symlink, or writes to an external source.
- In a code-backed project, migrate only durable context that code cannot recover: rationale, domain language, constraints, decisions, and workflows. Do not import implementation-recoverable or generated material.
- In a knowledge-only project, the accepted OKF bundle becomes the active authority for migrated durable context. Originals remain immutable evidence or archive, not a second active source. Code remains authoritative for executable behavior in code-backed projects.

### Admission and mapping

- Direct parsing is limited to UTF-8 Markdown, optional YAML frontmatter, and standard Markdown links and reference definitions. No v0.1.0 parser is added for HTML, PDF, Word, MediaWiki, Obsidian syntax, wikilinks, plugins, or Dataview. Those formats remain source material or inert residue.
- One selected source document maps to one output concept by default. Migration does not automatically extract glossary entries, split documents, or invent concepts. Such changes require an explicit mapping or a separate restructuring operation.
- Output identity is a deterministic normalized form of the selected source's relative path. The operation does not invent UUID continuity, silently rename, auto-merge, or overwrite. An existing target-path collision blocks the plan.
- An explicit source type is preserved. A source-class-to-OKF-type mapping must be human-approved; an ambiguous or missing type is not guessed. Unknown explicit OKF types remain valid.
- Existing OKF target concepts are never implicitly merged or replaced. Unrelated target concepts remain unchanged; collisions require a separate explicit decision.
- Selected or referenced attachments are copied byte-for-byte to deterministic `references/` paths with content hashes. Unsupported files are not interpreted, embedded, converted, or deleted.

### Semantics and preservation

- Structured `sources` is authoritative when it coexists with legacy citations. Only structurally unambiguous citations convert automatically. Ambiguous prose, conflicting citations, and unassigned provenance are reported and require explicit handling.
- Migration never fabricates `generated`, actors, `verified`, freshness, or review baselines. Provenance and review evidence remain separate concerns.
- Exact duplicates are reported as candidates. Near-duplicates, conflicting claims, identifier collisions, and ambiguous mappings block until the user chooses a result. Migration never silently deduplicates, deletes, or reattributes evidence.
- Standard OKF links follow the v0.2 consumer rule: a missing target is tolerated and reported as a non-blocking warning. Parsed links are rewritten only when their target mapping is unambiguous; an ambiguous rewrite or dropped parsed reference blocks the affected plan. Paths in prose, inline code, and fenced code are not links.
- Content that cannot be safely represented is retained visibly and inertly in a `## Migration residue` section when it is textual, and in the source corpus when it is a separate file. The operation receipt records the source path, reason, and disposition. Residue is not active concept meaning.
- Originals are never mutated, relocated, or deleted by migration. Cleanup, if ever needed, is a separate recovery-gated operation.

### Preview, execution, and recovery

- The dry-run preview is complete only when every selected input has a disposition and the manifest lists scope, mode, classifications, paths, transformations, links, provenance, residue, conflicts, attachments, retained originals, output identities, hashes, and recovery evidence. An incomplete preview cannot mint confirmation.
- Approval binds to the explicit request and complete plan. A snapshot must be independent, restored in a disposable location, and checked before execution. Git history, reflogs, and `git archive` are not the sole recovery mechanism.
- Execution uses the bundle-scoped operation lock, fresh source and target identity/content checks, a separate staging area, validation, and an atomic write-new-then-swap publication. Drift after preview aborts without target mutation and requires a new preview.
- An operation manifest outside the bundle and guard ledger records checkpoints, content identities, and recovery state. An unchanged plan may resume after interruption, and repeating a completed plan is an idempotent no-op. Any request, scope, or content drift invalidates the plan.
- Incomplete work is not published. A partial run remains staged and reported until the user narrows the request or resolves the blocker. A migration is `complete` when every selected input has a safe disposition, including inert residue; it is `partial` when selected work remains unresolved; recovery or post-operation uncertainty is `failed` or `indeterminate`, never success.

### Reporting and semantic claims

- The external operational receipt records source and target identities, per-item dispositions, path mappings, conflicts, residue, link outcomes, provenance assignments, hashes, recovery checks, validation findings, and the final outcome. It is not OKF content or a semantic sidecar.
- Structural checks, frontmatter parse-tree round trips, file counts, link handling, and conformance checks do not establish semantic fidelity. A semantic-fidelity claim requires explicit human review of all conflicts and residue plus representative high-risk conversions. Without that evidence, semantic fidelity is not assessed.
- All harnesses use the same request, preview, confirmation, plan binding, execution checks, and outcome semantics. Adapters may change presentation only. A harness that cannot attest a complete preview or explicit confirmation blocks the operation rather than weakening it.

This closes the migration decision. Implementation still belongs to the downstream product-specification and implementation tickets.
