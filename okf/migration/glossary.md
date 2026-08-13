---
status: draft
type: Glossary
---
# Migration Glossary

**Migration**:
A manual conversion of explicitly selected source material into an OKF bundle.
It is not automatic lifecycle synchronization and does not silently discard or
invent meaning.
_Avoid_: Automatic import, full synchronization

**Migration scan boundary**:
The repository or package subtree in which setup discovers possible migration
sources. It limits discovery but does not select or approve a source.
_Avoid_: Migration scope, include list, approval

**Migration scope proposal**:
A read-only list of discovered files or folders that setup offers for one user
decision before migration planning. It shows proposed inclusions and exclusions
with reasons and permits the user to add or remove sources.
_Avoid_: Migration plan, automatic selection, approval

**Migration scope**:
The exact set of sources the user accepts from a migration scope proposal. A
folder selects only the discovered contents shown when the user accepts it.
_Avoid_: Migration scan boundary, discovered inventory, proposed scope

**Target bundle proposal**:
The complete, read-only migration plan that setup presents after discovery and
semantic planning and before content transformation. Its authoritative table
has one row for each source disposition, output concept, and concept group. It
defines each output's content scope, provenance assignment, link decisions,
and placement. A requested change produces a new complete proposal. The
proposal cannot be accepted while a disposition, ambiguity, or target
validation remains unresolved.
_Avoid_: Migration scope proposal, staged bundle, approval token

**Target bundle tree**:
The derived view of a target bundle proposal that shows concept groups,
concept paths, and each navigation-only `index.md` with its exact group purpose
and planned child entries. It helps a reader inspect the planned structure,
but the proposal table remains authoritative.
_Avoid_: Source-path mirror, authoritative migration plan

**Accepted target bundle proposal**:
The exact target bundle proposal that the user accepts for the current setup
session. It permits transformation and publication of only its listed concepts
and navigation indexes. A changed output or a later setup session requires a
new proposal and decision; acceptance is not a persistent token or resume
state.
_Avoid_: Accepted proposal record, approval file, migration checkpoint

**Migration split**:
An accepted source mapping in which one selected migration source produces
multiple output concepts. Each output has an exact Concept ID, type, and
bounded content scope before transformation starts. It is not automatic
section extraction or a later restructuring operation.
_Avoid_: Automatic split, concept explosion, source disposition

**Migration residue**:
Selected source material that cannot be safely represented as OKF semantics.
It stays unchanged at its original project path and appears in the migration
report. It is not copied into the OKF bundle or treated as active concept
meaning.
_Avoid_: Lost content, retained bundle evidence, active extension

**Semantic fidelity**:
Evidence that migrated content retains the intended user-authored meaning.
Structural conformance and successful file conversion do not establish it.
_Avoid_: Conformance, migration success

**Manual-operation guard ledger**:
Local, uncommitted, bundle-scoped safety state that binds preview confirmations
to a ledger generation and bundle epoch, prevents token replay, and coordinates
manual operation execution. It is neither OKF content nor harness session state.
_Avoid_: Bundle metadata, confirmation cache

**Inbound link**:
A parsed, resolvable path reference to a concept, carried by a Markdown link, a
path-valued frontmatter field, an index entry, or a workspace link. A path
written in prose or inside code is not an inbound link.
_Avoid_: Backlink, reference, mention

**Link resolution**:
The verdict on whether an inbound link reaches its target, decided only by
whether the target file exists. Concept status is not an input, so the verdict
is independent of what a retrieval budget observed.
_Avoid_: Link validation, link health

**Source disposition**:
The terminal fate of a concept that a merge or split consumed. It is determined
by project mode rather than chosen per operation.
_Avoid_: Cleanup policy, source handling

**Provenance assignment**:
The record of which provenance sources each restructuring output carries. It is
derived from the footnote attribution key of the retained body, and a source
that no output cites is assigned explicitly rather than inferred.
_Avoid_: Source inheritance, provenance merge

**In-place deprecation**:
An archive operation that retains a concept at its current path and marks it
deprecated. It preserves bundle-relative identity and path-based link
resolution.
_Avoid_: Relocation, deletion

**Relocation**:
An archive operation that moves a concept to a different path. It changes the
bundle-relative identity; references to the old path need explicit handling.
_Avoid_: In-place deprecation, redirect

**Successor notice**:
Visible Markdown in a deprecated concept that links readers to a known
replacement. It is navigation, not a redirect, identity continuity, or a
machine-parsed relationship.
_Avoid_: Supersede edge, redirect, index-only metadata
