---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/82
status: draft
type: Decision
---
# Decide automatic synchronization invocation semantics

Status: closed.

## Question

Does automatic lifecycle synchronization mean agent-selected work that makes an explicit wrapper request, or must the runtime accept an automatic invocation class, and how must the skill and runtime state this consistently?

## Comment by artemVeduta

## Resolution

Automatic lifecycle synchronization is **agent-selected synchronization**: narrow, evidence-backed maintenance that the agent selects during an established user task. The agent sends this work through the wrapper as `invocation: "explicit"`. Model or parent-skill routing does not change it to an automatic invocation.

An **explicit invocation** is a deliberate wrapper process request. It does not attest that a human directly approved the mutation.

An **automatic invocation** is a request emitted by an adapter or hook. It stays read-only. An automatic `okf-lifecycle` `sync` request must return the existing `AUTOMATIC_MUTATION_BLOCKED` result, even when its evidence and scope are otherwise valid.

Every `okf-lifecycle` `sync` request must include `invocation`. A missing value is an invalid request. The skill, glossary, protocol, runtime, and wrapper tests must use these distinct terms and results consistently.

This decision does not add automatic diff-scoped or full-project synchronization. Those operations remain outside the narrow incremental write path.

### Required follow-through

[Align lifecycle skill and runtime synchronization behavior](https://github.com/artemVeduta/okf-agent-skills/issues/102) must apply this contract to the lifecycle skill, glossary, protocol validation, runtime behavior, and wrapper tests.
