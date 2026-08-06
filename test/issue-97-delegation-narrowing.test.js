const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Issue #97 records the narrowed delegated-execution and settings claims
// from issue #91: no v0.1.0 adapter installs a delegated agent definition,
// and the shared bridge that a native adapter drives accepts only the two
// installed skills. This file adds the one deterministic assertion that
// decision was missing — see docs/spec/okf-agent-skills-v0.1.0-completion.md,
// "Narrowed claims (issue #91, issue #97)".

const repo = path.resolve(__dirname, '..');
const adaptersDir = path.join(repo, 'adapters');
const bridgeWrapper = path.join(repo, 'scripts', 'adapter-bridge.js');
const harnesses = ['claude-code', 'codex', 'opencode'];

function manifest(harness) {
  return JSON.parse(fs.readFileSync(path.join(adaptersDir, harness, 'manifest.json'), 'utf8'));
}

function runBridge(harness, skill) {
  return childProcess.spawnSync(process.execPath, [bridgeWrapper, harness, skill], {
    input: '', encoding: 'utf8',
  });
}

test('no adapter manifest installs entry names an agents/ path', () => {
  for (const harness of harnesses) {
    const declared = manifest(harness);
    for (const entry of declared.installs) {
      assert.ok(!entry.source.startsWith('agents/'), `${harness}:${entry.source}`);
      assert.ok(!entry.target.startsWith('agents/'), `${harness}:${entry.target}`);
    }
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
