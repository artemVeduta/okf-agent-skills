# Test layout

The suite is one file per behaviour domain. The gate is:

    node --test "test/**/*.test.js"

Quote the glob so Node expands it, not the shell. `node --test test/` is
rejected by Node and matches nothing.

A ticket usually arrives as a symptom, not a domain name. Find the symptom
below; it names the one or two files to open. Domain names alone do not
disambiguate the write path — "publish wrote a file outside the bundle" is
plausible in four different files, so the symptom column is the index, not
the directory.

| File | Open it when the symptom is |
| --- | --- |
| `agents/connector.test.js` | A shipped agent definition, its tool allowlist, or the root-to-connector navigation and proposal-first entry flow is wrong. |
| `authority/write-gate.test.js` | A write was accepted that should have been refused for mode, scope, ownership, evidence, root declaration, or semantic preservation — refused before any byte reaches disk. |
| `bundle/federation.test.js` | A federation manifest lists repositories or bundles wrongly, or two bundles collide across a cross-bundle read. |
| `bundle/reach.test.js` | A path above the root, a sibling, an out-of-workspace candidate, or a symlink escape was reached — or a refusal disclosed a path it should not have. |
| `bundle/navigation.test.js` | An exact read misses, search returns the wrong set or the wrong vocabulary, a deprecated concept surfaces in results, the index is not preserved, or inbound links are miscounted. |
| `bundle/setup-root.test.js` | `init`, `inspect`, or `repair` of the bundle root misbehaves, the manifest grammar or settings lookup is wrong, or the pre-manifest bootstrap exception leaks. |
| `conformance/validation.test.js` | `validate` reports the wrong verdict or finding, a link verdict is wrong, a pre- or post-write field gate lets bad frontmatter through, or the YAML 1.2 subset parses something it must not. |
| `evidence/trust.test.js` | A trust tier, staleness window, review dependency, verification promotion, dependency-state report, or write-evidence file binding is wrong. |
| `evidence/semantic-review.test.js` | Structural coverage, agent review, and human fidelity are conflated, or a malformed, gapped, overlapping, duplicate, or out-of-bounds accepted review row is not refused. |
| `harness/execution.test.js` | Orientation gates or activation markers misfire, an installed skill store fails to resolve its wrapper, a skill does not run independently of the checkout, the adapter bridge does not narrow delegation, or an oversized response returns no receipt. |
| `ledger/split-report.test.js` | The final split report counts the wrong concepts, loses canonical output order, misreports a partial publication, or accepts a fabricated publication record. |
| `lifecycle/proposal-capture.test.js` | The documented assisted-capture proposal rules or the folder-local maintenance rules in `okf-lifecycle` are missing or wrong. |
| `lifecycle/sync.test.js` | `sync` produces the wrong outcome, or the deprecation retention policy keeps or drops the wrong thing. |
| `protocol/process-contract.test.js` | A wrapper process returns the wrong exit status, envelope, or key order, activation gating is skipped, or a delegation brief or receipt dispatches wrongly. |
| `protocol/skill-documents.test.js` | A `SKILL.md` frontmatter field, the router dispatch table, the shipped skill inventory, or a documented request example disagrees with what the real gates do. |
| `safety/write-settlement.test.js` | A write settled wrongly on disk: publish order, verification invalidation, aborted rename, leftover temporary file, unwritable or non-directory parent, or a symlink escape reached at write time. |
| `migration/discovery.test.js` | The discovery scan classifies a source wrongly, misses or over-reports files during the walk, picks up files setup itself wrote, or gets monorepo package boundaries wrong. |
| `migration/mapping.test.js` | The migration plan derives the wrong mapping, asks the wrong question or fails to gate on it, misreads type evidence or provenance, rewrites a link wrongly, mishandles duplicates, or treats a Glossary as a content heuristic. |
| `migration/links-residue.test.js` | A rewritten link loses its `#fragment`, a bare sibling name resolves wrongly, a link is not re-expressed from the concept's new directory depth, or migration residue is treated as anything but report-only. |
| `migration/split-trigger.test.js` | Split review opens (or fails to open) for the wrong reason — word target, explicit request, derived semantic boundary — or a source under review is sectioned or accounted for wrongly. |
| `migration/split-proposal.test.js` | The split proposal has the wrong shape, route inventory, or canonical order, or a residue section does not keep its source heading. |
| `migration/partition-assembly.test.js` | Sharding produces the wrong worker briefs, assembly into staged files is wrong, or worker split output does not map back correctly. |
| `migration/group-packages.test.js` | A folder-local concept group is assigned, questioned, collided, or refused wrongly — including an output accepted at the bundle root or a group the accepted set does not carry. |
| `migration/publish-precheck.test.js` | Publication proceeded despite a changed candidate set, a stale semantic review, changed source bytes, malformed publication input, or a staged candidate at the bundle root — i.e. a pre-write check that should have blocked with zero writes. |
| `migration/publish-report.test.js` | The staged bundle validates wrongly, the delegated publish through the write gate misbehaves, or the final migration report is wrong. |

## Adding tests

Add to the file whose symptom row already covers the behaviour. Add a new
file only for a domain no row names. When a file passes roughly 1100 lines,
split it by sub-topic and give each part its own row here.
