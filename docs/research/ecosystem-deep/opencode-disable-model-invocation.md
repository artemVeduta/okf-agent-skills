# OpenCode: `disable-model-invocation` Equivalent

> **RETRACTED 2026-08-01 — the headline answer below is wrong.**
> Original answer (2026-07-26): *"No. OpenCode has no supported mechanism that hides one skill
> from model choice while preserving a separate direct/manual invocation path."*
> **Corrected answer: two mechanisms achieve exactly that effect.** (a) Omit `description`, which
> filters the skill out of `<available_skills>` in both `Skill.fmt` and
> `packages/core/src/skill/guidance.ts` but leaves the skill registered as a `/name` slash command.
> (b) Deny the skill permission, per skill (`permission: { skill: { "my-skill": "deny" } }`) or
> globally (`tools: { skill: false }`); the slash command still survives.
> **Why the note was wrong:** it assumed skills have no per-skill user-invocation path. They do —
> `packages/opencode/src/command/index.ts:134-152` registers every skill from `skill.all()` as a
> slash command with `source: "skill"`. That capability landed 2026-01-31
> (commit `81ac41e0891cf9318af641805e7b1c5af1194be4`, first released in `v1.1.48`), six months
> before this note, and is **undocumented** — `commands.mdx` never mentions skills — so a
> docs-first investigation could not see it.
> **Still true:** OpenCode recognizes no frontmatter key literally named
> `disable-model-invocation`; unknown frontmatter keys are silently ignored.
> Superseding note: [`opencode-commands-and-skill-invocation.md`](./opencode-commands-and-skill-invocation.md)
> (source snapshot `32f278b48f1a495611165d8a9f1ace0b512933e2`, tag `v1.4.11`, verified 2026-08-01).
> Sections 3, 5, 6 and 7 below carry inline retractions. Sections 1, 2 and 4 stand.

Research date: 2026-07-26 · Retraction date: 2026-08-01

---

## 1. What `disable-model-invocation` Is (Claude Code)

`disable-model-invocation` is a **Claude Code feature** defined in the writing-great-skills vocabulary:

- When set to `true` in a SKILL.md frontmatter, the skill's `description` is stripped from the agent's reach. Only the human, by typing the skill name, can invoke it.
- When absent/false, the skill appears in `available_skills` and the agent can auto-invoke it.

Source: `/Users/artemveduta/.agents/skills/writing-great-skills/SKILL.md`, lines 4, 12-16

---

## 2. OpenCode Frontmatter: No Support

OpenCode recognizes only these frontmatter fields:

| Field | Required | Type | Source |
|-------|----------|------|--------|
| `name` | Yes | string, 1-64 chars | https://opencode.ai/docs/skills/#write-frontmatter |
| `description` | Yes (per docs) | string, 1-1024 chars | https://opencode.ai/docs/skills/#follow-length-rules |
| `license` | No | string | https://opencode.ai/docs/skills/#write-frontmatter |
| `compatibility` | No | string | https://opencode.ai/docs/skills/#write-frontmatter |
| `metadata` | No | string-to-string map | https://opencode.ai/docs/skills/#write-frontmatter |

**Unknown fields are silently ignored** (https://opencode.ai/docs/skills/#write-frontmatter).

Placing `disable-model-invocation: true` in an OpenCode `SKILL.md` has **zero effect**. Because the field is ignored rather than interpreted as `false`, a valid skill with a description remains listed to the model and remains invocable through the `skill` tool.

### Source Code Confirmation

The V2 skill frontmatter schema (`/packages/core/src/skill.ts:33-37`):

```typescript
const Frontmatter = Schema.Struct({
  name: Schema.String.pipe(Schema.optional),
  description: Schema.String.pipe(Schema.optional),
  slash: Schema.Boolean.pipe(Schema.optional),
})
```

Only `name`, `description`, and `slash` are extracted. No `disable-model-invocation` field exists.

The V1 skill frontmatter check (`/packages/opencode/src/skill/index.ts:53-59`):

```typescript
function isSkillFrontmatter(data: unknown): data is { name: string; description?: string } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}
```

Again, only `name` and `description`. No `disable-model-invocation`.

### GitHub Search

A search of the entire `anomalyco/opencode` repository for both `disable-model-invocation` and `disableModelInvocation` returned **zero matches**. The concept does not exist in the codebase.

---

## 3. Permission-Based Mechanisms (and Why They Don't Work)

> **RETRACTED 2026-08-01 — the section title and the `deny` / `tools: { skill: false }` verdicts
> are wrong.** Both mechanisms do work, because they hide the skill from the model only. The
> command registry (`Command.init`) iterates `skill.all()`, not `Skill.available()`, so a denied
> skill keeps its `/name` slash command; and the slash path is prompt injection
> (`session/prompt.ts:1355-1410`), so `permission.assert({ action: "skill" })` is never evaluated.
> The `ask` verdict below is unaffected and still correct.
> See [`opencode-commands-and-skill-invocation.md`](./opencode-commands-and-skill-invocation.md) §3–§4.

### `deny` — Hides from both model AND human

From https://opencode.ai/docs/skills/#configure-permissions:

> `deny` — Skill hidden from agent, access rejected

The skill is filtered out of `available_skills` and can never be loaded — not by the model, not by the human, not by any path.

Source code: `/packages/opencode/src/skill/index.ts:314`:

```typescript
return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
```

**Verdict: Too restrictive.** Cannot be used for human-only invocation.

> **RETRACTED 2026-08-01.** `deny` is precisely the per-skill human-only mechanism. The filter
> quoted above runs inside `Skill.available()`, which feeds the system prompt and the `skill` tool.
> It does not run in `Command.init`, so `/my-skill` remains registered and executable.

### `ask` — Does NOT prevent auto-invocation

From https://opencode.ai/docs/skills/#configure-permissions:

> `ask` — User prompted for approval before loading

The skill **still appears** in `available_skills` (only `deny` filters it out). The model can still **see** it and **decide** to invoke it. The only difference is an approval prompt.

Crucially, in `--auto` mode, `ask` is treated as `allow`:

Source: https://opencode.ai/docs/permissions/#auto-mode:

> Start OpenCode with --auto to automatically approve permission requests that are not explicitly denied. […] Explicit "deny" rules are still enforced. Auto mode only changes requests that would otherwise ask for approval.

**Verdict: Does not prevent auto-invocation.** The model still sees and can decide to call the skill. In auto mode, it loads without any prompt.

### `tools: { skill: false }` — Disables ALL skills

From https://opencode.ai/docs/skills/#disable-the-skill-tool:

> When disabled, the `<available_skills>` section is omitted entirely.

This removes the `skill` tool from the agent. No skills are visible or loadable. This is a blunt, whole-system disable.

Source code confirmation in `/packages/opencode/src/session/system.ts:98-99`:

```typescript
skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
  if (Permission.disabled(["skill"], agent.permission).has("skill")) return
```

**Verdict: Too blunt.** No per-skill granularity. Equivalent to removing the skill system entirely for that agent.

> **RETRACTED 2026-08-01.** The early return quoted above removes the `<available_skills>` block
> and the `skill` tool from the *model*. Every skill stays reachable as a slash command, so this is
> a working global "user-invocable only" switch, not a removal of the skill system. The
> "no per-skill granularity" part is still true — for per-skill scope use `deny` on one skill name.

---

## 4. The `slash` Frontmatter Field (Vestigial)

The V2 schema (`/packages/schema/src/skill.ts:23`) and core frontmatter (`/packages/core/src/skill.ts:36`) both recognize a `slash: Schema.Boolean` field. However:

1. It is **never read or acted upon** in the opencode skill implementation (`/packages/opencode/src/skill/index.ts` — the `Info` type has no `slash` property).
2. It is **not documented** on https://opencode.ai/docs/skills/.
3. No code references `skill.slash`, `info.slash`, or similar.

It appears to be vestigial or reserved for future use. Currently, it has no effect.

> **Confirmed and dated 2026-08-01** (not a retraction). `slash` was added 2026-06-03 by commit
> `889e0f9545` (*"feat(core): add skill registry and file agent loading (#30617)"*) and moved to
> `packages/schema` on 2026-06-24 (`516cfe4e0`, #33571). At commit `32f278b` nothing in the tree
> reads it. Groundwork, not a feature — but a signal to re-check.

---

## 5. Missing `description` Is Not a Manual-Invocation Feature

> **RETRACTED 2026-08-01 — the section title and its final two bullets are wrong.** Omitting
> `description` *is* a manual-invocation mode: the skill leaves `<available_skills>` (correctly
> described below) but keeps its `/name` slash command, which the human types directly. The claim
> below that *"There is no `/skill-name` slash-command mechanism for skills… only a global
> `/skills` browse command"* is false — `packages/opencode/src/command/index.ts:134-152` registers
> every skill as its own command; `/skills` is the TUI panel that groups them
> (`footer.command.tsx` filters `item.source === "skill"`). The one caveat that survives is
> stability: docs call `description` required, so this rests on undocumented behavior.
> See [`opencode-commands-and-skill-invocation.md`](./opencode-commands-and-skill-invocation.md) §2, §4a.

The docs state `description` is required (https://opencode.ai/docs/skills/#write-frontmatter). However, the code treats it as optional:

- `isSkillFrontmatter()` accepts `description === undefined` (`/packages/opencode/src/skill/index.ts:57`)
- The `Skill.Info` type has `description: Schema.optional(Schema.String)` (`/packages/opencode/src/skill/index.ts:39`)

Crucially, the `fmt()` function (`/packages/opencode/src/skill/index.ts:321-346`) that generates the `<available_skills>` listing **filters out skills without descriptions**:

```typescript
export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  // ...
}
```

This means that a `SKILL.md` with a `name` but **no `description`** currently:

1. The skill is loaded and is present in the skill registry (`Skill.all()` returns it).
2. But it **never appears in `<available_skills>`** in the system prompt.
3. Does not advertise its name through `<available_skills>`.
4. Can still be loaded by the model if the model is given the exact name and chooses to call `skill({ name })`, because `Skill.require(name)` has no description gate.

**Caveats:**
- This is undocumented/accidental behavior, not an intentional API.
- The docs state `description` is required, so skills without it may fail future validation.
- The skill is not discoverable through the normal listing, but the human still does not invoke it directly; the model makes the tool call after being told the name.
- There is no `/skill-name` slash-command mechanism for skills. Skills do not appear individually in the slash menu — only a global `/skills` browse command exists (`/packages/opencode/src/cli/cmd/run/footer.prompt.tsx:423-438`).

This unsupported parser/listing mismatch must not be described as a human-only or manual-only invocation mode.

---

## 6. Summary of All Options

> **RETRACTED 2026-08-01.** Every "Human can invoke?" cell below is wrong: it assumes the only way
> in is the model's `skill` tool call. Since v1.1.48 (2026-01-31) each skill is also a slash
> command, so the human always has a direct path. The corrected table follows; the original is kept
> underneath for provenance.

**Corrected table (2026-08-01):**

| Mechanism | Model sees skill? | Can auto-invoke? | Human can invoke `/name`? | Notes |
|-----------|-------------------|------------------|---------------------------|-------|
| `disable-model-invocation: true` | ✅ | ✅ | ✅ | Key is unknown to OpenCode and silently ignored |
| `permission.skill: { "<name>": "deny" }` | ❌ | ❌ | ✅ | **Per-skill explicit-only.** `Command.init` reads `skill.all()`, and the slash path never asserts permission |
| `permission.skill: "ask"` | ✅ | ✅ (subject to approval) | ✅ | In `--auto` mode, loads without any prompt |
| `tools: { skill: false }` | ❌ (all skills) | ❌ | ✅ (all skills) | **Global explicit-only switch** for that agent |
| Omit `description` field | ❌ | ❌ (absent from the catalog) | ✅ | **Per-skill explicit-only.** Rests on undocumented behavior — docs call `description` required |

**Original table (2026-07-26, retracted):**

| Mechanism | Model sees skill? | Can auto-invoke? | Human can invoke? | Notes |
|-----------|-------------------|------------------|--------------------|-------|
| `disable-model-invocation: true` | ✅ | ✅ | Indirectly, by asking the model | Ignored by OpenCode, so ordinary visible/invocable behavior remains |
| `permission.skill: "deny"` | ❌ | ❌ | ❌ | Skill hidden from everyone |
| `permission.skill: "ask"` | ✅ | ✅ (subject to approval) | Indirectly, by asking the model | In `--auto` mode, loads without any prompt |
| `tools: { skill: false }` | ❌ (all skills) | ❌ | ❌ | Disables entire skill system for that agent |
| Omit `description` field | ❌ in normal listing | Possible if exact name is supplied | Indirectly, by asking the model | Undocumented invalid authoring pattern, not a supported invocation mode |

---

## 7. Conclusion

> **RETRACTED 2026-08-01 — this whole conclusion is wrong.**
> **Corrected conclusion:** OpenCode has two working equivalents to `disable-model-invocation`.
> Per skill, either omit `description` or set `permission: { skill: { "<name>": "deny" } }`;
> globally, set `tools: { skill: false }`. All three hide the skill from the model while leaving it
> user-invocable as `/name`, because the command registry is built from `skill.all()` and the slash
> path is prompt injection with no permission gate. No code change to OpenCode is needed. The
> permission system is *not* binary in effect — the third state exists, it is just an emergent
> consequence of two different filters rather than a named feature, and it is undocumented.
> The one claim below that survives: there is no frontmatter key named `disable-model-invocation`.
> Full reasoning and source citations:
> [`opencode-commands-and-skill-invocation.md`](./opencode-commands-and-skill-invocation.md) §4.
> Original conclusion retained below for provenance.

**OpenCode has no mechanism equivalent to `disable-model-invocation`.** The permission system is binary: a skill is either model-visible and loadable (`allow`/`ask`) or hidden and rejected (`deny`). There is no supported third state that a human invokes directly while the model cannot select it.

One partial mitigation exists:

1. **Set `permission.skill: "ask"`** — the model can still see and auto-invoke the skill, but the human must approve each load. This fails in `--auto` mode (approvals are bypassed).

Omitting `description` is not a supported mitigation: it violates the documented format and still relies on the model to call the skill tool. To achieve a true explicit-only skill policy, a code change to OpenCode would be needed — either:
- Adding a supported `disable-model-invocation` frontmatter field that filters skills from `available_skills` while keeping them in the registry, or
- Extending the permission system with a `hidden` action that keeps the skill loadable but not listed in the tool description/system prompt.

---

## Sources

- https://opencode.ai/docs/skills/ — Skill frontmatter, permissions, discovery
- https://opencode.ai/docs/permissions/ — Permission system and auto mode
- https://opencode.ai/docs/agents/ — Agent configuration and task permissions
- `anomalyco/opencode` source code (commit `main` branch, cloned 2026-07-26):
  - `/packages/schema/src/skill.ts` — V2 skill schema (name, description, slash)
  - `/packages/core/src/skill.ts` — V2 frontmatter parsing
  - `/packages/opencode/src/skill/index.ts` — Skill discovery, loading, `available()`, `fmt()`
  - `/packages/opencode/src/tool/skill.ts` — Skill tool definition and invocation
  - `/packages/opencode/src/session/system.ts` — System prompt skills injection
  - `/packages/opencode/src/permission/index.ts` — Permission evaluation
  - `/packages/opencode/src/cli/cmd/run/footer.prompt.tsx` — Slash command menu ~~(no individual skill slash commands)~~ — parenthetical retracted 2026-08-01; the file never examined was `/packages/opencode/src/command/index.ts`, which registers one command per skill
- `/Users/artemveduta/.agents/skills/writing-great-skills/SKILL.md` — Definition of `disable-model-invocation` (Claude Code vocabulary)
