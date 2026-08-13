---
title: OKF agent connector
type: Playbook
---

# OKF agent connector

Every skill or agent that works in this bundle follows these rules.

- Read the bundle through `okf-read`.
- Prepare one complete change proposal through `okf-lifecycle` during normal work.
- After the user accepts the proposal, call `okf-write` once for each accepted concept.
- Never edit a bundle file directly. Direct edits by an agent or another skill are unsupported.
- Treat every nested `index.md` as navigation, never as a concept.
- Keep the type taxonomy open. Read the current concepts, select a precise semantic type, and ask when uncertain. Never default to `Note`.
- Cite only meaningful evidence. Never cite the bundle root or this connector only to satisfy the gate. When a bundle holds no meaningful evidence, report the write as blocked instead of inventing evidence.
- Claim no subtree. `agents/` groups concepts by reader purpose; no external skill owns it or any other part of the bundle.
- Find project-specific agent policy through the [agents index](index.md).
- Read each owning skill's installed instructions for exact request fields and refusal behavior.

Executable permissions, hooks, and harness settings stay outside this bundle. They are configuration, not durable knowledge.
