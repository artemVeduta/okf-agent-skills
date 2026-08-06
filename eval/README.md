# Flue eval slice

This directory holds a non-gating Flue eval for the five OKF skills. It is
development tooling. It is not part of the shipped product.

`node --test "test/*.test.js"` at the repository root never runs anything in
this directory. `.github/workflows/ci.yml` never runs anything in this
directory. This directory has its own `package.json` and its own lock file,
separate from the release, per
[`docs/research/flue-skill-evaluation.md`](../docs/research/flue-skill-evaluation.md).

## Setup choice

This eval slice uses the in-process `start()`/`init()` API from
`@flue/runtime` alone, with Node's own test runner for the two deterministic
checks. One dependency, `@flue/runtime`. `init()`'s `read(receipt, {
onEvent })` gives the full conversation transcript, including every
`activate_skill` tool call. See
[`docs/research/flue-skill-evaluation.md`](../docs/research/flue-skill-evaluation.md)
for the alternatives this ruled out.

## Layout

```
eval/
  package.json          — pins @flue/runtime 2.0.3
  agent.js               — the one Flue agent this eval slice drives
  run.js                 — runs every case, prints one JSON result line each
  lib/
    fixture.js            — builds a fresh fixture repository per case
    report.js             — the case-result record shape
    report.check.js       — deterministic check, no Flue, no model
    wrapper-contract.js   — classifies a wrapper's exit into its three documented conditions
    wrapper-contract.check.js — deterministic check of the classifier's pure branches, no model
  cases/
    activation.eval.js    — the five activation cases (one data row each), positive and negative
    wrapper-contract.eval.js
```

## The fixture workspace

Flue discovers a workspace skill only under
`<cwd>/.agents/skills/<name>/SKILL.md`. `lib/fixture.js` builds one fresh
temporary bundle repository per case and copies `skills/<name>` from this
checkout into `<fixture>/.agents/skills/<name>`, for each of the five
skills. This mounts the release candidate's own skills, without letting a
live model turn write through to the real `skills/` directory — `local()`
has no isolation of its own (see "Setup choice" below), so the fixture must
supply it.

Each fixture also carries a minimal conforming bundle: an `index.md` with
`okf_version: "0.2"`, the `.okf-active` activation marker, one evidence file,
and one concept file (`note.md`). A fresh fixture repository is built for
every case, mutating or not, because a Flue conversation reset does not
reset files.

## The six cases

Five of the six cases dispatch a prompt to the Flue agent and inspect the
conversation transcript for `activate_skill` tool calls:

| Case | Kind | Asserts |
| --- | --- | --- |
| `okf-read-positive-activation` | positive | `okf` or `okf-read` is among the activated skills for a read-only inspection prompt. |
| `okf-write-positive-activation` | positive | `okf` or `okf-write` is among the activated skills for a bounded revise prompt with evidence named. |
| `okf-lifecycle-positive-activation` | positive | `okf` or `okf-lifecycle` is among the activated skills for a synchronization prompt. |
| `okf-review-positive-activation` | positive | `okf` or `okf-review` is among the activated skills for a staleness/trust-tier prompt. |
| `unrelated-negative-activation` | negative | none of the five OKF skills activate for a prompt with no connection to OKF. |
| `okf-write-wrapper-contract` | wrapper-contract | the real `okf-write` wrapper process, run against a fresh fixture bundle, emits exactly one JSON line and exit 0, and the response's `result` is `applied`. |

Each positive case accepts either the router (`okf`) or the specific leaf
skill, because the router's own `SKILL.md` is the piece that is supposed to
route a direct request to its owner leaf — Flue may see either name in the
transcript depending on how far the model's own tool-call chain runs in one
turn.

The sixth case does not need a live model. It runs the wrapper directly,
the same way Flue's `local()` sandbox would run it through the model's
`bash` tool, and asserts the wrapper's one-line JSON result and exit class —
the real product contract, per the research doc. It is the one case this
environment can score today without a model.

## Running it

```sh
cd eval
npm install
npm run check   # deterministic checks: no Flue, no model, always runs
npm run eval    # the six cases against a live Flue agent
```

`npm run eval` needs a model provider API key in the environment. The default
model is `anthropic/claude-haiku-4-5`, which reads `ANTHROPIC_API_KEY`. To use
a different provider, set `OKF_EVAL_MODEL` and the key for that provider:

```bash
export OPENAI_API_KEY="sk-..."
OKF_EVAL_MODEL="openai/<model>" npm run eval
```

`anthropic` reads `ANTHROPIC_API_KEY` and `openai` reads `OPENAI_API_KEY`. The
same pattern applies to the other providers. See `docs/guide/models.md` in the
installed `@flue/runtime` package for the full list.

The key must be an API key with API billing. A chat subscription is not an API
key. This runner uses the in-process `start()`/`init()` API, which does not read
a `.env` file. Export the key in the shell, or start the runner with Node's
`--env-file` option.

Without a key, every case that needs a live model reports `status: "blocked"`
with the exact reason, and the wrapper-contract case still
reports `status: "pass"` or `status: "fail"` for real. No Flue case (the
five activation cases) has ever been scored in this repository — every
recorded run so far reports them `blocked`. Only the wrapper-contract case,
which needs no model, has run to a real answer. See
[`docs/flue-eval-results.md`](../docs/flue-eval-results.md) for the last
recorded run, what it proved, and what it could not prove.

## What a case result looks like

`npm run eval` prints one JSON line per case, then one summary line. The
wrapper-contract case is a `spawnSync` of the real wrapper script, not a
Flue dispatch — its `kind` names that distinctly from the five
`activation-positive`/`activation-negative` cases:

```json
{"id": "okf-write-wrapper-contract", "kind": "wrapper-contract", "description": "...", "status": "pass", "detail": null}
{"summary": {"total": 6, "pass": 1, "fail": 0, "blocked": 5}}
```

`status` is one of three values:

- `pass` — the case ran to a real answer and its assertion held.
- `fail` — the case ran to a real answer and its assertion did not hold, or
  the case hit an error unrelated to a missing credential.
- `blocked` — the case could not reach a real answer, and `detail` names why.
  A blocked case is not a claim about the OKF skills. It is a recorded gap
  in what this environment can currently prove.
