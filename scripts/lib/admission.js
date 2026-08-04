/*
 * Admission gate order: REACH -> PRESENCE -> {TRUST, ACCESS}.
 * This slice stops after PRESENCE; TRUST and ACCESS are not implemented.
 *
 * PROVISIONAL (spec section 11 open item): the request payload shape is
 * invented pending the wrapper contract decision.
 * PROVISIONAL (spec section 11 open item): next_gate is invented pending the
 * wrapper contract decision.
 */

const path = require('node:path');
const reach = require('./reach');
const presence = require('./presence');

function invalid() {
  return {
    result: 'blocked',
    data: { candidates: [] },
    findings: [{
      code: 'INVALID',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'data validity' },
    }],
  };
}

function validPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  // An empty path is invalid candidate data: path.resolve('') would silently adopt
  // the wrapper process CWD, which the request does not control.
  if (typeof payload.cwd !== 'string' || payload.cwd === '' || !Array.isArray(payload.candidates)) return false;
  if (payload.workspace_root !== undefined && (typeof payload.workspace_root !== 'string' || payload.workspace_root === '')) return false;
  return payload.candidates.every((entry) => (
    entry !== null && typeof entry === 'object' && !Array.isArray(entry) &&
    typeof entry.path === 'string' &&
    (entry.bundle === undefined || typeof entry.bundle === 'string')
  ));
}

function admit(request, services) {
  const payload = request.payload;
  if (!validPayload(payload)) return invalid();
  const cwd = path.resolve(payload.cwd);
  const workspaceRoot = payload.workspace_root === undefined ? null : path.resolve(payload.workspace_root);
  const context = { cwd, gitRoot: services.gitRootOf(cwd), workspaceRoot };
  const base = workspaceRoot || cwd;

  const candidates = payload.candidates.map((entry) => {
    const candidate = {
      path: path.resolve(base, entry.path),
      declared: entry.declared === true,
      requires_repository: entry.requires_repository === true,
      bundle: entry.bundle === undefined ? '.' : entry.bundle,
      named_by_user: entry.named_by_user === true,
    };
    const reached = reach.evaluate(candidate, context, services);

    if (!reached.passed) {
      return {
        state: 'inactive',
        failed_gate: 'REACH',
        next_gate: null,
        findings: [reached.finding],
      };
    }

    const present = presence.evaluate(candidate, services);
    if (!present.passed) {
      return {
        state: 'inactive',
        failed_gate: 'PRESENCE',
        next_gate: null,
        findings: [present.finding, ...reached.anomalies],
      };
    }

    return {
      state: 'inactive',
      failed_gate: null,
      next_gate: 'TRUST',
      findings: [...reached.anomalies],
    };
  });

  const result = candidates.some((candidate) => candidate.findings.some((finding) => finding.blocks === true))
    ? 'blocked'
    : 'ok';
  return { result, data: { candidates }, findings: [] };
}

module.exports = { admit };
