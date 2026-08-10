---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/86
status: draft
type: Decision
---
# Reconcile D8 with reachable post-write validation results

Status: Closed

## Question

How must the D8 post-operation-check decision, runtime results, and wrapper-observable fixtures align when the current runtime has thirteen checks and several checks cannot produce the specified fail result?

## Comment by artemVeduta

## Resolution

D8 defines validation of the primary saved concept. It does not cover the later index and log derivative writes.

D8 has these twelve checks:

1. Exact root declaration
2. Project mode
3. Saved concept read
4. Saved-tree comparison
5. Reserved bundle files
6. Required concept type
7. Source resource
8. Generated-by value
9. Attested Computation runtime
10. Human actor prefix
11. Source link
12. Upstream source

The outer exception catch is error containment. It is not a thirteenth check.

The six shared checks for reserved bundle files and concept obligations remain before and after publication. The pre-write copies block normal invalid requests. The post-write copies are defense-in-depth checks for a changed saved state.

A check fail condition is a Validation Verdict. It is not always the lifecycle result. The public result matrix is:

- All checks pass: `applied` with `data.validation: "valid"`.
- A blocking check fails after publication: `failed/incomplete` with `data.validation: "failed"`.
- A shared gate finds normal invalid input before publication: `blocked` with `data.validation: "not-run"`.
- A source does not resolve to an existing file: the Source link check fails with a non-blocking `UNRESOLVED_INTERNAL_LINK` warning, while the operation stays `applied` with `data.validation: "valid"`. A directory is not an existing file.
- The outer catch contains an unexpected post-write validation error as `failed/incomplete`. This behavior stays separate from the D8 check count.

Wrapper fixtures must cover the reachable public outcome matrix. One conforming fixture can cover the aggregate pass result. Each deterministic finding and result pair gets wrapper-seam coverage. The shared pre-write gates get their `blocked` fixtures. Saved concept read, saved-tree comparison, and the post-write copies of shared gates do not need artificial wrapper failure fixtures when a normal request cannot trigger those branches. Their fail conditions stay documented. Do not add a public fault-injection mode, a filesystem race, structured per-check output, or an internal execution-order contract.

This resolution updates the earlier fixture statement in D8. It requires wrapper-observable coverage of reachable results, not a forced pass and fail fixture for every internal defensive branch.
