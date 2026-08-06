# Flue eval results

This record covers one run of the eval slice in `eval/`. The eval slice is
development tooling. It does not gate the release. See
[`eval/README.md`](../eval/README.md) for the setup and
[`docs/research/flue-skill-evaluation.md`](research/flue-skill-evaluation.md)
for the accepted design this eval slice follows.

## Environment at the time of this run

- Date: 2026-08-06.
- Branch: `feat/issue-41-spec-v0.1.0`.
- Node.js version: `v26.5.0`.
- `env | grep -iE "key|token|secret|credential"` found no match. No model
  provider credential was set in the environment.
- `curl -sS -m 8 -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@flue/runtime/2.0.3`
  returned `200`. The npm registry was reachable.
- `curl -sS -m 8 -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/withastro/flue/tags`
  returned `200`. GitHub was reachable.

This run could reach the network. It could not reach a model.

## Commands run

```sh
cd eval
npm install
npm run check
npm run eval
```

## What `npm install` proved

`npm install` added 118 packages under `eval/node_modules/` and finished
with 0 vulnerabilities. It created `eval/package-lock.json`, which pins
`@flue/runtime` to exactly `2.0.3`. The install needed no dependency outside
`eval/`. It changed no file in `skills/`, `scripts/`, `adapters/`, or
`agents/`.

## What `npm run check` proved

`npm run check` runs `node --test lib/*.check.js`. Every test in it passed:

```
✔ runCase records a pass and a null detail when the case function does not throw
✔ runCase records a fail with the thrown message for an ordinary error
✔ runCase records blocked, not fail, for a BlockedCase
✔ a BlockedCase is an ordinary Error, not a special control-flow value
✔ classifyWrapperExit reports valid-response for exit 0 with one JSON line on stdout
✔ classifyWrapperExit reports invalid-input for exit 64 with nothing on stdout
✔ classifyWrapperExit throws for exit 64 with something on stdout
✔ classifyWrapperExit reports internal-failure for the documented exit-70 shape
✔ classifyWrapperExit throws on an exit code outside the three documented conditions
tests 9, pass 9, fail 0
```

This check needs no Flue runtime and no model. It exercises only
`classifyWrapperExit`'s pure branches, against literal `{ status, stdout,
stderr }` records. The wrapper-process contract itself — spawning the real
`scripts/okf-write.js` — is verified at the one gated seam in `test/`
(`test/write-gate.test.js`, `test/issue-48.test.js`, `test/issue-52.test.js`,
`test/issue-53.test.js`, `test/issue-64.test.js`), not duplicated here.

## What `npm run eval` proved

`npm run eval` ran all six cases. One case passed. Five cases were blocked.
No case failed:

```
{"id":"okf-read-positive-activation", ..., "status":"blocked", "detail":"no usable model provider credential: dispatch(...) failed: Provider is not configured: anthropic"}
{"id":"okf-write-positive-activation", ..., "status":"blocked", "detail":"no usable model provider credential: dispatch(...) failed: Provider is not configured: anthropic"}
{"id":"okf-lifecycle-positive-activation", ..., "status":"blocked", "detail":"no usable model provider credential: dispatch(...) failed: Provider is not configured: anthropic"}
{"id":"okf-review-positive-activation", ..., "status":"blocked", "detail":"no usable model provider credential: dispatch(...) failed: Provider is not configured: anthropic"}
{"id":"unrelated-negative-activation", ..., "status":"blocked", "detail":"no usable model provider credential: dispatch(...) failed: Provider is not configured: anthropic"}
{"id":"okf-write-wrapper-contract", ..., "status":"pass", "detail":null}
{"summary":{"total":6,"pass":1,"fail":0,"blocked":5}}
```

The `okf-write-wrapper-contract` case is a `spawnSync` of the real wrapper
script, not a Flue dispatch. No Flue case (the five
`activation-positive`/`activation-negative` cases above it) has ever been
scored in this repository.

The exact `detail` text is the real error `@flue/runtime` 2.0.3 raised in
this environment, captured verbatim.

### What the five blocked cases verified before they stopped

Each blocked case ran for real. Each one reached the point where the model
turn needed a provider, and stopped only there. This run also used one
extra, direct probe against the pinned `@flue/runtime` package, separate
from the six cases, to confirm exactly where that stop happens:

- A fixture with the five real skills copied under `.agents/skills/<name>`
  raised no skill-validation error, no copy error, and no
  sandbox-construction error. With the fixture skills present, the one
  observed failure was the same `Provider is not configured: anthropic`
  error a probe with no skills mounted at all also raised.

This is direct evidence that, in this environment: the fixture repository
built correctly; the `local()` sandbox attached to it correctly; and
Flue's workspace-skill discovery accepted the five real, copied skill
directories without error. The only unmet requirement was a model provider
credential.

This run makes no claim that any of the five skills would actually activate
for a matching prompt. That claim needs a live model turn, which this
environment could not run.

## What is blocked, and exactly what would unblock it

Every `activation-positive` and `activation-negative` case needs one model
provider credential in the process environment. The eval slice's
`useModel('anthropic/claude-haiku-4-5')` needs `ANTHROPIC_API_KEY`.

To complete this run: set `ANTHROPIC_API_KEY` in the process environment,
then run `cd eval && npm run eval` again. No other setup step is missing.
The package is installed, the fixture builds correctly, and the agent
constructs correctly.

## Real defects found

None. This run found no discrepancy between the shipped skills, the shipped
wrapper scripts, and their own documented contract. The wrapper-contract
case passed against the current working tree without any change to
`skills/`, `scripts/`, `adapters/`, or `agents/`. `git status --porcelain
skills/` was empty before and after this run: the fixture mounts a copy of
each skill directory, not a link into the real one, so a live model turn
cannot write through to the release candidate under test.

## Defect tickets to raise

None. No case in this run reached a real observed failure in the shipped
product. Per the task's own rule, a defect ticket is raised only for a real
observed failure, never a speculative one.

