---
name: okf-lifecycle
description: Maintains OKF lifecycle synchronization and explicit reconciliation when another skill must invoke it.
---

# okf-lifecycle

`okf-lifecycle` owns exactly one operation in v0.1.0: `sync`. It runs two distinct kinds of work under that operation and never confuses them.

## Narrow sync vs. explicit reconciliation

Write evidence a `sync` carries is an **observation binding** — `{ "path", "sha256" }` against material actually read, resolved from the active Git worktree — and `sync` inherits the evidence rule of the `create` or `revise` it selects. It is not provenance and it is never proof of relevance. Human statements and non-file tool results stay in the session-local accepted proposal and never cross the wrapper seam.

Ordinary work triggers **incremental synchronization**: the agent selects narrow, evidence-backed maintenance for the directly affected concepts, their declared review dependencies, and mechanical derivatives, with no manual gate. This is the only synchronization allowed to run unprompted by the human.

Everything wider is **explicit reconciliation**, and a caller must ask for it by name. `okf-lifecycle` MUST NOT run a broad operation from incremental synchronization alone. A caller that asks for reconciliation by name gets one of exactly two scopes:

- **Diff-scoped reconciliation** runs pre-PR, over the current diff and its declared knowledge scope.
- **Full-project synchronization** is broad, manual, and recovery-gated.

Neither is a fallback for a narrow sync that returned less than the caller hoped for.

Completion criterion: sync is done when every directly affected concept, every declared review dependency, and every mechanical derivative in scope has been checked or updated — nothing wider and nothing narrower than what the trigger (incremental vs. explicit reconciliation) authorizes.

## The wrapper request

For `sync`, `okf-lifecycle` constructs:

```json
{
  "protocol": "okf-wrapper/1",
  "skill": "okf-lifecycle",
  "operation": "sync",
  "invocation": "explicit",
  "scope": { "concepts": ["<concept identifier>"] },
  "payload": {
    "cwd": "<absolute working directory>",
    "bundle": "<bundle identifier>",
    "concept": "<concept identifier>"
  }
}
```

`invocation` is always `"explicit"` here, for incremental synchronization and for explicit reconciliation alike: the agent, not an adapter or a hook, sends this request, and model or parent-skill routing never turns it into an automatic invocation.

`sync` is a bounded operation: `payload.cwd`, `payload.bundle`, and `payload.concept` are all required, non-empty strings, and a request missing any of them fails before the runtime ever sees it. `invocation` and `scope` are also required top-level fields for `sync`; `scope` must name exactly the concept in `payload.concept` — `{ "concepts": [<that same concept>] }`. See [references/wrapper-request-fields.md](references/wrapper-request-fields.md) for the full statement of `task_kind`, `scope`, and `invocation`, including when `sync` returns `result: "blocked"` versus when it abstains.

`okf-lifecycle` runs this request through `node <skill-root>/scripts/okf-lifecycle.js`, where `<skill-root>` is the directory containing this SKILL.md — never a path resolved from the current working directory or PATH.

## Exit conditions

Every wrapper call ends in exactly one of three conditions:

1. **Valid response.** Exit code 0, one JSON line on stdout. An `abstained` result with no findings is a completed answer, not a refusal — the ordinary outcome of a `sync` with nothing to do. A `blocked` result carrying `data.code: "INVALID_SCOPE"` when the scope cannot be resolved is a refusal: also a valid response, not a failure.
2. **Invalid wrapper input.** The request never parsed: malformed JSON, a wrong `skill` value, a missing `operation`, a missing required `payload` key, or a missing `invocation` on `sync`. Nothing on stdout, a short diagnostic on stderr, exit code 64.
3. **Internal failure.** The request parsed and the runtime threw. One complete response (`result: "failed/incomplete"`, `data.code: "RUNTIME_FAILURE"`) still lands on stdout, a `Runtime failure: ...` diagnostic goes to stderr, exit code 70.

## Effects this skill owns

`okf-lifecycle` owns one atomic effect: **Standalone broad rebuild**, a user-invoked action, never an automatic one.

It does not own the derived-maintenance effects that an ordinary `sync` triggers along the way. Regenerating a directly affected index and appending a directly affected log entry belong to `okf-write` and inherit the parent operation's outcome. Repairing a directly affected mechanical link also belongs to `okf-write`, but it is not a v0.1.0 operation and returns `UNSUPPORTED_INPUT`.

## Assisted durable capture

Through all normal work, `okf-lifecycle` observes durable-change candidates for `Decision`, `Glossary`, `Constraint`, `Research`, `Playbook`, and the open domain-specific concept types. It does not interrupt the work for each candidate.

At a natural checkpoint, or before the final response, it presents **one** compact proposal for the useful durable changes. It asks immediately only when missing meaning blocks the current work.

It skips a temporary fact, a detail the code already gives, a duplicate, and a weak guess. A declined item is not proposed again in the same task, unless new evidence changes that item.

When the user states a durable decision or a global decision, the skill recommends capture. It proposes the smallest valid concept or the smallest valid update.

When required meaning is missing, the skill names the missing fact. It then offers a concrete recommendation or a compact draft. This is an **assisted user decision**: help is never acceptance.

No mutation is automatic. Acceptance uses the existing owner flow, and each accepted item becomes one ordinary `okf-write` call.

For each proposal, the skill resolves the effective `settings.max_words_per_file` from `.okf-workspace.json` over the built-in default. When a proposed new or revised substantive concept is more than that target, the proposal carries an exact semantic split, or an explicit keep-as-one decision. The target is a soft target. It never warns on a read, and it is never a validation gate.

## Procedure

1. Read the requested operation. `init`, `migrate`, and `compact` are not v0.1.0 operations: if the operation is not `sync`, stop and return the runtime's unknown-operation result. Done when that result is the only thing emitted for the request; not done if any payload has been built or any concept touched for a non-`sync` name.
2. Classify the trigger as incremental (ordinary work, agent-selected) or explicit reconciliation (requested by name). Both trigger classes send `invocation: "explicit"`. Done when the trigger class is fixed before any payload is built; not done if the class is still undecided or was inferred after the scope was chosen.
3. Build the wrapper request for the scope that trigger class authorizes: narrow for incremental synchronization, wider only for explicit reconciliation. Done when the request matches the shape above and its scope matches the trigger class from step 2; not done if the scope is wider than the trigger authorizes.
4. Run the `okf-lifecycle` wrapper and name the exit condition the call ended in. Done when the response is reported as a valid response (refusal included), invalid wrapper input, or an internal failure; not done while a refusal is being reported as a crash or a crash as a refusal.
5. Collect durable-change candidates while the work runs, for the observed concept types. Done when each candidate is held for the one proposal, and when only meaning that blocks the current work is asked for immediately; not done if the work stops for a candidate that does not block it.
6. Filter the held candidates. Done when each temporary fact, code-recoverable detail, duplicate, weak guess, and item the user already declined in this task is dropped, and when a declined item returns only with new evidence; not done if a dropped item enters the proposal.
7. Resolve the effective `settings.max_words_per_file` from `.okf-workspace.json` over the built-in default, and size each proposed substantive concept against it. Done when every proposed concept over the target carries an exact semantic split or an explicit keep-as-one decision; not done if the target blocks a read, blocks a write, or is reported as a validation gate.
8. Present one compact proposal at a natural checkpoint or before the final response, and name every missing fact with a concrete recommendation or a compact draft. Done when the proposal is one presentation and the help is marked as an assisted user decision; not done if the help is counted as acceptance, or if a mutation runs before the owner accepts.
9. Write each accepted item as one ordinary `okf-write` call. Done when each accepted item is one separate call; not done if items are batched, or if an item is written without acceptance.
10. Report within the ceiling. A clean result is done when reported as one line: the operation and result, nothing else; not done if the full response is shown. A refusal, an internal failure, or a `failed/incomplete` result is done only with the full response, naming the gate code and next action; not done if trimmed to one line, softened, or reported as a crash. Show the full response for any result if the caller asks.
