# Plan — Issue #199: Apply assisted durable capture across the lifecycle

Source ticket: https://github.com/artemVeduta/okf-agent-skills/issues/199
Binding decisions: #192 (assisted durable capture, global automatic lifecycle rule),
#202 (folder-local knowledge), #200 (`max_words_per_file` split review),
#169 (proposal-first reaches `okf-write` through the existing seams),
#197 (`.okf-workspace.json` carries `settings.max_words_per_file`).

## Context

The proposal-first rules already exist for **setup** (`skills/okf-setup/SKILL.md`,
`test/migration/*`). They do not exist for **normal lifecycle work**.
`skills/okf-lifecycle/SKILL.md` documents only narrow `sync` versus explicit
reconciliation; it says nothing about observing durable-change candidates,
batching one proposal, or maintaining a concept group package. This plan carries
those two decisions into the lifecycle skill, the shipped connector, and the
deterministic suite.

## Global Constraints

- Zero runtime dependencies. Node standard library only.
- **No new contract seam.** Add no proposal token, no batch-write operation, no
  wrapper operation, no hook, no new skill, no hidden memory. Every mutation
  keeps going through the existing `okf-write` / `okf-lifecycle` wrapper calls,
  one accepted write at a time.
- No backward compatibility, no migration path for older behaviour.
- The accepted proposal lives in session memory only. It never crosses the
  wrapper seam.
- Deterministic fixtures may prove documented shape and flow composition. They
  must never claim runtime proof of human acceptance or of live waiting.
- Report only in ASD-STE100 Simplified Technical English.
- Every task commits, and every task keeps `node --test "test/**/*.test.js"`
  green.

## Task 1 — Document assisted durable capture in `okf-lifecycle`

File: `skills/okf-lifecycle/SKILL.md`.

Add one section, `## Assisted durable capture`, before `## Procedure`, and the
matching numbered steps in `## Procedure`. It must state exactly these rules,
taken from #192 and #199:

1. Throughout normal work the skill observes durable-change candidates for
   `Decision`, `Glossary`, `Constraint`, `Research`, `Playbook`, and open
   domain-specific concept types. It does not interrupt for each candidate.
2. At a natural checkpoint, or before the final response, it presents **one**
   compact proposal for the useful durable changes.
3. It asks immediately only when missing meaning blocks the current work.
4. It skips temporary facts, code-recoverable detail, duplicates, and weak
   guesses.
5. A declined item is not repeated in the same task unless new evidence changes
   it.
6. When the user states a durable or global decision, the skill recommends
   capture and proposes the smallest valid concept or update.
7. When required meaning is missing, the skill names the missing fact and offers
   a concrete recommendation or a compact draft. This is an **assisted user
   decision**: help never counts as acceptance.
8. No mutation is automatic. Acceptance uses the existing owner flow, and each
   accepted item becomes one ordinary `okf-write` call.
9. The skill resolves the effective `settings.max_words_per_file` from
   `.okf-workspace.json` over the built-in default for each proposal. When a
   proposed new or revised substantive concept exceeds the target, the proposal
   carries an exact semantic split, or an explicit keep-as-one decision. The
   target is a soft target: it never warns on a read and it is never a
   validation gate.

Each `## Procedure` step keeps the file's existing "Done when … ; not done if …"
form.

## Task 2 — Document folder-local maintenance in `okf-lifecycle`

File: `skills/okf-lifecycle/SKILL.md`.

Add one section, `## Folder-local maintenance`, after Task 1's section, stating
these rules from #202 as they apply to normal lifecycle work:

1. Every proposed concept names exactly one bounded reader-purpose group. No
   substantive concept and no glossary sits directly at the bundle root; the
   root holds only `index.md` and the optional `log.md`.
2. Every proposal carries the exact index, glossary, local-guidance, and
   optional local-log change for each touched group, or an explicit no-change
   disposition — including an explicit no-local-terms result when the group owns
   no glossary.
3. For each new or changed concept the skill inspects the local glossary and the
   glossaries it links to, and proposes the needed term additions, links, scope
   changes, or removals. It never changes a term without acceptance.
4. A new group is proposed as one complete package. The skill creates no empty
   glossary, no empty guidance, and no other folder-template scaffolding.
5. Known structural defects in a touched group join that proposal. Defects in
   untouched groups are reported and offered as a separate restructuring
   proposal; they never block the unrelated local work.
6. Every write stays independent. The report names every applied, failed, and
   skipped effect. A partial result marks the touched group as needing repair,
   and the next mutation of that group includes the repair. There is no
   automatic retry, rollback, checkpoint, or resume. Git is the recovery
   mechanism.

Add the matching `## Procedure` steps in the same "Done when … ; not done if …"
form.

## Task 3 — Deterministic procedure fixtures

Add `test/lifecycle/proposal-capture.test.js`, and one row for it in
`test/README.md` (symptom column: the documented assisted-capture proposal or
the folder-local maintenance rules in `okf-lifecycle` are missing or wrong).

The fixtures read `skills/okf-lifecycle/SKILL.md` and assert the documented
shape — the same style the suite already uses for skill documents
(`test/protocol/skill-documents.test.js` is the reference for how a skill
document is asserted). They must prove, at least:

- both new sections exist, in order, before `## Procedure`;
- the observed durable concept types are named;
- the one-proposal-per-checkpoint rule, the skip list, the
  declined-item rule, and the "help never counts as acceptance" rule are stated;
- the `max_words_per_file` resolution and the split-or-keep-as-one decision are
  stated, and stated as a soft target, not a gate;
- the folder-local rules: named group, no root substantive concept, the four
  group-package dispositions with explicit no-change, glossary inspection
  without unaccepted term change, complete new-group package, touched-group
  defect handling, and the applied/failed/skipped partial-result report;
- the no-new-seam constraint: the document adds no wrapper operation beyond
  `sync` and names no proposal token or batch-write operation.

Do not add a fixture that claims a live human waited, accepted, or declined.
