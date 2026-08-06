# Langfuse for Local Coding-Agent Skill Evaluation

> Research date: 2026-08-05  
> Scope: Langfuse tracing, evaluation, datasets, experiments, self-hosting, CI,
> cost controls, integrations, and use with Claude Code, Codex, and OpenCode  
> Method: Read-only review of official documentation, official source
> repositories, published package metadata, and this repository  
> Source rule: Primary sources only

## Claim labels

- **Evidence** means a cited source states or implements the fact.
- **Inference** means the conclusion follows from two or more cited facts.
- **Recommendation** means a proposed action for this repository. It is not an
  adopted product decision.

## Executive conclusion

**Langfuse can reduce manual review of local coding-agent sessions, but it
cannot replace a test harness.** Its main value is to collect and compare
prompts, model responses, tool calls, timing, token use, costs, and scores. Its
datasets and experiments can keep cases and compare runs. Its coding-agent
integrations can trace Claude Code, Codex, and OpenCode sessions. However,
Langfuse does not create an isolated repository, install the skill and adapter,
start each coding agent with a test prompt, inspect the resulting file tree,
or prove that the required wrapper process contract was used.

For `okf-agent-skills`, the smallest useful design is:

1. Keep `node --test "test/*.test.js"` as the only `v0.1.0` release gate.
2. Put live-model evaluation in optional external infrastructure.
3. Build a small Node.js standard-library runner that invokes the three real
   coding-agent CLIs against temporary Git repositories.
4. Let that runner emit one local JSON result per case.
5. Add Langfuse later as an optional sink for traces, scores, comparisons, and
   manual diagnosis.
6. Do not adopt Flue for this task; it does not run the three supported coding
   agents.

This design adds no shipped dependency and no second product contract seam.
Use Cloud Hobby only for a short synthetic-data trial. Self-host only when the
data policy requires it.

## Repository constraints

The repository defines the following limits:

- The shipped runtime has no dependency outside the Node.js standard library.
- The only tested runtime contract seam is a skill wrapper script run as a
  process, with assertions on its standard output.
- Tests must be deterministic. They use no clock, network, coding-agent
  process, or model call.
- Live Claude Code, Codex, and OpenCode process tests are deferred and must not
  gate `v0.1.0`.
- The full gate is `node --test "test/*.test.js"`.

These rules are stated in [`AGENTS.md`](../../AGENTS.md),
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), and the
[`v0.1.0` completion specification](../spec/okf-agent-skills-v0.1.0-completion.md#testing-decisions).
The command was run during this research at repository commit
`54feaf0ea09e91b76b9f65cb57ee6316ea32dbab`. It completed with 241 tests, 241
passes, and 0 failures under Node.js `v25.6.1`.

The wrapper seam is small and suitable for external evaluation. A wrapper
reads one JSON request from standard input, emits one ordered JSON response
line on success or runtime failure, and uses exit codes `0`, `64`, and `70`
for a valid response, invalid input, and internal failure. See
[`scripts/wrapper.js`](../../scripts/wrapper.js) and
[`scripts/lib/protocol.js`](../../scripts/lib/protocol.js).

**Inference:** A networked evaluation service cannot become part of this gate.
It can only consume results from a separate live-model test path.

## What Langfuse provides

### License and delivery

Langfuse is an open-core product. The main repository is MIT licensed except
for `ee/`, `web/src/ee/`, and `worker/src/ee/`, which use the Langfuse
Enterprise License. Langfuse states that tracing, evaluation, prompt
management, experiments, annotation, and the playground are in the MIT core.
The JavaScript and Python SDK repositories are also MIT licensed.
([repository license](https://github.com/langfuse/langfuse/blob/main/LICENSE),
[enterprise license](https://github.com/langfuse/langfuse/blob/main/ee/LICENSE),
[open-source policy](https://langfuse.com/docs/open-source),
[JS SDK license](https://github.com/langfuse/langfuse-js/blob/main/LICENSE),
[Python SDK license](https://github.com/langfuse/langfuse-python/blob/main/LICENSE))

Langfuse Cloud is the managed service. The open-source server can run with
Docker Compose for local or low-scale use. Production deployment options
include Kubernetes and cloud templates. The self-hosted stack has a web
container, a worker container, Postgres, ClickHouse, Redis or Valkey, and
S3-compatible blob storage. Docker Compose lacks high availability, horizontal
scaling, and built-in backup support.
([self-hosting overview](https://langfuse.com/self-hosting),
[Docker Compose guide](https://langfuse.com/self-hosting/deployment/docker-compose))

**Inference:** Self-hosting is possible, but it is not the smallest first step
for a local skill experiment. Cloud Hobby has less operating work. A local
JSON artifact has no operating work.

### Tracing and observability

Langfuse traces LLM and non-LLM work. A trace can contain model generations,
tool calls, retrievals, events, and other spans. It records input, output,
timing, model details, token use, cost, metadata, users, and sessions.
Langfuse uses OpenTelemetry as its tracing base.
([observability overview](https://langfuse.com/docs/observability/overview),
[data and SDK overview](https://langfuse.com/docs/sdk),
[OpenTelemetry endpoint](https://langfuse.com/integrations/native/opentelemetry))

The supported ingestion paths include:

- Python SDK;
- JavaScript and TypeScript SDK;
- OpenTelemetry over OTLP HTTP;
- public REST API;
- native framework and model-provider integrations;
- gateway integrations such as LiteLLM.

The JavaScript tracing setup requires Langfuse packages and the OpenTelemetry
Node SDK. The current SDK guide names `@langfuse/tracing`, `@langfuse/otel`,
and `@opentelemetry/sdk-node`. The direct OTLP endpoint supports HTTP/JSON and
HTTP/protobuf, but not gRPC.
([SDK setup](https://langfuse.com/docs/sdk),
[OTLP protocol details](https://langfuse.com/integrations/native/opentelemetry#opentelemetry-endpoint))

**Inference:** Adding the Langfuse SDK to shipped code would violate this
repository's zero-dependency rule. Running that SDK in a separate evaluation
process does not change the shipped runtime.

### Evaluation, datasets, and experiments

Langfuse supports manual scores, user feedback, custom scores, deterministic
code evaluators, LLM-as-a-Judge evaluators, and external evaluation pipelines.
Scores can be numeric, categorical, boolean, or text.
([evaluation overview](https://langfuse.com/docs/evaluation/overview),
[scores by API or SDK](https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk))

A Langfuse dataset contains inputs and optional expected outputs. Dataset
items can also hold metadata. Item changes create timestamp-based dataset
versions. Experiments can use a hosted Langfuse dataset or local data. The SDK
experiment runner provides concurrent execution, automatic tracing,
item-level and run-level evaluators, error isolation, and dataset-run creation
for hosted datasets.
([datasets](https://langfuse.com/docs/evaluation/experiments/datasets),
[experiments by SDK](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk))

UI experiments are prompt and model experiments. They are not a general
coding-agent runner. The Langfuse documentation says to use SDK experiments
when the target includes full application or agent logic.
([experiments by UI](https://langfuse.com/docs/evaluation/experiments/experiments-via-ui#related-resources))

Code evaluators run deterministic Python or TypeScript in Langfuse. They have
no third-party packages, no network access, a 2-second limit, a 256 KB source
limit, and standard-library access only. On a self-hosted deployment, they
need a configured evaluator dispatcher.
([code evaluators](https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators#runtime-constraints))

An observation-level evaluator sees only the selected observation. It does not
automatically load sibling or child observations. An evaluator that needs the
whole agent result must receive the necessary summary on a logical root
observation.
([LLM-as-a-Judge context](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge#observation-evaluator-context))

**Inference:** A Langfuse evaluator cannot inspect a temporary worktree or run
the OKF wrapper after the fact. The external runner must calculate file-system
and wrapper assertions, then send the result as scores or as root-observation
data.

### CI support

Langfuse documents a GitHub Action that loads an experiment script, loads an
optional dataset and version, runs the experiment, can post a pull-request
comment, and fails on an explicit `RegressionError`. The action installs the
Langfuse Python or JavaScript SDK unless installation is disabled. It requires
Langfuse credentials and a networked Langfuse instance.
([CI/CD experiments](https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd),
[`langfuse/experiment-action`](https://github.com/langfuse/experiment-action))

**Inference:** This action is suitable for a separate scheduled, manual, or
non-release job. It is not suitable for the deterministic `v0.1.0` release
gate because it adds SDK installation, credentials, network access, and model
behavior.

### Pricing and cost controls

Langfuse Cloud bills one unit for each trace, observation, or score:

```text
units = traces + observations + scores
```

At the research date, the Cloud Hobby plan includes 50,000 units per month,
30 days of data access, and two users. Paid plans start with a monthly base fee
and included units. Self-hosted OSS has no Langfuse usage fee, but the operator
pays for and maintains its infrastructure.
([billable units](https://langfuse.com/docs/administration/billable-units),
[Cloud pricing](https://langfuse.com/pricing),
[self-hosted pricing](https://langfuse.com/pricing-self-host))

Cost controls include fewer observations, trace sampling, usage dashboards,
and Cloud spend alerts. Spend alerts cover the Langfuse Cloud bill, not model
provider charges. Coding-agent integrations can produce many observations
because each model call and tool call can become an observation.
([cost reduction](https://langfuse.com/faq/all/cutting-costs),
[spend alerts](https://langfuse.com/docs/administration/spend-alerts),
[coding-agent unit use](https://langfuse.com/resources/engineering/coding-agent-tracing#what-does-tracing-a-coding-agent-cost-in-langfuse-units))

## Supported model and agent integrations

Langfuse is not limited to one model provider. Official integration pages
cover OpenAI, Anthropic, Amazon Bedrock, Azure OpenAI, Cohere, Google Gemini,
Hugging Face, Mistral, Ollama, Vertex AI, and other providers through native
SDKs, OpenTelemetry libraries, or LiteLLM. Framework integrations include
LangChain, LlamaIndex, CrewAI, AutoGen, Semantic Kernel, Pydantic AI,
smolagents, Haystack, Mastra, and the Vercel AI SDK.
([integration overview](https://langfuse.com/integrations),
[OpenTelemetry integration table](https://langfuse.com/integrations/native/opentelemetry#use-opentelemetry-genai-instrumentation-libraries),
[Langfuse repository integration list](https://github.com/langfuse/langfuse#-integrations))

The official developer-tool integrations include Claude Code, Codex, and
OpenCode. Langfuse also documents integrations for GitHub Copilot, Cursor,
Kiro, Augment Code, and VS Code.
([coding-agent tracing guide](https://langfuse.com/resources/engineering/coding-agent-tracing#supported-coding-agents))

The separate Langfuse Agent Skill teaches a coding agent to instrument an
application, query Langfuse data, manage datasets and scores, and set up
evaluation workflows. It uses the Langfuse CLI and documentation. It does not
run or grade another skill by itself.
([Agent Skill documentation](https://langfuse.com/docs/api-and-data-platform/features/agent-skill),
[`langfuse/skills`](https://github.com/langfuse/skills/blob/main/skills/langfuse/SKILL.md))

## Exact coding-agent integration burden

### Claude Code

The official Langfuse plugin uses a Claude Code `Stop` hook. It reads the
Claude Code transcript after each response and sends user input, assistant
responses, reasoning, tool calls, tool input and output, timing, and session
grouping to Langfuse. Setup requires:

- installation from the Claude Code plugin marketplace;
- Python 3.9 or newer;
- Langfuse Python SDK `>=4.0,<5`;
- Langfuse project keys and base URL;
- per-project opt-in.

The documented hook uses Langfuse SDK internals and pins the major version for
that reason.
([Claude Code integration](https://langfuse.com/integrations/developer-tools/claude-code))

For automated cases, Claude Code provides `claude -p` with JSON or JSONL output
and process exit status. The `--bare` mode must not be used for a skill-discovery
test because it explicitly skips skills, hooks, plugins, auto memory, and
`CLAUDE.md`. A controlled non-bare environment is therefore necessary.
([Claude Code programmatic mode](https://code.claude.com/docs/en/headless))

**Burden for this repository:** No product code change is necessary for
tracing. A separate runner must create a controlled Claude home and temporary
project, install the OKF skill and adapter, invoke `claude -p`, and score the
process and worktree result. The Langfuse plugin remains a developer-machine
or evaluation-runner dependency.

### Codex

The official Langfuse Codex plugin uses Codex plugin hooks and a `Stop` hook per
turn. It captures prompts, model responses, reasoning summaries, shell and file
tools, MCP and web tools, token use, subagents, timing, and sessions. Setup
requires:

- Codex 0.128 or newer;
- Node.js 22 or newer;
- marketplace and plugin installation;
- `plugin_hooks = true` and an enabled plugin entry;
- separate hook trust approval;
- Langfuse keys and explicit opt-in.

The plugin is MIT licensed. Its package has Langfuse, OpenTelemetry, and Zod
runtime dependencies.
([Codex integration](https://langfuse.com/integrations/developer-tools/codex),
[plugin package](https://github.com/langfuse/codex-observability-plugin/blob/main/package.json),
[plugin license](https://github.com/langfuse/codex-observability-plugin/blob/main/LICENSE))

Codex provides `codex exec` for scripts and CI. It supports JSONL events,
structured output, explicit sandbox modes, and `--ephemeral`. An ephemeral run
does not persist the rollout file, while the Langfuse plugin reads that file.
Therefore, a traced case must not use `--ephemeral` unless a different trace
path is added.
([Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode))

**Burden for this repository:** No product code change is necessary for
tracing. A separate runner must provide a controlled `CODEX_HOME`, temporary
Git repository, skill and adapter installation, fixed sandbox policy, and
`codex exec --json` invocation. The plugin and its dependencies stay outside
the shipped OKF runtime.

### OpenCode

The official Langfuse OpenCode plugin uses OpenCode's experimental
OpenTelemetry support. It captures user turns, model generations, tool calls,
retries, reasoning, compaction, and failed steps. Setup requires:

- `experimental.openTelemetry: true` in OpenCode configuration;
- `@langfuse/opencode-observability-plugin` in the plugin list;
- Langfuse keys in a user config file or environment variables;
- an OpenCode restart.

The plugin is MIT licensed. Its package has Langfuse, OpenCode plugin,
OpenTelemetry, and Effect runtime dependencies.
([OpenCode integration](https://langfuse.com/integrations/developer-tools/opencode),
[plugin package](https://github.com/langfuse/opencode-observability-plugin/blob/main/package.json),
[plugin license](https://github.com/langfuse/opencode-observability-plugin/blob/main/LICENSE))

OpenCode provides `opencode run` for non-interactive work. It supports raw JSON
events, a selected model and agent, a selected working directory, and automatic
permission approval. It also supports a controlled config directory through
environment variables.
([OpenCode CLI](https://opencode.ai/docs/cli/#run-1))

**Burden for this repository:** No product code change is necessary for
tracing. A separate runner must merge the test configuration with the existing
OKF OpenCode adapter configuration, use an isolated config directory, install
the skill and adapter, invoke `opencode run --format json`, and score the
process and worktree result. The Langfuse plugin remains external.

### Shared limitation

Langfuse states that these coding-agent hooks do not capture the assembled
session context. They do not prove which `CLAUDE.md`, `AGENTS.md`, rules, or
skills were loaded. A skill invocation can appear as a tool call or text
mention, but context loading is indirect evidence. The hooks are also local
telemetry and can be disabled.
([coding-agent tracing limits](https://langfuse.com/resources/engineering/coding-agent-tracing#limits))

**Inference:** Every evaluation case needs two forms of evidence:

- behavior evidence from process output, wrapper output, and the resulting
  file tree;
- diagnostic evidence from the agent transcript and tool-call trace.

The first decides pass or fail. The second explains why.

## What Langfuse can and cannot automate

| Evaluation task | Langfuse alone | Required addition |
| --- | --- | --- |
| Preserve session prompts, model replies, tool calls, timing, and usage | Yes | Install the coding-agent integration |
| Find repeated reads, failed tools, retries, and expensive turns | Yes | Add useful run metadata and dashboards |
| Store test inputs and expected outputs | Yes | Define a dataset or keep local case files |
| Compare prompt, model, or code variants | Yes | Provide a task function that runs the target |
| Apply deterministic and model-based scores | Yes | Put all required data on the selected observation or ingest external scores |
| Start Claude Code, Codex, or OpenCode | No | External process runner |
| Create and reset temporary repositories | No | External fixture manager |
| Install this repository's skill and native adapter | No | External installer step |
| Prove that the intended skill was loaded | No | Explicit invocation case plus behavior and tool evidence |
| Assert the wrapper protocol and process result | No | Wrapper-aware local assertions |
| Assert no forbidden file changed | No | Before-and-after file-tree comparison |
| Keep a deterministic offline release gate | No | Existing `node --test` suite |

## Minimum evaluation harness still needed

The minimum harness is not an observability SDK. It is a process runner with a
small case format.

### Case input

Each case needs:

- stable case ID;
- target harness: Claude Code, Codex, or OpenCode;
- explicit or model-selected skill invocation;
- source fixture for a temporary Git repository;
- user prompt;
- fixed model and harness version for comparison;
- permission mode;
- expected process result;
- expected and forbidden file effects;
- expected wrapper result or finding codes where they are observable;
- timeout and repetition count for live-model variance.

### Run procedure

For each case, the runner must:

1. Copy the fixture to a new temporary Git repository.
2. Install the current checkout's skills and one native adapter into isolated
   harness configuration.
3. Record the initial file tree and content hashes.
4. Start one coding-agent CLI as a child process.
5. Capture standard output, standard error, exit status, duration, and raw
   JSON events where the CLI provides them.
6. Record the final file tree and content hashes.
7. Apply deterministic assertions first.
8. Write one local JSON result with the case, tool versions, Git commit,
   observed effects, assertions, and artifact paths.
9. Optionally publish a trace and scores to Langfuse.

The runner can use only `node:child_process`, `node:fs`, `node:os`,
`node:path`, `node:crypto`, and other Node.js standard modules. The live coding
agents, model credentials, and Langfuse publisher are environment tools, not
runtime dependencies of `okf-agent-skills`.

### Scoring order

Use this order:

1. Process completion and timeout.
2. Wrapper response and finding codes, when present in tool output.
3. Required file bytes and forbidden file effects.
4. Required skill or wrapper tool calls in the trace.
5. Semantic output quality only where exact checks cannot decide it.

This order keeps a model judge away from safety and contract claims. A model
judge can score clarity or usefulness. It must not decide whether a forbidden
write occurred.

## Dependency boundary

| Component | Location | Dependencies | Network or model | Part of shipped runtime | `v0.1.0` gate |
| --- | --- | --- | --- | --- | --- |
| Existing wrapper tests | This repository | Node.js standard library | No | Yes | Yes |
| Small live-agent runner | Separate evaluation tool or non-release area | Node.js standard library plus installed agent CLIs | Yes | No | No |
| Langfuse coding-agent plugins | User or evaluation-runner config | Python or Node packages, by harness | Yes | No | No |
| Langfuse experiment publisher | Separate evaluation process | Langfuse SDK and OpenTelemetry, or REST API code | Yes | No | No |
| Langfuse Cloud | External service | None in product | Yes | No | No |
| Self-hosted Langfuse | External infrastructure | Docker stack and data stores | Local or private network | No | No |
| Langfuse GitHub Action | Separate optional CI job | Action plus Langfuse SDK | Yes | No | No |

**Recommendation:** Do not add a `package.json`, Langfuse SDK, OpenTelemetry
SDK, plugin package, model client, or Langfuse credential to this repository
for the first evaluation slice. Keep the live runner and publisher external.

## Privacy and data handling

The three coding-agent integrations can send prompts, assistant responses,
reasoning, tool inputs, and tool outputs. These values can include source code,
absolute paths, environment details, and command output. Langfuse has SDK
masking features, but each coding-agent plugin has its own capture behavior.
Codex documents a character cap. The OpenCode page warns that complete session
telemetry is sent when enabled. Claude Code uses transcript processing.
([Langfuse masking](https://langfuse.com/docs/observability/features/masking),
[Claude Code capture](https://langfuse.com/integrations/developer-tools/claude-code#what-can-this-integration-trace),
[Codex data privacy](https://langfuse.com/integrations/developer-tools/codex#data-privacy),
[OpenCode data privacy](https://langfuse.com/integrations/developer-tools/opencode#data-privacy))

**Recommendation:** Start with synthetic temporary repositories. Do not send
real project sessions to Langfuse Cloud until the capture fields, retention,
access, and redaction policy are reviewed. Use self-hosting only if the data
policy requires it, because self-hosting has a much larger operating burden.

## Comparison with a small local harness

| Property | Small local harness | Langfuse |
| --- | --- | --- |
| Runs the three real coding-agent CLIs | Yes | No |
| Uses temporary worktrees | Yes | No |
| Checks exact file effects | Yes | No |
| Checks wrapper result values | Yes | Only after external capture or ingestion |
| Works offline for deterministic wrapper checks | Yes | No added value over current tests |
| Stores and compares rich traces | Basic local artifacts | Strong |
| Team dashboards and search | No | Strong |
| Hosted datasets and experiments | No | Yes |
| Human annotation and model judges | Custom work | Built in |
| Adds shipped dependencies | No, if external | No, if external |
| Best role | Test driver and source of pass/fail | Trace, score, compare, and diagnose |

## Comparison with Flue

### Official Flue framework

Flue is an Apache-2.0 TypeScript agent framework. It requires Node.js
`>=22.19.0` and has multiple runtime dependencies. It can load Agent Skills,
including workspace skills from `.agents/skills/`. It gives agents tools,
state, sandboxes, subagents, durable execution, and a runtime event stream.
It can export OpenTelemetry to an OTel-compatible backend, which can include
Langfuse.
([Flue getting started](https://flueframework.com/docs/guide/getting-started/),
[Flue runtime package](https://github.com/withastro/flue/blob/main/packages/runtime/package.json),
[Flue license](https://github.com/withastro/flue/blob/main/LICENSE),
[Flue skills](https://flueframework.com/docs/guide/skills/),
[Flue observability](https://flueframework.com/docs/guide/observability/),
[Flue OpenTelemetry](https://flueframework.com/docs/ecosystem/tooling/opentelemetry/))

Flue's official eval guidance uses live models and ordinary Vitest tests. It
states that evals are non-deterministic, spend tokens, and must use a separate
suite and cadence from unit tests. Flue has no dedicated eval framework. It can
run an agent in process or through its HTTP interface.
([Flue evals](https://flueframework.com/docs/guide/evals/))

**Inference:** Flue is useful if the target is a Flue agent or if the project
wants to build a new agent runtime. It is not a direct runner for Claude Code,
Codex, and OpenCode. Running an OKF skill under Flue would test a fourth host,
not the three supported hosts.

### `skills-autoresearch-flue`

The public `skills-autoresearch-flue` repository is an alpha skill-evaluation
and improvement harness built on Flue. It separates researcher, producer, and
judge roles, uses project fixtures and baselines, records iteration artifacts,
and has a cost cap. It requires Node.js 24, pnpm, `@flue/runtime`, Valibot, and
a larger development toolchain. Its current alpha path serializes all text
skill files into the producer prompt and does not execute candidate scripts or
perform lazy resource loading.
([README](https://github.com/schalkneethling/skills-autoresearch-flue/blob/main/README.md),
[`package.json`](https://github.com/schalkneethling/skills-autoresearch-flue/blob/main/package.json),
[harness guide](https://github.com/schalkneethling/skills-autoresearch-flue/blob/main/docs/using-the-harness.md))

At commit `ecd77cfeb95d2fdddba297bfbfff65ee393a096f`, GitHub reported no
detected license and the repository had no `LICENSE` file.
([GitHub repository metadata](https://api.github.com/repos/schalkneethling/skills-autoresearch-flue))

**Recommendation:** Do not copy or redistribute code from this alpha harness
until its license is clear. Its researcher, producer, and judge split is useful
design evidence, but adopting the implementation would add substantial
infrastructure and would still not test the three real coding-agent hosts.

### Comparison table

| Property | Small local runner | Langfuse | Flue | `skills-autoresearch-flue` |
| --- | --- | --- | --- | --- |
| Primary role | Drive real target CLIs | Observe and evaluate runs | Build and run Flue agents | Improve skills through model roles |
| Tests Claude Code, Codex, and OpenCode directly | Yes | Only observes them | No | No |
| Exact file-system assertions | Yes | No | Custom eval code | Fixture outputs, not target-host worktrees |
| Agent Skills support | Uses each host | Langfuse has its own helper skill | Native | Prompt-mounted alpha flow |
| Trace and dashboard quality | Local only | Strong | Export to OTel or other backends | Local artifacts |
| Runtime dependencies | None beyond Node standard library | SDKs and OTel if embedded | Many | Many |
| Fit with this repository's shipped runtime | Good if external | Good if external | Poor if embedded | Poor if embedded |
| Best use now | Required base | Optional second layer | Not required | Research only |

## Recommended adoption sequence

### Phase 1: Local evidence

Create a small external runner and four case classes:

- automatic router or skill selection;
- explicit read flow;
- bounded write flow;
- safety refusal with no forbidden effect.

Run each class against Claude Code, Codex, and OpenCode in temporary Git
repositories. Keep exact checks local. Record JSON artifacts. Do not publish
anything yet.

### Phase 2: Optional Langfuse tracing

Install the official Langfuse coding-agent integration in the isolated runner
environment for each host. Add a unique case ID to the prompt and available
metadata. Use Langfuse to inspect tool order, retries, failures, token use, and
cost. Keep pass or fail in the local result.

### Phase 3: Experiments and scores

When the case format is stable, publish local deterministic results as scores.
Use a Langfuse dataset only if team comparison and annotation are useful. Pin
dataset versions for repeatable optional runs. Add an LLM judge only for
semantic quality that exact assertions cannot measure.

### Phase 4: Optional CI

Run live evaluation on demand, on a schedule, or as a non-release pull-request
signal. Do not make it a required `v0.1.0` check. Keep the offline
`node --test "test/*.test.js"` suite as the release authority, with the pass
count equal to the test count and zero failures.

## Primary sources

### Langfuse

1. [Langfuse documentation](https://langfuse.com/docs)
2. [Langfuse server repository](https://github.com/langfuse/langfuse)
3. [Langfuse license](https://github.com/langfuse/langfuse/blob/main/LICENSE)
4. [Langfuse SDKs](https://langfuse.com/docs/sdk)
5. [Evaluation overview](https://langfuse.com/docs/evaluation/overview)
6. [Datasets](https://langfuse.com/docs/evaluation/experiments/datasets)
7. [Experiments by SDK](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk)
8. [Experiments in CI/CD](https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd)
9. [Self-hosting](https://langfuse.com/self-hosting)
10. [Cloud pricing](https://langfuse.com/pricing)
11. [Coding-agent tracing](https://langfuse.com/resources/engineering/coding-agent-tracing)
12. [Claude Code integration](https://langfuse.com/integrations/developer-tools/claude-code)
13. [Codex integration](https://langfuse.com/integrations/developer-tools/codex)
14. [OpenCode integration](https://langfuse.com/integrations/developer-tools/opencode)
15. [Langfuse Agent Skill](https://github.com/langfuse/skills)

The official Langfuse documentation repository was reviewed at commit
`a5dee9ec5ef2e5d57f66527f52256adfe39db373`. The official Langfuse Agent Skill
repository was reviewed at commit `9cee84e588ec17ec65142aea1020da191c0ebb30`.
The Langfuse server `main` commit observed during research was
`fbc170eec10e72d8b40e35150f157ad3417c2290`.

### Coding-agent CLIs

1. [Claude Code programmatic mode](https://code.claude.com/docs/en/headless)
2. [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) (the former `developers.openai.com` URL redirects here)
3. [OpenCode CLI](https://opencode.ai/docs/cli/)

### Flue

1. [Flue documentation](https://flueframework.com/docs)
2. [Flue repository](https://github.com/withastro/flue)
3. [Flue evals](https://flueframework.com/docs/guide/evals/)
4. [Flue skills](https://flueframework.com/docs/guide/skills/)
5. [Flue observability](https://flueframework.com/docs/guide/observability/)
6. [`skills-autoresearch-flue`](https://github.com/schalkneethling/skills-autoresearch-flue)

### This repository

1. [`AGENTS.md`](../../AGENTS.md)
2. [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
3. [`v0.1.0` specification](../spec/okf-agent-skills-v0.1.0.md)
4. [`v0.1.0` completion specification](../spec/okf-agent-skills-v0.1.0-completion.md)
5. [`scripts/wrapper.js`](../../scripts/wrapper.js)
6. [`scripts/lib/protocol.js`](../../scripts/lib/protocol.js)
