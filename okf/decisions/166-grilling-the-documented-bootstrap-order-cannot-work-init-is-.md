---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/166
status: draft
type: Decision
---

# Grilling: The documented bootstrap order cannot work — init is gated on the marker repair writes

Status: Closed.

## Parent

- #155

## Question

**The documented bootstrap procedure cannot work on a clean repository.**

`skills/okf-setup/SKILL.md` orders the procedure:

- Step 4 — "Repair `index.md` through `init`"
- Step 5 — "Repair `.okf-active` through `repair`"

But `init` is gated on the activation marker. `scripts/lib/runtime.js:51`:

```js
const activationBypassOperations = new Set(['inspect', 'repair', 'plan', 'aggregate', 'report', 'partition', 'assemble', 'migration-validate', 'publish']);
```

`init` is not in that set, so it passes the shared gate, and `runtime.js:456-463` returns `not-configured` when the marker is absent. On a clean repository step 4 therefore **always** fails until step 5 has run.

A real `/okf-setup` run confirmed it, and the agent had to find the working order by trial:

> "init first answered not-configured because the activation marker did not exist yet; it succeeded after repair wrote `.okf-active`."

SKILL.md:408 states plainly that `init` runs "the activation-marker gate", so the document contradicts itself: its own Admission section and its own Procedure disagree.

### The decision

Which way does this resolve?

- **Reorder the procedure** to repair activation, then `init`, then discover. Smallest change. But it leaves `init` — the operation whose whole job is creating a bundle root that does not exist yet — requiring a marker that declares that same bundle already active.
- **Exempt `init` from the activation gate**, joining `inspect` and `repair` in the bypass set. This matches what the marker *means*: `.okf-active` says "this bundle is active", and during `init` there is no bundle to be active. It also matches SKILL.md's own framing of `init` as "the one exception to the rule that a mutation needs an already-conforming root".
- **Something else** — for example `init` writing the marker itself, which would collapse two steps into one but crosses the line [#133](https://github.com/artemVeduta/okf-agent-skills/issues/133) drew: `.okf-active` is a plain filesystem action, not an OKF write.

Note the same circularity one step further on. SKILL.md:144 justifies gating `discover` because it "needs the bundle root to exist to know what to exclude from its own scan". Combined with the above, the only order that actually works is **repair → init → discover**, which no document states.

Whichever option wins, add a flow test that bootstraps a genuinely empty repository through the documented order and asserts each step succeeds. No current test does this, which is why a contradiction between two sections of the same file survived to a real user's first run.

## Comment by artemVeduta

## Resolution

Explicit `init` is the narrow bootstrap exception to the activation-marker gate. It may run when `.okf-active` is absent. The documented setup order remains:

`inspect -> consent -> init -> repair activation -> repair manifest -> discover`

This gives precedence to the later, specific bootstrap decision over the earlier general rule that an absent marker blocks mutation. It also follows the domain meaning of the activation marker: it selects automatic OKF behavior and grants no authority or permission.

The exception is limited as follows:

- Only an explicit `init` request can use it. No `okf-setup` operation runs automatically; an automatic request stays silent.
- A malformed marker still blocks mutation and reports `ACTIVATION_MARKER_INVALID`. The exception applies only when the marker is absent.
- `init` still runs ownership, REACH, TRUST, ACCESS, parent-writability, and post-write validation. It still skips PRESENCE and evidence because it creates the first bundle root.
- `init` creates or repairs only the bundle-root `index.md`. It does not create or repair `.okf-active` or `.okf-workspace.json`.
- Marker creation remains a separate, explicit `repair` action.
- All other mutations still require a valid activation marker.

This resolves a contract contradiction rather than adding a new setup capability. The runtime and setup instructions must implement the bootstrap order already settled by [Grilling: Init bootstrap — how /setup creates the bundle root through the write gate](https://github.com/artemVeduta/okf-agent-skills/issues/133) and recorded by completion decision D11.

Implementation and the required empty-repository wrapper flow test are tracked by [Task: Allow explicit init before activation and test clean bootstrap](https://github.com/artemVeduta/okf-agent-skills/issues/173).
