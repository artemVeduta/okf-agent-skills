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
- For `v0.2.0`, add an optional repository-local runner only if repeated manual
  runs become a real maintenance cost.
- If that runner is added, use repository-local JSON data and the Node.js
  standard library. Do not add a framework or service.
- Do not use Flue as the native harness evaluator. Its current eval path puts
  skill text in a model prompt. It does not test native skill discovery.
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
| Flue harness | No, not for this use | Its own generated phase workspaces | Strong loop support | Separate system and dependency set | Anthropic plus its secret tools | High |
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

This is the smallest useful automation for `v0.2.0`. Node.js already supplies
the required parts:

- `node:child_process` starts a CLI with an argument array, selected working
  directory, environment, timeout, and captured streams.[R12]
- `node:fs/promises` creates a unique temporary directory and copies a fixture
  tree.[R13]
- `node:test` and `node:assert` can check the runner itself without another
  package. The test runner sets a failure exit code when a test fails.[R14]

Keep the design small:

```text
eval/
  cases.json
  run.mjs
```

Each case needs only a stable ID, fixture path, prompt, harness command, trial
count, skill mode, timeout, and deterministic outcome checks. `skill mode`
must support `with-skill` and `without-skill`. The runner must create a new
workspace for every trial, install or omit the skill, start the native CLI,
capture its events and final files, run the checks, and write one JSON result.

Use the no-skill run as an ablation. It shows whether the skill changes task
success. Use repeated trials before comparing rates, and record the trial count
with each result. Do not invent a pass threshold until recorded runs provide
data. A threshold is a product decision, not a runner default.

Do not put live cases under `test/`. Keep runner self-tests deterministic and
keep live runs behind an explicit command. A scheduled or manually started CI
job can publish its JSON artifact, but it must not block `v0.1.0`.

### Flue

The examined project identifies itself as an alpha skills autoresearch harness.
It has separate researcher, producer, and judge model phases.[R15] Its package
requires Node.js 24, pnpm, `@flue/runtime`, Valibot, and a set of development
packages.[R16] Its model-backed flow uses Anthropic credentials through Varlock
and 1Password.[R15]

The important mismatch is fidelity. Its guide states that the alpha eval path
serializes all text candidate-skill files into the producer prompt. It does not
execute candidate scripts or load resources on demand.[R17] The source builds a
producer prompt from copied input, reference, and skill files, then dispatches
that prompt to a Flue producer agent.[R18][R19] This tests the effect of supplied
skill instructions. It does not test whether Claude Code, Codex, or OpenCode
discovers and invokes this repository's installed skill.

Flue has useful ideas for a later improvement loop: separate producer and
judge roles, baseline comparison, cost tracking, and saved artifacts. Adopting
its current system for this repository would add more code and dependencies
than a native CLI runner, while it would test a different boundary.

### Langfuse

Langfuse supplies datasets, experiments, scores, tracing, and result comparison.
Its SDK experiment runner loops an application task over local or hosted data.
The user still supplies the task function.[R20][R21] Thus, Langfuse does not
start these three native agents by itself. A separate harness runner is still
necessary.

The JavaScript example adds Langfuse packages, OpenTelemetry, and an application
model client. It sends traces to Langfuse and requires an explicit flush.[R20]
The CI integration needs Langfuse public and secret keys, SDK packages, network
access, and usually provider keys for the evaluated application.[R22] These
requirements conflict with this repository's zero-dependency deterministic
gate, although an independent optional job could use them.

Langfuse becomes useful only after local JSON artifacts are insufficient. Add
it when maintainers need shared dashboards, annotation queues, production trace
sampling, or long-term experiment comparison. Until then, the local result file
is the simpler source of evidence.

## Recommended Sequence

### `v0.1.0`

1. Keep `node --test "test/*.test.js"` as the only release gate.
2. Run one manual, non-gating smoke case in each harness when credentials are
   available.
3. Record `not observable` instead of failure when a harness does not expose a
   documented skill-invocation event.
4. Do not add Flue, Langfuse, a judge model, or evaluation CI.

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
- **R5.** OpenAI, [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive).
- **R6.** OpenAI, [Codex developer commands](https://developers.openai.com/codex/cli/reference).
- **R7.** OpenAI, [Build skills](https://developers.openai.com/codex/skills).
- **R8.** OpenCode, [CLI](https://opencode.ai/docs/cli/).
- **R9.** OpenCode, [Agent Skills](https://opencode.ai/docs/skills/).
- **R10.** OpenCode, [Plugins](https://opencode.ai/docs/plugins/).
- **R11.** OpenCode, [Providers](https://opencode.ai/docs/providers/).
- **R12.** Node.js, [`child_process.spawn`](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options).
- **R13.** Node.js, [`fsPromises.mkdtemp`](https://nodejs.org/api/fs.html#fspromisesmkdtempprefix-options) and [`fsPromises.cp`](https://nodejs.org/api/fs.html#fspromisescpsrc-dest-options).
- **R14.** Node.js, [`node:test`](https://nodejs.org/api/test.html#test-runner).
- **R15.** `skills-autoresearch-flue`, [README at commit `ecd77cf`](https://github.com/schalkneethling/skills-autoresearch-flue/blob/ecd77cfeb95d2fdddba297bfbfff65ee393a096f/README.md).
- **R16.** `skills-autoresearch-flue`, [`package.json` at commit `ecd77cf`](https://github.com/schalkneethling/skills-autoresearch-flue/blob/ecd77cfeb95d2fdddba297bfbfff65ee393a096f/package.json).
- **R17.** `skills-autoresearch-flue`, [Using the Harness at commit `ecd77cf`](https://github.com/schalkneethling/skills-autoresearch-flue/blob/ecd77cfeb95d2fdddba297bfbfff65ee393a096f/docs/using-the-harness.md#candidate-skill-resources).
- **R18.** `skills-autoresearch-flue`, [`model-agent.ts` at commit `ecd77cf`](https://github.com/schalkneethling/skills-autoresearch-flue/blob/ecd77cfeb95d2fdddba297bfbfff65ee393a096f/src/model-agent.ts).
- **R19.** `skills-autoresearch-flue`, [`flue-harness.ts` at commit `ecd77cf`](https://github.com/schalkneethling/skills-autoresearch-flue/blob/ecd77cfeb95d2fdddba297bfbfff65ee393a096f/src/flue-harness.ts).
- **R20.** Langfuse, [Experiments via SDK](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk).
- **R21.** Langfuse, [Datasets](https://langfuse.com/docs/evaluation/experiments/datasets).
- **R22.** Langfuse, [Experiments in CI/CD](https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd).
