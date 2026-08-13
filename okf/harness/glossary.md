---
status: draft
type: Glossary
---
# Harness Integration Glossary

**Harness adapter**:
The harness-specific integration layer that invokes and presents the shared
skills and runtime through native plugins, hooks, or session seams. It does
not redefine shared authority, trust, or mutation rules.
_Avoid_: Separate runtime, harness-specific semantics

**External document-producing skill**:
A third-party skill outside this suite whose normal work creates or maintains
project documents. When it targets an OKF bundle, it uses the owning OKF flows;
an accepted mutation reaches `okf-write`. Direct file edits are outside the
supported suite contract.
_Avoid_: Harness adapter, OKF producer, direct bundle editor

**Agent policy**:
Durable, human-readable project guidance that tells agents how to work. It can
be stored as OKF knowledge. Executable permissions, hooks, and harness settings
remain authoritative configuration outside the bundle.
_Avoid_: Harness configuration, permission file, executable setting

**Agent connector concept**:
The `agents/okf` Playbook concept linked from the `agents` concept-group index.
It gives an external document-producing skill the stable suite rules, directs
it to the owning skill for each wrapper request, and links project-specific
agent policy. Setup creates it in every new bundle and proposes it for an
existing bundle. It is durable guidance, not executable harness configuration
or a copy of each wrapper request schema.
_Avoid_: Agent index, harness adapter, permission grant

**External-skill conformance**:
An observed result in which an external document-producing skill discovers the
agent connector, uses the owning OKF flows, avoids direct bundle edits, selects
meaningful concept types, and leaves a suite-valid bundle. It does not establish
the semantic truth or trust of the authored content.
_Avoid_: Bundle conformance, content verification, trust review

**Skill binding**:
The mapping from an invocation route to the skill it dispatches to. Every
harness exposes the same skill bindings as part of semantic parity; a
harness-native configuration scope, such as a Codex hook's trusted-project or
plugin scope, is not itself a skill binding.
_Avoid_: Reach clause, hook scope, router dispatch protocol

**Tool allowlist**:
The explicit, closed set of tools an agent definition declares itself
permitted to use. It carries no raw file-write, Git-history, network, or
nested-agent authority beyond what it names.
_Avoid_: Allowed effects, agent definition

**Native wrapper**:
A thin, harness-specific surface through which an adapter can expose a
shipped agent definition (`okf-reader`, `okf-writer`) for delegation. It is
distinct from a skill wrapper script, the shared cross-harness process entry
under `scripts/`.
_Avoid_: Skill wrapper script, harness adapter

**Router**:
The `okf` router skill that dispatches each request to exactly one of the
four owning sub-skills (`okf-read`, `okf-write`, `okf-lifecycle`,
`okf-review`) using a sealed operation table, and owns the user-invoked
confirmation sequence. It implements no second authorization rule of its own.
_Avoid_: Harness adapter, skill wrapper script, guard skill

**Session override**:
The highest-precedence layer in the settings chain — `adapter defaults <
user/global settings < project/worktree settings < current-session override`
— that expires at session end. Retained design for a later release; see the
#91 narrowing in `docs/spec/okf-agent-skills-v0.1.0-completion.md`. (#91)
_Avoid_: Effective settings, local override, project mode

**Effective settings**:
The fully resolved settings value produced by applying the
settings-precedence chain, including any session override. The main session
resolves it and carries it into a delegation brief. Retained design for a
later release; see the #91 narrowing in
`docs/spec/okf-agent-skills-v0.1.0-completion.md`. (#91)
_Avoid_: Session override, execution preference

**Supported entry seam**:
One of the specific, per-harness native hooks or events — such as Claude
Code's and Codex's `SessionStart`, or OpenCode's
`experimental.chat.system.transform` — that a harness adapter is permitted to
treat as an automatic-orientation injection point. An adjacent seam that
never re-emits, such as `PreCompact` or an ordinary prompt, is not a
supported entry seam.
_Avoid_: Orientation occurrence, adjacent seam, explicit entry path

**Logical cause**:
The categorized-reason component of an orientation occurrence key — alongside
the harness, the repository instance, and the context ID — identifying why a
session-entry event fired, for example startup, resume, clear, compact, or
fork.
_Avoid_: Native event ID, orientation occurrence, task kind

**Native event ID**:
The harness-native identifier of the specific triggering event, carried in
the occurrence key when one exists. A later native event with a new native
event ID can form a new occurrence and emit another orientation.
_Avoid_: Logical cause, occurrence key, adapter generation

**Adapter generation**:
A counter the OpenCode adapter creates from a lifecycle signal
(`session.created` or `session.compacted`) and that the next eligible system
transform claims, coordinating at-most-once orientation delivery on a harness
with no native session-start hook. A failed transform leaves that generation
`degraded` without automatic retry.
_Avoid_: Bundle epoch, ledger generation, native event ID
