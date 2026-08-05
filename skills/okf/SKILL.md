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

This table is coarser than the runtime's: four user-facing categories, mapped to the skill that owns each. It is a map for a human or agent choosing which skill to reach for, not the authorization mechanism itself, and it does not restate the runtime's own finer-grained sealed operation table — that table is the runtime's alone to enforce.

## Why this skill carries no reach clause

The four leaf skills each state that another skill can invoke them. `okf` does not, because nothing is meant to invoke it that way — a user selects an operation category directly, and that selection is what triggers this skill.

## Steps

1. Read the operation category from the request. Done when you can name it as one of `read`, `write`, `lifecycle`, or `review`.
2. Find that category's row in the Dispatch table. Done when you have the exact owner skill name from the matching row.
3. Dispatch the request to that owner skill. Done when the owner skill has taken over the work.

If the category matches none of the four rows, do not guess an owner. Done when you have reported the category as unrecognized instead of dispatching.
