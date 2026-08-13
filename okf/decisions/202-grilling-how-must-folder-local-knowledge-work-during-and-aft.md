---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/202
status: draft
type: Decision
---

# Grilling: How must folder-local knowledge work during and after migration?

Status: Closed.

## Parent

- [/okf-setup: propose the target bundle before writing it, and report only what it did](https://github.com/artemVeduta/okf-agent-skills/issues/155)

## Question

How must migration and ongoing maintenance organize knowledge into self-contained reader-purpose subfolders instead of letting an agent default to bundle-global placement?

## Resolution

The user approved this complete project-wide contract. It applies to migration and all later lifecycle work.

### Folder-local placement

Every substantive concept belongs to an approved concept group: a bundle subdirectory for one bounded, current reader-purpose area. A source directory, concept type, file count, or directory depth is evidence a human can weigh, but none of them can determine a group. A distinct reader question that needs separate navigation or local language can justify a child group.

Folder grouping does not force semantic source splitting. The split-review and source-accounting rules in [Grilling: When must setup propose splitting a large migration source?](200-grilling-when-must-setup-propose-splitting-a-large-migration.md) remain unchanged.

The direct bundle-root files are limited to the required `index.md` and an optional `log.md`. No substantive concept and no Glossary concept lives directly at the root. The required connector stays the Playbook concept in the `agents` concept group.

### Concept group package

Every group has a navigation-only `index.md` that states its reader purpose and lists its direct concepts and child groups. A group has `glossary.md` only when it owns local terms, a Playbook or another support concept only when current local guidance requires one, and `log.md` only for a real independent audit need. Setup and lifecycle never create an empty glossary, empty guidance, or other folder-template scaffolding.

An accepted proposal records the index, glossary, local-guidance, and placement disposition for every touched group, including explicit no-change results and an explicit no-local-terms result where no glossary exists.

### Glossary ownership

One group owns the canonical definition of a term with one shared meaning. Other groups link to that definition from their index or glossary instead of copying it. Separate meanings stay in separate local glossaries with an explicit scope each. Setup and lifecycle never create a general `shared/` glossary as a fallback.

For each new or changed concept, the agent checks local and linked glossaries and proposes the needed term additions, links, scope changes, or removals in the same review unit. It never extracts, moves, or rewrites a term without user approval.

### Migration proposal

The target bundle proposal names every output group and reader purpose. For each group it carries the concept output, the exact index change, the glossary disposition, the local-guidance disposition, and the optional local-log disposition. The derived tree and the authoritative tables show that no substantive output sits at the bundle root.

The setup wrapper rejects a root-level substantive output, an absent required group index, a missing accepted group-package output, an unexpected output, and any candidate set that differs from the accepted target proposal. Semantic group fit, reader purpose, term ownership, and term meaning remain human decisions.

### Post-migration maintenance

Normal lifecycle work uses the same folder-local rule. Every OKF change proposal names the target group and carries the direct group-package changes or an explicit no-change disposition. A new group is one complete proposed package. A concept move, regroup, or split is explicit and user-approved; no agent performs an automatic restructuring.

A touched concept group is a group whose concept or direct package changes in the accepted operation. A known structural defect in a touched group joins that proposal. A defect outside the touched groups is reported and offered as a separate restructuring proposal; it does not block unrelated local work.

The connector routes external skills through the existing owner flow. Lifecycle keeps the complete accepted proposal in session memory and checks the ordered writes against it. Each existing wrapper process validates the structural facts of its own write. No proposal token, batch-write operation, hidden agent memory, hook, new skill, or second runtime contract seam is added.

### Failure and reporting

Each write stays independent. When one accepted write succeeds and a later concept, index, glossary, guidance, or log write fails, the report names every applied, failed, and skipped effect. It marks the touched group as needing repair, and that group's next mutation must carry the repair. There is no automatic retry, move, rollback, checkpoint, resume, or atomicity claim. Git remains the recovery mechanism.

### Superseded placement rules

This resolution supersedes the permission for substantive root concepts in [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](163-grilling-strict-or-dynamic-concepts-and-what-the-structure-i.md) and [Grilling: Where does a concept go when its type has no canonical directory?](160-grilling-where-does-a-concept-go-when-its-type-has-no-canoni.md). It also supersedes root `glossary.md` placement in [Grilling: How is a glossary stored - how many, and where?](162-grilling-how-is-a-glossary-stored-how-many-and-where.md) and the root-concept examples in [Grilling: Setup proposes the target bundle tree for approval before publishing](156-grilling-setup-proposes-the-target-bundle-tree-for-approval-.md). Their independent dynamic-type, reader-purpose, navigation, conflict, proposal, and approval rules remain.
