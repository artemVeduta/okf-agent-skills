---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/157
status: draft
type: Decision
---
# Grilling: Residue is classified but never retained — decide what residue means

Status: This decision is closed.

## Parent

- #155

## Question

`migration-plan` derives a `references/<path>` location for every `residue` source and reports it in `data.references`. No operation ever copies the file there.

The dogfood run ([#150](https://github.com/artemVeduta/okf-agent-skills/issues/150)) classified 14 unsupported-format sources as residue. `okf/references/` holds exactly one file — a migrated `Reference` concept. The 14 sources are not in the bundle. The report told the user they were "retained as inert evidence".

The specification is self-consistent: it says deriving the path "is not itself a copy". No later operation claims the copy either. So the gap is a contract gap, not a bug.

Decide what residue means:

- Does the bundle **keep** unsupported-format evidence? If yes, which operation writes it — `assemble` into staging, or `publish` through the delegation bridge? Raw evidence is not a conforming concept, so it cannot pass the write gate as one.
- Or does residue mean **classified and reported only**, leaving the file in place in the project? If so, `report`'s wording and `data.references`' name are both misleading and must change.
- If evidence is kept, does `references/` still hold it, given that `references/` is also the canonical directory for the `Reference` concept type? A raw `.pdf` and a `Reference` concept sharing one directory is a collision waiting to happen.

Whichever way this goes, the report must stop claiming retention that does not happen.

## Comment by artemVeduta

## Resolution

Migration residue is an approved report-only terminal result.

- A residue source stays unchanged at its original project path. Setup does not copy it into the OKF bundle.
- `migration-plan` records it once in `data.plan` with its source path, `residue` disposition, and reason. `data.references` is removed.
- Residue does not enter partition worker briefs, worker returns, assembly output, staging, validation, or publication.
- `report` lists the source path and reason and says that setup left the source unchanged. It does not claim bundle retention or report a target path.
- Approved residue does not make migration partial. A run is complete when every selected source has a successful terminal result, including approved residue. `partial` remains for unresolved or failed work.
- Referenced attachments are a separate case. Their existing byte-copy contract does not make unsupported source residue into bundle content.

The project glossary now defines **Migration residue** with this meaning in `CONTEXT.md`.

This removes the false retention claim and the unused `references/<path>` contract. It also removes the raw-file collision with concept placement.
