/*
 * Adapter install/disable/uninstall, writing only inside the given
 * harness-local target directory. `uninstall` removes exactly what
 * `install` created, and only receipt paths that resolve inside target.
 *
 * Also the one at-most-once orientation claim cycle every harness adapter
 * shares. Dispatch is a child-process run of the sibling okf-read wrapper,
 * the one contract seam. The invariants a reader cannot get from the code:
 *   - the occurrence is pre-claimed 'unavailable' before dispatch, so a
 *     dispatch that crashes is reported once and never replayed;
 *   - every ledger mutation is a compare-and-swap, so two concurrent hooks
 *     cannot both claim one occurrence;
 *   - only a 'clean' result is injected into the session, everything else is
 *     a diagnostic;
 *   - a replay reports the ORIGINAL reason, not the runtime's generic
 *     claimed-attempt gloss, which the adapter cannot recover on its own.
 */

const path = require('node:path');
const childProcess = require('node:child_process');
const orientation = require('./orientation');

const occurrencesName = '.okf-occurrences.json';
const harnesses = orientation.validHarnesses;
const receiptName = '.okf-adapter.json';
const disabledMarker = '.okf-adapter-disabled';
const placeholderTarget = '__OKF_TARGET_DIR__';
const claimsLimit = 256;
const suiteRoot = path.join(__dirname, '..', '..');
const adaptersRoot = path.join(suiteRoot, 'adapters');
const scriptsRoot = path.join(suiteRoot, 'scripts');
const readWrapper = path.join(scriptsRoot, 'okf-read.js');

function substitute(text, targetDir) {
  return text.split(placeholderTarget).join(targetDir);
}

// The installed adapter runs from its own target, so the whole canonical
// scripts tree is copied in: after installation the tag checkout is not a
// runtime dependency of anything the harness executes.
// The listing carries its own completeness: a symlink or an unreadable
// directory truncates the walk, and a truncated copy would fail closed at
// every session start instead of failing the install, so it is not copied.
function copyScriptsTree(destination, resolvedTarget, services, recordFile) {
  const { files, complete } = services.listFiles(scriptsRoot);
  if (!complete) return false;
  for (const file of files) {
    const relative = path.join(destination, path.relative(scriptsRoot, file));
    const targetFile = path.join(resolvedTarget, relative);
    const content = services.readFile(file);
    recordFile(relative);
    services.mkdir(path.dirname(targetFile));
    services.writeFile(targetFile, content);
  }
  return true;
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

  // The receipt is the only record of what install created, so it is written on
  // the failure paths too: uninstall can then remove exactly the residue rather
  // than leaving a partial target that answers NOT_INSTALLED.
  const installedFiles = [];
  const writeReceipt = () => services.writeFile(
    path.join(resolvedTarget, receiptName),
    JSON.stringify({ harness, suite_version: manifest.suite_version, installed_files: installedFiles, disabled: false }),
  );
  const recordFile = (relative) => {
    installedFiles.push(relative);
    writeReceipt();
  };

  writeReceipt();
  for (const entry of manifest.installs) {
    const targetFile = path.join(resolvedTarget, entry.target);
    const content = substitute(services.readFile(path.join(sourceRoot, entry.source)), resolvedTarget);
    recordFile(entry.target);
    services.mkdir(path.dirname(targetFile));
    services.writeFile(targetFile, content);
  }
  const complete = copyScriptsTree(manifest.scripts_tree, resolvedTarget, services, recordFile);
  if (!complete) {
    uninstall(harness, resolvedTarget, services);
    return { ok: false, code: 'INCOMPLETE_SOURCE_TREE' };
  }

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

// The raw bytes travel with the parsed claims because they are the
// compare-and-swap token for the next mutation.
function readLedger(file, services) {
  let text = null;
  try { text = services.readFile(file); } catch { text = null; }
  let claims = {};
  if (text !== null) {
    try {
      const parsed = JSON.parse(text);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) claims = parsed;
    } catch { claims = {}; }
  }
  return { text, claims };
}

// Insertion order is eviction order. Only occurrences that can still recur have
// to be answerable, and deriveKey embeds the context id, so an entry from a
// finished session can never match again.
function bounded(claims) {
  const keys = Object.keys(claims);
  if (keys.length <= claimsLimit) return claims;
  const kept = {};
  for (const key of keys.slice(keys.length - claimsLimit)) kept[key] = claims[key];
  return kept;
}

// publishFile is the suite's compare-and-swap write: `expected` of null means
// the ledger must still be absent.
function publishClaims(file, expected, claims, services) {
  const kept = bounded(claims);
  const text = JSON.stringify(kept);
  services.publishFile(file, text, expected);
  return { text, claims: kept };
}

function finalizeClaim(file, initial, key, record, services) {
  let ledger = initial;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claims = { ...ledger.claims };
    if (record) claims[key] = record;
    else delete claims[key];
    try {
      publishClaims(file, ledger.text, claims, services);
      return;
    } catch (error) {
      if (!error || error.code !== 'TARGET_CHANGED') return;
      ledger = readLedger(file, services);
    }
  }
}

// Claiming an occurrence must not be a lost update: a concurrent hook that won
// the ledger owns the occurrence, and this one becomes a replay of that record.
function preClaim(file, key, services) {
  let ledger = readLedger(file, services);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prior = ledger.claims[key];
    if (prior !== undefined) return { ledger, prior, firstAttempt: false };
    try {
      const published = publishClaims(file, ledger.text, { ...ledger.claims, [key]: { outcome: 'unavailable', reason: null } }, services);
      return { ledger: published, prior: undefined, firstAttempt: true };
    } catch (error) {
      if (!error || error.code !== 'TARGET_CHANGED') {
        return { ledger, prior: { outcome: 'unavailable', reason: null }, firstAttempt: false };
      }
      ledger = readLedger(file, services);
    }
  }
  // Contention this persistent is treated as somebody else's claim rather than
  // risking a second presentation of the same occurrence.
  return { ledger, prior: ledger.claims[key] || { outcome: 'unavailable', reason: null }, firstAttempt: false };
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
  const { ledger, prior, firstAttempt } = file
    ? preClaim(file, key, services)
    : { ledger: { text: null, claims: {} }, prior: undefined, firstAttempt: true };

  const request = {
    protocol: 'okf-wrapper/1', skill: 'okf-read', operation: 'orient', invocation: 'automatic',
    payload: { ...payload, claimed: firstAttempt ? [] : [{ occurrence_key: key, outcome: prior.outcome }] },
  };
  let dispatched = null;
  let response = null;
  try {
    dispatched = childProcess.spawnSync(process.execPath, [readWrapper], { input: JSON.stringify(request), encoding: 'utf8' });
    const parsed = JSON.parse(dispatched.stdout);
    if (parsed !== null && typeof parsed === 'object' && parsed.protocol === 'okf-wrapper/1') response = parsed;
  } catch { response = null; }

  // Exit 0 with nothing parseable on stdout is the deliberate silent seam: no
  // attempt happened, so the claim is released. A non-zero exit is a real
  // failed attempt, whose pre-claim stays so the occurrence is never replayed.
  let record;
  let presented;
  if (response) {
    record = { outcome: claimOutcome(response.result), reason: reasonOf(response) };
    presented = present(response, firstAttempt ? reasonOf(response) : prior.reason);
  } else if (dispatched && !dispatched.error && dispatched.status === 0) {
    record = null;
    presented = null;
  } else {
    presented = present({ result: 'unavailable' }, 'dispatch_failed');
  }

  if (file && firstAttempt && record !== undefined) {
    finalizeClaim(file, ledger, key, record, services);
  }

  return presented;
}

module.exports = { install, disable, uninstall, harnesses, claimAndDispatch };
