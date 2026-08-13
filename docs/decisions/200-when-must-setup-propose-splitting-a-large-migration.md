---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/200
type: Decision
---

# Grilling: When must setup propose splitting a large migration source?

Status: Closed.

## Parent

- [/okf-setup: propose the target bundle before writing it, and report only what it did](https://github.com/artemVeduta/okf-agent-skills/issues/155)

## Question

When must setup propose that one selected migration source become several Markdown concepts?

The user requires setup to detect large source files during migration and propose a split into separate Markdown documents before transformation. The user approves the exact split; setup must not split or publish automatically.

Decide:

- the precise meaning of `large source` and whether the trigger is deterministic;
- whether chunks are semantic concepts, fixed-size fragments, or another unit;
- whether a large but coherent source can remain one concept;
- how headings, anchors, provenance, links, and target groups bind each proposed output;
- what the proposal shows and how the user adjusts it;
- what validation proves that every source section has one disposition and no content is lost or duplicated;
- how the rule composes with the one-source-to-one-concept default and explicit Migration splits.

## Comment by artemVeduta

## Resolution

The user approved this complete contract.

### Shared file-word setting

Every OKF setting has one built-in default and one optional workspace override. The complete precedence is `built-in default < .okf-workspace.json override`; there is no user-global, bundle, harness, or session layer.

`.okf-workspace.json` can contain:

```json
{
  "settings": {
    "max_words_per_file": 1000
  }
}
```

Both `settings` and each override are optional. `max_words_per_file` is a soft target with a built-in default of `1000`. A word is one continuous sequence of letters or numbers. Headings, prose, tables, frontmatter, and code count; Markdown marks do not. An unknown or invalid override produces an exact finding and leaves the built-in default effective. It does not invalidate otherwise valid bundle configuration.

The file-word target applies to selected migration sources and all substantive authored Markdown concepts, including domain-specific concepts. It does not apply to navigation-only indexes or generated connector files. Normal reads do not warn only because a file exceeds the target. An untouched existing file does not fail. The target alone never blocks validation or mutation.

### Split trigger and unit

One selected source produces one concept by default. A source above the effective file-word target must receive split review. A smaller source can receive split review when setup finds clear semantic boundaries or when the user requests it.

Split review produces either an exact migration split or an explicit keep-as-one result with a reason. A large but coherent source can remain one concept after user acceptance. Each output is one semantic concept. Setup never creates fixed-size concept fragments.

An explicit user split uses the same proposal and validation contract. Workers transform accepted mappings only and cannot add or change a split.

### Source accounting

A Markdown heading and its content form the normal source section. Content before the first heading forms a section. When one heading contains several concepts, setup can divide it only at visible Markdown block boundaries such as paragraphs, lists, tables, or code blocks. It never cuts one of those blocks only to meet the word target.

One output can use non-adjacent sections when they form one concept. The proposal lists their exact output order. Source order is the default; a different order must be explicit.

Each source section has exactly one disposition: assignment to one output concept, or migration residue left at the source path. No source section can be missing or assigned twice.

### Proposal and adjustment

The split-review view shows the source path, effective target, word count, review reason, each source section, its heading path, line range, short boundary excerpts, disposition, and output order. The user can inspect any complete section before deciding.

Each output row shows exact Concept ID, type, title, heading outline, path, reader-purpose group, provenance assignments, link routes, and anchor routes. The derived tree shows every group purpose, navigation index, and child entry. A keep-as-one result shows the same fields for one output and its reason.

The user can merge or divide outputs, move or reorder sections, rename outputs, change types or groups, and change provenance or link routes. Any change creates one new complete proposal. Setup does not apply a partial patch to an old proposal. Full output transformation starts only after the user accepts the complete proposal.

### Headings, anchors, links, groups, and provenance

Source headings give boundary evidence but do not control concept identity, type, or placement. Setup keeps accurate heading text but can propose a clearer heading or hierarchy. The proposal shows every changed or removed heading.

A link with a source heading anchor routes to the output that owns that section. If the heading changes, the proposal shows the new anchor. A link to the whole split source has no automatic target; the user selects one output concept or one group index. An ambiguous link blocks acceptance. Setup never guesses.

Outputs from one source can go to different reader-purpose groups. Each output independently goes to the bundle root or to its accepted group.

An observed source path is migration evidence, not authored provenance. Existing authored `sources` entries go only to outputs whose assigned content supports them. The proposal shows each assignment. An unclear assignment blocks acceptance.

### Validation and publication

The accepted proposal binds the source content identity and exact source-section ranges. Together, the ranges must cover the complete source once, with no gap or overlap, one disposition for each range, and one accepted output order. A source change invalidates the proposal before transformation or publication.

The transformed candidate set must exactly equal the accepted proposal: output Concept IDs, paths, types, titles, heading outlines, source-section assignments and order, groups, indexes, provenance, links, anchors, and total output count. A missing, extra, or changed item blocks publication and requires a new proposal.

Fresh read-only review reports each source section as `preserved`, `missing`, `duplicated`, or `uncertain`. Only `preserved` passes. The result states separately whether structural coverage passed, agent semantic review passed, and human semantic fidelity was assessed.

Before the first write, publication reruns source identity, complete candidate-set conformance, and review freshness. A precheck failure writes nothing. A later write failure is reported exactly as partial work. Setup does not claim atomic publication or recovery.

### Report

For each reviewed source, the report records the effective `max_words_per_file` value, source word count, review reason, accepted split or keep-as-one result, every source-section disposition, every planned and actual output, conformance and semantic-review results, and every failed or skipped write. Counts use actual output concepts, not source-file count.

### Superseded rules

This resolution supersedes the conflicting exact no-`settings` manifest grammar in [Grilling: Is `.okf-active` needed, and what replaces project activation?](https://github.com/artemVeduta/okf-agent-skills/issues/196). It also supersedes the multi-layer settings chain in [Decide inline versus sub-agent OKF maintenance and `.okf-*` settings](https://github.com/artemVeduta/okf-agent-skills/issues/38). Their independent activation, admission, authority, and safety rules remain.
