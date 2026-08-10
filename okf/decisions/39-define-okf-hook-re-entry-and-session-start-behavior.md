---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/39
status: draft
type: Decision
---
# Define OKF hook re-entry and session-start behavior

Status: closed.

Part of [Ship a production-ready cross-harness OKF skill suite](https://github.com/artemVeduta/okf-agent-skills/issues/1).

This decision blocks [Write the implementation-ready product specification](https://github.com/artemVeduta/okf-agent-skills/issues/8).

## Question

What exact event-to-seam contract should implement OKF orientation for startup, resume, clear or compact, fork, and prompt-time re-entry across Claude Code, OpenAI Codex, and OpenCode?

The decision must settle when orientation is emitted, how duplicate orientation is suppressed, how a forked context behaves, which native seam OpenCode uses, and how unsupported or failed seams report their result.

Do not reopen the settled `.okf-active` marker, bounded read-only orientation, adapter ownership, or automatic-mutation prohibition from [Specify the harness plugin architecture and `.okf-active` opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35). The remaining OpenCode explicit-entry evidence must be considered.

## Comment by artemVeduta

## Resolution

The event-to-seam contract for OKF orientation is settled. It preserves the read-only orientation and adapter boundaries from [Specify the harness plugin architecture and `.okf-active` opt-in contract](https://github.com/artemVeduta/okf-agent-skills/issues/35) and the execution-placement rules from [Decide inline versus sub-agent OKF maintenance and `.okf-*` settings](https://github.com/artemVeduta/okf-agent-skills/issues/38).

### Event authority and injection

- Claude Code uses `SessionStart(source=startup|resume|clear|compact)` and `SessionStart(source=fork)` for forked sessions.
- OpenAI Codex uses `SessionStart(source=startup|resume|clear|compact)`. `SubagentStart` identifies a child context. If Codex gives no fork signal, the adapter does not infer `fork`.
- OpenCode uses `session.created` and `session.compacted` as lifecycle signals only. They do not inject orientation and do not prove startup, resume, clear, compact mode, or fork.
- OpenCode uses the awaited `experimental.chat.system.transform` as the only automatic orientation injection seam. `experimental.session.compacting` may change the compaction prompt, but it is not an orientation seam.
- Adjacent `PreCompact`, `PostCompact`, `SessionEnd`, ordinary prompt, and fire-and-forget event callbacks do not emit a second orientation.

Example: after Codex compaction, `SessionStart(source=compact)` emits one orientation before the next model request; `PostCompact` does not emit another. After OpenCode `session.compacted`, the next eligible system transform may inject one orientation.

### Occurrence identity and deduplication

- The adapter owns an occurrence key containing the harness, repository instance, context ID, logical cause, and native event ID when one exists.
- OpenCode creates an adapter generation from a lifecycle signal; the next eligible system transform claims that generation.
- The adapter claims an occurrence before dispatch. Duplicate signals and repeated transforms cannot emit a second orientation.
- Delivery is at-most-once. A failed or unavailable claimed attempt is reported and is not replayed automatically.
- This state is separate from the OKF manual-operation guard ledger and OKF content.

Example: two identical Codex compact callbacks produce one orientation. A later compact event with a new event ID produces another. A failed OpenCode transform leaves that generation degraded and does not retry it.

### Fork and child contexts

- Every forked or delegated child context receives a fresh read-only orientation. It does not inherit the parent result or suppress orientation.
- The child rechecks activation, scope, routing, and bundle admission.
- Orientation does not create authority, approval, a delegation brief, or writer permission. A writer child still requires explicit intent and the shared guard.

Example: an `okf-writer` child scoped to another admitted bundle receives its own bounded orientation, but it cannot write without its valid delegation brief, approval, recovery evidence, and guard checks.

### OpenCode explicit entry

- Automatic orientation stays outside the skill command path and uses the system transform.
- Native `/okf-*` commands remain the explicit entry path.
- Per-skill `permission.skill: deny` prevents model-driven skill-tool invocation. Required skill metadata remains present; omitting `description` is not the policy.
- A command is a request, not approval, authority, or proof that mutation is safe. The shared runtime and manual-operation guard remain mandatory, including on the prompt-injection command path.

Example: `/okf-write` may start a write request, but it cannot publish a mutation without the exact request, complete preview, confirmation, approval, recovery, and guard checks.

### Failure results

- `not-configured`: `.okf-active` is absent. Automatic behavior is silent; an explicit read reports `not-configured`.
- `invalid`: the marker, adapter contract, or required configuration is malformed. Emit a diagnostic, no orientation, and block mutation.
- `unavailable`: the bundle, runtime, or required admission evidence cannot be read. Emit a diagnostic, no orientation, and block mutation.
- `degraded`: the seam is unsupported or untrusted, or the logical cause is unobservable. Continue the host session without claiming clean orientation and block mutation.
- `failed`: an accepted seam was invoked but orientation dispatch failed. Report the failure, do not retry the claimed occurrence, and block mutation.
- `clean`: activation, admission, scope, runtime, and injection all pass.

The host session continues for non-clean orientation results. No non-clean result claims clean evidence or permits mutation. This closes [Define OKF hook re-entry and session-start behavior](https://github.com/artemVeduta/okf-agent-skills/issues/39) and unblocks [Write the implementation-ready product specification](https://github.com/artemVeduta/okf-agent-skills/issues/8).

Evidence: [OpenCode plugin documentation](https://opencode.ai/docs/plugins/), [OpenCode command documentation](https://opencode.ai/docs/commands/), and the corrected local research note [`docs/research/ecosystem-deep/opencode-commands-and-skill-invocation.md`](https://github.com/artemVeduta/okf-agent-skills/blob/main/docs/research/ecosystem-deep/opencode-commands-and-skill-invocation.md).}
