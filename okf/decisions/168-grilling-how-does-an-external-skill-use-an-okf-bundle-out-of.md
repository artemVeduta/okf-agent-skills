---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/168
status: draft
type: Decision
---

# Grilling: How does an external skill use an OKF bundle out of the box, and how do we test it?

Status: Closed.

## Parent

- #155

## Question

**How does a skill that is not ours use an OKF bundle out of the box, and how would we ever know it worked?**

We now have the first real external consumer, and it is a useful shock. A user installed the Matt Pocock skill pack into a fresh repository whose only OKF content was a bootstrapped bundle, told it *"use the okf folder instead of docs, with its own rules"*, and it complied — producing this:

```
okf/
├── index.md
└── agents/
    ├── issue-tracker.md   ← type: Playbook
    ├── triage-labels.md   ← type: Reference
    └── domain.md          ← type: Playbook
```

It wrote all three through `okf-write` `create` rather than editing files directly, and the `domain.md` it generated instructs every downstream skill to read the bundle through `okf-read`, to never edit bundle files with ad-hoc tools, to treat a domain term as a `Glossary` concept and a decision as a `Decision` concept, and to proceed silently when a concept does not exist.

Much of that is exactly the behavior we want. **None of it was published anywhere.** The agent derived it by reading our skill sources. That is the finding: the contract an external skill needs is currently reverse-engineered, not documented, and the parts it got right were luck as much as design.

### Is this legitimate use?

The pack stored **agent-skill configuration** as OKF concepts. That is a use we never considered.

- Is agent configuration durable *knowledge*, or is it configuration that happens to be Markdown? A `Playbook` concept describing where issues live is a different kind of thing from a `Decision` about the architecture.
- Should `okf/agents/` exist at all? It is not a canonical type directory, which makes it a live instance of [#160](https://github.com/artemVeduta/okf-agent-skills/issues/160) and [#163](https://github.com/artemVeduta/okf-agent-skills/issues/163) arriving from outside rather than from migration.
- If a bundle becomes a config store, does `okf-read` search start returning configuration when a user asks a domain question? Does trust review mean anything for a config file?
- Or is this exactly right — the bundle is the project's durable context, and how the project's agents behave *is* durable context?

### What is the out-of-the-box contract?

- What must an external skill know to use a bundle correctly? Candidates: writes go through `okf-write`; reads go through `okf-read`; never edit bundle files directly; a nested `index.md` is navigation, never a concept; pick a real type instead of defaulting to `Note`; cite evidence that means something.
- **Where does that contract live?** A published document, a skill the pack invokes, something `init` writes into the bundle, or the bundle root itself declaring it?
- How does an external skill discover the type taxonomy, given that it is deliberately open?
- What should an external skill do on a **fresh** bundle, where the evidence requirement can only be satisfied by citing the root ([#167](https://github.com/artemVeduta/okf-agent-skills/issues/167))?
- Is there a supported way for an external skill to declare "I own this subtree", or does everything share one flat namespace?

### How do we test it?

This is the half with no answer at all today. The suite tests our own wrappers through their own process boundary. Nothing tests a *foreign* consumer.

- What does a conformance test for an external skill look like? A fixture repository plus a scripted sequence, or a checklist a skill author self-certifies against?
- Can we test the out-of-the-box path end to end — install into an empty repo, bootstrap, have a non-OKF skill write and read concepts, assert the bundle still validates?
- Should there be an **integration fixture** in this repo that pins the contract, so a change to admission or the write gate that breaks external consumers fails a test rather than a user's first run?
- The two live sessions that produced this ticket found four real defects between them ([#165](https://github.com/artemVeduta/okf-agent-skills/issues/165), [#166](https://github.com/artemVeduta/okf-agent-skills/issues/166), [#167](https://github.com/artemVeduta/okf-agent-skills/issues/167), and the dogfood set). **Every one was found by a human running it, not by the suite.** What class of test would have caught each? Answer that per defect — it is the sharpest available signal about what is missing.
- Does "out of the box" include harnesses other than Claude Code? [#15](https://github.com/artemVeduta/okf-agent-skills/issues/15) already carries live cross-harness acceptance testing; decide whether this is the same effort or a different one.

### Relationship to the rest of the map

This ticket is **empirical input** to [#164](https://github.com/artemVeduta/okf-agent-skills/issues/164), not output from it. We have an observed external consumer to study, and what it did tells us something about what users do with a bundle that no amount of reasoning would have produced. It is deliberately left unblocked for that reason — but its conclusions should feed [#164](https://github.com/artemVeduta/okf-agent-skills/issues/164)'s action inventory rather than being settled independently of it.

Invoke `/grilling`.

## Comment by artemVeduta

## Resolution

An **external document-producing skill** is a third-party skill outside this suite whose normal work creates or maintains project documents. It is not an OKF producer by purpose. When it targets an OKF bundle, it uses the owning OKF flows. Direct bundle edits by an agent or another skill are unsupported.

Durable, human-readable **agent policy** is valid OKF knowledge. Executable permissions, hooks, and harness settings remain authoritative configuration outside the bundle.

### Agent connector

Setup gives every new bundle this discovery path:

```text
index.md
└── agents/
    ├── index.md
    └── okf.md
```

- The root index links to `agents/index.md`.
- `agents/index.md` is navigation only and links to the `agents/okf` concept.
- `agents/okf.md` has type `Playbook` and is the **agent connector concept**.
- Setup creates this structure in every new bundle. For an existing bundle, setup includes it in the target-tree proposal.
- Its absence does not make an upstream OKF bundle nonconforming.
- `agents/` is a reader-purpose concept group. It is not a namespace owned by an external skill. External skills do not own subtrees.

The connector contains stable suite rules, not a copy of wrapper request schemas:

- Use `okf-read` for reads.
- Use `okf-lifecycle` to prepare one complete change proposal during normal work.
- After user acceptance, use `okf-write` once for each accepted concept.
- Never edit bundle files directly.
- Treat every nested `index.md` as navigation, never as a concept.
- Keep the type taxonomy open. Inspect current concepts, select a precise semantic type, and ask when uncertain. Never default to `Note`.
- Cite only meaningful evidence. Never cite the root or connector only to satisfy the gate.
- Find project-specific agent policy through the `agents` index.
- Use each owning skill's installed instructions for exact request fields and refusal behavior.

The out-of-box promise starts after the OKF suite is installed and setup has created and activated the bundle. The user still selects OKF as the documentation system for the external skill's task. The user does not have to teach the skill the operating rules.

If a fresh bundle has no meaningful evidence, the external skill reports that the write is blocked. It does not invent evidence. [Grilling: What is evidence for? The gate checks existence, not relevance](https://github.com/artemVeduta/okf-agent-skills/issues/167) owns the accepted evidence form and the symlink-safety decision.

### Conformance and tests

**External-skill conformance** means the skill discovers the connector, uses the owning OKF flows, avoids direct bundle edits, selects meaningful concept types, and leaves a suite-valid bundle. It does not establish the semantic truth or trust of the authored content.

Use two test layers:

1. A deterministic, release-gating integration fixture bootstraps a fresh repository, verifies the root-to-connector navigation chain, runs the documented multi-wrapper flow, reads the created concepts back, and validates the final bundle.
2. A non-gating live-agent case pins the real third-party document-producing skill pack that exposed this gap. It runs one fixed agent-policy task in Claude Code, Codex, and OpenCode. The prompt tells the skill to use the existing OKF bundle but does not teach wrapper, index, type, evidence, or proposal rules. The case captures redacted process evidence and validates the final bundle.

The live case is a separate external-consumer case group from [Add live cross-harness acceptance testing for v0.2.0](https://github.com/artemVeduta/okf-agent-skills/issues/15). It reuses that effort's runner, fixtures, redaction, and trial rules.

### Defect-to-test map

| Human-found defect | Smallest test that would have caught it |
|---|---|
| [Task: discover must exclude OKF's own config files from the candidate scan](https://github.com/artemVeduta/okf-agent-skills/issues/165) | A wrapper contract fixture that bootstraps an otherwise empty repository and requires `discover` to return zero sources. |
| [Grilling: The documented bootstrap order cannot work](https://github.com/artemVeduta/okf-agent-skills/issues/166) | A multi-wrapper integration test that runs the documented clean-repository setup order. A skill-instruction check keeps the procedure text in the same order. |
| [Grilling: What is evidence for? The gate checks existence, not relevance](https://github.com/artemVeduta/okf-agent-skills/issues/167) | A wrapper contract test for symlink escape. A deterministic relevance test waits for a checkable relevance rule. The live external-skill case detects evidence theater. |
| [Grilling: Residue is classified but never retained](https://github.com/artemVeduta/okf-agent-skills/issues/157) | After the residue decision, a multi-wrapper migration test must compare the report with bytes on disk. |
| [Grilling: Narrow, reorder, or remove the Glossary type-inference rule](https://github.com/artemVeduta/okf-agent-skills/issues/158) | A wrapper contract negative fixture with research metadata that must not infer `Glossary`. |
| [Task: Fix link rewriting](https://github.com/artemVeduta/okf-agent-skills/issues/159) | A wrapper contract fixture with one fragment link and one bare sibling link. |
| [Grilling: Where does a concept go when its type has no canonical directory?](https://github.com/artemVeduta/okf-agent-skills/issues/160) | The target-tree integration test must prove that type does not choose placement and source path is not a fallback. |

### Map effect

This decision makes the external consumer part of the setup structure. It also makes the proposal-first lifecycle seam, connector installation, deterministic conformance fixture, and separate live external-skill case precise enough for follow-up tickets. The deterministic conformance fixture remains blocked until setup order, evidence, target-tree proposal, and proposal-first lifecycle decisions permit the documented flow.

## Comment by artemVeduta

## Follow-up tickets

- [Grilling: How does proposal-first normal work reach okf-write?](https://github.com/artemVeduta/okf-agent-skills/issues/169)
- [Task: Create the external-skill connector and deterministic conformance fixture](https://github.com/artemVeduta/okf-agent-skills/issues/170)
- [Task: Run pinned external-skill acceptance across supported harnesses](https://github.com/artemVeduta/okf-agent-skills/issues/171)

The map contains all three as child issues with native blocking relationships.
