---
status: draft
type: Glossary
---
# Concept Groups Glossary

**Concept group**:
A bundle subdirectory for one bounded, current reader-purpose area. Every
substantive concept belongs to exactly one approved group. A source directory,
concept type, file count, or directory depth is evidence only; none of them can
select the group.
_Avoid_: Type directory, source mirror, folder

**Concept group package**:
The complete set of one group's own files and their dispositions: the required
navigation `index.md`, the `glossary.md` it has only when it owns local terms,
the local guidance concept it has only when current guidance requires one, and
the `log.md` it has only for a real independent audit need. An accepted proposal
records a disposition for each, including an explicit no-change and an explicit
no-local-terms result.
_Avoid_: Folder template, scaffolding

**Reader purpose**:
The exact bounded question a concept group answers, stated on the group's own
index. It is a human decision, never derived from a path or a type.
_Avoid_: Category, topic label

**Canonical owning glossary**:
The one group glossary that holds the definition of a term with one shared
meaning. A consuming group links to it instead of copying it. Two separate
meanings stay in two local glossaries, each with its own explicit scope, and no
general `shared/` glossary is ever created as a fallback.
_Avoid_: Shared glossary, global glossary

**Touched concept group**:
A group whose concept or direct package changes in the accepted operation. A
known structural defect inside one joins that proposal; a defect outside the
touched groups is reported separately and never blocks unrelated local work.
_Avoid_: Affected folder, dirty group

**Group needing repair**:
A touched group left inconsistent because an accepted concept, index, glossary,
guidance, or log write failed or was never attempted. The report names it, and
its next mutation must carry the repair. Nothing retries, moves, or rolls back
on its own.
_Avoid_: Partial group, rollback
