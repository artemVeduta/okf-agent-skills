---
sources:
  - resource: https://github.com/artemVeduta/okf-agent-skills/issues/85
status: draft
type: Decision
---
# Decide the OpenCode adapter contract for v0.1.0

Status: closed.

## Question

What OpenCode installation and configuration contract must `v0.1.0` support when the current flat plugin target is not a native OpenCode plugin directory?

## Comment by artemVeduta

## Resolution

`v0.1.0` supports both OpenCode scopes through the existing explicit-target adapter command.

- The project target is `<repo>/.opencode/`.
- The global target is `$OPENCODE_CONFIG_DIR` when set; otherwise it is `$XDG_CONFIG_HOME/opencode/`, with `~/.config/opencode/` as the default.
- The target argument names the OpenCode configuration root. The install manifest places the plugin below its native `plugins/` directory with an OKF-specific filename.
- Every adapter-owned file stays inside the supplied target. Files that share an OpenCode directory use OKF-specific names.
- The installer does not create, replace, merge, or remove `opencode.json`, `opencode.jsonc`, or legacy `config.json`.

OpenCode configuration is a required manual installation step. The user must merge effective `permission.skill: deny` rules for `okf`, `okf-read`, `okf-write`, `okf-lifecycle`, and `okf-review` into the applicable `opencode.json` or `opencode.jsonc`. The documented rules must remain effective after broader permission patterns because OpenCode uses the last matching rule.

A successful `install` result means only that adapter files were installed. It must report the manual configuration step as its next action and must not claim that the adapter is ready. Disable and uninstall affect only receipt-owned adapter files and never change user configuration.

`README.md` will show the supported project and global OpenCode shapes, the manual configuration snippet, and the install, disable, and uninstall commands. It will also show the installation shape for Claude Code and Codex so all three harness contracts are visible in one place.

No live OpenCode process test becomes a `v0.1.0` release gate. Deterministic fixtures must prove paths, ownership, non-overwrite behavior, install claims, disablement, and removal. Current first-party OpenCode evidence defines the documented paths; the suite does not promise unverified older-version compatibility.
