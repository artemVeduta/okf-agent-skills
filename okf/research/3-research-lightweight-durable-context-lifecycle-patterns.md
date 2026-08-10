---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/3
status: draft
type: Research
---

# Research lightweight durable-context lifecycle patterns

Status: source GitHub issue closed.

## Question

What compact, low-slop knowledge lifecycle should OKF skills use so agents retain team vocabulary, rationale, constraints, invariants, external research, and other knowledge not recoverable from code—without duplicating constants, configuration, behavior, or implementation—and how should this differ for knowledge-only projects?

Investigate primary and high-trust sources on durable agent context and knowledge maintenance; obtain and analyze the supplied YouTube Short transcript; identify useful Obsidian knowledge-management practices without adopting Obsidian syntax or integration; and compare approaches for concept depth, glossaries, logs, provenance, freshness, approvals/notices, growth thresholds, compaction, archiving, loss prevention, and retrieval. Write the cited report to `docs/research/lightweight-durable-context.md`.

## Comment by artemVeduta

## Corrected resolution — 2026-07-26

The four research reports remain the resolution artifacts:

- `docs/research/lightweight-durable-context.md`
- `docs/research/durable-context-platforms.md`
- `docs/research/obsidian-transferable-patterns.md`
- `docs/research/lifecycle-dimensions.md`

### Corrected findings

- The sampled coding-agent products repeatedly use scoped Markdown instructions, skills, or memories, but their mechanisms and limits differ. None of the reviewed primary documentation describes a complete checked-in knowledge lifecycle covering freshness, identity, restructuring, retrieval, archive, migration, and recovery.
- Matt Pocock's video is represented accurately as a design premise: avoid mirroring code; preserve rationale and alternatives, domain language, and thin navigation. It is an informed opinion, not empirical validation. The report now cites the direct video with timestamp mapping.
- Code-backed and knowledge-only projects require different authority boundaries. Code-backed OKF should preserve compact knowledge that is not adequately recoverable from code; knowledge-only OKF may be the complete project record.
- Zettelkasten counts such as 500–700 or 1,000–1,500 notes describe one practitioner's recollection. They are not adopted thresholds. The same applies to proposed word, age, overlap, result-count, retention, and token values: all remain configurable candidates requiring fixture benchmarks.
- Git history, reflogs, and `git archive` are not sufficient as the sole loss-prevention mechanism. Risky migration, merge/split, archive, purge, and compaction operations require a dry-run, verified independent snapshot or backup, disposable restore test, explicit approval, and post-operation validation.
- Bundle-relative paths are locators, not automatically stable identities. Identity, routing, redirects, merge/split, and inbound-link behavior remain explicit decisions.

### Follow-up decisions

The map now contains dedicated decisions for trust tiers, traceability/freshness, retrieval, archive, concept identity/routing, and merge/split/redirect semantics. **Research safe migration of existing knowledge corpora into OKF** now blocks the migration decision.

The research explicitly labels statements as **Evidence**, **Inference**, **Candidate default**, or **Decision required** so later tickets do not silently promote proposals into product policy.
