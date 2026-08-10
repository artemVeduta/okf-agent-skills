---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/160
status: draft
type: Decision
---
# Grilling: Where does a concept go when its type has no canonical directory?

Status: This decision is closed.

## Parent

- #155

## Blocked by

- #156

## Question

The OKF data model ([#130](https://github.com/artemVeduta/okf-agent-skills/issues/130)) names a canonical directory for `Decision`, `Constraint`, `Research`, `Playbook`, `Release`, and `Reference`. The type taxonomy is deliberately open, so a legitimate domain-specific type has no canonical directory, and `migration-plan` falls back to keeping the source path.

In the dogfood run the user chose `Prototype Report` for 4 documents. They landed at `okf/docs/ci-gate-proof.md`, `okf/docs/federated-write-impact.md`, and two more — putting a `docs/` directory **inside** the bundle, mirroring the project directory the migration was reading from.

The fallback is defensible: it invents no directory, per the "no invented value" rule. It is also the reason the bundle now has a `docs/` subtree that means nothing in the data model.

Where should a concept go when its type names no canonical directory?

- Keep the source path, as now, and accept the mirrored project structure inside the bundle.
- Place it at the bundle root, so the bundle's shape is flat rather than mirrored.
- Ask the user for a directory as part of the type question, since they are already naming a type the model does not know.
- Let the target-tree proposal answer it — the user is approving a structure anyway, so this becomes one more thing in that tree.

The last option is why this ticket is blocked: if setup proposes a full target tree, this question may dissolve into it rather than needing its own rule.

## Comment by artemVeduta

## Resolution

A concept whose type has no canonical directory follows the same placement rule as every other concept. Concept type and concept path are independent; no type has a canonical directory in the dynamic concept structure.

- Place the concept at the bundle root when no concept group improves current navigation.
- Otherwise, place it in a concept group selected for one current, named reader purpose.
- Never use the source path as a fallback. A matching source and target path is valid only when the target groups were selected independently for readers.
- Do not ask for a directory as an extra part of the type question. Placement is an output decision in the complete target bundle proposal.
- The user accepts the exact output path and all concept groups through the one complete proposal. An unknown or domain-specific type gets no special interaction.

For the dogfood `Prototype Report` concepts, `okf/docs/` is not valid only because the sources came from `docs/`. A new proposal must place each concept at the root or in a named reader-purpose group.

This selects the target-tree proposal option from the question. It applies [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163) and [Grilling: Setup proposes the target bundle tree for approval before publishing](https://github.com/artemVeduta/okf-agent-skills/issues/156) without adding another fallback rule.
