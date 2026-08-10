---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/155
status: draft
type: Decision
---
# /okf-setup: propose the target bundle before writing it, and report only what it did

Status: Open.

## Destination

An OKF suite whose **structure follows from what people actually do with it**, and whose **setup proposes before it writes**.

The map was chartered on the second half alone. Its root ticket ([Grilling: What does a user actually do with an OKF bundle?](https://github.com/artemVeduta/okf-agent-skills/issues/164)) widened it: the question "is the bundle structure strict or dynamic" cannot be answered without first knowing the actions a user performs against a bundle - including one the suite has no answer for today, adding a domain derived from current code.

So the way runs: **actions -> structure -> proposal**.

The dogfood migration ([Dogfood `/okf-setup` on this repository and replace `docs/` with the resulting bundle](https://github.com/artemVeduta/okf-agent-skills/issues/150)) proved the twelve-operation pipeline works: 42 concepts published, 0 failures, a valid OKF v0.2 bundle. It also proved the pipeline is honest about structure and dishonest about outcome: it moves a file and adds a header, never asking whether that file should be one concept or five, and it reports residue as "retained" that it never retains.

This map finds its way to three changes:

1. Setup ends its checking phase by proposing a **target bundle tree** for approval, including concept splitting, domain subdirectories, and `index.md` placement, per the OKF v0.2 structure:

   ```text
   ├── <concept>.md                  # A concept at the bundle root.
   └── <subdirectory>/               # Subdirectories group concepts.
       ├── index.md
       ├── <concept>.md
       └── <subdirectory>/
           └── …
   ```

   The user approves, adjusts, or rejects that tree. Only then does setup publish.

2. Every claim the migration report makes is true of the bundle on disk.

3. Setup creates an agent connector that lets an external document-producing skill discover and follow the OKF owner flows. Deterministic integration tests gate the contract; separate live cases test real external use across supported harnesses.

## Notes

- **The chain of dependency on this map is deliberate.** [Grilling: What does a user actually do with an OKF bundle?](https://github.com/artemVeduta/okf-agent-skills/issues/164) blocks [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163) and [Grilling: Setup must ask which files and folders to migrate](https://github.com/artemVeduta/okf-agent-skills/issues/161); [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163) blocks [Grilling: Setup proposes the target bundle tree for approval before publishing](https://github.com/artemVeduta/okf-agent-skills/issues/156) and [Grilling: How is a glossary stored - how many, and where?](https://github.com/artemVeduta/okf-agent-skills/issues/162). Answering any of them before its blocker is answering it with an assumption.
- Predecessor map: [/setup: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129) - closed, destination reached. Its decisions stand unless a ticket here explicitly revises one.
- **This map revises no settled rule by accident.** [Research: Migration contract - converting arbitrary docs to OKF concepts](https://github.com/artemVeduta/okf-agent-skills/issues/131) forbids automatic splitting, glossary extraction, concept explosion, and restructuring "unless explicitly approved". A proposed-and-approved restructure is the path that clause left open; it is not a reversal. Automatic restructuring stays forbidden.
- The spec v0.1.0 rules apply: zero dependencies, one contract seam, no invented value for an open row, no new skill without a recorded decision.
- Git owns history, rollback, and recovery. Do not build backup, restore, checkpoint, or resume subsystems.
- Data model reference: OKF v0.2 SPEC.md - https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- Use the grilling, domain-modeling, prototype, research, tdd, and ponytail skills when their phase is active.

## Decisions so far

- [Grilling: What does a user actually do with an OKF bundle?](https://github.com/artemVeduta/okf-agent-skills/issues/164) - Direct and integrated lifecycle actions share the OKF owners; normal work proposes durable changes before writing, and broad maintenance stays explicit.
- [Grilling: Setup must ask which files and folders to migrate](https://github.com/artemVeduta/okf-agent-skills/issues/161) - Setup inspects all document candidates inside a separate scan boundary and migrates only the exact scope the user accepts before planning.
- [Grilling: Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163) - Dynamic structure separates concept type from path; approved reader-purpose groups determine placement and always contain navigation indexes.
- [Grilling: How is a glossary stored - how many, and where?](https://github.com/artemVeduta/okf-agent-skills/issues/162) - Glossaries are multi-term concepts named `glossary.md`, placed by reader purpose; term conflicts require approved consolidation or distinct scoped meanings.
- [Grilling: How does an external skill use an OKF bundle out of the box, and how do we test it?](https://github.com/artemVeduta/okf-agent-skills/issues/168) - Setup installs an `agents/okf` connector; external skills use proposal-first owner flows, with deterministic and separate live conformance tests.
- [Grilling: How does proposal-first normal work reach okf-write?](https://github.com/artemVeduta/okf-agent-skills/issues/169) - Lifecycle builds proposals in-session; accepted exact requests permit one attempt each, while deterministic tests prove wrapper-flow compatibility only.
- [Grilling: Setup proposes the target bundle tree for approval before publishing](https://github.com/artemVeduta/okf-agent-skills/issues/156) - Setup presents an authoritative table plus derived tree before transformation; one complete acceptance binds exact outputs, groups, splits, provenance, and link routing.
- [Grilling: Residue is classified but never retained — decide what residue means](https://github.com/artemVeduta/okf-agent-skills/issues/157) - Migration residue stays unchanged at its source path and is report-only; setup does not copy it or route it through workers and publication.

- [Grilling: Narrow, reorder, or remove the Glossary type-inference rule](https://github.com/artemVeduta/okf-agent-skills/issues/158) - Glossary content inference is removed; exact structural evidence still infers it, and unmatched sources ask for type.

- [Grilling: Where does a concept go when its type has no canonical directory?](https://github.com/artemVeduta/okf-agent-skills/issues/160) - Type never determines path; the accepted target proposal places each concept at the root or in a named reader-purpose group, with no source-path fallback.

- [Grilling: The documented bootstrap order cannot work — init is gated on the marker repair writes](https://github.com/artemVeduta/okf-agent-skills/issues/166) - Explicit `init` may run before activation only when the marker is absent; marker repair stays separate and all other mutation gates remain.

- [Grilling: What is evidence for? The gate checks existence, not relevance](https://github.com/artemVeduta/okf-agent-skills/issues/167) - Write evidence binds exact accepted observations; the runtime checks file identity and safety but never claims semantic relevance or provenance.

- [Task: discover must exclude OKF's own config files from the candidate scan](https://github.com/artemVeduta/okf-agent-skills/issues/165) - Discovery drops OKF's own root artifacts by Git-root-relative path; a fresh bootstrap now finds zero sources.

- [Task: Allow explicit init before activation and test clean bootstrap](https://github.com/artemVeduta/okf-agent-skills/issues/173) - Explicit `init` runs with the marker absent; automatic setup stays silent, marker repair stays separate, and the documented order is pinned end to end.

- [Task: Replace readable-path evidence with accepted observation bindings](https://github.com/artemVeduta/okf-agent-skills/issues/174) - Write evidence is a `{path, sha256}` observation binding checked for identity and containment; setup binds each concept to its real accepted source instead of `index.md`.

- [Task: Create the external-skill connector and deterministic conformance fixture](https://github.com/artemVeduta/okf-agent-skills/issues/170) - Every new bundle ships the `index.md -> agents/index.md -> agents/okf.md` connector chain, proven by a deterministic wrapper-flow fixture.

- [Task: Fix link rewriting - preserve anchor fragments, rewrite bare sibling links](https://github.com/artemVeduta/okf-agent-skills/issues/159) - A rewritten link keeps its `?query`/`#fragment` suffix; the reported bare-sibling defect was type-directory flattening, not a resolution bug.

- [Grilling: How does setup validate transformed content against the accepted proposal?](https://github.com/artemVeduta/okf-agent-skills/issues/172) - All staged output must pass exact proposal checks and fresh read-only semantic review; publish reruns the gate, while human semantic fidelity remains explicitly unassessed without human review.

- [Grilling: Should setup read structural meaning from root convention files?](https://github.com/artemVeduta/okf-agent-skills/issues/176) - Setup uses cited structure from any readable scanned file as proposal evidence; known context files have deterministic parsers, all evidence stays non-authoritative, and dual-role files are reported without double counting.

- [Task: Remove Glossary content inference](https://github.com/artemVeduta/okf-agent-skills/issues/179) - The `**Label**: value` heuristic is gone; only exact structural evidence infers Glossary, and an unmatched source asks for its type.

- [Task: Implement target bundle proposals and dynamic concept placement](https://github.com/artemVeduta/okf-agent-skills/issues/178) - A new `propose` operation returns authoritative tables and a derived tree for acceptance before transformation; type-based directories are gone, and evidence advisories never block acceptance.

- [Task: Implement report-only migration residue](https://github.com/artemVeduta/okf-agent-skills/issues/177) - Residue stays unchanged at its source path and is recorded once in the plan; `data.references` and every `references/<path>` target are removed, and a dual-role file is counted once.

- [Task: Enforce migration proposal conformance before publication](https://github.com/artemVeduta/okf-agent-skills/issues/180) - One stateless gate checks the complete staged set against the accepted proposal and its fresh read-only review; `publish` reruns it before its first write and states plainly what it cannot see.

## Not yet specified

## Out of scope

- Automatic restructuring with no user approval - forbidden by [Research: Migration contract - converting arbitrary docs to OKF concepts](https://github.com/artemVeduta/okf-agent-skills/issues/131) and not revisited here
- Compaction, archiving, and restructuring as v0.1.0 operations - deferred per the spec
- OKF-managed backup, restore, checkpoint, or resume systems - Git is the recovery mechanism
