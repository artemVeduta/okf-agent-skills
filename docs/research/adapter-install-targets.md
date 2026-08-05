# Verified per-harness adapter install target directories

Research record for decision D6 in
`docs/spec/okf-agent-skills-v0.1.0-completion.md`. D6 requires the recommended install
target directory for each native adapter to come from **current, first-party evidence for
that specific harness** — that harness's own documentation or its own source code — checked
at the time this record was written, never inferred and never carried across harnesses. This
record is evidence, not policy: it does not change adapter behavior, and the adapter install
command keeps the target directory as a required argument the user supplies. No default and
no path inference are introduced anywhere in this repository by this record.

**Check date for every citation in this record: 2026-08-05.**

Cross-check method: for each harness, the recommended directory is checked against that
adapter's `manifest.json` `installs` list (`adapters/<harness>/manifest.json` in this repo) —
does the harness actually read every listed `target` relative path from the recommended
directory, verified against that harness's own current docs or source.

---

## Claude Code

**Recommended target directory:** `~/.claude/skills/<name>/` — for example
`~/.claude/skills/okf-agent-skills/`. **Scope: per-user (personal).**

**Why this one, over the project-scoped alternative.** Claude Code auto-loads, with no
marketplace and no install step, any folder under a skills directory that contains a
`.claude-plugin/plugin.json` manifest — a "skills-directory plugin." Two skills-directory
locations exist:

| Skills directory        | Scope    | Loads                                                                              |
| :----------------------- | :------- | :---------------------------------------------------------------------------------- |
| `~/.claude/skills/`      | personal | in every project, since the location is the user's alone                            |
| `<cwd>/.claude/skills/`  | project  | only after the user accepts the workspace trust dialog for that folder             |

The project-scoped location also does not walk up to the repository root the way plain
skills do — launching Claude Code from a subdirectory misses a plugin that lives at the
project's `.claude/skills/`. The personal location has none of these restrictions, so it is
the one this record recommends.

**Cross-check against `adapters/claude-code/manifest.json`.** The `installs` list is:

```
.claude-plugin/plugin.json -> .claude-plugin/plugin.json
hooks/hooks.json           -> hooks/hooks.json
manifest.json              -> manifest.json
```

This is exactly the layout of a Claude Code plugin root: `.claude-plugin/plugin.json` is the
plugin manifest, and `hooks/` at the plugin root with a `hooks.json` inside it is the
documented default location for a plugin's hook definitions. `manifest.json` at the plugin
root is an extra file Claude Code does not read for anything, and does not conflict with
plugin discovery. Consistent: verified.

**Citations (first-party, Anthropic's own current docs, checked 2026-08-05):**

- [Create plugins](https://code.claude.com/docs/en/plugins) — plugin root structure table
  (`hooks/` → "Event handlers in `hooks.json`"), the warning that the plugin root is never
  `~/.claude/` itself, and the `claude plugin init` skills-directory workflow.
- [Plugins reference — Skills-directory plugins](https://code.claude.com/docs/en/plugins-reference#skills-directory-plugins) —
  the `~/.claude/skills/` vs. `<cwd>/.claude/skills/` scope table and the trust/no-walk-up
  caveats for project scope, quoted above.

---

## Codex

**Recommended target directory:** `<repo>/.codex/` (the OKF bundle's own repository root,
project-scoped). **Scope: per-project.** `~/.codex/` (user-scoped, `$CODEX_HOME` when set) is
an equally valid alternative — see below.

**Why project scope is recommended.** Codex reads standalone `hooks.json` flat out of exactly
two kinds of location: `~/.codex/hooks.json` (user-level, or `$CODEX_HOME/hooks.json` if
`CODEX_HOME` is set — it defaults to `~/.codex`) and `<repo>/.codex/hooks.json`
(project-level). Both are real, current, equally documented locations; Codex loads hooks from
every layer concurrently rather than having one override the other. This suite's own bundle
is inherently per-project (D5: `v0.1.0` never creates a bundle root and only ever operates on
one repository's bundle), so scoping the Codex adapter to that same repository's `.codex/`
keeps one adapter installation paired with one bundle, and avoids the adapter firing in
unrelated repositories a developer also uses Codex in. The user-level location remains a
correct choice for a developer who wants the adapter active across every repository; it is
not wrong, only broader in scope than this record recommends by default.

Project-level hooks load only when Codex considers the project trusted; an untrusted project
skips its `.codex/` layer entirely (config, hooks, and rules alike). This is a real,
documented constraint, not a defect of the recommended path.

**Cross-check against `adapters/codex/manifest.json`.** The `installs` list is:

```
hooks.json    -> hooks.json
manifest.json -> manifest.json
```

Both targets are flat filenames with no subdirectory, which is exactly how Codex reads a
standalone `hooks.json` — directly inside `~/.codex/` or `<repo>/.codex/`, never nested one
level deeper. `manifest.json` sitting alongside it is an extra file Codex does not read for
anything and does not conflict with hook discovery. Consistent: verified.

**Citations (first-party, OpenAI's own current docs, checked 2026-08-05):**

- [Hooks](https://learn.chatgpt.com/docs/hooks) (redirects from
  `developers.openai.com/codex/hooks`) — the four standalone locations quoted above:
  `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json`,
  `<repo>/.codex/config.toml`, and the project-trust gating rule.
- [Advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced)
  (redirects from `developers.openai.com/codex/config-advanced`) — `CODEX_HOME` defaulting to
  `~/.codex`, and hooks loading from every configuration layer concurrently.

---

## OpenCode

**No single recommended target directory closes the gap. This is a recorded, evidenced,
partial inconsistency in `adapters/opencode/manifest.json`'s `installs` list, not a fully
usable adapter at any one directory. Recording it, rather than picking a directory anyway, is
the correct outcome for this ticket.**

**What is verified.** OpenCode reads its own JSON config file — file names `opencode.json` and
`opencode.jsonc` project-side — but its **global** config loader additionally accepts a third,
legacy file name, `config.json`, checked in the order `opencode.jsonc`, `opencode.json`,
`config.json`, and only inside the single global config directory
(`$XDG_CONFIG_HOME/opencode`, i.e. `~/.config/opencode/` when `XDG_CONFIG_HOME` is unset, or
`$OPENCODE_CONFIG_DIR` when that flag is set). The project-level loader (any directory ending
in `.opencode`, walked from the working directory to the git root) checks only `opencode.json`
and `opencode.jsonc` — **not** `config.json`. So `adapters/opencode/config.json` is only ever
picked up as configuration if it lands directly inside the global config directory, never
inside a project's `.opencode/`.

Separately, OpenCode discovers plugin scripts by globbing `{plugin,plugins}/*.{ts,js}`
**inside** either the global config directory or a project's `.opencode/` directory — i.e. a
plugin file must sit in a `plugin/` or `plugins/` subdirectory one level below the directory
that also holds the config file, never flat alongside it.

**The conflict.** `adapters/opencode/manifest.json`'s `installs` list places `config.json`,
`plugin.js`, and `manifest.json` all flat, directly in one target directory:

```
config.json   -> config.json
plugin.js     -> plugin.js
manifest.json -> manifest.json
```

No single target directory satisfies both discovery rules at once:

- Target = the global config directory (`~/.config/opencode/`): `config.json` is read
  correctly (it is one of the three accepted global filenames). `plugin.js` is **not**
  discovered — it needs to be one level deeper, in a `plugin/` or `plugins/` child directory,
  and the manifest does not place it there.
- Target = a project's `.opencode/` directory: `plugin.js` still needs a `plugin/`/`plugins/`
  child directory to be discovered, and separately `config.json` is never a recognized
  filename at project scope at all (only `opencode.json`/`opencode.jsonc` are), so the config
  file is inert either way.

`plugin.js` is the file that actually wires the adapter into
`experimental.chat.system.transform` — it is the only one of the three that performs the
orientation injection this suite depends on. Under either candidate directory the adapter, as
currently packaged, cannot both apply its `config.json` permission defaults and load its
`plugin.js` orientation hook from one flat target directory.

**What this record does not do.** Per the ticket's scope, this record adds no default, no
path inference, and no adapter or install code change — fixing the layout (for example, by
nesting `plugin.js` under `plugin/` in the adapter's own source tree) is an adapter-code
change outside this research ticket. This gap blocks only the OpenCode row of the install
documentation; it does not block Claude Code's or Codex's rows above, and it does not imply
anything about either of those harnesses.

**Searches already tried, so a future reader does not repeat them:**

- `opencode.ai/docs/plugins/` and `opencode.ai/docs/config/` (first-party docs) — confirm the
  `plugin`/`plugins` subdirectory requirement and the `opencode.json`/`opencode.jsonc` project
  file names.
- `github.com/sst/opencode` (redirects to `github.com/anomalyco/opencode`, default branch
  `dev`) — confirmed as the current first-party source repository for the OpenCode CLI
  documented at `opencode.ai`.
- `packages/core/src/global.ts` — confirms the global config directory is
  `xdg-basedir`'s `xdgConfig` joined with `"opencode"`, overridable by
  `Flag.OPENCODE_CONFIG_DIR`.
- `packages/opencode/src/config/config.ts` — confirms the global-scope candidate filename
  list `["opencode.jsonc", "opencode.json", "config.json"]` and the project-scope candidate
  list `["opencode.json", "opencode.jsonc"]` (no `config.json`) for any directory ending in
  `.opencode`.
- `packages/opencode/src/config/plugin.ts` — confirms the `"{plugin,plugins}/*.{ts,js}"` glob
  pattern used to discover plugin scripts, scoped one level below the directory passed in by
  the caller (global config dir or a project's `.opencode/`).

**Not tried / open for a future pass:** locating an OpenCode integration test or fixture
directory in the source tree that would show a complete, real, on-disk example of a plugin +
config pairing installed together (would confirm or refute the above from a second angle);
checking whether a future OpenCode release changes the global-only status of `config.json`
support (it reads as a legacy compatibility filename, not a documented recommendation, so it
may be removed).

---

## Summary table

| Harness     | Recommended directory      | Scope       | Status                                                        |
| :---------- | :-------------------------- | :---------- | :-------------------------------------------------------------- |
| claude-code | `~/.claude/skills/<name>/`  | per-user    | Verified, consistent with `manifest.json`                      |
| codex       | `<repo>/.codex/`            | per-project | Verified, consistent with `manifest.json`; `~/.codex/` also valid (per-user) |
| opencode    | *(none — recorded gap)*     | n/a         | Verified evidence found; the manifest's flat file layout is not fully addressable by any one directory. See above. |
