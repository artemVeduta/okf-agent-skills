---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/196
type: Decision
---

# Grilling: Is `.okf-active` needed, and what replaces project activation?

Status: Closed.

## Parent

- [/okf-setup: propose the target bundle before writing it, and report only what it did](https://github.com/artemVeduta/okf-agent-skills/issues/155)

## Question

Should `.okf-active` exist?

The user's starting position is no: remove `.okf-active` and do not replace it with another project marker unless a required contract cannot work without one. The burden of proof is on keeping project activation state.

[Specify the harness plugin architecture and .okf-active opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35) made the zero-byte file the per-worktree opt-in for automatic OKF behavior. It grants no trust, authority, access, write ownership, approval, or permission. This ticket explicitly reconsiders that activation decision.

Observed:

- An absent marker makes automatic calls silent and explicit reads `not-configured`; an invalid marker blocks normal operations.
- Setup inspects, reports, asks to repair, and writes the marker as one of its three configuration files.
- Explicit `init` has a special bypass only so bootstrap can run before the marker exists.
- The activation gate affects reading, writing, orientation, delegation, discovery, migration planning, and both worktrees in a cross-repository operation.
- A valid bundle root already declares `okf_version`, and adapter installation is separate from project setup. Neither currently replaces per-worktree activation.

Decide:

- whether a separate per-worktree opt-in is required at all;
- if `.okf-active` is removed, what exact fact enables automatic adapter behavior, or whether automatic project behavior is removed;
- whether explicit reads and writes need any activation condition beyond normal bundle admission and write gates;
- how a user disables OKF behavior for one repository without deleting its bundle;
- what happens to orientation and its `not-configured`/silent outcomes;
- what happens to cross-repository activation requirements;
- what setup inspects, repairs, reports, and asks after the marker is removed;
- how existing `.okf-active` files are treated during upgrade;
- which specification decisions this resolution supersedes.

Do not answer removal by inventing another sentinel file, hidden state, or permission meaning. Activation and authority remain separate unless this ticket explicitly decides otherwise.

## Comment by artemVeduta

## Resolution

Remove `.okf-active` completely. `.okf-workspace.json` becomes the single source of suite-specific runtime configuration. Automatic orientation and all other existing runtime behavior stay unless this resolution changes their configuration source.

### Workspace manifest

`schema_version` stays `1`. Version 1 is redefined to the new exact grammar; old version 1 manifests are invalid and no compatibility parser or migration exists.

Every bundle record has exactly these required fields:

```json
{
  "alias": "project-docs",
  "owner": "okf-agent-skills",
  "root": "docs",
  "okf_version": "0.2",
  "project_mode": "code-backed"
}
```

- `alias` is the stable bundle name used for routing and `okf-workspace://` links. The agent selects a clear alias from bundle purpose and shows it in the complete setup proposal. There is no fixed alias default and no separate alias question.
- `owner` names the repository record that contains the bundle. It sets the base for `root` and selects the repository whose admission checks apply. It grants no authority.
- `root` is an explicit owner-repository-relative path. Setup recommends `docs`; the field is never omitted or defaulted by the runtime.
- `okf_version` is the suite's per-bundle format target.
- `project_mode` is the per-bundle `code-backed` or `knowledge-only` authority model.
- `required` is removed. Every declared bundle is required.
- `mode` is removed. Every declared bundle is `source`.

The existing repository record, path, identity, alias, uniqueness, and containment rules stay unless they conflict with the exact bundle record above. The manifest declares scope and configuration only. It grants no trust, access, discovery authority, write ownership, approval, or foreign-write authority.

### Runtime behavior

- Automatic orientation, explicit and automatic invocation, adapter hooks, and the occurrence ledger stay.
- A valid manifest replaces the valid activation marker as the condition for normal runtime behavior.
- A missing manifest keeps automatic calls silent and makes normal explicit calls `not-configured`.
- An invalid manifest reports invalid configuration. The runtime does not fall back to an undeclared local bundle.
- Reads retain their existing tolerance for an unsupported bundle format or project mode. Writes require `okf_version: "0.2"` and a recognized `project_mode` in the selected bundle record.
- Admission, trust, access, evidence, write, same-repository, and foreign-write-authority checks stay.
- Each repository participating in federated or future cross-repository work uses its own valid manifest in place of its marker requirement.
- Removing or renaming the manifest disables normal OKF behavior without deleting the bundle.

### Bundle root and setup

The bundle-root `index.md` becomes navigation only. The runtime does not read `okf_version` or `project_mode` from it and has no root-frontmatter fallback. This remains OKF v0.2 conformant because the upstream format makes both the root index and its version declaration optional, and does not define `project_mode`.

The setup order becomes:

```text
inspect -> consent -> repair manifest -> init -> discover
```

- `inspect` checks the manifest and bundle root, not `.okf-active`.
- `repair` has no activation target. It writes the accepted manifest, including each bundle's version and project mode.
- `init` creates a navigation-only root index and can run in the explicit pre-manifest setup path.
- Discovery, migration planning, publication prechecks, and normal runtime operations use the manifest.

### No backward compatibility

- The runtime never reads `.okf-active`.
- Setup never detects, reports, repairs, deletes, or migrates it.
- Discovery gives it no special treatment.
- Existing `.okf-active` files have no meaning; this repository removes its tracked file.
- Old root declarations are ignored and removed when their bundle is changed to this contract.
- Old version 1 manifest shapes are invalid.

### Superseded decisions

This resolution supersedes only the conflicting activation-marker, manifest-field, root-metadata, setup-order, and exact-root-write-gate clauses in these decisions; their independent admission, authority, navigation, adapter, and proposal rules remain:

- [Choose the skill bundle, runtime, and distribution architecture](https://github.com/artemVeduta/okf-agent-skills/issues/5)
- [Specify the harness plugin architecture and `.okf-active` opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35)
- [Replace budget-aware retrieval with index navigation](https://github.com/artemVeduta/okf-agent-skills/issues/36)
- [Decide cross-repository write authority](https://github.com/artemVeduta/okf-agent-skills/issues/37)
- [Decide inline versus sub-agent OKF maintenance and `.okf-*` settings](https://github.com/artemVeduta/okf-agent-skills/issues/38)
- [Define OKF hook re-entry and session-start behavior](https://github.com/artemVeduta/okf-agent-skills/issues/39)
- [Choose the repository OKF bundle topology and evidence boundary](https://github.com/artemVeduta/okf-agent-skills/issues/87)
- [Define the exact `.okf-workspace.json` grammar and path-base rules](https://github.com/artemVeduta/okf-agent-skills/issues/109)
- [`/setup`: bring projects under OKF with auto-bootstrap and migration](https://github.com/artemVeduta/okf-agent-skills/issues/129)
- [Grilling: Init bootstrap - how /setup creates the bundle root through the write gate](https://github.com/artemVeduta/okf-agent-skills/issues/133)
- [Grilling: okf-setup skill architecture - operations, contract boundaries, delegation](https://github.com/artemVeduta/okf-agent-skills/issues/134)
- [Grilling: Setup orchestration - state inspection, report, consent, and repair model](https://github.com/artemVeduta/okf-agent-skills/issues/141)
- [Grilling: The documented bootstrap order cannot work - init is gated on the marker repair writes](https://github.com/artemVeduta/okf-agent-skills/issues/166)
- [Task: Allow explicit init before activation and test clean bootstrap](https://github.com/artemVeduta/okf-agent-skills/issues/173)

The user confirmed that this is the complete shared understanding.

## Comment by artemVeduta

Clarification: the superseded exact-root-write-gate clauses also include [Choose the OKF conformance baseline, compatibility, and extension policy](https://github.com/artemVeduta/okf-agent-skills/issues/21). Its independent OKF v0.2 conformance and read-forbearance rules remain.
