/*
 * The orientation seam table (which logical causes orient, which are silent
 * lifecycle-only no-ops, and which are unsupported for a harness) lives here
 * as the single source of truth for both the runtime and the adapter manifests.
 */

const path = require('node:path');
const admission = require('./admission');

const suiteVersion = '0.1.0';
const validHarnesses = new Set(['claude-code', 'codex', 'opencode']);
const validClaimOutcomes = new Set(['delivered', 'failed', 'unavailable']);

const seamTable = {
  'claude-code': {
    orient: new Set(['startup', 'resume', 'clear', 'compact', 'fork']),
    silent: new Set(['pre-compact', 'post-compact', 'session-end', 'prompt']),
  },
  codex: {
    orient: new Set(['startup', 'resume', 'clear', 'compact', 'subagent-start']),
    silent: new Set(['pre-compact', 'post-compact', 'session-end', 'prompt']),
  },
  opencode: {
    orient: new Set(['system-transform']),
    silent: new Set(['session-created', 'session-compacted', 'pre-compact', 'post-compact', 'session-end', 'prompt']),
  },
};

function orientationFinding(code, reason, blocks, extra = {}) {
  return { code, origin: 'suite', severity: 'error', blocks, detail: { gate: 'orientation', reason, ...extra } };
}

function orientationData(activation, bundle, rootIndexPath, workspaceHealth, occurrenceKey) {
  return { activation, bundle, root_index_path: rootIndexPath, workspace_health: workspaceHealth, occurrence_key: occurrenceKey };
}

// The four evidence fields collapse to null together whenever a result carries
// no clean evidence, which is most non-clean outcomes below.
function noEvidence(activation, key) {
  return orientationData(activation, null, null, null, key);
}

function outcome(result, data, findings) {
  return { result, data, findings, next_action: result === 'clean' ? 'Read the root index to begin navigation.' : null };
}

// The occurrence key is derived from adapter-supplied fields only; nothing here
// stores it. A harness outside the fixed enum, or a cwd outside any repository,
// cannot form a trustworthy identity, so the key is null in either case. Fields
// are JSON-array-encoded, not concatenated, so no field boundary is ambiguous.
function deriveKey(payload, services) {
  if (!validHarnesses.has(payload.harness)) return null;
  const repositoryInstance = services.gitRootOf(payload.cwd);
  if (!repositoryInstance) return null;
  const nativeEventId = payload.native_event_id === undefined ? '' : payload.native_event_id;
  return JSON.stringify([payload.harness, repositoryInstance, payload.context_id, payload.logical_cause, nativeEventId]);
}

function validClaimed(claimed) {
  return Array.isArray(claimed) && claimed.every((entry) => (
    entry !== null && typeof entry === 'object' && !Array.isArray(entry) &&
    typeof entry.occurrence_key === 'string' && entry.occurrence_key !== '' &&
    validClaimOutcomes.has(entry.outcome)
  ));
}

function invalidPayloadReason(payload) {
  if (!validHarnesses.has(payload.harness)) return 'unknown_harness';
  if (payload.suite_version !== undefined && payload.suite_version !== suiteVersion) return 'suite_version_mismatch';
  if (payload.claimed !== undefined && !validClaimed(payload.claimed)) return 'malformed_claimed';
  return null;
}

function matchedClaim(claimed, key) {
  if (!Array.isArray(claimed) || key === null) return null;
  const match = claimed.find((entry) => entry.occurrence_key === key);
  return match ? match.outcome : null;
}

function classifySeam(harness, cause) {
  const table = seamTable[harness];
  if (!table) return 'unsupported';
  if (table.orient.has(cause)) return 'orient';
  if (table.silent.has(cause)) return 'silent';
  return 'unsupported';
}

// Admission's own workspace_health ('healthy'/'degraded') is only present when
// a workspace manifest was selected; otherwise this repository's own
// completeness stands in for it, in the same vocabulary.
function workspaceHealthOf(admitted, partial) {
  return typeof admitted.data.workspace_health === 'string' ? admitted.data.workspace_health : (partial ? 'degraded' : 'healthy');
}

// Reuses admission.admitRead (no second admission path) against one seeded
// candidate rooted at the current repository. A workspace manifest, if active,
// overrides that seed with its own federated candidates.
function computeFromAdmission(request, services, key) {
  const cwd = request.payload.cwd;
  const activeRoot = services.gitRootOf(cwd);
  const admittedRequest = {
    ...request,
    payload: { cwd, candidates: [{ path: activeRoot, bundle: '.', declared: true, named_by_user: true, requires_repository: true }] },
  };
  const admitted = admission.admitRead(admittedRequest, services);
  const { active, partial } = admission.completeness(admitted);
  if (active.length === 0) {
    return outcome('unavailable', noEvidence('active', key), [orientationFinding('unreadable', 'no_admitted_bundle', true)]);
  }
  if (partial) {
    return outcome('degraded', orientationData('active', null, null, workspaceHealthOf(admitted, partial), key), [orientationFinding('unreadable', 'admission_incomplete', false), ...admitted.findings]);
  }
  const candidate = active[0];
  const indexFile = path.join(candidate.bundle_root, 'index.md');
  if (!services.exists(indexFile) || !services.access(indexFile)) {
    return outcome('unavailable', noEvidence('active', key), [orientationFinding('unreadable', 'root_index_unreadable', true)]);
  }
  return outcome('clean', orientationData('active', { bundle_alias: candidate.bundle_alias, bundle_root: candidate.bundle_root }, 'index.md', workspaceHealthOf(admitted, partial), key), []);
}

// `marker` is the activation state the caller already computed: 'absent',
// 'invalid' (malformed marker file), or 'valid'.
function orient(request, services, marker) {
  const payload = request.payload;
  const key = deriveKey(payload, services);
  if (marker === 'absent') {
    return outcome('not-configured', noEvidence('absent', key), [orientationFinding('unreadable', 'marker_absent', false)]);
  }
  if (marker !== 'valid') {
    return outcome('invalid', noEvidence('invalid', key), [orientationFinding('invalid', 'marker_invalid', true)]);
  }

  const reason = invalidPayloadReason(payload);
  if (reason) {
    return outcome('invalid', noEvidence('active', key), [orientationFinding('invalid', reason, true)]);
  }

  const claim = matchedClaim(payload.claimed, key);
  if (claim === 'delivered') return null;
  if (claim === 'failed' || claim === 'unavailable') {
    return outcome('failed', noEvidence('active', key), [orientationFinding('unreadable', 'claimed_attempt_failed', true, { outcome: claim })]);
  }

  const seam = classifySeam(payload.harness, payload.logical_cause);
  if (seam === 'silent') return null;
  if (seam === 'unsupported') {
    return outcome('degraded', noEvidence('active', key), [orientationFinding('unreadable', 'unsupported_seam', false, { harness: payload.harness, logical_cause: payload.logical_cause })]);
  }

  return computeFromAdmission(request, services, key);
}

module.exports = { suiteVersion, seamTable, orient, deriveKey };
