/*
 * At-most-once orientation claim cycle every harness adapter shares.
 * Dispatch is a child-process run of the sibling okf-read wrapper, the one
 * contract seam. The invariants a reader cannot get from the code:
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
const claimsLimit = 256;
const scriptsRoot = path.join(__dirname, '..');
const readWrapper = path.join(scriptsRoot, 'okf-read.js');

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

function bounded(claims) {
  const keys = Object.keys(claims);
  if (keys.length <= claimsLimit) return claims;
  const kept = {};
  for (const key of keys.slice(keys.length - claimsLimit)) kept[key] = claims[key];
  return kept;
}

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
  return { ledger, prior: ledger.claims[key] || { outcome: 'unavailable', reason: null }, firstAttempt: false };
}

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

module.exports = { harnesses, claimAndDispatch };
