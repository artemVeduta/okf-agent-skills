---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/26
status: draft
type: Decision
---

# Adopt a combined skill-authoring contract for the OKF skill suite

Status: Closed.

## Question

Which guidance from Matt Pocock’s pinned [`writing-great-skills` source](https://github.com/mattpocock/skills/tree/ed37663cc5fbef691ddfecd080dff42f7e7e350d/skills/productivity/writing-great-skills) and the verified evidence produced by [Capture and verify the transcript of “Building Great Agent Skills: The Missing Manual”](https://github.com/artemVeduta/okf-agent-skills/issues/25) should govern how the OKF skill suite is discussed, specified, authored, and reviewed, and how should that guidance be translated across Claude Code, Codex, and OpenCode without treating harness-specific mechanics as portable facts?

The decision must distinguish shared principles, repository-only detail, video-only rationale or examples, prior OKF research, and any conflict or drift. It must state which vocabulary and rules are normative, advisory, adapted, or rejected for OKF: predictability; user- versus model-invocation; context versus cognitive load; descriptions and trigger branches; skill granularity; steps versus reference; progressive disclosure and context pointers; leading words; checkable and exhaustive completion criteria; legwork and premature completion; and pruning duplication, sediment, sprawl, no-ops, and negation.

Map every adopted rule to its concrete consequence for OKF skill boundaries, descriptions/frontmatter, information layout, completion criteria, harness adapters, deterministic tests, and independent review. Keep the adopted contract in this ticket’s resolution as the single source of truth; the map and downstream tickets should point to it instead of duplicating its policy.

## Comment by artemVeduta

## Resolution

This is the adopted skill-authoring contract for the OKF skill suite. It is the
single source of truth for the policy below. The map and downstream tickets
should link here rather than restating it.

### Governing objective

The root objective is **predictability**: for the same class of request, the
agent should follow the same intended process and safety gates. Predictability
does not require identical prose, files, or other output when the input differs.

For example, two migration runs may produce different bundles, but both must
inventory the source, classify uncertainty, preview the change, validate it,
and use the approved write-new-then-swap boundary. Every authoring choice is
judged by whether it improves that repeatable process or protects an explicit
OKF invariant.

### Evidence and status

Evidence is not one undifferentiated list of best practices. The following
classification governs adoption:

| Evidence | Status and use |
| --- | --- |
| Current OKF specification and accepted OKF suite decisions | Normative for OKF semantics and suite policy. |
| Current, verified first-party harness documentation or source | Normative only for the corresponding harness adapter fact. It does not establish cross-harness parity. |
| Matt Pocock's pinned `writing-great-skills` source | The primary authoring reference. Its adopted principles are normative for this suite only where this resolution explicitly adopts them. |
| The verified transcript of “Building Great Agent Skills: The Missing Manual” | Advisory rationale, vocabulary, and examples. It is not independent corroboration and does not create product policy by itself. |
| Earlier OKF research notes and local experiments | Evidence and hypotheses until an accepted repository decision promotes a finding. |
| `CONTEXT.md` | Canonical domain vocabulary. It is not an implementation specification or automatic authoring policy. |

When sources conflict, current OKF decisions govern OKF behavior, current
first-party evidence governs adapter facts, and this accepted contract governs
the suite's authoring policy. A changed source or harness fact triggers review;
it does not silently mutate the contract. Unsupported parity claims, duplicated
policy, and rules outside the destination are rejected.

### Adopted contract

#### Invocation and loads

Every skill has an explicit invocation design:

- Use model invocation only when the agent or another skill must reach the
  skill autonomously.
- Use user invocation when human intent or approval is essential, especially
  for destructive, broad, migratory, or otherwise consequential operations.
- Treat **context load** as the model-facing cost of exposing invocation
  descriptions and **cognitive load** as the human-facing cost of remembering
  user-invoked skills.
- Use those terms as design tradeoffs, not as universal numeric budgets.

Invocation intent is portable; its enforcement is not. Claude Code,
OpenAI Codex, and OpenCode receive harness-specific mappings. A skill is not
called manual-only merely because a harness ignores a particular frontmatter
field.

#### Descriptions and frontmatter

The portable frontmatter subset is limited to shared, verified Agent Skills
metadata. `name` and `description`, including their standard constraints, are
portable contract fields. Optional fields are portable only when the target
capability matrix verifies them.

Descriptions are concise routing metadata:

- State the capability in third-person language.
- For model-invoked skills, front-load the leading word and state each
  genuinely distinct trigger branch once.
- Add a reach clause only when another skill must invoke the skill.
- For user-invoked skills, make the description human-facing rather than
  pretending it controls model routing.
- Do not repeat the procedure, identity, or reference material in metadata.
- Do not count synonyms that rename one branch as separate triggers.

Claude-specific controls such as `disable-model-invocation`, `context: fork`,
hooks, and execution restrictions are adapter concerns. Codex's
`agents/openai.yaml` and OpenCode permissions or plugins are adapter concerns.
The presence of `allowed-tools` or any other generic field is not evidence that
every host enforces it.

#### Skill boundaries and granularity

A skill describes one coherent job. A boundary is earned by an independent
leading word or invocation trigger, a meaningful branch with distinct
references or safeguards, or a sequence boundary that prevents an observed
premature-completion failure.

Do not split merely to mirror code modules, reduce line count, or satisfy a
harness directory layout. Do not hide unrelated jobs in a generic monolith.
The exact suite inventory remains an architecture decision; this contract
defines how that inventory is judged.

#### Steps, reference, and disclosure

**Steps** are ordered work the agent must perform. **Reference** is the
definition, rule, fact, or example consulted during that work. A skill may be
all steps, all reference, or both; facts must not be disguised as procedural
steps.

Use progressive disclosure at the shallowest useful level:

- Metadata supports discovery and invocation.
- `SKILL.md` contains universal steps, completion gates, and essential rules.
- One-level-deep references, scripts, or assets contain branch-specific or
  on-demand material.

Inline what every branch needs. Put material used by only some branches behind
an explicit context pointer whose wording states when and why to load it. Keep
related definitions, rules, and caveats co-located. Avoid deep pointer chains
and do not hide material required by every branch merely to shorten the file.

#### Leading words

Leading words are compact behavioral anchors and shared vocabulary. Prefer
existing OKF, repository, and harness terms over invented jargon. For example,
`preview`, `write-new-then-swap`, and `round-trip` can anchor behavior when the
repository defines those terms consistently.

Leading words are advisory by default. A term becomes normative only when the
repository defines its semantics and verifies them. A leading word never
replaces explicit safeguards or completion criteria for risky work.

#### Completion, legwork, and sequence

Every procedural step ends with a checkable completion criterion. The criterion
states observable evidence for done and not-done. It is exhaustive whenever a
bounded scope or safety obligation makes omissions dangerous, such as every
modified concept, every affected link, or each failed check. Open-ended work
gets an explicit bounded stopping condition instead of fake exhaustiveness.

Use this order when an agent rushes:

1. Strengthen the current completion criterion.
2. Add the required legwork and evidence to that criterion.
3. Split the sequence only if the rush remains an observed, irreducible
   problem.

Legwork and premature completion are shared review vocabulary. Hiding future
steps is an evidence-driven technique, not a default, and must not conceal
information the current step genuinely needs.

#### Pruning

Pruning is a normative review gate:

- Each meaning has one authoritative source.
- Stale, irrelevant sediment is removed rather than layered over.
- Genuine sprawl is addressed through disclosure or a justified boundary.
- A no-op sentence is deleted when it does not change model behavior, rather
  than cosmetically shortened.
- Positive target behavior is preferred over negation. An unavoidable hard
  prohibition is paired with the action that should happen instead.

### Translation and verification consequences

The contract has these concrete consequences for the suite:

- **Skill boundaries:** boundaries follow coherent jobs, independent triggers,
  meaningful branches, and safety-sensitive sequences; they do not follow
  implementation modules or assumed feature parity.
- **Descriptions and frontmatter:** shared metadata is linted as portable;
  descriptions are third-person, branch-specific, concise, and non-duplicative;
  harness-only fields are kept in adapters and never treated as universal.
- **Information layout:** universal procedures and gates remain in `SKILL.md`;
  branch-specific material uses one-level context pointers; related facts stay
  co-located; pointer chains remain shallow.
- **Completion criteria:** every procedural step has an observable criterion;
  bounded safety work uses exhaustive criteria; exploratory work declares a
  stopping condition; criteria name evidence rather than aspiration.
- **Harness adapters:** adapters translate invocation, discovery, permissions,
  hooks, subagents, installation, and unsupported-capability behavior. They
  preserve the portable intent, fail closed where a required safeguard is
  unavailable, and never claim a control that was not verified.
- **Deterministic tests:** static tests cover metadata, names, descriptions,
  links, layout, and known policy boundaries. Fixture tests cover bounded
  workflow states, safety gates, reports, and failure handling. Capability tests
  cover each adapter only against verified behavior. Model evaluation uses
  scenarios and evidence, not exact prose matching.
- **Independent review:** reviewers trace every normative rule from source and
  status to scope, implementation consequence, verification, and failure or
  unsupported behavior. They inspect actual files and tests for drift,
  duplication, sediment, no-ops, negation, vague criteria, and false parity.

`v0.1.0` keeps deterministic and fixture-based contract tests as the release
gate. Live process acceptance across all three harnesses remains the later
acceptance phase already identified by the map.

### Explicit limits

This contract does not choose the final skill count, exact runtime, hook
installation, session-start injection, numeric context thresholds, migration
state model, or release sequence. Those decisions remain in their downstream
tickets. It governs how those decisions are discussed, specified, authored,
tested, and independently reviewed.

The source links remain evidence pointers. The accepted policy is this
resolution, not the transcript, a research note, or a copied version of the
pinned authoring skill.
