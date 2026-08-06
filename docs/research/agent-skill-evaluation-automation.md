# Agent Skill Evaluation Automation

Research record for the five skills in `skills/`. This record compares the
smallest useful evaluation methods. It does not change the accepted release
gate or product behavior.

**Check date for external sources: 2026-08-05.**

## Decision Inputs

- Keep the `v0.1.0` release gate unchanged. It is deterministic and uses no
  network, harness process, or model call.
- For `v0.1.0`, use a short manual smoke run outside the release gate. Run it
  in each supported harness when credentials are available.
- For `v0.1.0`, a non-gating, development-only Flue slice was also added under
  `eval/`. It runs outside `node --test "test/*.test.js"`, and its recorded
  runs are in [`docs/flue-eval-results.md`](../flue-eval-results.md). See
  [`eval/README.md`](../../eval/README.md) for the setup.
- For a native-harness runner, use repository-local JSON data and the Node.js
  standard library. Do not add a framework or service.
- Do not use `skills-autoresearch-flue` as the native harness evaluator. Its
  alpha eval path serializes candidate skill text into the producer prompt; it
  does not test native skill discovery.
- The Flue framework itself is used only for the non-gating activation eval in
  `eval/` (one dependency, `@flue/runtime`), which exercises Flue's own
  workspace-skill discovery, not native Claude Code, Codex, or OpenCode
  discovery.
- Do not use Langfuse as the runner. Langfuse can store and compare results,
  but application code must still run each task.

## Fixed Boundary

The accepted test method is already clear. A good release test has no wall
clock, network, harness process, or model call. The only behavior contract seam
is a skill wrapper script that runs as a process. Live Claude Code, Codex, and
OpenCode tests are deferred and must not gate `v0.1.0`.[R1][R2]

Thus, a model-backed evaluation is product evidence. It is not a deterministic
test. It must not replace the wrapper tests or run in the same required CI job.

## What An Evaluation Must Measure

Use two separate result classes:

1. **Skill use evidence**: Did the harness make the skill available? Did the
   model load or explicitly invoke it? Report `observed`, `not observed`, or
   `not observable`. Do not turn missing telemetry into a failure by default.
2. **Task outcome evidence**: Did the final workspace and response meet the
   case checks? Prefer checks on files, wrapper JSON, exit status, and required
   response fields. Use a model judge only for a quality that code cannot
   check.

This separation is necessary because the harnesses expose different events.
Claude Code supports direct skill use in non-interactive mode and has a
`UserPromptExpansion` hook for command expansion.[R3][R4] OpenCode has a native
`skill` tool, JSON event output, and plugin events before and after tool
execution.[R8][R9][R10] Codex has JSONL events for command, file, MCP, web, and
agent items, but its documented event list does not name a skill-invocation
item.[R5] A Codex task can succeed with a skill even when invocation is not
directly observable from the documented JSONL data.

## Harness Evidence

| Harness | Scripted command | Structured output | Native skill path | Skill-use evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `claude -p` | `json` or `stream-json` | Direct `/skill-name` works in `-p` mode | Direct invocation, `UserPromptExpansion`, or tool stream evidence |
| Codex | `codex exec` | JSONL with `--json` | Explicit `$skill` and implicit selection | No dedicated skill event is documented; report `not observable` when needed |
| OpenCode | `opencode run` | Raw JSON events with `--format json` | Native `skill` tool and discovered Agent Skills | Observe a `skill` tool call in JSON or a plugin tool event |

Codex documents explicit `$skill` use and implicit skill selection.[R7]
Claude Code returns zero on success and nonzero on run failure. It can return
structured output and cost data.[R3] Codex supports an ephemeral run, a selected
working directory, read-only or workspace-write sandboxes, and JSONL output.
Its automation guidance also warns that API credentials need careful process
scope.[R5][R6] OpenCode supports a selected directory, model, agent, permission
mode, and JSON events for `opencode run`. Provider use needs stored or
environment credentials.[R8][R11]

All three tools can run in automation. None of the examined first-party CLI
references documents a random seed for model output.[R3][R5][R8] This is a
documentation finding, not a claim about internal model code. Treat the runs as
nondeterministic. Use repeated trials and report a rate instead of one exact
answer.

## Options

| Option | Native skill discovery | Isolated workspace | Repeated trials and ablation | CI fit | Credentials | Repository cost |
| --- | --- | --- | --- | --- | --- | --- |
| Manual smoke run | Yes | Manual copy or temporary clone | Possible, but slow | Non-gating only | Harness or provider credentials | No code |
| Local JSON plus Node.js runner | Yes, because it starts each native CLI | Automatic temporary directory per trial | Simple skill/no-skill pairs and repeated runs | Optional, non-gating job only | Harness or provider credentials | One data file and one runner |
| `skills-autoresearch-flue` | No, not for this use | Its own generated phase workspaces | Strong loop support | Separate system and dependency set | Anthropic plus its secret tools | High |
| Langfuse | Only through a separate task runner | The task runner must provide it | Strong storage and comparison features | Supported, but adds network services and SDKs | Langfuse plus model and harness credentials | Medium to high |

### Manual Smoke Run

This is the correct `v0.1.0` choice because no recurring cost is proven yet.
Use one small read-only case first. Install the same tagged skill tree into a
clean test workspace. Run an explicit router request and an implicit leaf-skill
request. Record the CLI version, model, prompt, exit status, final response,
workspace diff, and available skill-use evidence.

Repeat only when a skill or adapter changes. This gives native discovery and
native tool behavior with no new repository code. It does not give statistical
confidence. It is a smoke check, not a release gate.

### Repository-Local JSON Plus Node.js Runner

For a future native-harness runner, Node.js already supplies the required
parts:

- `node:child_process` starts a CLI with an argument array, selected working
  directory, environment, timeout, and captured streams.[R12]
- `node:fs/promises` creates a unique temporary directory and copies a fixture
  tree.[R13]
- `node:test` and `node:assert` can check the runner itself without another
  package. The test runner sets a failure exit code when a test fails.[R14]

The shipped, non-gating Flue slice follows this small shape:

```text
eval/
  run.js
  agent.js
  cases/activation.eval.js
  cases/wrapper-contract.eval.js
  lib/
```

Each shipped case has a stable ID, kind, description, and run function. The
runner creates a new fixture workspace for every case. Activation cases use a
live Flue agent; the wrapper-contract case checks the real wrapper process
without a model.

A future native-harness runner must also install or omit the skill, start the
native CLI, capture its events and final files, run deterministic checks, and
write one JSON result per trial.

Use the no-skill run as an ablation. It shows whether the skill changes task
success. Use repeated trials before comparing rates, and record the trial count
with each result. Do not invent a pass threshold until recorded runs provide
data. A threshold is a product decision, not a runner default.

Do not put live cases under `test/`. Keep runner self-tests deterministic and
keep live runs behind an explicit command. A scheduled or manually started CI
job can publish its JSON artifact, but it must not block `v0.1.0`.

### `skills-autoresearch-flue`

The alpha harness serializes candidate skill text into a producer prompt, so it
does not test native skill discovery; see the dedicated
[`skills-autoresearch-flue` assessment](./flue-skill-evaluation.md).

### Langfuse

Langfuse can store and compare results, but it does not start the three native
agents; see the dedicated
[`Langfuse assessment`](./langfuse-coding-agent-skill-evaluation.md).

## Recommended Sequence

### `v0.1.0`

1. Keep `node --test "test/*.test.js"` as the only release gate.
2. Run one manual, non-gating smoke case in each harness when credentials are
   available.
3. Record `not observable` instead of failure when a harness does not expose a
   documented skill-invocation event.
4. Do not add Langfuse, a judge model, or evaluation CI.
5. The one model-backed addition taken is the non-gating Flue slice under
   `eval/`. It is development-only tooling: it adds no dependency to `skills/`,
   `scripts/`, `adapters/`, or `agents/`, and it runs outside the release gate.
   Its results are evidence, never a gate.

### `v0.2.0`

Add the local runner only after manual results show that repetition is useful.
Start with one read-only case, one harness, and equal repeated skill and
no-skill trials. Add the other harnesses and cases one at a time. Each added
case must have deterministic workspace checks before it gets a model judge.

Keep live evaluation optional and non-gating until a separate recorded decision
defines a stable sample, repetition count, metric, threshold, cost limit, secret
policy, and failure policy.

## Risks

- Model and provider changes can change results without a repository change.
- User configuration, global skills, plugins, and stored sessions can pollute a
  run. Use clean configuration roots where each CLI supports them.
- A final task success does not prove skill use.
- A visible skill call does not prove a good task outcome.
- A model judge adds a second nondeterministic model and can hide simple file
  errors. Use code checks first.
- Live CI exposes credentials to a process that can run repository code. Keep
  secrets scoped to the one agent command and use a protected runner.

## Sources

- **R1.** Repository specification, [Testing Decisions](../spec/okf-agent-skills-v0.1.0-completion.md#testing-decisions).
- **R2.** Repository contribution rules, [What a good test is here](../../CONTRIBUTING.md#what-a-good-test-is-here).
- **R3.** Anthropic, [Run Claude Code programmatically](https://code.claude.com/docs/en/headless).
- **R4.** Anthropic, [Hooks reference](https://code.claude.com/docs/en/hooks).
- **R5.** OpenAI, [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) (the former `developers.openai.com` URL redirects here).
- **R6.** OpenAI, [Codex developer commands](https://developers.openai.com/codex/cli/reference).
- **R7.** OpenAI, [Build skills](https://developers.openai.com/codex/skills).
- **R8.** OpenCode, [CLI](https://opencode.ai/docs/cli/).
- **R9.** OpenCode, [Agent Skills](https://opencode.ai/docs/skills/).
- **R10.** OpenCode, [Plugins](https://opencode.ai/docs/plugins/).
- **R11.** OpenCode, [Providers](https://opencode.ai/docs/providers/).
- **R12.** Node.js, [`child_process.spawn`](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options).
- **R13.** Node.js, [`fsPromises.mkdtemp`](https://nodejs.org/api/fs.html#fspromisesmkdtempprefix-options) and [`fsPromises.cp`](https://nodejs.org/api/fs.html#fspromisescpsrc-dest-options).
- **R14.** Node.js, [`node:test`](https://nodejs.org/api/test.html#test-runner).
