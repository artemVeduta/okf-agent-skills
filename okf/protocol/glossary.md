---
status: draft
type: Glossary
---
# Skill Protocol Glossary

**Skill wrapper script**:
The thin per-skill process entry under `scripts/` that imports shared modules,
accepts one JSON request on standard input, and emits one canonical response on
standard output. It does not define authority, approval, or mutation policy.
_Avoid_: CLI, router, independent runtime

**Invocation class**:
The classification of how a request may reach its owning skill: `Model-invoked`,
`User-invoked`, `Model-or-user-invoked`, `Inherited from parent`, or `Not
invocable`. It does not grant permission, authority, approval, trust, or access.
_Avoid_: Permission level, execution preference, task kind

**Reach clause**:
Routing metadata in a skill description that states when another skill must
invoke that skill. A router dispatch counts as skill-to-skill invocation. It is
not a permission, scope declaration, admission gate, or authority grant.
_Avoid_: Bundle REACH gate, permission clause, trigger guarantee

**Wrapper response**:
The one canonical JSON object emitted by a skill wrapper. It carries the
protocol, skill, operation, result, scope, evidence limits, operation data,
findings, and next action. A valid refusal is a response, not a process error.
_Avoid_: Tool result, approval record, observation journal

**Wrapper exit code**:
The process transport result of a wrapper: `0` for any valid response, `64` for
invalid input, and `70` for an internal failure that also emits a complete
`failed/incomplete` response. It does not encode an OKF result or approval.
_Avoid_: OKF status, finding code, permission result

**Wrapper error stream**:
The wrapper's diagnostic-only `stderr` channel for invalid input and internal
failure. It is empty for valid domain responses and does not carry results,
findings, approval, authority, or operation-success claims.
_Avoid_: Semantic result channel, audit log, approval channel

**Semantic parity**:
Agreement across harnesses on shared runtime decisions and safety outcomes
while allowing different native triggers, configuration, and presentation.
_Avoid_: Identical harness behavior, feature parity

**Delegation**:
The explicit choice by a main session to assign bounded work to a separate agent
under a delegation brief. It changes execution placement, not project mode,
admission, trust, access, authority, approval, recovery, or guard state.
_Avoid_: Authority transfer, automatic sub-agent execution

**Delegation brief**:
The immutable bounded instruction set passed from a main session to a delegated
agent. It names the task kind, operation class, target identities, allowed and
forbidden effects, observed evidence, required gates, effective settings, and
expected result. It does not grant authority or approval.
_Avoid_: Prompt fragment, permission grant, approval token

**Agent definition**:
The shipped role contract for a delegated agent. It states the required skill,
tool allowlist, forbidden effects, delegation-brief rules, and result contract.
It is inert until explicit use and does not grant authority.
_Avoid_: Permission grant, active worker, harness policy

**Reader agent**:
A delegated agent restricted to admitted read and search work. It returns
observed evidence and cannot mutate OKF content.
_Avoid_: Retrieval backend, writer agent

**Writer agent**:
A delegated leaf agent that may read admitted evidence and execute bounded OKF
writes through the shared runtime and guard under an explicit delegation brief.
It cannot create agents, broaden authority, mutate from automatic hooks, or
execute broad manual operations under this role.
_Avoid_: Automatic writer, authority holder, unrestricted sub-agent

**Execution preference**:
A user setting that chooses `inline` or `delegated` placement for eligible reads
or bounded writes. It does not change safety or authority and remains below the
shared rules. Retained design for a later release; see the #91 narrowing in
`docs/spec/okf-agent-skills-v0.1.0-completion.md`. (#91)
_Avoid_: Permission setting, policy override

**Delegation receipt**:
The structured result returned by a delegated operation. It records status,
operation and target identity, requested and actual effects, observed evidence,
validation, residue, and the next action. It is not approval, an operation
manifest, or an observation journal.
_Avoid_: Completion claim, audit log

**Orientation context**:
A fixed-schema, bounded, read-only summary emitted at a supported session-entry
seam after activation and admission checks. It provides navigation and status
only; it contains no full index or concept body, does not infer task intent,
perform task-specific retrieval, or mutate OKF content. Each child context gets
a fresh orientation rather than inheriting a parent result.
_Avoid_: Session-start synchronization, automatic context sync

**Orientation occurrence**:
A logical re-entry for which a harness adapter may make at most one orientation
attempt. It is distinct from a native harness event, a prompt, and a
manual-operation occurrence. Its identity does not grant authority or approval.
_Avoid_: Session event, prompt event, operation occurrence

**Orientation result**:
The reported outcome of an orientation attempt or automatic no-op. It can show
that the project is not configured, the required scope is invalid or
unavailable, the seam is degraded or the attempt failed, or the orientation is
clean. A non-clean result never asserts clean evidence or permits mutation.
_Avoid_: Concept status, operation result, approval result

**Semantic preservation**:
Retention of YAML key names, scalar types and values, sequence order, and
mapping structure without promising preservation of comments or formatting.
_Avoid_: Lexical preservation, byte-for-byte round trip
