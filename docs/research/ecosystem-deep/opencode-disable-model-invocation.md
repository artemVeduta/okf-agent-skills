# OpenCode: `disable-model-invocation` Equivalent

> **Answer: No.** OpenCode has no mechanism to prevent the agent from auto-invoking a skill while still allowing the human to invoke it manually.

Research date: 2026-07-26

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

Placing `disable-model-invocation: true` in an OpenCode SKILL.md has **zero effect** — it passes validation but is not acted upon.

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

### `deny` — Hides from both model AND human

From https://opencode.ai/docs/skills/#configure-permissions:

> `deny` — Skill hidden from agent, access rejected

The skill is filtered out of `available_skills` and can never be loaded — not by the model, not by the human, not by any path.

Source code: `/packages/opencode/src/skill/index.ts:314`:

```typescript
return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
```

**Verdict: Too restrictive.** Cannot be used for human-only invocation.

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

---

## 4. The `slash` Frontmatter Field (Vestigial)

The V2 schema (`/packages/schema/src/skill.ts:23`) and core frontmatter (`/packages/core/src/skill.ts:36`) both recognize a `slash: Schema.Boolean` field. However:

1. It is **never read or acted upon** in the opencode skill implementation (`/packages/opencode/src/skill/index.ts` — the `Info` type has no `slash` property).
2. It is **not documented** on https://opencode.ai/docs/skills/.
3. No code references `skill.slash`, `info.slash`, or similar.

It appears to be vestigial or reserved for future use. Currently, it has no effect.

---

## 5. Accidental Workaround: Omit `description`

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

This means: if you create a SKILL.md with a `name` but **no `description`**:

1. The skill is loaded and is present in the skill registry (`Skill.all()` returns it).
2. But it **never appears in `<available_skills>`** in the system prompt.
3. The model has **no way to discover** the skill's name or existence.
4. If a human types the skill name in a message (e.g., "use the my-skill skill"), the model **can still load it** if it recognizes the instruction, because `Skill.require(name)` has no description gate.

**Caveats:**
- This is undocumented/accidental behavior, not an intentional API.
- The docs state `description` is required, so skills without it may fail future validation.
- The model cannot discover the skill — it must be told by the human.
- There is no `/skill-name` slash-command mechanism for skills. Skills do not appear individually in the slash menu — only a global `/skills` browse command exists (`/packages/opencode/src/cli/cmd/run/footer.prompt.tsx:423-438`).

---

## 6. Summary of All Options

| Mechanism | Model sees skill? | Can auto-invoke? | Human can invoke? | Notes |
|-----------|-------------------|------------------|--------------------|-------|
| `disable-model-invocation: true` | ❌ (no effect) | ❌ (no effect) | ❌ (no effect) | Claude Code only; silently ignored by OpenCode |
| `permission.skill: "deny"` | ❌ | ❌ | ❌ | Skill hidden from everyone |
| `permission.skill: "ask"` | ✅ | ✅ (with prompt) | ✅ | In `--auto` mode, loads without any prompt |
| `tools: { skill: false }` | ❌ (all skills) | ❌ | ❌ | Disables entire skill system for that agent |
| Omit `description` field | ❌ (name hidden) | ❌ (undiscoverable) | ✅ (by name in prompt) | Undocumented, accidental behavior; docs say description is required |

---

## 7. Conclusion

**OpenCode has no mechanism equivalent to `disable-model-invocation`.** The permission system is binary: a skill is either visible+loadable (allow/ask) or invisible+unloadable (deny). There is no third state of "visible only to humans."

Two partial mitigations exist:

1. **Set `permission.skill: "ask"`** — the model can still see and auto-invoke the skill, but the human must approve each load. This fails in `--auto` mode (approvals are bypassed).

2. **Omit `description`** — the skill becomes invisible to the model in the `<available_skills>` listing while remaining loadable by explicit name. This is accidental behavior, not a supported API, and fragile (a future version may enforce `description` as required or stop filtering descriptions in `fmt()`).

Neither is a reliable substitute for `disable-model-invocation`. To achieve human-only skill invocation, a code change to OpenCode would be needed — either:
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
  - `/packages/opencode/src/cli/cmd/run/footer.prompt.tsx` — Slash command menu (no individual skill slash commands)
- `/Users/artemveduta/.agents/skills/writing-great-skills/SKILL.md` — Definition of `disable-model-invocation` (Claude Code vocabulary)
