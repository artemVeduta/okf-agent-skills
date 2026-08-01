# OKF Agent Skills

This context defines the language used to design lifecycle-aware agent skills
for Open Knowledge Format documentation.

## Language

**Code-backed project**:
A project in which executable behavior is represented by code. Code is
authoritative for that behavior, while OKF records durable context that cannot
be recovered adequately from the code.
_Avoid_: Code project

**Knowledge-only project**:
A project whose durable knowledge is represented entirely by documents rather
than executable code. Its OKF bundle is the complete source of truth.
_Avoid_: Obsidian project, docs-only repository

**Durable context**:
Knowledge that should remain available across agent sessions because it
clarifies domain language, intent, rationale, constraints, invariants, or
workflows without duplicating implementation.
_Avoid_: Documentation of the code, prose mirror

**Automatic lifecycle**:
The recurring behavior through which an agent consults relevant OKF knowledge
and maintains small, evidence-backed documentation changes while doing normal
project work.
_Avoid_: Automatic full sync

**Trust tier**:
An advisory classification of the verification evidence recorded for a
concept. A trust tier does not grant authority to mutate the concept; operation
risk and project mode determine the required safeguards.
_Avoid_: Permission level, operator trust

**OKF specification version**:
The upstream Open Knowledge Format version, such as v0.2, that defines format
semantics. It is independent of the suite release version.
_Avoid_: Format release, suite version

**Suite release version**:
The version of `okf-agent-skills`, such as v0.1.0. It records which reviewed OKF
specification revision the product implements but does not name the format.
_Avoid_: OKF version, specification version

**Bundle conformance**:
Satisfaction of the structural tests defined by an identified OKF
specification version. Product policy and migration fidelity are separate.
_Avoid_: Overall validity, suite compatibility

**Producer obligation**:
An OKF requirement governing authored content or producer behavior that is not
necessarily a bundle-conformance test.
_Avoid_: Conformance test, product rule

**Consumer tolerance**:
Required or recommended behavior when reading optional, unknown, legacy, or
broken OKF content without treating that content as a mutation target.
_Avoid_: Automatic repair, conformance waiver

**Suite profile**:
The two rules `okf-agent-skills` imposes beyond OKF conformance: mutation
requires an exact `okf_version: "0.2"` bundle-root declaration, and a rewrite
must reproduce the frontmatter's parsed semantics through the suite's own
writer. Reported with origin `suite`, never as an OKF conformance error.
_Avoid_: OKF conformance, product extension

**Semantic preservation**:
Retention of YAML key names, scalar types and values, sequence order, and
mapping structure without promising preservation of comments or formatting.
_Avoid_: Lexical preservation, byte-for-byte round trip

**Repository instance identity**:
The local identity of one repository or non-repository workspace instance to
which trust attaches. Moving an instance preserves trust; a fresh clone or
replacement is a different instance.
_Avoid_: Trusted path, repository lineage

**Repository lineage identity**:
The routing identity shared by clones of one logical VCS repository. It does
not grant trust, and an independently owned fork has a different lineage.
_Avoid_: Repository instance identity, permission

**Bundle identity**:
The identity of a knowledge bundle formed from its owner identity and its
bundle-root path. Moving the bundle root changes its identity.
_Avoid_: Bundle name, filesystem path alone

**Federation**:
Read-time composition of explicitly admitted bundles that retain independent
identity and ownership. Federation does not merge concepts or grant write
authority across repositories.
_Avoid_: Workspace merge, shared write scope

**Notional cold-work charge**:
A versioned conservative measure of the discovery work a resolution would
perform without cache hits. It determines the work frontier so cache state
cannot change which scopes are examined.
_Avoid_: Actual work, cache-adjusted budget

**Observed execution work**:
The resources actually consumed while resolving, including cache hits and
misses. It supports telemetry and hard resource protection but never widens the
frontier set by the notional cold-work charge.
_Avoid_: Discovery allowance, notional work

**Provenance source**:
An authored OKF `sources` entry identifying evidence that supports a concept.
It does not by itself assert that a change to the source makes the concept
semantically stale.
_Avoid_: Freshness dependency, watched file

**Review dependency**:
An operationally tracked artifact or scope whose change is evidence that a
concept may need review. It is distinct from authored provenance and does not
make a semantic-freshness claim.
_Avoid_: Provenance source, proof of staleness

**Review baseline**:
The accepted content identity of a concept's review dependencies at the time of
an evidence-backed review. Later observations are compared with this baseline;
repository history and file timestamps do not define it.
_Avoid_: Git baseline, last concept edit

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
