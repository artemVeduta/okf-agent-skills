---
status: draft
type: Glossary
---
# Bundle Structure Glossary

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
identity and ownership. Federation does not merge concepts or grant foreign-
write authority by itself. An explicit target-side grant may enable a manual,
approved, recovery-gated cross-repository operation under suite policy.
_Avoid_: Workspace merge, shared write scope

**Foreign-write authority**:
The target-side, uncommitted grant that permits one exact source repository
instance to perform a bounded operation against one exact foreign bundle. It
is separate from reach, presence, trust, filesystem access, federation,
workspace manifest, project mode, approval, and the guard ledger. It is scoped to
allowed effects, can be revoked by an authorized target owner, and never
permits automatic mutation. The specification's target-owner consent is the
same grant named for the act of issuing it, not a second concept.
_Avoid_: Trust grant, filesystem permission, workspace declaration, approval,
target-owner consent

**Workspace manifest**:
The user-authored `.okf-workspace.json` federation declaration whose containing
directory is the workspace root, and of which exactly one is active. It names
which bundles may be read and under which aliases, and each bundle record
declares its own `okf_version` and `project_mode`. A valid manifest with an
admitted bundle record is also the activation condition for automatic OKF
behavior, and it may carry an optional `settings` object. It does not grant
trust, filesystem access, discovery authority, or write ownership, and it
records no operation.
_Avoid_: Operation manifest, trust store, permission file

**Bundle admission**:
The bundle-level decision on whether a candidate bundle may be read, taken in
the fixed order of reach, presence, then trust and access. It classifies
candidates and does not locate, rank, or read concepts.
_Avoid_: Discovery, workspace discovery, access grant

**Concept discovery**:
The location of candidate concepts inside a bundle that bundle admission
already admitted. It may use index navigation, exact paths, or native search.
It cannot widen bundle admission, and it does not grant trust, access, write
ownership, approval, or permission.
_Avoid_: Discovery, admission, bundle admission

**Dynamic concept structure**:
An OKF bundle organization in which a concept's type does not determine its
path. Placement is a separate decision in the approved target tree.
_Avoid_: Type directory, source-path fallback, closed concept taxonomy

**Glossary concept**:
An OKF concept of type `Glossary` that defines a coherent set of canonical
terms for one reader purpose. The document is the concept and has one Concept
ID and lifecycle; its individual terms are not separate concepts. A bundle can
contain zero or more glossary concepts, placed like other concepts in its
approved reader structure. `Glossary` is the one type that fixes its basename
to `glossary.md`, so the bundle root and each concept group can contain at most
one glossary concept.
_Avoid_: Glossary index, term concept

**Term conflict**:
The case in which two migration sources define the same term. It requires an
explicit semantic decision because the definitions can express one shared
meaning or separate scoped meanings. It never causes an automatic merge.
_Avoid_: Target collision, automatic deduplication

**Source-path mirror**:
A target concept path copied from its source project path instead of selected
for the bundle's reader structure. It is evidence of a missing placement
decision and is not a valid fallback.
_Avoid_: Approved target path, concept group

**LLM-guided native navigation**:
Task-specific reading in which an agent uses harness-native file and search
tools to navigate admitted bundles. The model chooses navigation steps and
interprets tool results; it does not treat model memory as bundle content. The
suite supplies scope and safety rules, not a custom retrieval backend, matcher,
ranking service, tokenizer, embedding store, retrieval cache, cost model, or
ledger.
_Avoid_: Pure LLM retrieval, custom retrieval backend, semantic retrieval
