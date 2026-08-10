---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/167
status: draft
type: Decision
---

# Grilling: What is evidence for? The gate checks existence, not relevance

Status: Closed.

## Parent

- #155

## Question

**What is evidence actually for?**

The evidence gate validates that a cited path exists inside the bundle and can be read. Nothing more. `scripts/lib/runtime.js:75-87`:

```js
const file = path.resolve(bundleRoot, relative);
if (!inside(bundleRoot, file)) return { invalid: true, evidence };
try { services.readFile(file); } catch { return { unavailable: true, evidence }; }
```

The content is read and **discarded**. There is no parsing, no relevance check, no comparison against the concept being written, no check that the evidence differs from the write target, and no uniqueness check across concepts.

This is not theoretical. An external skill pack created three unrelated concepts in a fresh bundle and cited `okf/index.md` as the evidence for all three, stating openly why:

> "I used `okf/index.md` as evidence for all three concepts because the bundle held no other file; swap in real evidence if it matters to you."

The gate accepted it. A bootstrap bundle contains exactly one readable file, so on a fresh bundle the evidence requirement can only ever be satisfied one way — by citing the root — which means it discriminates nothing at precisely the moment the first concepts are written.

### The decision

- Is evidence a **provenance claim** — "this concept is supported by that material" — in which case the gate must check something about the relationship, and citing the bundle root should be refused?
- Is it an **anti-fabrication speed bump** — force the author to name a file that exists, so a concept cannot be conjured from nothing — in which case it is working as designed and the documentation should stop implying more?
- Is it **ceremony** that a fresh bundle cannot satisfy honestly, in which case `create` on an empty bundle needs a different rule, the same way `init` needed one for the write gate?
- If evidence is meant to be meaningful, what is the minimum checkable property? "Not the concept itself", "not the bundle root", "referenced by the concept body", or something stronger?

### Also settle, in the same session

`inside(bundleRoot, file)` at `runtime.js:82` is a containment check on the resolved path with **no `realpath`**. Compare `scripts/lib/presence.js:44-52`, which calls `services.realpath` on both sides before its containment test. This is the same asymmetry [#151](https://github.com/artemVeduta/okf-agent-skills/issues/151) closed for concept paths, still open on the evidence path. Decide whether the evidence path needs the same `realpath` re-check and a `SYMLINK_ESCAPE` refusal.

## Comment by artemVeduta

## Resolution

Write evidence is an **observation binding** between material used during a resolution and one exact proposed mutation. It is not authored provenance and it is not proof of semantic relevance. Standard OKF `sources` remains the only authored provenance. The skill procedure judges relevance; the runtime checks only objective facts that it can observe.

### Evidence classes

Two classes can support a write:

1. A local file observation that the runtime can recheck.
2. A human statement or non-file tool result that is frozen in the session-local accepted proposal.

Non-file evidence does not cross the wrapper seam. No token or self-attested evidence object is added for a fact the runtime cannot check. As decided in [Grilling: How does proposal-first normal work reach okf-write?](https://github.com/artemVeduta/okf-agent-skills/issues/169), the wrapper cannot prove proposal acceptance; this remains a procedure guarantee and is reported as a limit.

### File binding

A file binding has this exact shape:

```json
{
  "path": "docs/source.md",
  "sha256": "64 lowercase hexadecimal characters"
}
```

Paths are relative to the active Git worktree, not to the bundle. Absolute paths and paths with a `..` segment are invalid. This lets a concept use authoritative source material in the same repository, including migration sources outside the bundle.

For each binding, the runtime:

1. Resolves the path from the active worktree.
2. Requires a regular readable file.
3. Recomputes realpath containment inside the active worktree.
4. Reads the exact bytes and computes SHA-256.
5. Requires the computed identity to equal the accepted identity.

The target concept, `index.md`, and `log.md` can be supporting observations, but they cannot be the only evidence for a claim change. One source file may support more than one concept; uniqueness is not a validity rule. The runtime does not inspect content for semantic relevance and does not require a body reference, because that would invent a second provenance convention.

### Operation rules

- `create`, a claim-affecting `revise`, and `relationship` require accepted-proposal evidence. File bindings are optional because direct human evidence and non-file observations are valid.
- `machine-verify` requires qualifying recheckable file evidence. Proposal-only evidence cannot change trust.
- `format` and non-claim metadata changes require no semantic evidence.
- `sync` inherits the rule of the selected `create` or `revise` operation.

An empty file-binding list is valid except for `machine-verify`. It means the wrapper verified no file evidence; it does not mean the write had no proposal evidence.

### Refusals

| Cause | Code |
| --- | --- |
| Malformed binding, absolute path, `..`, or malformed digest | `UNSUPPORTED_INPUT` |
| Missing, unreadable, or non-regular file | `EVIDENCE_UNAVAILABLE` |
| Real path outside the active worktree | `SYMLINK_ESCAPE` |
| Current byte identity differs from the accepted identity | `EVIDENCE_CHANGED` |
| `machine-verify` has no qualifying file binding | `EVIDENCE_REQUIRED` |

The evidence path gets the same realpath re-check and `SYMLINK_ESCAPE` refusal that [Task: create must make a missing concept parent directory before publish can work](https://github.com/artemVeduta/okf-agent-skills/issues/151) applied to concept and derivative paths.

### Response contract

`data.evidence` lists only file bindings whose current SHA-256 identity matched the accepted value. `evidence_limits` always states that semantic support is not runtime-verified and that non-file evidence exists only in the accepted proposal. An empty `data.evidence` list is valid and honest.

### Setup consequence

Setup must stop using `index.md` as filler evidence for every migrated concept. The accepted migration proposal binds each concept to its actual source file or files and their SHA-256 identities. A split can bind several concepts to one source. A synthesis can bind one concept to several sources. Human adjustments and non-file observations remain in the accepted proposal.

### Compatibility and testing

String-only evidence entries are rejected. No compatibility form is kept. Deterministic wrapper-seam tests must cover every refusal above, a matched binding, a valid proposal-only write, repeated use of one source, setup publication with actual source bindings, and honest response limits.
