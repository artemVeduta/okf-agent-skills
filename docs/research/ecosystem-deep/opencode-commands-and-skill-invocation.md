# OpenCode: Commands, and Skills as Slash Commands

> Fetch date: **2026-08-01**
> Primary sources: [opencode.ai/docs](https://opencode.ai/docs), source tree of
> [github.com/sst/opencode](https://github.com/sst/opencode) (the clone redirects to `anomalyco/opencode`).
> Source snapshot: default branch at commit `32f278b48f1a495611165d8a9f1ace0b512933e2` (2026-08-01).
> Latest release tag in the snapshot: `v1.4.11`.

**Verdict in one line: the user is correct.** OpenCode has slash commands, and **every discovered
skill is automatically registered as a slash command**. Two of our earlier notes are wrong and are
listed in section 7.

---

## 1. Commands exist

Verified in the docs and in source.

- Invocation: type `/` plus the command name in the TUI.
- On disk:
  - global `~/.config/opencode/commands/`
  - project `.opencode/commands/`
  - or inline in `opencode.json` / `opencode.jsonc` under the `command` key
- Format: Markdown with YAML frontmatter. The filename becomes the command name
  (`test.md` gives `/test`).
- Frontmatter fields: `description`, `template` (the prompt, required),
  `agent`, `model`, `subtask` (boolean, forces a subagent).
- Argument substitution: `$ARGUMENTS`, positional `$1` `$2`, shell injection with
  `` !`cmd` ``, file inclusion with `@file`.
- Custom commands can override built-ins such as `/init`, `/undo`, `/help`.

Source: https://opencode.ai/docs/commands/ (fetched 2026-08-01).

Command registry in source: `packages/opencode/src/command/index.ts`. The `Info` schema is:

```ts
export const Info = Schema.Struct({
  name, description, agent, model,
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  template: Schema.Unknown,
  subtask, hints,
})
```

The `source` field already tells the story: a command can come from a config command, an MCP
prompt, **or a skill**.

---

## 2. Every skill becomes a slash command, automatically

Verified in source, `packages/opencode/src/command/index.ts` lines 134-152:

```ts
for (const item of yield* skill.all()) {
  if (commands[item.name]) continue
  const dir = item.location === "<built-in>" ? undefined : path.dirname(item.location)
  commands[item.name] = {
    name: item.name,
    description: item.description,
    source: "skill",
    get template() {
      if (!dir) return item.content
      return [
        item.content,
        "",
        `Base directory for this skill: ${dir}`,
        "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
      ].join("\n")
    },
    hints: [],
  }
}
```

Facts that follow directly:

- The loop runs over `skill.all()` — **all** discovered skills, with no filtering.
- No user authoring is needed. There is no "write a command that calls the skill" step.
- A same-named config command or MCP prompt wins (`if (commands[item.name]) continue`).
- The command template is the **skill body text**, plus a base-directory footer.

Surfaces that show it:

- TUI slash autocomplete and a dedicated skill picker:
  `packages/opencode/src/cli/cmd/run/footer.command.tsx` filters `item.source === "skill"` into a
  "Skills" panel reachable as `/skills`, and excludes them from the plain command list
  (`item.source !== "skill"`).
- Desktop app slash popover badges skill-sourced entries: `packages/app/src/components/prompt-input/slash-popover.tsx:341`.
- ACP (editor integrations) exposes skills as available commands:
  `packages/opencode/src/acp/service.ts:755-761` emits `{ name, description, source: "skill", template: skill.content }`
  for every skill not already shadowed by a command. Covered by the test
  `packages/opencode/test/cli/acp/skills.test.ts` — *"skill slash command appears through available_commands_update"*.
- HTTP API: `POST /session/:id/command` executes any command by name, including skill-sourced ones
  (https://opencode.ai/docs/server/).

**This is undocumented.** `packages/web/src/content/docs/commands.mdx`, `tui.mdx`, and `skills.mdx`
contain no cross-reference between skills and commands (grep for "skill" in `commands.mdx` and
`tui.mdx` returns nothing). The behavior is real and tested, but the docs never state it — which is
almost certainly why our earlier notes missed it.

---

## 3. Command execution is prompt injection, not a skill tool call

Verified in `packages/opencode/src/session/prompt.ts` lines 1355-1410 (`SessionPrompt.command`):

1. `commands.get(input.command)` resolves the entry.
2. `await cmd.template` gives the skill body.
3. Positional `$1..$n` and `$ARGUMENTS` are substituted; leftover args are appended.
4. `` !`shell` `` blocks are executed and inlined.
5. The result is submitted as the user prompt for the turn.

Consequences, all inferred directly from that code path (no separate branch for skills exists):

- The `skill` tool is **not** called. No `skill_content` wrapper, no tool-call round trip.
- `permission.assert({ action: "skill", ... })` — which the skill tool does perform
  (`packages/core/src/tool/skill.ts:76-83`) — is **bypassed** on the slash path.
- The `<skill_files>` directory listing that the tool attaches is **not** included; the slash path
  adds only the base-directory sentence.
- The model still sees the skill in `<available_skills>` in the system prompt, unless the skill is
  hidden by one of the mechanisms in section 4. So after `/my-skill`, the same skill can also be
  listed as loadable — the content is present twice conceptually, once as injected prompt and once
  as a catalog entry.

---

## 4. Explicit-invocation-only IS achievable

There is no frontmatter flag named `disable-model-invocation`. But two supported config/authoring
levers produce exactly its effect, because the model-facing catalog and the command registry are
built from different filters.

The model-facing catalog (`<available_skills>`) is built in
`packages/opencode/src/skill/index.ts` (`Skill.fmt`) and, for the v2 core, in
`packages/core/src/skill/guidance.ts`. Both apply filters that the command registry does not.

### 4a. Omit `description` — per-skill hiding

`Skill.fmt` starts with:

```ts
const described = list.filter((skill) => skill.description !== undefined)
if (described.length === 0) return "No skills are currently available."
```

`packages/core/src/skill/guidance.ts:52-54` does the same:
`skill.description === undefined ? [] : [...]`.

The loader treats `description` as optional
(`packages/opencode/src/skill/index.ts:38-40` and the `isSkillFrontmatter` guard at line 53), even
though https://opencode.ai/docs/skills/ documents it as required.

So a `SKILL.md` with `name` but no `description`:

- loads normally,
- is **absent** from `<available_skills>` and from the `skill` tool description,
- is still registered as a command (the loop in section 2 does not filter on description),
- is invocable as `/name` by the user.

That is `disable-model-invocation` in all but the name. Caveat: it rests on undocumented behavior
(docs call `description` required), so it is not a stability promise.

### 4b. `permission.skill` deny — per-skill or blanket hiding

- Per-skill: `permission: { skill: { "my-skill": "deny" } }`.
  `Skill.available(agent)` filters denied skills out of the catalog
  (`packages/opencode/src/skill/index.ts:309-315`), and `SkillV2.available` does the same
  (`packages/core/src/skill.ts:30-31`). The `skill` tool would also refuse. But
  `Command.init` iterates `skill.all()`, not `available()`, so the slash command survives — and
  because the slash path never asserts permission (section 3), it still runs.
- Blanket: `permission: { skill: "deny" }`, or agent `tools: { skill: false }`, which is normalized
  into a `skill: "deny"` rule (`packages/core/src/v1/config/agent.ts:68-75`,
  `packages/opencode/src/config/config.ts:553-562`). Then
  `SystemPrompt.skills` returns early (`packages/opencode/src/session/system.ts:99`), the whole
  skills block leaves the system prompt, and the `skill` tool is hidden — while **all** skills remain
  reachable as slash commands. That is a global "user-invocable only" switch.

Whether 4b's survival of the command is intended or an oversight is **inferred, not stated**. It is
consistent across TUI, ACP, and HTTP surfaces, none of which filter skill-sourced commands by
permission.

Docs for `permission.skill` (the action matches the skill name):
https://opencode.ai/docs/permissions/ — the permission list is at `permissions.mdx:158`.
Docs for `tools: { skill: false }`: https://opencode.ai/docs/skills/.

---

## 5. Dates and versions

| Capability | Landed | Version | Evidence |
|---|---|---|---|
| Skills invokable as slash commands | 2026-01-31 | first tag containing it: **v1.1.48** (2026-01-31) | commit `81ac41e0891cf9318af641805e7b1c5af1194be4`, *"feat: make skills invokable as slash commands in the TUI (#11390)"*, by Dax. Touched `command/index.ts`, `skill/skill.ts`, `tool/skill.ts`, TUI autocomplete, SDK types. |
| Command registry moved to `command/index.ts` | 2026-04-16 | — | `3fe906f51` *"refactor: collapse command barrel into command/index.ts (#22903)"* |
| v2 core skill registry, adds `slash` frontmatter field | 2026-06-03 | — | `889e0f9545` *"feat(core): add skill registry and file agent loading (#30617)"* |
| `slash` moved to shared schema package | 2026-06-24 | — | `516cfe4e0` *"refactor(schema): extract shared public schemas (#33571)"* |

### The `slash` frontmatter field

`packages/schema/src/skill.ts:23` and `packages/core/src/skill.ts:36,98` define and parse an optional
boolean `slash` on skill frontmatter. The v2 loader also accepts flat top-level `*.md` files (not only
`<dir>/SKILL.md`), deriving the name from the filename, with `description` optional — see the test at
`packages/core/test/skill.test.ts:56` which writes `---\nslash: true\n---\n# foo`.

**No consumer of `skill.slash` exists anywhere in the tree as of `32f278b`** (grep for `slash` across
all `.ts`/`.tsx`/`.go` returns only the schema, the parser, and tests). It is parsed and carried, but
nothing reads it yet. This looks like groundwork for an explicit `slash`-only skill mode in the v2
runtime. Treat it as a signal to re-check, not as a current feature.

---

## 6. Answers to the five questions

1. **Does OpenCode have user-invocable commands?** Yes. `/name` in the TUI, from
   `~/.config/opencode/commands/`, `.opencode/commands/`, or the `command` key in
   `opencode.json`. Markdown + YAML frontmatter (`description`, `template`, `agent`, `model`,
   `subtask`). Documented.
2. **Is a skill exposed as a command?** Yes, **automatically**, for every discovered skill, since
   2026-01-31 / v1.1.48. No authoring step. Undocumented but source-verified and covered by tests.
   Effectively `skill === command`, with config commands and MCP prompts taking name precedence.
3. **Can a skill be explicit-invocation-only?** Yes, two ways: omit `description` (per skill), or
   deny the `skill` permission — per skill (`permission: { skill: { name: "deny" } }`) or globally
   (`tools: { skill: false }`). In all cases the slash command survives, because the command registry
   reads `skill.all()` and the slash path performs no permission check. There is no
   `disable-model-invocation` frontmatter key by that name.
4. **Has this changed recently?** The core capability is not recent — it is six months old
   (2026-01-31, v1.1.48). Our notes were written 2026-07-26 and were already stale by half a year.
   The only genuinely new thing is the unconsumed `slash` frontmatter field (2026-06-03).
5. **Prompt-injected or skill-tool invocation?** **Prompt-injected.** The command template is the
   skill body, substituted for `$1`/`$ARGUMENTS`, shell-expanded, then sent as the user prompt.
   The `skill` tool is not called and its permission gate is not evaluated. The model still sees the
   skill in `<available_skills>` unless one of the section-4 mechanisms hides it.

---

## 7. Corrections to our existing notes

Both of these claims are **wrong** and should be retracted:

- `opencode-skills.md` — *"OpenCode has no per-skill command at all — skills are a built-in `skill`
  tool listing `<available_skills>` XML, so every load is a model tool call."*
  Wrong since v1.1.48 (2026-01-31). Every skill is also a `/name` slash command, and the slash path
  is prompt injection, not a tool call.
- `opencode-disable-model-invocation.md` — *"OpenCode has no explicit-invocation-only equivalent to
  Claude Code's `disable-model-invocation`."*
  Wrong. Omitting `description`, or denying the `skill` permission, hides a skill from the model
  while leaving it user-invocable via slash. There is no frontmatter key with that name, which is
  probably what the note was actually testing for.

What those notes got right: skill discovery paths, the `skill` tool and `<available_skills>` XML
shape, and the absence of a `disable-model-invocation` frontmatter key.

---

## 8. Verified vs inferred

**Verified in primary sources** (docs pages fetched 2026-08-01, or read at commit `32f278b`):
command locations/format/frontmatter; the skill-to-command loop and its exact template; the
prompt-injection execution path; the `description !== undefined` filter in both catalog renderers;
the permission filter in `Skill.available` / `SkillV2.available` and its absence in `Command.init`;
`tools: { skill: false }` normalizing to a deny rule; the early return in `SystemPrompt.skills`;
the ACP available-commands emission and its test; commit SHAs, dates, and the `v1.1.48` tag.

**Inferred:**
that hiding via permission-deny while keeping the slash command is intentional rather than an
oversight; that the unconsumed `slash` field is groundwork for a future explicit-only mode; that
`description`-omission is safe to rely on long-term (docs say the field is required, so it may not be).

**Not tested empirically.** No OpenCode binary was run; all behavioral claims come from reading the
source and its tests.
