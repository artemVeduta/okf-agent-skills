/*
 * Admission gate order: REACH -> PRESENCE -> {TRUST, ACCESS}.
 * PROVISIONAL (spec section 11 open item): manifest grammar, path bases,
 * workspace selection, trust storage, and INVALID gate assignment remain
 * provisional where the specification leaves them open.
 */

const path = require('node:path');
const reach = require('./reach');
const presence = require('./presence');
const manifest = require('./manifest');
const trust = require('./trust');

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
  if (typeof payload.cwd !== 'string' || payload.cwd === '') return false;
  if (payload.workspace_root !== undefined && (typeof payload.workspace_root !== 'string' || payload.workspace_root === '')) return false;
  // A manifest supplies the candidates instead, so the field is optional.
  if (payload.candidates === undefined) return true;
  if (!Array.isArray(payload.candidates)) return false;
  return payload.candidates.every((entry) => (
    entry !== null && typeof entry === 'object' && !Array.isArray(entry) &&
    typeof entry.path === 'string' &&
    (entry.bundle === undefined || typeof entry.bundle === 'string')
  ));
}

function makeCandidate(entry, base) {
  const bundle = entry.bundle === undefined ? '.' : entry.bundle;
  return {
    path: path.resolve(base, entry.path),
    declared: entry.declared === true,
    requires_repository: entry.requires_repository === true,
    bundle,
    named_by_user: entry.named_by_user === true,
    bundle_alias: entry.bundle_alias === undefined ? bundle : entry.bundle_alias,
    bundle_root: path.resolve(base, entry.path, bundle),
    owner: entry.owner,
    mode: entry.mode || 'source',
    required: entry.required === true,
  };
}

function evaluate(entries, context, services, allowMissingIndex) {
  return entries.map((entry) => {
    const candidate = makeCandidate(entry, context.workspaceRoot || context.cwd);
    const reached = reach.evaluate(candidate, context, services);
    // Path-derived fields stay on the candidate because read and write routing need
    // them. redact() removes them at the response boundary, so a path the user did not
    // name is never serialized.
    const record = (failed_gate, findings) => ({
      bundle_alias: candidate.bundle_alias,
      bundle_root: candidate.bundle_root,
      owner: candidate.owner,
      named_by_user: candidate.named_by_user,
      mode: candidate.mode,
      required: candidate.required,
      state: failed_gate === null ? 'active' : 'inactive',
      failed_gate,
      next_gate: null,
      findings,
    });
    if (!reached.passed) return record('REACH', [reached.finding]);
    const accessible = services.access(candidate.bundle_root);
    // An existing bundle root the harness cannot read cannot be inspected. ACCESS owns
    // that failure, so PRESENCE must not relabel it BUNDLE_MISSING and short-circuit the
    // joint TRUST/ACCESS report the specification requires.
    const inspectable = accessible || !services.exists(candidate.bundle_root);
    if (inspectable) {
      const present = presence.evaluate(candidate, services, allowMissingIndex ? { allowMissingIndex: true } : undefined);
      if (!present.passed) return record('PRESENCE', [present.finding, ...reached.anomalies]);
    }
    // PROVISIONAL (spec section 11 open item): the workspace-root trust sidecar is undecided, so the workspace-root bundle is reported untrusted rather than granted implicit trust.
    // Trust attaches to a repository instance, not to a path, so every candidate the
    // current repository owns inherits its implicit trust. A candidate owned by any
    // other repository, or by none, does not.
    const owningRoot = candidate.owner === undefined ? services.gitRootOf(candidate.path) : candidate.owner;
    const implicit = context.gitRoot !== null && owningRoot === context.gitRoot;
    const trusted = implicit || trust.trusted(candidate.path, services);
    const findings = [...reached.anomalies];
    if (!trusted) findings.push(reach.gateFinding('UNTRUSTED', 'TRUST', candidate));
    if (!accessible) findings.push(reach.gateFinding('ACCESS_DENIED', 'ACCESS', candidate));
    return record(!trusted ? 'TRUST' : (!accessible ? 'ACCESS' : null), findings);
  });
}

// A manifest bundle is admitted as a candidate rooted at its owning repository, so
// REACH and PRESENCE see the same shape they see for a directly supplied candidate.
function bundleEntries(workspace, root) {
  const repositories = new Map(workspace.repositories.map((repo) => [repo.name, repo]));
  return workspace.bundles.map((bundle) => {
    const owner = bundle.owner === null ? null : repositories.get(bundle.owner);
    const ownerRoot = owner ? path.resolve(root, owner.path) : root;
    return {
      path: ownerRoot,
      // path.relative collapses a no-owner '.' to '', so the branches are not equivalent.
      bundle: owner ? path.relative(ownerRoot, path.resolve(ownerRoot, bundle.root)) : bundle.root,
      bundle_alias: bundle.alias,
      owner: owner ? ownerRoot : null,
      mode: bundle.mode,
      required: bundle.required,
      declared: true,
      requires_repository: Boolean(owner),
    };
  });
}

function admitInternal(request, services, allowMissingIndex) {
  const payload = request.payload;
  if (!validPayload(payload)) return invalid();
  const cwd = path.resolve(payload.cwd);
  const gitRoot = services.gitRootOf(cwd);
  const selected = manifest.select(payload, { cwd, gitRoot }, services);
  // A manifest root overrides an explicitly supplied workspace root.
  const context = { cwd, gitRoot, workspaceRoot: selected.root || (payload.workspace_root === undefined ? null : path.resolve(payload.workspace_root)) };
  const entries = selected.manifest ? bundleEntries(selected.manifest, selected.root) : (payload.candidates || []);
  const candidates = evaluate(entries, context, services, allowMissingIndex);
  const findings = selected.finding ? [selected.finding] : [];
  const degraded = candidates.some((x) => x.required && x.state !== 'active');
  const federation = selected.finding ? 'rejected' : (selected.manifest ? 'accepted' : 'none');
  const data = selected.manifest
    ? { federation, manifest: selected.manifest, current_repository: gitRoot, candidates, workspace_health: degraded ? 'degraded' : 'healthy', coverage: degraded ? 'non-exhaustive' : 'complete' }
    : { federation, candidates };
  if (selected.finding) data.federation_finding = selected.finding;
  const blocked = [...findings, ...candidates.flatMap((x) => x.findings)].some((f) => f.blocks);
  return { result: blocked ? 'blocked' : 'ok', data, findings };
}

function admit(request, services) {
  return admitInternal(request, services, false);
}

function admitRead(request, services) {
  return admitInternal(request, services, true);
}

// `init` may create a bundle root that does not exist on disk yet, so PRESENCE
// (which requires an existing `index.md`) does not apply, and ACCESS is checked
// against the nearest existing ancestor rather than the bundle root itself.
function nearestExisting(dir, services) {
  let current = dir;
  for (;;) {
    if (services.exists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

function evaluateForInit(entries, context, services) {
  return entries.map((entry) => {
    const candidate = makeCandidate(entry, context.workspaceRoot || context.cwd);
    const reached = reach.evaluate(candidate, context, services);
    const record = (failed_gate, findings) => ({
      bundle_alias: candidate.bundle_alias,
      bundle_root: candidate.bundle_root,
      owner: candidate.owner,
      named_by_user: candidate.named_by_user,
      mode: candidate.mode,
      required: candidate.required,
      state: failed_gate === null ? 'active' : 'inactive',
      failed_gate,
      next_gate: null,
      findings,
    });
    if (!reached.passed) return record('REACH', [reached.finding]);
    const accessible = services.access(nearestExisting(candidate.bundle_root, services));
    const owningRoot = candidate.owner === undefined ? services.gitRootOf(candidate.path) : candidate.owner;
    const implicit = context.gitRoot !== null && owningRoot === context.gitRoot;
    const trusted = implicit || trust.trusted(candidate.path, services);
    const findings = [...reached.anomalies];
    if (!trusted) findings.push(reach.gateFinding('UNTRUSTED', 'TRUST', candidate));
    if (!accessible) findings.push(reach.gateFinding('ACCESS_DENIED', 'ACCESS', candidate));
    return record(!trusted ? 'TRUST' : (!accessible ? 'ACCESS' : null), findings);
  });
}

function admitInit(request, services) {
  const payload = request.payload;
  if (!validPayload(payload)) return invalid();
  const cwd = path.resolve(payload.cwd);
  const gitRoot = services.gitRootOf(cwd);
  const context = { cwd, gitRoot, workspaceRoot: payload.workspace_root === undefined ? null : path.resolve(payload.workspace_root) };
  const candidates = evaluateForInit(payload.candidates || [], context, services);
  const blocked = candidates.flatMap((x) => x.findings).some((f) => f.blocks);
  return { result: blocked ? 'blocked' : 'ok', data: { federation: 'none', candidates }, findings: [] };
}

// Shared by orient and navigation: an empty active set means nothing to work
// with; a required member missing, non-exhaustive coverage, or a blocking
// finding on an active candidate makes the result partial even when
// something did admit. Takes the admitted response itself, so every caller
// stops repeating the same candidates-array guard.
function completeness(admitted) {
  const candidates = Array.isArray(admitted.data.candidates) ? admitted.data.candidates : [];
  const active = candidates.filter((candidate) => candidate.state === 'active');
  const partial = admitted.findings.length > 0 || admitted.data.coverage === 'non-exhaustive' || candidates.some((candidate) => (
    (candidate.required === true && candidate.state !== 'active') ||
    (candidate.state === 'active' && Array.isArray(candidate.findings) && candidate.findings.some((finding) => finding.blocks))
  ));
  return { active, partial };
}

// Candidate records may hold a path the user never named. Only a named path is echoed
// back here. Routing results carry paths of admitted bundles only, which are authorized
// by construction, so they need no redaction.
function redact(data) {
  if (!data || !Array.isArray(data.candidates)) return data;
  return {
    ...data,
    candidates: data.candidates.map(({ bundle_root, owner, named_by_user, ...rest }) => (
      named_by_user === true ? { ...rest, bundle_root, owner } : rest
    )),
  };
}

module.exports = { admit, admitRead, admitInit, redact, completeness };
