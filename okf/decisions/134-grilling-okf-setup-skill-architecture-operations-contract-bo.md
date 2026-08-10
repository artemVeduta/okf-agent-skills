---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/134
status: draft
type: Decision
---
# Grilling: okf-setup skill architecture — operations, contract boundaries, delegation

Status: This decision is closed.

## Parent

[/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)

## Question

What operations does the new `okf-setup` skill own, and what are its contract boundaries with `okf-lifecycle`, `okf-write`, and `okf-read`?

Decision already made: a new `okf-setup` skill. This ticket settles:
1. The operation names (`init`, `migrate`, `setup`, others?)
2. Per-operation payload keys and their validation
3. How `okf-setup` composes with `okf-write` — does setup call write to create individual concepts, or does it write directly?
4. How `okf-setup` composes with the delegation bridge — does it accept delegation briefs, or does it run only as a direct invocation?
5. Whether setup operations are manual-only (like spec v0.1.0 init/migrate) or can be auto-triggered
6. The SKILL.md frontmatter: name, description, reach clause, trigger branches

Current state: `okf-lifecycle` explicitly rejects `init` and `migrate` as unknown operations. `okf-write` handles `create`, `revise`, `format`, `relationship`, `machine-verify`. `okf-read` handles `enumerate`, `validate`, `resolve`, `read`, `search`, `orient`.

## Blocked by

- [Grilling: Init bootstrap — write gate](https://github.com/artemVeduta/okf-agent-skills/issues/133) — need to know how init works before defining setup's operations

## Comment by artemVeduta

## Resolution

### Q1: `init` runtime operation vs `setup` skill-level orchestration

One runtime operation (`init`), one skill-level invocation (`/okf-setup`). The runtime router gets one new entry: `init → okf-setup`. `setup` is agent-level orchestration — the skill inspects state, invokes `init` when needed, then runs discovery → classification → migration → validation → publish. `setup` does not go through the runtime as a sealed operation.

### Q2: `init` ownership and write-gate bypass

`init` is owned by `okf-setup`, not routed through `okf-write`. It writes the bundle root `index.md` with `okf_version: "0.2"`, which is the file `okf-write` requires as a precondition. `init` has its own admission (check git repo exists, not read-only, not untrusted, bundle root absent/invalid) and validation — it is a bootstrap operation, not a general write. After `init` succeeds, subsequent setup phases delegate concept writes to `okf-write`.

### Q3: `init` payload

```json
{ "protocol": "okf-wrapper/1", "skill": "okf-setup", "operation": "init", "payload": { "cwd": "<repo root>" } }
```

`project_mode` is not in the `init` payload — it is added later by a delegated `okf-write` `revise` after the user answers during setup's interactive question phase.

### Q4: Delegation acceptance

`okf-setup` does not accept delegation briefs — no `okf-setup` role in the delegation bridge. It is only directly invoked by the user. However, `okf-setup` itself creates delegation briefs to dispatch fresh-context worker sub-agents during migration.

### Q5: SKILL.md frontmatter and `okf-lifecycle`

```yaml
name: okf-setup
description: Bootstraps an OKF bundle from an existing project, migrating documentation into OKF concepts and initializing configuration, when a user explicitly invokes setup.
```

`okf-lifecycle` stays unchanged — `init` never reaches it because the runtime router dispatches to `okf-setup`. The `UNKNOWN_OPERATION` guard remains.

### Architecture summary

- **Runtime router** gains one new entry: `init → okf-setup`
- **Sealed skill set** grows from 5 to 6: `okf-setup` added
- **Delegation bridge** unchanged — no `okf-setup` role, no delegation briefs IN to setup
- **`okf-lifecycle`** unchanged
- **`okf-write`** unchanged — setup delegates write operations through it
