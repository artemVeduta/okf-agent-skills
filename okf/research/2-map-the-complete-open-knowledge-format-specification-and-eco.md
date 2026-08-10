---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/2
status: draft
type: Research
---

# Map the complete Open Knowledge Format specification and ecosystem

Status: source GitHub issue closed.

## Question

What does a full primary-source investigation of the current Open Knowledge Format establish about its purpose, data model, bundle structure, §9 conformance rules, examples, validator, tools, skill, FAQs, maintenance status, and ecosystem—and what strengths, limitations, reusable patterns, and implementation choices follow from examining every project linked from the ecosystem map and every relevant deep link reachable from the supplied references?

The investigation must begin with the Google Cloud article, the GoogleCloudPlatform knowledge-catalog OKF sources, and all sections of https://okf.md/; follow their relevant deep links; inspect source repositories and official documentation for every ecosystem project; clearly distinguish normative requirements from examples or proposals; and write a deeply cited report to `docs/research/okf-spec-and-ecosystem.md`.

## Comment by artemVeduta

## Corrected resolution — 2026-07-26

The primary synthesis remains `docs/research/okf-spec-and-ecosystem.md`, supported by the numbered reports and `docs/research/ecosystem-deep/`.

### Corrected specification findings

- OKF v0.1 was announced on 2026-06-12. Its index, log, conformance, and versioning sections are §6, §7, **§9**, and §11.
- The v0.2 migration commit landed on 2026-07-24 and Google announced it on 2026-07-25. Dates inside examples are not release metadata. Current v0.2 bundle conformance is §11.
- The report now separates the three structural bundle tests from conditional producer requirements and consumer behavior. Conditional requirements include `sources[].resource`, `generated.by`, and `runtime` for `type: Attested Computation`.
- The research does **not** select the product's write version, v0.1 compatibility policy, fallback fields, or custom extensions. Those are delegated to **Choose the OKF conformance baseline, compatibility, and extension policy**.

### Corrected ecosystem findings

- An explicit coverage matrix accounts for every entry on the captured ecosystem map, including compatibility/concept entries such as Obsidian and GitHub Actions rather than pretending every map item is a new implementation.
- `kcagent` exists in `toolbox/enrichment`; its source distribution is distinct from whether a matching npm package exists.
- MCP-hosted validation already exists: Copperbox exposes `validate_bundle` and Caedora exposes `lint_bundle`. The narrower unverified gap is a thin MCP wrapper around `okflint`.
- `@quatrain/okf` is retained only as an explicitly excluded false positive.
- kcmd implements three MCP tools; `pull` and `push` are CLI operations.
- `signed-okf` implements Ed25519/JWKS signing, not OriginTrail anchoring. OriginTrail import defaults off-chain; on-chain publication is a separate explicit operation.
- Inkeep supplies OKF guidance/scaffolding rather than lint enforcement.
- Volatile download numbers and unsupported labels such as “gold standard,” “canonical,” “production grade,” and cross-project maturity rankings were removed or qualified.
- Knowledge Catalog round-trip evidence is limited to the demonstrated adapter/subset and is not generalized to arbitrary fields or MCP serving.

Statements are now classified as evidence, inference, candidate policy, or decision required. The ticket remains closed; this comment corrects the prior resolution without rewriting the issue history.

## Comment by artemVeduta

The corrected resolution and qualification of the evidence are recorded in the primary resolution comment above. Canonical local artifact: `docs/research/okf-spec-and-ecosystem.md`.

## Comment by artemVeduta

## Corrected ecosystem deep-dive note — 2026-07-26

The deep-dive directory remains useful, but the earlier summary overstated completeness and maturity.

Corrections now applied:

- ecosystem-map entries have an explicit coverage matrix and classification;
- `@quatrain/okf` is excluded as a false positive;
- `kcagent` is confirmed in Google's `toolbox/enrichment` source;
- kcmd's MCP surface is three tools;
- Copperbox and Caedora provide MCP validation operations;
- signed-okf and OriginTrail responsibilities are separated;
- Inkeep is guidance/scaffolding, not lint enforcement;
- volatile npm counts and unsupported “canonical,” “most mature,” and production-readiness labels are not used as evidence.

The detailed appendix may describe excluded projects for auditability, but excluded projects are not counted as OKF implementations. Research snapshots and package versions are date-scoped and must be rechecked before product decisions.

## Comment by artemVeduta

Historical note corrected: the previous links pointed to the wrong repository owner and were removed. The canonical repository is `artemVeduta/okf-agent-skills`; the corrected local artifacts are `docs/research/okf-spec-and-ecosystem.md` and `docs/research/ecosystem-deep/`.

## Comment by artemVeduta

Historical note corrected: this comment previously linked an unpublished commit under the wrong repository owner. Use the corrected resolution comment and the canonical local research paths above.
