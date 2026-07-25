# Skill-Authoring Guidance: Primary-Source Survey

## Table of Contents

1. [Anthropic Official Guidance](#1-anthropic-official-guidance)
2. [Matt Pocock's `writing-great-skills`](#2-matt-pococks-writing-great-skills)
3. [Cross-Cutting Patterns](#3-cross-cutting-patterns)
4. [Anti-Patterns](#4-anti-patterns)
5. [Sources](#5-sources)

---

## 1. Anthropic Official Guidance

Sources: [Anthropic Skill-Authoring Best Practices](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/best-practices), [Agent Skills Specification](https://agentskills.io/specification), [Agent Skills Best Practices for Creators](https://agentskills.io/skill-creation/best-practices), [Anthropic Engineering Blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), [Claude Code Skills Docs](https://code.claude.com/docs/en/skills)

### Core Principles

- **Conciseness is key**: "The context window is a public good." Default assumption: Claude is already very smart. Only add context Claude doesn't already have. Challenge each piece of information: "Does Claude really need this explanation?" (source: Anthropic best-practices)
- **Add what the agent lacks, omit what it knows**: Ask "Would the agent get this wrong without this instruction?" If no, cut it. (source: agentskills.io best-practices)
- **Aim for moderate detail**: "Overly comprehensive skills can hurt more than they help — the agent struggles to extract what's relevant." (source: agentskills.io best-practices)
- **Test with all models you plan to use**: Haiku/Sonnet/Opus have different guidance needs. What works for Opus might need more detail for Haiku. (source: Anthropic best-practices)

### Skill Structure

**SKILL.md format** (source: agentskills.io specification):

```yaml
---
name: skill-name          # Required. Max 64 chars. Lowercase letters, numbers, hyphens only.
description: ...          # Required. Max 1,024 chars. Non-empty.
license: ...              # Optional
compatibility: ...        # Optional. Max 500 chars.
metadata:                 # Optional. Arbitrary key-value mapping.
allowed-tools: ...        # Optional. Space-separated, experimental.
---
```

- `name` must match parent directory name. No consecutive hyphens, no leading/trailing hyphens. (source: specification)
- `description` must be in third person: "Processes Excel files..." not "I can help you..." (source: Anthropic best-practices)

**Directory structure**:

```
skill-name/
├── SKILL.md          # Required
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
```

### Naming Conventions

- Use **gerund form** (verb + -ing): `processing-pdfs`, `analyzing-spreadsheets`, `managing-databases` (source: Anthropic best-practices)
- Acceptable alternatives: noun phrases (`pdf-processing`), action-oriented (`process-pdfs`)
- Avoid: vague names (`helper`, `utils`), overly generic (`documents`, `data`), reserved words (`anthropic-`, `claude-`)
- Consistent naming makes skills easier to reference, understand, and organize (source: Anthropic best-practices)

### Writing Effective Descriptions

- Critical for skill selection: Claude uses it to choose from potentially 100+ available skills (source: Anthropic best-practices)
- Include both **what the skill does** and **when to use it**
- Be specific and include key terms / trigger phrases
- Always in **third person** (injected into system prompt; inconsistent point-of-view causes discovery problems)

### Progressive Disclosure (3 levels)

Source: Anthropic engineering blog + specification

1. **Metadata** (~100 tokens): `name` and `description` loaded at startup for all skills
2. **Instructions** (<5,000 tokens recommended): Full `SKILL.md` body loaded when skill activates
3. **Resources** (as needed): Files in `scripts/`, `references/`, `assets/` loaded only when required

**Practical guidance** (source: Anthropic best-practices):

- Keep `SKILL.md` body under **500 lines** for optimal performance
- Split content into separate files when approaching this limit
- Organize by domain: `reference/finance.md`, `reference/sales.md`, `reference/product.md`
- **Keep references one level deep** from `SKILL.md`. Avoid deeply nested reference chains — Claude may partially read nested files (e.g., `head -100`)
- For reference files >100 lines, include a table of contents at the top

### Matching Specificity to Fragility (Degrees of Freedom)

Source: Anthropic best-practices

- **High freedom** (text-based instructions): Multiple approaches valid, decisions depend on context
- **Medium freedom** (pseudocode or scripts with parameters): Preferred pattern exists, some variation acceptable
- **Low freedom** (specific scripts, few/no parameters): Operations are fragile, consistency critical, specific sequence must be followed

Analogy: "Narrow bridge with cliffs on both sides" (low freedom) vs. "Open field with no hazards" (high freedom).

### Invocation Control (Claude Code-specific)

Source: Claude Code skills docs

| Frontmatter                      | User can invoke | Claude can invoke | Context load                |
|----------------------------------|-----------------|-------------------|-----------------------------|
| (default)                        | Yes             | Yes               | Description always in ctx   |
| `disable-model-invocation: true` | Yes             | No                | Description not in ctx      |
| `user-invocable: false`          | No              | Yes               | Description always in ctx   |

Claude Code extends the base specification with: `context: fork` (subagent execution), `allowed-tools`/`disallowed-tools`, `model`/`effort` overrides, `hooks`, `paths` (glob patterns for activation), `argument-hint`/`arguments`, string substitution (`$ARGUMENTS`, `$0`, `$1`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`), and `` !`command` `` dynamic context injection.

### Evaluation-Driven Development

Source: Anthropic best-practices

1. Identify gaps: Run Claude on representative tasks without a skill, document failures
2. Create evaluations: Build 3+ scenarios that test these gaps
3. Establish baseline: Measure performance without the skill
4. Write minimal instructions: Just enough to address gaps and pass evaluations
5. Iterate: Execute evaluations, compare against baseline, refine

"Create evaluations BEFORE writing extensive documentation. This ensures your skill solves real problems rather than documenting imagined ones."

### Patterns for Effective Instructions

All from Anthropic best-practices / agentskills.io best-practices:

- **Workflows**: Break complex operations into clear, sequential steps. Provide checklists the agent can copy and check off.
- **Feedback loops**: "Run validator -> fix errors -> repeat" pattern. Validator can be a script or a reference document.
- **Plan-validate-execute**: For batch/destructive operations. Create intermediate plan in structured format, validate against source of truth, then execute.
- **Templates**: Provide concrete output format templates. Agents pattern-match well against structures.
- **Gotchas sections**: "The highest-value content in many skills." Environment-specific facts that defy reasonable assumptions. "When an agent makes a mistake you have to correct, add the correction to the gotchas section."
- **Provide defaults, not menus**: Pick a default approach and mention alternatives briefly rather than presenting equal options.
- **Favor procedures over declarations**: Teach *how to approach* a class of problems, not *what to produce* for a specific instance.
- **Start from real expertise**: "A common pitfall is asking an LLM to generate a skill without providing domain-specific context." Feed project-specific material (runbooks, style guides, API specs, crash logs) into the creation process.

### Skill Content Lifecycle (Claude Code)

Source: Claude Code skills docs

- Skill content stays in context across turns once loaded
- Re-invocation with identical content adds a short "already loaded" note (v2.1.202+)
- Auto-compaction carries skills forward: first 5,000 tokens of each, up to 25,000 combined budget, newest-first
- If a skill stops influencing behavior, strengthen the `description` and instructions

### Code and Scripts Guidance

Source: Anthropic best-practices

- **Solve, don't defer**: Handle error conditions in scripts rather than deferring to Claude
- **No "voodoo constants"**: All values justified and documented
- **Pre-made scripts** are more reliable, save tokens, save time, ensure consistency
- Make execution intent clear: "Run `analyze_form.py`" (execute) vs. "See `analyze_form.py` for the algorithm" (read as reference)
- Avoid assuming tools are installed; document dependencies explicitly
- Use forward slashes only (`scripts/helper.py`), never Windows-style paths

---

## 2. Matt Pocock's `writing-great-skills`

Source: `/Users/artemveduta/.agents/skills/writing-great-skills/SKILL.md` and `GLOSSARY.md`

### Root Principle

"A skill exists to wrangle determinism out of a stochastic system. **Predictability** — the agent taking the same *process* every run, not producing the same output — is the root virtue; every lever below serves it." (SKILL.md:7)

### Invocation Model

Two choices trading different costs (SKILL.md:13-21):

- **Model-invoked**: Keeps a `description`, agent can fire autonomously, other skills can reach it. Costs **context load** — the description sits in the window every turn. Omit `disable-model-invocation`, write model-facing description with rich trigger phrasing.
- **User-invoked**: Strips description from agent's reach. Only human typing its name can invoke. Zero context load, but spends **cognitive load** — the human is the index that must remember it exists. Set `disable-model-invocation: true`; description becomes human-facing.

"Pick model-invocation only when the agent must reach the skill on its own, or another skill must. If it only ever fires by hand, make it user-invoked and pay no context load."

### The Two Loads

From GLOSSARY.md:

- **Context Load** (GLOSSARY.md:45-48): "The cost a model-invoked skill imposes on the agent's context window — its description, always loaded, spending both tokens and attention. The brake on splitting into more model-invoked skills."
- **Cognitive Load** (GLOSSARY.md:51-54): "The cost a user-invoked skill imposes on the human — what they must hold in their head: which skills exist and when to reach for each. The price of human agency. Spend it where human judgement matters; remove it where it does not."

### Information Hierarchy

A ladder ranked by how immediately the agent needs the material (SKILL.md:32-44, GLOSSARY.md:71-80):

1. **In-skill steps** — Ordered actions in SKILL.md. Each step ends on a **completion criterion**, a condition that tells the agent the work is done. Must be *checkable* (can the agent tell done from not-done?) and, where it matters, *exhaustive*.
2. **In-skill reference** — Definitions, rules, facts in SKILL.md, consulted on demand. "Often a legitimately flat peer-set — a fine arrangement, not a smell."
3. **External reference** — Reference pushed out of SKILL.md into a separate file, reached by a **context pointer**.

"Push too little down and the top bloats; push too much and you hide material the agent actually needs. That tension is the whole decision."

### Progressive Disclosure

"The move down the ladder — out of SKILL.md into a linked file — so the top stays legible." (SKILL.md:42)

- Mechanics: A linked `.md` file in the skill folder, named for what it holds
- **Branching** is the cleanest disclosure test: "inline what every branch needs, and push behind a pointer what only some branches reach"
- A **context pointer**'s *wording*, not its target, decides when and how reliably the agent reaches the material

### Description Writing

For model-invoked skills (SKILL.md:24-29):

- **Front-load the skill's leading word** — the description is where it does its invocation work
- **One trigger per branch.** Synonyms that rename a single branch are duplication — collapse them
- **Cut identity that's already in the body.** Keep the description to triggers, plus any "when another skill needs…" reach clause

### Leading Words

"A compact concept already living in the model's pretraining that the agent thinks with while running the skill." (SKILL.md:63, GLOSSARY.md:129-134)

Serves predictability twice:
- In the body: anchors *execution* — the agent reaches for the same behavior every time the word appears
- In the description: anchors *invocation* — when the same word lives in your prompts, docs, and code, the agent links that shared language to the skill

Examples: "fast, deterministic, low-overhead" -> *tight*; "a loop you believe in" -> *red*. "Reach for an existing word first" — a made-up word recruits no priors.

### Completion Criteria

"The condition that tells the agent a unit of work is done — the target it judges against." (GLOSSARY.md:137-142)

Two properties:
- **Clarity**: Can the agent tell done from not-done? A vague bound invites premature completion.
- **Demand**: How much does it require? Sets **legwork** — "every modified model accounted for" forces thorough work where "produce a change list" does not.

"The strongest criteria are both checkable and exhaustive."

### When to Split (Granularity)

Two split cuts (SKILL.md:46-52):

- **By invocation**: Split off a model-invoked skill when you have a distinct leading word that should trigger it on its own, or another skill must reach it. You pay context load for the new always-loaded description.
- **By sequence**: Split a run of steps when the steps still ahead (**post-completion steps**) tempt the agent to rush the current step (**premature completion**). Keeping them out of view encourages more **legwork** on the current task.

### Pruning

Three layers (SKILL.md:55-60):

- **Single source of truth**: Keep each meaning in one authoritative place
- **Relevance**: Does each line still bear on what the skill does?
- **No-ops**: "Run the no-op test on each sentence in isolation, and when one fails, delete the whole sentence rather than trim words from it."

### Co-location

"Keeping the material an agent needs at once in one place — a concept's definition, rules, and caveats under a single heading, not scattered across the file — so reading one part brings its neighbours with it." (GLOSSARY.md:107-110)

The within-file companion to the Information Hierarchy: "the hierarchy ranks *how far down* a piece sits; co-location decides *what sits beside it* once there."

### Router Skill

"A user-invoked skill whose job is to point at your other user-invoked skills — naming each and when to reach for it — so the human has one skill to remember instead of many." (GLOSSARY.md:57-60)

The cure for cognitive load when user-invoked skills multiply.

---

## 3. Cross-Cutting Patterns

### Consistent Across All Sources

| Principle | Anthropic | Pocock |
|-----------|-----------|--------|
| **Conciseness** | "Only add context Claude doesn't already have" | "Run the no-op test on each sentence in isolation" |
| **Progressive disclosure** | 3-level model (metadata -> SKILL.md -> ref files) | 3-rung ladder (steps -> in-skill ref -> external ref) |
| **Split by domain/branch** | "Organize by domain: finance.md, sales.md" | "Inline what every branch needs, push what only some branches reach" |
| **Description as trigger** | "Include both what the skill does and when to use it" | "Front-load the leading word — the description is where it does its invocation work" |
| **Checkable completion** | "Checklists for multi-step workflows" | "Completion criteria must be checkable and, where it matters, exhaustive" |
| **Avoid vagueness** | "Avoid vague descriptions like 'Helps with documents'" | "A vague bound invites premature completion" |
| **Examples > descriptions** | "Provide input/output pairs" | Leading words recruit pretrained priors |
| **Validation loops** | "Run validator -> fix errors -> repeat" | "A demanding completion criterion drives thorough legwork" |
| **Iterate from real use** | "Observe how Claude navigates skills, iterate based on observation" | "Use failure modes to diagnose issues the user may be having" |
| **One-deep references** | "Keep references one level deep from SKILL.md" | "Push behind a pointer what only some branches reach" |

### Distinct Concepts (Pocock-Only)

Concepts not present in Anthropic's guidance:

- **Leading Words** as a named technique for compact behavioral anchoring via pretrained priors
- **Cognitive Load** as the explicit cost of user-invoked skills (human-as-index)
- **Context Load** as the token+attention cost of model-invoked descriptions
- **Router Skill** as a formal pattern for user-invoked skill discovery
- **Co-location** as the spatial companion to hierarchy ("what sits beside what")
- **Completion Criterion** as a formal concept with clarity and demand axes
- **Legwork** as the agent's behind-scenes digging, separate from the step structure
- **Post-Completion Steps** as a named tug toward premature completion
- **Negation** as a distinct failure mode (prohibition backfires — "don't think of an elephant")

### Distinct Concepts (Anthropic-Only)

Concepts not present in Pocock's framework:

- **Evaluation-driven development** as a formal 5-step methodology
- **Degrees of freedom** (high/medium/low) as an explicit calibration framework
- **Templates for output format** as a named pattern
- **Gotchas sections** as a specific content section type
- **Plan-validate-execute** as a named workflow pattern
- **Conditional workflows** as a branching technique
- **Specific model testing** (Haiku/Sonnet/Opus) guidance
- **Descriptions must be in third person** as a hard rule
- **Pre-made scripts** vs. generated code tradeoff analysis

---

## 4. Anti-Patterns

### From Anthropic

- **Too verbose**: Explaining what the agent already knows (what PDF is, how HTTP works)
- **Time-sensitive information**: "Before August 2025, use old API" — will become wrong
- **Inconsistent terminology**: Mixing "API endpoint", "URL", "API route", "path"
- **Too many options**: Presenting 4 libraries as equal choices without a default
- **Deeply nested references**: SKILL.md -> advanced.md -> details.md (Claude may partially read)
- **Voodoo constants**: Unjustified magic numbers in scripts
- **Deferring to Claude**: Scripts that throw errors rather than handling them
- **Assuming tools are installed**: Not documenting dependencies
- **Windows-style paths**: Backslashes in file references
- **First/second person descriptions**: "I can help you..." / "You can use this..."
- **Overly generic or vague names**: `helper`, `utils`, `documents`

### From Pocock

- **Premature completion**: Ending a step before genuinely done. Defence: sharpen the completion criterion first (cheap, local); only if irreducibly fuzzy and you observe the rush, hide post-completion steps by splitting.
- **Duplication**: Same meaning in more than one place. Costs maintenance and tokens, inflates prominence.
- **Sediment**: "Stale layers that settle because adding feels safe and removing feels risky. The default fate of any skill without a pruning discipline."
- **Sprawl**: "A skill simply too long, even when every line is live and unique." Cure is the ladder: disclose reference behind pointers, split by branch.
- **No-op**: "A line the model already obeys by default — you pay load to say nothing." Test: does it change behavior versus the default? Model-relative, not reader-relative.
- **Negation**: "Don't think of an elephant" names the elephant and makes it more available. Cure: prompt the **positive** — state the target behavior so the banned one is never spoken.

### Shared Anti-Patterns

- **Over-engineering**: Writing skills for imagined requirements rather than observed gaps
- **Vagueness**: Instructions like "handle errors appropriately" or "follow best practices"
- **Context bloat**: Loading reference material the agent doesn't need for the current task
- **Asking LLMs to generate skills without domain context**: "A common pitfall... vague, generic procedures rather than the specific API patterns, edge cases, and project conventions that make a skill valuable" (agentskills.io best-practices)

---

## 5. Sources

| Source | URL |
|--------|-----|
| Anthropic Skill-Authoring Best Practices | `https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/best-practices` |
| Agent Skills Specification | `https://agentskills.io/specification` |
| Agent Skills Quickstart | `https://agentskills.io/skill-creation/quickstart` |
| Agent Skills Best Practices for Creators | `https://agentskills.io/skill-creation/best-practices` |
| Anthropic Engineering Blog: Agent Skills | `https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills` |
| Claude Code Skills Documentation | `https://code.claude.com/docs/en/skills` |
| Claude Code Best Practices | `https://code.claude.com/docs/en/best-practices` |
| Matt Pocock: `writing-great-skills` SKILL.md | `/Users/artemveduta/.agents/skills/writing-great-skills/SKILL.md` |
| Matt Pocock: `writing-great-skills` GLOSSARY.md | `/Users/artemveduta/.agents/skills/writing-great-skills/GLOSSARY.md` |
