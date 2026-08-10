---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/23
status: draft
type: Research
---

# Research safe migration of existing knowledge corpora into OKF

Status: source GitHub issue closed.

## Question

What does primary-source and implementation-level research establish about safely migrating existing documentation corpora—Markdown documentation trees, wiki exports, Obsidian vaults, and mixed knowledge folders—into OKF without losing content, provenance, attachments, navigation, or user intent?

The report must investigate prior art and failure modes for:

- corpus inventory and classification before conversion;
- Markdown and frontmatter parsing fidelity;
- standard links, Obsidian wikilinks, anchors, attachments, embedded media, and unsupported formats;
- stable identity, duplicate detection, conflict handling, redirects, and link rewriting;
- distinguishing durable context from code-recoverable duplication;
- resumable and idempotent migration;
- dry-run manifests, explicit approval boundaries, preservation of originals, and independent backups;
- rollback and restore verification;
- post-migration conformance, completeness, and semantic spot checks;
- code-backed versus knowledge-only projects.

Use high-trust primary sources and source code where available. Separate evidence from candidate product policy. Write the cited findings to `docs/research/knowledge-corpus-migration.md`. This research must resolve before **Define safe migration of existing knowledge into OKF** is grilled.

## Comment by artemVeduta

# Resolution

Investigated with 8 parallel research sub-agents across all dimensions of safe knowledge corpus migration into OKF. The full synthesis is at `docs/research/knowledge-corpus-migration.md`.

## Key findings

**What exists:** Per-file conversion (Pandoc, obsidian-export) is mature. Per-corpus safety (inventory, backup, rollback, idempotency, validation) is not -- existing tools operate on individual files and assume the user has already surveyed their corpus. No single tool implements end-to-end dry-run manifests, backup verification, checkpoint/resume, or post-migration completeness checking.

**The single invariant every tool ecosystem converges on:** Write-new-then-swap, never mutate-in-place. rsync, blue-green deployment, restic, and database migration all independently arrive at this pattern. For OKF migration: write all transformed output to a temporary directory, validate, then atomically commit.

**YAML type coercion (the Norway problem) is the #1 data-loss risk.** Frontmatter values like `country: no`, `version: 1.10`, `tags: [python, 3.12]` are silently altered by default parsers. Failsafe schema + explicit quoting during ingestion is the recommended mitigation.

**OKF v0.2 has no concept-level identity field.** Path-based identity breaks on move/rename. UUID v7 (timestamp-ordered) in frontmatter + content hash (SHA-256) for deduplication is the candidate model. This gates 13 cross-cutting decisions.

**13 decisions that gate a migration tool:** identity mechanism, redirect implementation, duplicate detection depth, conflict resolution, deletion policy, approval gates, callout conversion, block embeds, attachment structure, auto-type assignment, Dataview preservation, classification granularity, and durable context detection thresholds.

**8 detailed supporting reports** at `docs/research/migration-sections/` -- each with full primary-source chains and citations. The evidence is established; the decisions are ready for human-in-the-loop resolution.

Resolves: Define safe migration of existing knowledge into OKF.
