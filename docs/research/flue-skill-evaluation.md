# Flue skill evaluation and integration assessment

Research date: 2026-08-05.

## Scope and method

This report examines Flue from primary sources only. The sources are the Flue
repository, its official documentation source, its source code, its package
metadata, its tags and changelog, and its license. The assessment uses Flue tag
`v2.0.3`, commit
[`bf86b8726f5ba189844185fdbeca0e194344ded1`](https://github.com/withastro/flue/tree/bf86b8726f5ba189844185fdbeca0e194344ded1).
The tag date is 2026-08-04. The repository has tags but no GitHub Release
objects. The first-party changelog identifies `2.0.3` as the current tagged
version.[^release]

This report is evidence, not policy. It does not change the `v0.1.0`
specification or release gate.

## Recommendation

Do not add Flue to the `v0.1.0` release gate. Keep the deterministic
`node --test "test/*.test.js"` gate and the specified manual run in one real
harness.

Flue can automate useful skill activation checks in its own harness. It cannot
run Claude Code, Codex, or OpenCode. It therefore cannot replace the manual
native-harness run. It also needs a live model, a package toolchain, credentials,
and a new agent application. This cost is too high for one supplemental smoke
test before `v0.1.0`.

If trigger quality later becomes a measured problem, use Flue only as optional
developer tooling in a separate, non-gating eval job. Test positive and negative
activation cases there. Do not treat its results as cross-harness parity
evidence.

## What Flue does

Flue is a TypeScript framework for building and running autonomous agents. An
agent is a function. Hooks add a model, tools, skills, state, subagents, and an
optional sandbox. Flue can run an agent in a local Node.js process or serve it
as an application on Node.js or Cloudflare.[^readme][^why]

Flue supports Agent Skills. It validates `SKILL.md`, puts each mounted skill's
name and description in an `Available Skills` prompt section, and gives the
model an `activate_skill` tool. The model calls this tool when it judges that a
task matches the skill description. The tool returns the full skill
instructions.[^skills][^activation-source]

Flue can discover workspace skills only under
`<cwd>/.agents/skills/<name>/SKILL.md`. It can also package a skill through a
static `SKILL.md` import and `useSkill(...)`.[^skills-discovery]

Flue is not primarily an evaluation framework. Its official eval guide says
that Flue has no dedicated eval framework. It recommends Vitest tests that
drive a live Flue agent through an in-process API or an HTTP API. An optional
`vitest-evals` blueprint adds a custom HTTP harness, judges, reports, and CI
output.[^eval-guide]

## Release and package facts

| Item | Finding |
| --- | --- |
| Current examined tag | `v2.0.3` at commit `bf86b8726f5ba189844185fdbeca0e194344ded1` |
| GitHub Releases | None; version history is in tags and `CHANGELOG.md` |
| License | Apache License 2.0[^license] |
| Node.js floor | `>=22.19.0` for `@flue/runtime`, `@flue/cli`, and `@flue/vite`[^runtime-package][^cli-package][^vite-package] |
| Runtime package | `@flue/runtime@2.0.3` |
| Runtime dependency shape | Nine direct runtime dependencies in the published package metadata, including Pi, Hono, MCP, YAML, ULID, and Valibot[^runtime-package] |
| Eval integration | Optional `vitest-evals`; it is not part of the Flue runtime[^vitest-blueprint] |

## Harnesses and models

### Agent harnesses

Flue evaluates a Flue agent. Its two documented eval entry points are:

- An in-process Flue runtime through `start()` and `init()`.
- A mounted Flue agent through its public HTTP conversation API.

These are two surfaces of the same Flue harness. They are not adapters for
Claude Code, Codex, or OpenCode.[^eval-surfaces]

The optional `vitest-evals` package has other independent harness integrations,
for AI SDK, OpenAI Agents, Pi, and custom targets.[^vitest-harnesses] The Flue
blueprint explicitly uses a custom HTTP harness. It also says not to install a
runtime-specific `vitest-evals` harness package for this
integration.[^vitest-blueprint] This does not add native coding-harness support
to Flue.

### Models

Flue uses Pi's provider protocol. By default, it registers the full Pi built-in
provider set. The official model guide names Anthropic, OpenAI, Google,
Amazon Bedrock, Google Vertex, Groq, Mistral, xAI, DeepSeek, Cerebras,
Together, Fireworks, and OpenRouter, among others. A project can limit the
provider list. It can also register a custom provider or a local compatible
endpoint such as Ollama.[^models]

The same model name does not give native-harness parity. Flue supplies its own
system prompt, `activate_skill` tool, tool schemas, sandbox tools, and session
rules. Claude Code, Codex, and OpenCode supply different harness behavior.

## Evaluation capability matrix

| Capability | Status in Flue | Evidence and limit |
| --- | --- | --- |
| Skill format validation | Yes | Imported skills fail build-time validation. Invalid workspace skills are skipped with a warning.[^skills] |
| Positive trigger cases | Yes, as authored eval cases | Assert that the transcript contains an `activate_skill` call with the expected skill name. Flue exposes tool names and input in conversation history, and its eval harness converts tool activity to normalized events.[^activation-source][^eval-harness] |
| Negative trigger cases | Yes, as authored eval cases | Assert that `activate_skill` is absent, or that it does not name the unrelated skill. Flue has no special positive/negative trigger-case type. |
| Task outcomes | Yes | An eval can assert reply text, structured data, tool calls, tool results, errors, and file effects. Deterministic assertions are preferred for exact contracts.[^eval-guide][^eval-harness] |
| Repeated trials | No built-in Flue feature | The guide states that evals are nondeterministic and that each case spends live tokens. A user can author several cases or call the harness several times, but Flue defines no trial count, pass-rate rule, confidence interval, or aggregate threshold.[^eval-guide] |
| Ablation | No built-in feature | A user can create one agent with a skill and one without it, or conditionally mount a skill. The pairing, run count, scoring, and comparison are user code. Flue does not report a skill uplift value.[^skills-conditional] |
| Case isolation | Partial | The official eval harness creates a fresh conversation ID for each case. This isolates conversation history. It does not isolate filesystem mutations when the agent uses `local()`.[^eval-harness][^sandbox] |
| Filesystem isolation | Available, but not suitable for this full suite | The virtual sandbox is in-memory and host-isolated. The `local()` sandbox has no isolation. The OKF wrappers require real Node.js processes and repository files, so a practical OKF eval needs `local()` or an external container plus a fresh fixture checkout per case.[^sandbox] |
| Local process execution | Yes | `flue run` and the in-process API run in local Node.js without an HTTP server.[^run] |
| Local-only or offline execution | Conditional | Hosted models need network access and provider credentials. True local-only execution needs a custom local provider, such as the documented Ollama example. Local process execution alone is not offline execution.[^models] |
| CI | Yes, but separate from deterministic tests | A live eval is an ordinary Vitest run and can fail a CI job. Flue recommends a separate job and cadence because runs are slow, spend tokens, and can fail without a code change.[^eval-ci] |
| Structured results | Yes | `flue run --json` emits one terminal JSON envelope. Programmatic calls expose text or schema-validated data plus token and cost usage. The optional eval harness emits normalized output, events, usage, cost, and tool activity; it can write a JSON report.[^run][^structured][^eval-harness] |
| Cost observation | Yes | Flue reports input, output, cache, total token, and estimated cost values from model catalog rates.[^structured] |
| Cost limits | Limited | Model choice, thinking level, submission timeout, and run cadence can reduce cost. A cheaper model can do compaction. Flue does not document a per-case token ceiling, a suite token ceiling, or a dollar stop in its eval API. Cloudflare AI Gateway has separate dashboard budget controls for `cloudflare/...` models.[^models][^durability] |
| Result replay | Not supplied by Flue itself | Flue's own eval guide uses live runs. Any replay feature belongs to optional external eval tooling, not to Flue's skill runtime or the documented Flue custom harness. |

## How to evaluate these skills with Flue

A Flue trigger eval would mount the five skills and send task prompts to a
Flue agent. For each prompt, it would inspect the conversation for these
observations:

1. The expected `activate_skill` call occurred for a positive case.
2. No unrelated skill was activated for a negative case.
3. The model called the correct wrapper as a child process when the task
   required product behavior.
4. The wrapper emitted the expected one-line JSON result and exit class.
5. Any fixture repository effect matched the wrapper result.

Items 3 through 5 are important for this repository. Skill activation alone
does not prove the product contract. The product contract is the wrapper
process and its stdout, not Flue's internal runtime.

Flue can observe a model's `bash` call, but it does not know this repository's
wrapper protocol. The eval agent must give the model a host filesystem through
`local()` and must make the `scripts/` paths available. A test must also create
a new fixture repository for each mutating case. A fresh Flue conversation does
not reset shared files.

## Exact integration burden for this repository

### Constraint fit

| Repository constraint | Flue fit |
| --- | --- |
| Zero shipped runtime dependencies | Compatible only if all Flue files and packages remain optional developer tooling and are excluded from the installed skill product. Flue itself is not zero-dependency.[^runtime-package] |
| One wrapper-process contract seam | Compatible only as non-contract smoke coverage. A Flue gate would add a model-and-harness behavior seam. The current specification permits wrapper-process contract tests and defers live harness process tests.[^local-gate] |
| Deterministic `node --test` release gate | Not compatible as part of that gate. Flue evals use a live model and are explicitly nondeterministic.[^eval-guide][^local-gate] |
| No npm package in `v0.1.0` | A repository-local Flue setup needs `package.json`, a lock file, and installed packages. That setup must remain development-only. It must not become a product install requirement.[^local-completion] |
| Three native harness adapters | Flue does not execute any of the three adapters. It adds a fourth harness. |

### Minimum full HTTP eval setup

The official Flue `vitest-evals` path assumes that a Flue application already
exists. This repository has no Flue application. A full integration therefore
needs all of these new development artifacts:

1. `package.json` and one lock file.
2. A Vite configuration with the Flue plugin.
3. A Flue agent module that selects a model, attaches `local()`, and mounts the
   five skills.
4. An `app.ts` route map that exposes that agent over HTTP.
5. A dedicated Vitest eval configuration.
6. The generated custom Flue HTTP eval harness.
7. Positive trigger, negative trigger, and task-outcome case files.
8. Fixture setup that gives each mutating case a new repository and an exact
   installed skill and wrapper layout.
9. Ignore rules for generated eval reports and local Flue state.
10. A separate local command or CI job that starts the server, waits for it,
    runs evals, and stops the server.

The direct package set is at least `@flue/runtime`, `hono`, `@flue/vite`,
`vite`, `@flue/sdk`, `vitest`, and `vitest-evals`. TypeScript is an additional
developer check if the new files are type-checked. `@flue/cli` is optional for
this HTTP design. Valibot is optional unless the eval agent defines schema
validated tools or results. Flue's official blueprint adds `@flue/sdk`, Vitest,
and `vitest-evals` to an existing Flue project; the other packages are required
here because no such application exists.[^vitest-blueprint][^flue-example]

At the examined tag, the exact Flue package version is `2.0.3`. The first-party
example uses Vite `^8.0.14`, Vitest `^4.1.6`, `vitest-evals` `^0.15.0`, and Hono
`^4.7.0`.[^flue-example] A real adoption must use one lock file so these ranges
do not change between eval runs.

These packages can all be declared as development dependencies in this
repository. That label does not make them dependency-free. They are runtime
dependencies of the eval process, but not dependencies of the shipped OKF
skills or wrappers. The release artifact and base install must not contain or
require them.

### Smaller Flue-only smoke setup

A smaller setup can use `flue run` instead of an HTTP application and
`vitest-evals`. It needs `@flue/runtime`, `@flue/cli`, one agent module, one
model credential, and a script that checks the `--json` envelope. This removes
the HTTP route, SDK, Vite eval harness, and reports. It does not give a stable
structured transcript assertion for skill activation. It is therefore no
better than the existing manual real-harness run for release evidence.

## Comparison with the specified manual smoke run

The `v0.1.0` specification says that adapter fixtures are the release gate. It
also says that a real harness is exercised manually for dogfooding and publish,
and that live cross-harness process tests stay deferred to `v0.2.0`.[^local-gate]

| Question | Manual native-harness run | Flue eval |
| --- | --- | --- |
| Uses a shipped harness | Yes | No |
| Checks native skill discovery and invocation | Yes, for the selected harness | No; checks Flue discovery and `activate_skill` |
| Checks the native adapter | Yes, if the run includes the adapter | No |
| Checks the wrapper process | Yes | Yes, if the model reaches it through `local()` |
| Deterministic | No | No |
| Repeatable by command | Partly | Yes |
| Structured report | Harness-dependent | Yes with added eval tooling |
| Needs new repository dependencies | No | Yes |
| Can replace the specified publish smoke | No replacement needed | No |

Flue can minimize manual work only after a team has enough recurring trigger
and outcome cases to justify the tooling. It can run those cases and collect
their results before the manual publish check. It cannot remove the final
manual check because it does not run a shipped harness or adapter.

For this repository now, Flue would increase total setup and maintenance work.
The best `v0.1.0` path is the current deterministic wrapper suite plus one
manual native-harness smoke run.

## Sources

[^release]: Flue, [`CHANGELOG.md`, lines 1-7](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/CHANGELOG.md#L1-L7), [`v2.0.3` tag](https://github.com/withastro/flue/tree/v2.0.3), and the GitHub [Releases API result](https://api.github.com/repos/withastro/flue/releases), checked 2026-08-05.
[^readme]: Flue, [`README.md`, lines 1-40](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/README.md#L1-L40).
[^why]: Flue official docs source, [`why-flue.md`, lines 7-40](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/why-flue.md#L7-L40).
[^skills]: Flue official docs source, [`skills.md`, lines 7-21](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/skills.md#L7-L21) and [lines 49-60](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/skills.md#L49-L60).
[^activation-source]: Flue source, [`context.ts`, lines 148-158](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/packages/runtime/src/context.ts#L148-L158), and [`agent.ts`, lines 416-449](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/packages/runtime/src/agent.ts#L416-L449).
[^skills-discovery]: Flue official docs source, [`skills.md`, lines 62-94](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/skills.md#L62-L94) and [lines 164-176](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/skills.md#L164-L176).
[^eval-guide]: Flue official docs source, [`evals.md`, lines 7-18](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/evals.md#L7-L18).
[^license]: Flue, [`LICENSE`](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/LICENSE), and root [`package.json`, lines 1-9](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/package.json#L1-L9).
[^runtime-package]: npm registry, [`@flue/runtime@2.0.3` package metadata](https://registry.npmjs.org/@flue/runtime/2.0.3), and Flue source [`packages/runtime/package.json`, lines 77-103](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/packages/runtime/package.json#L77-L103).
[^cli-package]: npm registry, [`@flue/cli@2.0.3` package metadata](https://registry.npmjs.org/@flue/cli/2.0.3).
[^vite-package]: npm registry, [`@flue/vite@2.0.3` package metadata](https://registry.npmjs.org/@flue/vite/2.0.3).
[^vitest-blueprint]: Flue first-party blueprint, [`tooling--vitest-evals.md`, lines 5-20](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/blueprints/tooling--vitest-evals.md#L5-L20) and [lines 194-227](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/blueprints/tooling--vitest-evals.md#L194-L227).
[^vitest-harnesses]: Sentry, official [`vitest-evals` harness documentation](https://vitest-evals.sentry.dev/docs/harnesses/), and its [documentation source](https://github.com/getsentry/vitest-evals/blob/8300699ebd36fb2e1e9e62f7a71d9ce2a6f176e8/packages/docs/src/content/docs/docs/harnesses.mdx), checked 2026-08-05.
[^eval-surfaces]: Flue official docs source, [`evals.md`, lines 47-126](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/evals.md#L47-L126).
[^models]: Flue official docs source, [`models.md`, lines 32-53](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/models.md#L32-L53) and [lines 123-190](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/models.md#L123-L190).
[^eval-harness]: Flue first-party example, [`harness.ts`, lines 100-147](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/examples/vitest-evals/src/evals/harness.ts#L100-L147), and [`service-health.eval.ts`](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/examples/vitest-evals/src/evals/service-health.eval.ts).
[^skills-conditional]: Flue official docs source, [`skills.md`, lines 88-94](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/skills.md#L88-L94).
[^sandbox]: Flue official docs source, [`sandboxes.md`, lines 23-46](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/sandboxes.md#L23-L46) and [lines 113-135](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/sandboxes.md#L113-L135).
[^run]: Flue official docs source, [`run.md`, lines 7-17](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/cli/run.md#L7-L17) and [lines 33-54](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/cli/run.md#L33-L54).
[^eval-ci]: Flue official docs source, [`evals.md`, lines 181-197](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/guide/evals.md#L181-L197).
[^structured]: Flue official docs source, [`agent-api.md`, lines 400-458](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/reference/agent-api.md#L400-L458).
[^durability]: Flue official docs source, [`agent-api.md`, lines 101-112](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/apps/docs/src/content/docs/reference/agent-api.md#L101-L112).
[^local-gate]: This repository, [`docs/spec/okf-agent-skills-v0.1.0.md`](../spec/okf-agent-skills-v0.1.0.md#acceptance-evidence), and [`docs/spec/okf-agent-skills-v0.1.0-completion.md`](../spec/okf-agent-skills-v0.1.0-completion.md#testing-decisions).
[^local-completion]: This repository, [`docs/spec/okf-agent-skills-v0.1.0-completion.md`](../spec/okf-agent-skills-v0.1.0-completion.md#repository-setup).
[^flue-example]: Flue first-party example, [`examples/vitest-evals/package.json`](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/examples/vitest-evals/package.json), [`vite.config.ts`](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/examples/vitest-evals/vite.config.ts), and [`src/app.ts`](https://github.com/withastro/flue/blob/bf86b8726f5ba189844185fdbeca0e194344ded1/examples/vitest-evals/src/app.ts).
