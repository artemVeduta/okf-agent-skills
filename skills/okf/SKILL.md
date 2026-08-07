---
name: okf
description: Routes OKF requests to the owning skill when a user selects an operation.
---

# okf

`okf` is the router for OKF work. It reads the operation category a user has selected, looks up the owning leaf skill in the table below, and dispatches the request there. It implements no second authorization rule of its own: the real, fine-grained authorization rule lives in the runtime's own sealed operation table, not in this file.

## Dispatch

| Operations | Owner |
| --- | --- |
| `read` | `okf-read` |
| `write` | `okf-write` |
| `lifecycle` | `okf-lifecycle` |
| `review` | `okf-review` |
| `init` | `okf-setup` |
| `inspect` | `okf-setup` |
| `repair` | `okf-setup` |
| `plan` | `okf-setup` |
| `aggregate` | `okf-setup` |
| `report` | `okf-setup` |
| `discover` | `okf-setup` |
| `migration-plan` | `okf-setup` |
| `partition` | `okf-setup` |
| `assemble` | `okf-setup` |
| `migration-validate` | `okf-setup` |
| `publish` | `okf-setup` |

This table is coarser than the runtime's: sixteen user-facing categories, mapped to the skill that owns each. It is a map for a human or agent choosing which skill to reach for, not the authorization mechanism itself.

## Wrapper invocation

`okf` itself runs its wrapper as `node <skill-root>/scripts/okf.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

## Procedure

1. Read the operation category from the request. Done when you can name it as one of `read`, `write`, `lifecycle`, `review`, `init`, `inspect`, `repair`, `plan`, `aggregate`, `report`, `discover`, `migration-plan`, `partition`, `assemble`, or `migration-validate`; not done while more than one category still fits the request.
2. Dispatch the request to that category's owner in the Dispatch table. Done when the owner skill has taken over the work; not done if this file was consulted for any rule beyond the owner's name.
3. If the category matches none of the fifteen rows, do not guess an owner. Done when the category has been reported as unrecognized; not done if any owner skill was invoked for a category with no row.
4. Relay the owner's report unchanged, within the owner's ceiling. Done when the caller receives exactly what the owner skill reported, in the form the owner chose; not done if this file reshapes, trims, or restates any part of that report.
