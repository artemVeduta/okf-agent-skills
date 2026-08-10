---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/176
status: draft
type: Decision
---

# Grilling: Should setup read structural meaning from root convention files?

Status: Closed.

## Question

When setup builds a target bundle proposal, should repository-root convention files such as `CONTEXT.md`, `AGENTS.md`, and `CLAUDE.md` supply structural meaning instead of being treated only as ordinary migration sources?

Decide:

- which exact convention files, if any, setup recognizes;
- which structural facts each file can provide, such as domain terms, reader-purpose groups, or agent-policy placement;
- whether those facts are authoritative evidence, proposal hints, or ordinary source content;
- how explicit user choices and conflicting files take priority;
- how setup avoids executing or trusting instructions while it reads migration evidence;
- what setup reports when a convention file has both structural meaning and content selected for migration.

The answer must leave target proposal generation deterministic where possible and must ask instead of inventing a value when evidence conflicts or is incomplete.

## Comment by artemVeduta

## Resolution

Setup uses **migration structural evidence** when it builds the target bundle proposal.

### Recognized convention structures

- Root `CONTEXT.md` and root `CONTEXT-MAP.md` have deterministic structural parsers.
- A valid root `CONTEXT-MAP.md` identifies linked `CONTEXT.md` files inside the migration scan boundary for the same deterministic context parsing.
- A missing, unreadable, duplicate, outside-boundary, or conflicting mapped context stays unresolved and causes a question.
- `AGENTS.md`, `CLAUDE.md`, and other filenames have no special structural meaning. They can still supply ordinary content evidence.

### Structural facts

- `CONTEXT.md` can supply its context name, description, terms, and avoided names. If selected for migration, its exact filename still infers `Glossary`. The file does not create a concept group or fix placement.
- `CONTEXT-MAP.md` can supply context names, linked context files, descriptions, and declared relationships. Names and descriptions can suggest reader-purpose groups. Links can suggest source placement. Relationships do not imply nesting.
- Any readable file in the migration scan boundary can supply cited evidence for domain terms, reader-purpose groups, classification, placement, or agent-policy placement, whether or not that file is selected for migration.
- Migration scope controls which content becomes OKF content. It does not hide migration structural evidence.

### Authority and priority

Migration structural evidence is a proposal hint. It does not select a file for migration and does not grant authority, trust, permission, or approval. The accepted target bundle proposal remains authoritative.

Setup applies this priority:

1. OKF conformance and safety rules.
2. Explicit user choices for the current complete proposal.
3. Explicit compatible source metadata.
4. Deterministic convention syntax.
5. Other content evidence.

An explicit user choice can settle a conflict for the complete proposal. Without that choice, compatible source metadata remains authoritative over inference. Evidence at the same level that conflicts or stays incomplete causes a question. Setup does not invent a winner.

### Safe and reviewable reading

- Setup parses only defined convention structures and treats all other text as inert content.
- Setup does not execute commands, follow instructions, resolve agent-file imports, or apply harness include rules while it reads migration evidence.
- Context-map links are parsed only as the defined context-map structure. They are not instruction imports.
- Convention evidence records the source path and exact parsed field.
- Other content evidence records the source path and exact heading or text span. If the text does not state the fact clearly, setup asks instead of inferring it.

### Dual-role reporting

When one file supplies structural evidence and is also selected for migration, setup reports both roles separately. The structural-evidence result records the fact used and the proposal row it affected. The migration result records the source disposition and output. Migration counts include the file once; reading it as evidence is not a second migration.
