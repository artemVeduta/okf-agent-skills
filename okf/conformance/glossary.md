---
status: draft
type: Glossary
---
# Conformance Glossary

**Trust tier**:
An advisory classification of the verification evidence recorded for a
concept. A trust tier does not grant authority to mutate the concept; operation
risk and project mode determine the required safeguards.
_Avoid_: Permission level, operator trust

**OKF specification version**:
The upstream Open Knowledge Format version, such as v0.2, that defines format
semantics. It is independent of the suite release version.
_Avoid_: Format release, suite version

**Suite release version**:
The version of `okf-agent-skills`, such as v0.1.0. It records which reviewed OKF
specification revision the product implements but does not name the format.
_Avoid_: OKF version, specification version

**Bundle conformance**:
Satisfaction of the structural tests defined by an identified OKF
specification version. Product policy and migration fidelity are separate.
_Avoid_: Overall validity, suite compatibility

**Producer obligation**:
An OKF requirement governing authored content or producer behavior that is not
necessarily a bundle-conformance test.
_Avoid_: Conformance test, product rule

**Consumer tolerance**:
Required or recommended behavior when reading optional, unknown, legacy, or
broken OKF content without treating that content as a mutation target.
_Avoid_: Automatic repair, conformance waiver

**Suite profile**:
The two rules `okf-agent-skills` imposes beyond OKF conformance: mutation
requires an exact `okf_version: "0.2"` declaration in the selected manifest
bundle record, and a rewrite must reproduce the frontmatter's parsed
semantics through the suite's own writer. Reported with origin `suite`, never
as an OKF conformance error.
_Avoid_: OKF conformance, product extension

**Activation**:
The condition under which harness adapters provide automatic OKF behavior: a
valid `.okf-workspace.json` manifest resolved for the current worktree, with
an admitted bundle record. It does not grant trust, authority, access, write
ownership, approval, or permission. A missing manifest leaves automatic
behavior silent and makes an explicit call report `not-configured`; an
invalid manifest reports `MANIFEST_INVALID` and blocks mutation. A
cross-repository operation requires a valid manifest in both affected
worktrees.
_Avoid_: Authorization marker, permission flag, automatic setup
