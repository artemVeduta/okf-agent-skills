---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/164
status: draft
type: Decision
---

# Grilling: What does a user actually do with an OKF bundle? (action inventory, incl. adding a domain from code)

Status: Closed.

## Parent

- #155

## Question

**This is the root ticket of this map. Everything else on it assumes an answer to this one.**

The suite can create a bundle, write concepts, read them, review trust, and migrate documents into it. What it has never decided is **what a user actually does with an OKF bundle over its life** — and every structural question downstream is currently being answered without that.

The trigger: *"I want to add a new domain based on current code — what should I do?"* There is no answer today. `/okf-setup` migrates documents that already exist. `okf-write` `create` writes one bounded concept. Neither derives a domain from a codebase. And [#131](https://github.com/artemVeduta/okf-agent-skills/issues/131) points the other way for `code-backed` projects: migrate durable context that is **not** mechanically recoverable from code. So deriving documentation from code is either a new capability that needs its own recorded decision, or a deliberate exclusion that needs saying out loud. Right now it is neither.

Grill this **breadth-first**. Fan across the whole usage surface rather than deep on any one thread.

### The actions

- What is the complete set of actions a user performs against a bundle? Candidates, not a closed list: bootstrap, migrate existing docs, **add a domain from existing code**, add one concept by hand, answer a question from the bundle, find what is relevant to a task in progress, update a concept after the code changed, notice a concept has gone stale, retire a concept, review trust, split a concept that grew, merge two that converged, restructure a subtree.
- Which of these exist today, which are missing, and which are deliberately excluded?
- For each action that exists: what is its entry point? A slash command, a skill invocation, an agent doing it unprompted, or a human editing Markdown directly?
- Which actions are **explicitly invoked** and which may happen **automatically**? The suite is strict about this today — only `/okf-setup` may bootstrap, delegation is explicit — so a new action needs the same clarity.

### Adding a domain from code

- What is the input — a directory, a module boundary, a package, a user's description of the domain?
- What is the output — one concept, a subtree, a glossary of domain terms, a domain model document?
- How does this respect [#131](https://github.com/artemVeduta/okf-agent-skills/issues/131)'s code-backed rule? Deriving from code produces exactly the mechanically-recoverable content that rule excludes. Is the rule wrong, narrower than it reads, or is this action `knowledge-only`?
- Does the `/domain-modeling` skill already own this, and does OKF consume its output rather than duplicating it?
- Is it a proposal the user approves — the same shape as [#156](https://github.com/artemVeduta/okf-agent-skills/issues/156) — or a direct write?

### Who reads the bundle, and how

- Is the primary reader a **human** browsing Markdown, or an **agent** retrieving context mid-task? The two want different structures: humans want navigable directories and prose; agents want retrievable, self-contained, densely-linked concepts.
- If both, which one loses when they conflict?
- How does a reader find the right concept — directory navigation, link traversal, search, an index, or an agent's own judgement?
- What does a reader do when the bundle contradicts the code?

### Over time

- What happens to a concept when the code it describes changes? Who notices, and how?
- What is the smallest useful unit of work — one concept, or a coherent set?
- How does a bundle avoid becoming a graveyard of stale documents that nobody trusts and everybody routes around?

### What this decides

The output should be an **action inventory**: each action named, with its entry point, its owner skill, whether it is explicit or automatic, and whether it exists, is missing, or is excluded. That inventory is what [#163](https://github.com/artemVeduta/okf-agent-skills/issues/163) needs — a structure is only strict or dynamic relative to what people do with it — and it will likely graduate several new tickets of its own.

Expect this to be large. It may need more than one session, and it may redraw parts of this map.

Invoke `/grilling` and `/domain-modeling`.

## Comment by artemVeduta

## Resolution

OKF is the project documentation system when a project selects **OKF-native documentation**. All durable project documentation lives as OKF concepts and indexes. Project mode does not change: code, configuration, and tests remain authoritative for executable behavior in a code-backed project.

Agents are the primary readers. Humans can still browse and edit plain Markdown. An agent or another skill must use the owning OKF skill and wrapper contract. Direct OKF calls and calls from another skill are equal entry paths to the same owner.

### Interaction rules

- Session orientation is the only automatic action. It is read-only.
- Task-specific reads are agent-selected explicit wrapper calls. They can be silent in the user interaction. They are not automatic wrapper invocations.
- Normal feature, fix, and research work reads relevant OKF first. It proposes a change only when verified context will affect future work and code cannot recover it adequately.
- **Proposal-first normal work revises the earlier bounded-write rule from #6 and the pinned specification.** An agent does not create or revise a concept during normal work before the user accepts one complete OKF change proposal. One acceptance covers exactly the listed concepts. Each concept is still written and validated separately.
- A declined proposal is not shown again in the same task unless new evidence changes it or the user requests synchronization.
- Skipping grilling does not block requested implementation. The agent reads existing context, completes verified work, and then proposes only missing durable context. This does not bypass this map dependency or any implementation-ticket blocker.
- When OKF and code conflict, code wins for executable behavior. For intent or rationale, the agent reports both and does not guess. It proposes an OKF revision only when evidence permits one.
- A human can edit OKF Markdown directly. The next relevant read, review, or synchronization re-reads and validates current content. The suite does not track a human-edit event or watch files.

### Action inventory

| Action | Entry point | Owner | Invocation | Status |
|---|---|---|---|---|
| Orient a session | Adapter seam or direct OKF read | `okf-read` | Automatic, read-only | Exists |
| Browse Markdown | Open bundle files | Human | Manual | Exists outside the suite |
| Read an exact concept or answer from it | Direct or integrated OKF read | `okf-read` | Agent-selected explicit call | Exists |
| Find task-relevant context | Direct or integrated OKF read and native search | `okf-read` | Agent-selected explicit call | Exists with known navigation defects |
| Validate a bundle or concept | Direct or integrated OKF read | `okf-read` | Explicit | Exists |
| Bootstrap and configure a project | Direct OKF setup | `okf-setup` | User-explicit | Exists with defects tracked by #165 and #166 |
| Migrate selected documents | Direct OKF setup | `okf-setup` | User-explicit | Exists; residue retention remains open in #157 |
| Propose a durable update from normal work | Integrated lifecycle checkpoint | `okf-lifecycle` | Read-only until accepted | Missing end-to-end flow |
| Create one accepted concept | Direct or integrated OKF write | `okf-write` | Explicit after proposal acceptance | Exists |
| Revise one accepted concept | Direct or integrated OKF write | `okf-write` | Explicit after proposal acceptance | Exists |
| Research and promote durable findings | Direct or integrated lifecycle flow | `okf-lifecycle` | Explicit research, then one proposal decision | Missing end-to-end flow |
| Add a domain from code | Direct or integrated lifecycle flow | `okf-lifecycle` | User-scoped proposal, then one proposal decision | Missing |
| Review trust and freshness | Direct or integrated OKF review | `okf-review` | Explicit, read-only | Exists |
| Notice possible stale context | Relevant read, verified result, or synchronization | `okf-review` | Read-only | Review exists; lifecycle trigger is missing |
| Re-read and validate changed Markdown | Next relevant read, review, or synchronization | `okf-read` or `okf-review` | Agent-selected explicit call | Exists; no edit-event tracking |
| Synchronize before a PR | Direct or integrated lifecycle request at any time | `okf-lifecycle` | User-explicit, diff-scoped, report or proposal first | Missing end-to-end flow |
| Synchronize the whole workspace | Direct lifecycle request | `okf-lifecycle` | User-explicit; parallel reads, one complete proposal, gated per-bundle writes | Missing; broad safeguards are not shipped |
| Promote a draft to stable | Direct OKF write | `okf-write` | User-explicit | Missing |
| Retire a stable concept as deprecated | Direct OKF write | `okf-write` | User-explicit | Missing |
| Reactivate a deprecated concept | Direct OKF write | `okf-write` | User-explicit | Missing |
| Record exact human verification | Direct OKF review | `okf-review` | User-explicit | Missing |
| Set or change `stale_after` | Direct OKF review | `okf-review` | User-explicit | Missing |
| Move or rename a concept | Direct OKF write | `okf-write` | User-explicit | Missing |
| Split a concept | Direct OKF write | `okf-write` | User-explicit | Missing |
| Merge concepts | Direct OKF write | `okf-write` | User-explicit | Missing |
| Restructure a subtree | Direct OKF write | `okf-write` | User-explicit | Missing |
| Edit Markdown directly | Filesystem editor | Human | Manual | Supported outside the suite |
| Retain raw evidence | Decision remains in #157 | Open | User-explicit only | Missing and unresolved |

### Add a domain from code

`okf-lifecycle` owns the flow. No external skill dependency and no seventh OKF skill are added. `okf-read` keeps read ownership and `okf-write` keeps mutation ownership.

1. The user gives a goal or code scope. A directory or package is evidence, not an automatic domain boundary.
2. Lifecycle reads existing OKF first. It can then inspect code and tests, project issues, Git history, and external primary sources when project evidence is not enough.
3. Lifecycle proposes the domain boundary and an open checked set: terms and meanings, a domain overview, decisions and rationale, constraints and invariants, ownership, playbooks, and task navigation. Another concept type is permitted only when it passes the durable-context test.
4. Curated context is permitted when code cannot explain it adequately. File lists, API mirrors, call graphs, generated references, and restated code behavior are excluded.
5. The user accepts one coherent proposal. Lifecycle calls existing `create` or `revise` once per concept and reports any partial result. No domain-specific wrapper or batch-write operation is added.

### Research artifacts

Raw research notes and downloaded evidence are temporary by default and stay outside the bundle. At research completion, lifecycle applies the durable-change test once. If it passes, it presents one sourced Research-concept proposal. If it fails, it reports the findings without durable promotion. Exact durable raw-evidence storage, validation, and report wording remain with #157.

### Synchronization

Pre-PR synchronization can be requested at any time. It inspects the current diff against an agreed base and reports or proposes only affected durable context.

Whole-workspace synchronization extends the accepted full-project design. `okf-lifecycle` coordinates one read-only subagent per admitted bundle in parallel, presents one complete proposal, and after acceptance uses bounded writers under the admission, authority, approval, and validation boundaries of each bundle. It never merges bundle ownership. The action is missing until the deferred broad-operation safeguards exist.

There is no built-in cadence, reminder, or monthly rule.

### Excluded

- Automatic bundle mutation.
- Direct bundle edits by agents or other skills.
- Code mirrors and generated implementation documentation.
- Repeated prompts after a declined proposal in the same task.
- A new domain skill, research skill, proposal wrapper operation, or batch-write operation.
- An OKF-managed recovery restore. Git remains the recovery system; reactivating a deprecated concept is a status action, not recovery.

### Map effect

This decision unblocks [Strict or dynamic concepts, and what the structure inside okf/ means](https://github.com/artemVeduta/okf-agent-skills/issues/163) and [Setup must ask which files and folders to migrate](https://github.com/artemVeduta/okf-agent-skills/issues/161). It also settles the existing fog question: `okf-lifecycle` uses the same propose-before-write interaction for normal work and synchronization.

The missing actions are inventory findings, not implementations delivered by this ticket.
