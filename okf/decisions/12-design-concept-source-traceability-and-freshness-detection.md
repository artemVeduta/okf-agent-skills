---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/12
status: draft
type: Decision
---
# Design concept-source traceability and freshness detection

Status: This decision is closed.

## Question

How should OKF concepts declare their relationship to source code in code-backed projects or external references in knowledge-only projects, and how should the skill suite detect staleness from those relationships?

The research in [`docs/research/lightweight-durable-context.md`](https://github.com/artemVeduta/okf-agent-skills/blob/main/docs/research/lightweight-durable-context.md) identifies traceability as a priority decision. Stable identity and cross-bundle routing are decided separately by **Define concept identity, cross-bundle routing, precedence, and workspace trust**.

**Must resolve:**

- Should concepts use `source_files`, `derived_from`, standard OKF `sources`, or a namespaced extension?
- How does freshness propagate when a source changes?
- Should the okforge folder-to-source mapping pattern be adopted, adapted, or rejected?
- How should freshness differ between evidence-based source-change detection and elapsed-time warnings?
- Any time-based value is a configurable candidate until fixture evidence and project policy justify a default.
- How do external-source disappearance, renamed code paths, generated files, and partial workspaces affect confidence?

## Comment by artemVeduta

## Resolution

Concept provenance, review dependencies, and semantic freshness are separate. The suite uses standard OKF provenance, a portable operational review record, and evidence-bearing findings without inventing a second stale flag.

### Provenance and review dependencies

- Standard OKF `sources` is the only authored provenance representation. A `sources[].resource` identifies evidence supporting a concept; it does not by itself declare that source changes make the concept stale.
- The suite adds no `source_files`, `derived_from`, namespaced frontmatter, or machine-parsed body convention. Explicit derivation chains remain outside OKF v0.2.
- A **review dependency** is an operationally tracked artifact or scope whose change is evidence that a concept may need review. Review dependencies are always selected explicitly; the suite never watches every provenance source automatically.
- A review dependency may reference a standard `sources[].id` without repeating its locator, or directly name an additional local file, recursive directory, OKF concept, or external resource.

### Declaration, identity, and scope

- Adapt the okforge mapping pattern from folder-to-source mapping to concept-to-dependency mapping. The authoritative unit is the bundle-qualified Concept ID, not an OKF folder.
- Each bundle owns a versioned, project-owned operational traceability record containing dependency declarations and accepted review baselines. It is version-controlled where the project has VCS; a non-repository workspace still stores it as portable project state. Current observations and performance caches are local and disposable.
- Repository-local dependencies bind to repository lineage plus normalized repository-relative path. Non-repository dependencies bind to workspace identity plus root-relative path. Machine-absolute paths and CWD-relative meaning are forbidden. Every observation re-applies the settled containment, symlink, trust, and access gates.
- Suite v0.1.0 supports exact files and recursive directories, not globs or implicit ignore rules. A directory identity covers sorted normalized member paths and the content identities of all contained regular files admitted by containment, so additions, removals, renames, and edits count. A scope that cannot be observed within resource bounds is `unobservable`; it is never sampled silently.
- A dependency whose resolved scope contains its owning concept or the operational traceability record is invalid. Directed cycles among concept review dependencies are invalid. Provenance and ordinary Markdown-link cycles remain valid because they do not propagate review state.

### Review baselines

- A **review baseline** is the accepted content identity of a concept's review dependencies at an evidence-backed review. Git object IDs may be an efficient content-identity input, but repository history, `HEAD`, file timestamps, and the concept's last edit do not define the baseline.
- A newly added or retargeted dependency has no baseline and reports `review needed: no baseline`. Setup and migration may capture observations for a preview, but cannot accept them implicitly or infer a baseline from Git history.
- A policy-authorized machine or human may advance a baseline only after reviewing complete evidence. The accepted record atomically identifies the reviewer and review time, the concept content identity, all observed dependency identities, and the disposition: `unchanged`, `concept updated`, or `mapping repaired`.
- Operational review evidence is reported separately from the trust tier derived from OKF `verified`. Only a human actor may add human verification.
- Accepted baseline records are audit entries superseded by later acceptances, not silently overwritten. Adding, removing, or retargeting a dependency is itself a reviewed operation. Removals record rationale; rename repairs record old and new locators plus evidence. Mapping edits cannot silently clear findings.

### Observation and consequences

- Comparable content produces `unchanged` or `changed`. A positively established existence failure produces `unavailable`. Access, network, workspace, tool, or resource limits produce `unobservable`. These outcomes must not be collapsed.
- `changed` and `unavailable` produce review-needed findings. `unobservable` produces an indeterminate diagnostic. None mutates `status`, `stale_after`, `verified`, or trust tier.
- Review evidence propagates only across explicitly declared review-dependency edges. Standard provenance and Markdown links never imply freshness propagation. Reports may explain a chain but cannot infer additional affected concepts.
- Findings remain composable per dependency and reason; no numeric confidence or replacement freshness flag exists. A configured concept is traceability-clean only when every dependency and mapping is valid, baselined, observable, and unchanged.
- A concept with no review dependencies is `not configured`, not clean or stale, and is quiet by default. Project policy may require mappings for selected concept types or scopes.

### Time and project modes

- OKF `stale_after` keeps its defined meaning: a concept is stale when `today >= stale_after`. A source change is unreviewed change evidence, not proof of semantic staleness.
- Suite v0.1.0 ships no implicit elapsed-time threshold. A project may configure review cadence, which produces `review due` rather than synthesizing `stale_after`. Numeric defaults require representative fixture evidence.
- Code-backed and knowledge-only projects use the same semantics. Code-backed setup prioritizes local code dependencies and non-blocking task nudges. Knowledge-only setup prioritizes external and concept dependencies and may choose stricter review-before-write policy. Project mode never changes evidence into proof of staleness.

### External, renamed, generated, and partial sources

- External observation is opt-in project policy and remains subject to harness authorization. It fetches only explicitly declared resources with bounded size, time, redirects, and supported schemes; it never crawls adjacent links. Without capability or authorization the result is `unobservable`.
- External content identity is a fingerprint of the bounded, successfully retrieved representation after transport decoding. `ETag` and `Last-Modified` may optimize a request that returns `304`, but are not content identity. Suite v0.1.0 performs no LLM or semantic normalization to hide representation changes. Diagnostics record the final resolved locator and retrieval evidence.
- A missing old path remains `unavailable`. Repository evidence may suggest a likely rename, but the suite never rebinds or advances the baseline automatically; accepting the repair is part of review.
- Authoritative generator inputs and generator/toolchain identity are the primary dependencies for generated artifacts. Generated output may be an explicit supplemental dependency when emitted bytes matter. Its change is review evidence, not stronger confidence. A missing build-produced output is `unobservable` unless project policy establishes that it must exist in the observed workspace.
- A dependency absent because of a sparse checkout, inactive federation member, missing permission, or partial workspace is `unobservable`, never assumed unchanged or deleted.

### Downstream boundary

This decision supplies semantics to **Specify the OKF knowledge model and automatic developer lifecycle** and **Define validation, growth, compaction, and approval contracts**. Those decisions still own exact serialization and command timing, operation-specific blocking policy, and fixture-calibrated resource limits. They may not add numeric defaults or reinterpret review evidence as semantic staleness without new evidence and an explicit decision.
