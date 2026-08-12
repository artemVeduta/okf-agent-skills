// The one shared spawn every `scripts/*.js` wrapper dispatch goes through: `okf-delegate.js`
// dispatching a skill wrapper, `scripts/lib/setup.js`'s `dispatchBrief` dispatching
// `okf-delegate.js` itself, and `scripts/lib/adapters.js`'s `claimAndDispatch` dispatching
// `okf-read.js`. A delegated response grows with the bundle: `okf-read validate` on a bundle
// of a few hundred concepts already exceeds Node's 1 MiB default `maxBuffer`, and the overflow
// arrives as a SIGTERM kill indistinguishable on its own from a crashed wrapper. Size the
// buffer past any single JSON response, and hand every caller the one signal (`truncated`)
// that tells the two apart, so a large bundle is never reported as an indeterminate dispatch
// failure.
//
// `result.error.code` on a `spawnSync` `maxBuffer` overflow is `'ENOBUFS'`, verified against
// this Node build (not `'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'`, which is the callback-based
// `exec`/`execFile` buffering error, a different code path spawnSync's native buffering never
// goes through).
const childProcess = require('node:child_process');

const MAX_BUFFER = 1 << 30;

// Spawns `wrapperPath` with `request` as its JSON stdin, parses its JSON stdout, and
// classifies the outcome. `ok: true` means `response` is the parsed body. `ok: false`
// means the caller has no usable response; `truncated` distinguishes an oversized
// answer (buffer overflow) from anything else (a crash, a signal, a non-JSON reply).
function dispatchWrapper(wrapperPath, request) {
  const result = childProcess.spawnSync(process.execPath, [wrapperPath], {
    input: JSON.stringify(request), encoding: 'utf8', maxBuffer: MAX_BUFFER,
  });
  const truncated = !!(result.error && result.error.code === 'ENOBUFS');
  let response = null;
  try { response = JSON.parse(result.stdout); } catch { response = null; }
  const ok = !result.signal && response !== null && typeof response === 'object';
  return {
    ok,
    response: ok ? response : null,
    truncated,
    signal: result.signal,
    exitCode: result.status,
    spawnError: !!result.error,
  };
}

module.exports = { dispatchWrapper };
