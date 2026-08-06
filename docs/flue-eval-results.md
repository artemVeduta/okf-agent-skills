# Flue eval results

This record covers the eval slice in `eval/`. The eval slice is development
tooling. It does not gate the release. See
[`eval/README.md`](../eval/README.md) for the setup and
[`docs/research/flue-skill-evaluation.md`](research/flue-skill-evaluation.md)
for the accepted design this eval slice follows.

This record has two parts. The first run had no model credential. The second
run had one, and scored the five activation cases for the first time.

## Run 1 — no model credential

- Date: 2026-08-06.
- No model provider credential was set in the environment.

`npm install` added 118 packages under `eval/node_modules/` and created
`eval/package-lock.json`, which pins `@flue/runtime` to exactly `2.0.3`. The
install needed no dependency outside `eval/`. It changed no file in
`skills/`, `scripts/`, `adapters/`, or `agents/`.

`npm run eval` scored 1 case and blocked 5:

```
{"summary":{"total":6,"pass":1,"fail":0,"blocked":5}}
```

Each blocked case gave `Provider is not configured: anthropic`. Each one ran
for real and stopped only at the model turn. This proved the fixture built
correctly, the `local()` sandbox attached correctly, and Flue accepted the
five real copied skill directories. It proved nothing about activation.

## Run 2 — with a model credential

- Date: 2026-08-06.
- Branch: `feat/issue-41-spec-v0.1.0`.
- Node.js version: `v26.5.0`.
- Provider: `opencode-go`, credential `OPENCODE_API_KEY`.
- Model: `opencode-go/deepseek-v4-pro`, thinking level `max`.

Command:

```sh
cd eval
OKF_EVAL_MODEL='opencode-go/deepseek-v4-pro' OKF_EVAL_THINKING_LEVEL=max npm run eval
```

`npm run check` gave 9 tests, 9 pass, 0 fail. This check needs no Flue
runtime and no model.

### The five activation cases scored for the first time

This is the first recorded run in which a live model turn ran. The result is
not stable between runs. Three full runs and several single-case runs gave
these counts:

| Case | Trials | Pass | Fail | Blocked |
| --- | --- | --- | --- | --- |
| `okf-read-positive-activation`, first prompt | 4 | 0 | 4 | 0 |
| `okf-read-positive-activation`, corrected prompt | 4 | 4 | 0 | 0 |
| `okf-write-positive-activation` | 7 | 5 | 2 | 0 |
| `okf-lifecycle-positive-activation` | 4 | 2 | 0 | 2 |
| `okf-review-positive-activation` | 3 | 3 | 0 | 0 |
| `unrelated-negative-activation` | 3 | 3 | 0 | 0 |
| `okf-write-wrapper-contract` | 3 | 3 | 0 | 0 |

The negative case never activated an OKF skill for an unrelated task. The
wrapper-contract case passed every time. It needs no model.

### Finding 1 — a plain file-read prompt activates no OKF skill

The first `okf-read` prompt was:

    Open note.md in this bundle and tell me its current title and type.
    Do not change anything.

No OKF skill activated. This repeated 4 times out of 4. The model read the
file with its own tools.

This is the specified behavior, not a defect. `okf-read`'s description ends
with the reach clause `when another skill must invoke it`, which
`docs/spec/okf-agent-skills-v0.1.0.md` requires for a leaf skill (#26). The
router `okf` activates `when a user selects an operation`. The prompt above
selects no operation. So the eval case's expectation was wrong, not the
skills.

The prompt now names the read operation:

    Validate the shape of the concept note.md in this bundle and report its
    title and type. Do not change anything.

This passed 4 times out of 4.

An open question stays for a person to answer: a user who asks for a plain
file read gets no OKF behavior at all. That may be correct. This record does
not decide it.

### Finding 2 — positive activation is not stable between runs

`okf-write-positive-activation` passed 5 times and failed 2 times out of 7,
with no change to the skill, the prompt, or the runner between trials. A
failure reports `got: []`, which means no skill activated at all.

One trial therefore cannot support a pass or fail claim about trigger
quality. Flue supplies no trial count, no pass-rate rule, and no aggregate
threshold, as
[`docs/research/flue-skill-evaluation.md`](research/flue-skill-evaluation.md)
records. This eval slice adds none. This is direct evidence for the accepted
decision to keep the eval slice out of the release gate.

### Finding 3 — the provider can drop a run

Two trials of `okf-lifecycle-positive-activation` on
`opencode-go/deepseek-v4-pro` ended with `Stream ended without finish_reason`
from the provider, and the case passed on retry. The runner now reports this
as `blocked`, not `fail`, because it happens outside the case's own logic. A
`fail` must mean the OKF skills did something wrong.

The runtime's own error message says only that the run failed. The
provider's words are in `meta.reason`. The runner now reports both, or the
record would say nothing useful.

## Real defects found in the shipped product

None. No run found a discrepancy between the shipped skills, the shipped
wrapper scripts, and their own documented contract. `git status --porcelain
skills/` was empty before and after every run. The fixture mounts a copy of
each skill directory, not a link into the real one, so a live model turn
cannot write through to the release candidate under test.

## Defect tickets to raise

None against `skills/`, `scripts/`, `adapters/`, or `agents/`.

Finding 2 needs a decision about repeated trials and a pass-rate rule before
any trigger-quality claim is made from this eval slice. Finding 1 leaves one
open question about a plain read request. Both belong to the eval slice and
its evidence rules, not to the shipped product.
