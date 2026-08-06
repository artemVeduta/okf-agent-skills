/*
 * Adapter install/disable/uninstall, writing only inside the given
 * harness-local target directory. `uninstall` removes exactly what
 * `install` created, and only receipt paths that resolve inside target.
 *
 * Also the one at-most-once orientation claim cycle every harness adapter
 * shares: derive the occurrence key, pre-claim it 'unavailable' before
 * dispatch (so a crash mid-dispatch is reported, never replayed), dispatch
 * through the sibling okf-read wrapper as a child process (the wrapper is
 * the one contract seam), then finalize the claim from the real result. Presentation is decided
 * here too, so every adapter agrees by construction: inject only on
 * 'clean', everything else is a diagnostic, never injected. A replay
 * reports the ORIGINAL reason, not the runtime's generic claimed-attempt
 * gloss, which the adapter has no way to recover on its own.
 */

const path = require('node:path');
const childProcess = require('node:child_process');
const orientation = require('./orientation');

const occurrencesName = '.okf-occurrences.json';
const harnesses = new Set(['claude-code', 'codex', 'opencode']);
const receiptName = '.okf-adapter.json';
const disabledMarker = '.okf-adapter-disabled';
const placeholderTarget = '__OKF_TARGET_DIR__';
const suiteRoot = path.join(__dirname, '..', '..');
const adaptersRoot = path.join(suiteRoot, 'adapters');
const scriptsRoot = path.join(suiteRoot, 'scripts');
const readWrapper = path.join(__dirname, '..', 'okf-read.js');

function substitute(text, targetDir) {
  return text.split(placeholderTarget).join(targetDir);
}

// The installed adapter runs from its own target, so the whole canonical
// scripts tree is copied in: after installation the tag checkout is not a
// runtime dependency of anything the harness executes.
function copyScriptsTree(destination, resolvedTarget, services, installedFiles) {
  for (const file of services.listFiles(scriptsRoot)) {
    const relative = path.join(destination, path.relative(scriptsRoot, file));
    const targetFile = path.join(resolvedTarget, relative);
    services.mkdir(path.dirname(targetFile));
    services.writeFile(targetFile, services.readFile(file));
    installedFiles.push(relative);
  }
}

function readReceipt(targetDir, services) {
  try { return JSON.parse(services.readFile(path.join(targetDir, receiptName))); } catch { return null; }
}

function install(harness, targetDir, services) {
  if (!harnesses.has(harness)) return { ok: false, code: 'UNKNOWN_HARNESS' };
  const sourceRoot = path.join(adaptersRoot, harness);
  const manifest = JSON.parse(services.readFile(path.join(sourceRoot, 'manifest.json')));
  const resolvedTarget = path.resolve(targetDir);
  services.mkdir(resolvedTarget);

  const installedFiles = [];
  for (const entry of manifest.installs) {
    const targetFile = path.join(resolvedTarget, entry.target);
    services.mkdir(path.dirname(targetFile));
    const content = substitute(services.readFile(path.join(sourceRoot, entry.source)), resolvedTarget);
    services.writeFile(targetFile, content);
    installedFiles.push(entry.target);
  }
  copyScriptsTree(manifest.scripts_tree, resolvedTarget, services, installedFiles);

  const receipt = { harness, suite_version: manifest.suite_version, installed_files: installedFiles, disabled: false };
  services.writeFile(path.join(resolvedTarget, receiptName), JSON.stringify(receipt));
  return {
    ok: true, harness, target: resolvedTarget, installed_files: installedFiles,
    ...(manifest.next_action ? { next_action: manifest.next_action } : {}),
  };
}

function disable(harness, targetDir, services) {
  const resolvedTarget = path.resolve(targetDir);
  const receipt = readReceipt(resolvedTarget, services);
  if (!receipt || receipt.harness !== harness) return { ok: false, code: 'NOT_INSTALLED' };
  services.writeFile(path.join(resolvedTarget, disabledMarker), '');
  services.writeFile(path.join(resolvedTarget, receiptName), JSON.stringify({ ...receipt, disabled: true }));
  return { ok: true, harness, target: resolvedTarget };
}

// Prunes directories install created, stopping at (and including) resolvedTarget
// itself, and never stepping outside it into the caller's pre-existing tree.
function removeEmptyDirs(dir, resolvedTarget, services) {
  let current = dir;
  while (current === resolvedTarget || current.startsWith(resolvedTarget + path.sep)) {
    let entries;
    try { entries = services.readdir(current); } catch { return; }
    if (entries.length > 0 || !services.removeEmptyDir(current)) return;
    current = path.dirname(current);
  }
}

function uninstall(harness, targetDir, services) {
  const resolvedTarget = path.resolve(targetDir);
  const receipt = readReceipt(resolvedTarget, services);
  if (!receipt || receipt.harness !== harness) return { ok: false, code: 'NOT_INSTALLED' };
  for (const relative of receipt.installed_files) {
    const file = path.resolve(resolvedTarget, relative);
    if (!file.startsWith(resolvedTarget + path.sep)) continue;
    services.remove(file);
    removeEmptyDirs(path.dirname(file), resolvedTarget, services);
  }
  services.remove(path.join(resolvedTarget, disabledMarker));
  services.remove(path.join(resolvedTarget, receiptName));
  removeEmptyDirs(resolvedTarget, resolvedTarget, services);
  return { ok: true, harness, target: resolvedTarget };
}

function readClaims(file, services) {
  try { return JSON.parse(services.readFile(file)); } catch { return {}; }
}

function writeClaims(file, claims, services) {
  services.writeFile(file, JSON.stringify(claims));
}

// The runtime's own `claimed` contract is the three-value enum
// ('delivered'|'failed'|'unavailable'); 'unavailable' survives the mapping
// because it is already one of those three, everything else that is not
// 'clean' collapses to 'failed'.
function claimOutcome(result) {
  if (result === 'clean') return 'delivered';
  if (result === 'unavailable') return 'unavailable';
  return 'failed';
}

function reasonOf(response) {
  const finding = response && Array.isArray(response.findings) ? response.findings[0] : null;
  return finding && finding.detail ? finding.detail.reason : null;
}

function present(response, reason) {
  if (!response) return null;
  if (response.result === 'clean') {
    return { kind: 'clean', text: `OKF orientation: bundle ${response.data.bundle.bundle_alias}, root index ${response.data.root_index_path}.` };
  }
  return { kind: 'diagnostic', text: `OKF orientation ${response.result}${reason ? `: ${reason}` : ''}` };
}

function claimAndDispatch(payload, ledgerDir, services) {
  const key = orientation.deriveKey(payload, services);
  const file = key ? path.join(ledgerDir, occurrencesName) : null;
  const claims = file ? readClaims(file, services) : {};
  const prior = key ? claims[key] : undefined;
  const firstAttempt = prior === undefined;
  if (file && firstAttempt) {
    claims[key] = { outcome: 'unavailable', reason: null };
    writeClaims(file, claims, services);
  }

  const request = {
    protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'orient', invocation: 'automatic',
    payload: { ...payload, claimed: firstAttempt ? [] : [{ occurrence_key: key, outcome: prior.outcome }] },
  };
  // A non-zero exit, empty stdout, or unparseable stdout is indistinguishable
  // from no response at all: the claim is released and nothing is presented.
  let response;
  try {
    const dispatched = childProcess.spawnSync(process.execPath, [readWrapper], { input: JSON.stringify(request), encoding: 'utf8' });
    response = dispatched.status === 0 ? JSON.parse(dispatched.stdout) : null;
  } catch { response = null; }

  if (file && firstAttempt) {
    if (response) claims[key] = { outcome: claimOutcome(response.result), reason: reasonOf(response) };
    else delete claims[key];
    writeClaims(file, claims, services);
  }

  return present(response, firstAttempt ? reasonOf(response) : prior.reason);
}

module.exports = { install, disable, uninstall, harnesses, claimAndDispatch };
