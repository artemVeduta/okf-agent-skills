---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/172
status: draft
type: Decision
---

# Grilling: How does setup validate transformed content against the accepted proposal?

Status: Closed.

## Parent

- #155

## Question

[Grilling: Setup proposes the target bundle tree for approval before publishing](https://github.com/artemVeduta/okf-agent-skills/issues/156) puts one approval before content transformation and requires staged output to match the accepted content scopes without a second routine approval.

Deterministic runtime checks can compare Concept IDs, types, groups, indexes, provenance assignments, and link targets. They cannot by themselves prove that transformed prose obeys an accepted semantic content scope. The current `migration-validate` operation checks structure and source dispositions, while semantic fidelity can remain unassessed.

Decide the staged semantic-validation gate:

- Which accepted proposal fields can the runtime verify directly?
- Which semantic checks require a fresh read-only review agent or another source outside the runtime?
- Must every approved split receive semantic review, or only a defined high-risk set?
- How do external findings enter the one wrapper contract seam without becoming a second authority?
- Which mismatch blocks publication, and which condition can publish only with an honest unassessed-fidelity report?
- How does a failed check return to a revised proposal or new transformation without adding checkpoint or resume state?

Settle the evidence and publication gate. Implementation follows.

## Comment by artemVeduta

## Resolution

Publication requires **migration proposal conformance** for the complete staged set. The accepted target bundle proposal remains the only authority.

### Deterministic gate

`migration-validate` compares the staged set with one closed list of accepted proposal fields:

- selected source dispositions;
- exact output set;
- Concept IDs and types;
- target paths and concept groups;
- index purposes and child entries;
- required `draft` state;
- accepted source observation bindings;
- authored provenance assignments;
- parsed internal link targets.

Any difference blocks publication.

### Semantic proposal review

After staging, a fresh read-only review agent checks every transformed output against its accepted content scope and observed sources. For each output, the result binds:

- Concept ID;
- staged body SHA-256;
- exact accepted content scope;
- accepted source observation bindings;
- a `pass` or `fail` verdict;
- explanatory findings.

The review also returns one source-level coverage verdict for every transformed selected source. This verdict checks the complete accepted split, retained material, and residue boundary across all outputs from that source.

Every output verdict and source-level verdict must pass. A failed, uncertain, stale, or missing verdict blocks publication. Review evidence does not approve output and does not become a second authority.

### Publication enforcement

`publish` receives the accepted proposal, staged set, and review result. Before its first write, it reruns the same validator against the exact current inputs. It does not trust a caller Boolean, validation receipt, approval token, checkpoint, or resume state.

A transformation defect discards the complete staged set and starts a new transformation under the same accepted proposal. If the content scope or another accepted proposal field must change, setup creates a new complete proposal and obtains acceptance before another transformation.

### Reporting

A passing gate supports the claim that deterministic proposal checks and read-only semantic proposal review passed. It does not establish human-assessed semantic fidelity. Publication without human review is permitted only after every proposal-conformance check passes, and the report must state that human semantic fidelity was not assessed.

This keeps the earlier human-review rule from [Research: Migration contract - converting arbitrary docs to OKF concepts](https://github.com/artemVeduta/okf-agent-skills/issues/131) and the one-acceptance model from [Grilling: Setup proposes the target bundle tree for approval before publishing](https://github.com/artemVeduta/okf-agent-skills/issues/156). No second routine approval is added.
