const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');
const { adapterManifest: manifest } = require('../test-support/snapshot');

// Issue #97 records the narrowed delegated-execution and settings claims
// from issue #91: no v0.1.0 adapter installs a delegated agent definition,
// and the shared bridge that a native adapter drives accepts only the two
// installed skills. This file adds the one deterministic assertion that
// decision was missing — see docs/spec/okf-agent-skills-v0.1.0-completion.md,
// "Narrowed claims (issue #91, issue #97)".

const repo = path.resolve(__dirname, '..');
const bridgeWrapper = path.join(repo, 'scripts', 'adapter-bridge.js');
const harnesses = ['claude-code', 'codex', 'opencode'];

function runBridge(harness, skill) {
  return childProcess.spawnSync(process.execPath, [bridgeWrapper, harness, skill], {
    input: '', encoding: 'utf8',
  });
}

test('no harness manifest carries an installs key: the install-script model is removed', () => {
  for (const harness of harnesses) {
    const declared = manifest(harness);
    assert.equal(Object.hasOwn(declared, 'installs'), false, harness);
  }
});

test('scripts/adapter-bridge.js rejects okf-delegate: the delegated path is not reachable through the shared bridge', () => {
  for (const harness of harnesses) {
    const result = runBridge(harness, 'okf-delegate');
    assert.equal(result.status, 64, harness);
    assert.equal(result.stdout, '', harness);
    assert.match(result.stderr, /Unsupported adapter bridge request/, harness);
  }
});
