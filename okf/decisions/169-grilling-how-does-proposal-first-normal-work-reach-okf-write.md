---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/169
status: draft
type: Decision
---

# Grilling: How does proposal-first normal work reach okf-write?

Status: Closed.

## Parent

- [/okf-setup: propose the target bundle before writing it, and report only what it did](https://github.com/artemVeduta/okf-agent-skills/issues/155)

## Question

**How does an external document-producing skill enter the proposal-first lifecycle without inventing a second proposal protocol?**

[Grilling: How does an external skill use an OKF bundle out of the box, and how do we test it?](https://github.com/artemVeduta/okf-agent-skills/issues/168) requires the agent connector to direct normal durable work through `okf-lifecycle`: one complete proposal first, then one `okf-write` call per accepted concept.

The shipped process contract does not represent that flow. `okf-lifecycle` owns only `sync`, and `sync` requires one existing `payload.concept`. It cannot propose creation of a new concept or a coherent set of concepts. [Grilling: What does a user actually do with an OKF bundle?](https://github.com/artemVeduta/okf-agent-skills/issues/164) also forbids a new proposal wrapper operation and a batch-write operation.

Decide the one orchestration seam:

- Does the `okf-lifecycle` skill orchestrate proposal construction outside its wrapper, using `okf-read` for evidence and `okf-write` only after acceptance?
- If yes, what exact artifact crosses from the external skill to `okf-lifecycle`, and what acceptance record prevents an unapproved write?
- If no, which earlier rule changes without adding a seventh skill or a second runtime contract seam?
- How can the deterministic external-skill fixture prove proposal-first behavior when only wrapper processes are tested contract boundaries?

The result must preserve zero dependencies, one wrapper process seam per skill, one user decision for the complete proposal, and one validated write per concept.

Invoke `/grilling` and `/domain-modeling`.

## Comment by artemVeduta

## Resolution

`okf-lifecycle` owns proposal construction in its skill procedure, outside its wrapper process. It uses `okf-read` for evidence. Its wrapper keeps `sync` as the only operation. No proposal wrapper operation, batch-write operation, seventh skill, or second runtime seam is added.

### Lifecycle handoff

An external document-producing skill gives `okf-lifecycle` one session-local lifecycle handoff with:

- workspace
- bundle
- task kind
- user goal
- completed work summary
- observed evidence
- candidate durable changes

Each candidate gives its intended content and can suggest a concept path and type. Lifecycle reads the bundle and selects the final path, type, operation, and evidence list. Observed evidence in the handoff does not by itself satisfy the write-evidence gate. [Grilling: What is evidence for? The gate checks existence, not relevance](https://github.com/artemVeduta/okf-agent-skills/issues/167) still owns that rule.

### Proposal acceptance

Lifecycle presents one complete proposal. The proposal contains an ordered list of exact write requests. Each item names the operation, concept, exact changes, body when the operation supports it, and evidence.

Clear user acceptance creates a session-local accepted proposal record and freezes that list. A rejection clears it. An adjustment requires a revised complete proposal and clear acceptance before any write.

This is a procedure guarantee, not a runtime approval protocol. `okf-write` cannot prove that a human accepted the proposal and cannot reject a direct call on that basis. `invocation: "explicit"` does not attest acceptance. A runtime-enforced token would require a separate recorded decision that revises this seam.

### Writes and partial results

Lifecycle sends one `okf-write` request for each listed concept. Each accepted item permits one attempt. One failed write does not cancel successful writes or stop unrelated listed writes. Lifecycle reports the complete result and does not retry automatically. A changed request or added concept requires a new complete proposal and acceptance.

### Deterministic proof

The release-gating fixture uses only existing wrapper processes. It:

1. Reads the connector.
2. Models the lifecycle handoff and accepted proposal as fixture data.
3. Confirms that the bundle did not change before the test acceptance boundary.
4. Calls `okf-write` once for each listed concept.
5. Reads the concepts and validates the final bundle.

This fixture proves that the documented flow is compatible with the wrapper contracts. It does not prove that a human accepted the proposal or that a real agent waited. The separate live external-skill test observes that behavior across supported harnesses.

### Map effect

This decision closes the lifecycle dependency for [Task: Create the external-skill connector and deterministic conformance fixture](https://github.com/artemVeduta/okf-agent-skills/issues/170). It creates no new runtime operation and no new ticket.
