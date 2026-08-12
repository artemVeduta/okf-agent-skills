const path = require('node:path');
const crypto = require('node:crypto');
const validation = require('./validation');
const admission = require('./admission');
const manifest = require('./manifest');
const routing = require('./routing');
const { inside } = require('./paths');
const lifecycle = require('./lifecycle');
const orientation = require('./orientation');
const setup = require('./setup');
const {
  respond, suiteFinding, writeFailureReason, writeResponse, effectRecords, targetOutsideWorktreeBlocked,
  primaryEffects, derivedEffects,
} = require('./response');

const skills = new Set(['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review', 'okf-setup']);
const navigationResults = new Set(['ok', 'degraded', 'not-configured', 'unavailable']);
const routerOwners = new Map([
  ['enumerate', 'okf-read'], ['search', 'okf-read'], ['read', 'okf-read'], ['validate', 'okf-read'],
  ['orient', 'okf-read'],
  ['create', 'okf-write'], ['revise', 'okf-write'], ['format', 'okf-write'], ['machine-verify', 'okf-write'],
  ['relationship', 'okf-write'], ['sync', 'okf-lifecycle'], ['review', 'okf-review'],
  ['init', 'okf-setup'], ['inspect', 'okf-setup'], ['repair', 'okf-setup'],
  ['plan', 'okf-setup'], ['aggregate', 'okf-setup'], ['report', 'okf-setup'],
  ['discover', 'okf-setup'], ['migration-plan', 'okf-setup'], ['partition', 'okf-setup'],
  ['assemble', 'okf-setup'], ['migration-validate', 'okf-setup'], ['publish', 'okf-setup'],
]);

// `inspect`, `repair`, `plan`, `aggregate`, `report`, `partition`, `assemble`, and
// `publish` all report on or compute around state that exists before or independently
// of the manifest (#197: was the activation marker), so all eight bypass the shared
// activation gate the same way (#133/#138/#135/#136/#146/#147/#149). `discover`
// (#142) and `migration-plan` (#144) deliberately do NOT: unlike those eight, each
// needs a bundle root to already exist -- `discover` to exclude it from the scan,
// `migration-plan` to check a candidate target path for a collision -- and each
// runs as a step of an already-active setup session rather than something that
// inspects or repairs the manifest itself.
// `partition` (#146) needs no bundle root at all: it only groups an already-determined
// plan the caller supplies (or validates a worker's returned shard against the brief
// the caller supplies), never touching the bundle or the filesystem beyond resolving
// `cwd`'s own Git root for the briefs it builds. `assemble` (#147) writes only the
// staging area alongside the bundle, never the bundle itself, so it shares the same
// bypass for the same reason. `migration-validate` (#148) only ever reads that same
// staging area back, never the bundle itself either, so it bypasses for the identical
// reason `assemble` does. `publish` (#149) never touches the bundle directly either --
// every real mutation it causes happens one level down, inside a delegated `okf-write`
// `create` call that runs its own full admission (REACH/TRUST/ACCESS/PRESENCE),
// evidence gate, and write gate exactly as any other caller of that seam would; gating
// `publish` itself a second time at this outer level would only duplicate that check
// with weaker information (no per-concept evidence, no per-concept task kind) than the
// delegated call already has. An automatic caller gets the same silence every other
// operation on an inactive bundle gets; only an explicit call after `init`/`repair`
// have run reaches `discover`/`migration-plan`.
//
// `admit` (#197) joins this set for a different reason than the other eight, and it
// is a decision made on top of #196's resolution, not implied by it -- document it
// here because nothing else names it. Once a valid manifest is required for the
// gate to open, "the gate is open" and "a manifest exists to resolve candidates
// from" became the same fact: `admission.js`'s own candidate-source priority
// (manifest over caller-supplied `payload.candidates`, by design, so a real
// manifest is never silently overridden by a caller) means any repository that
// could reach `admit` past a manifest-mandatory gate would also have its explicit
// candidates replaced by the manifest's own. `admit` is the one operation whose
// entire contract is evaluating the caller's own candidates -- it is the
// inspection primitive at which REACH, PRESENCE, TRUST, ACCESS, and federation
// fallback-on-invalid-manifest are independently observable at all; gating it the
// same way as `read`/`write`/`orient` would leave that code in place but
// unverifiable through any wrapper-level test. The accepted cost: `admit` on a
// manifest-less or invalid-manifest repository still returns real candidate
// evaluation instead of `not-configured`/`invalid configuration`, unlike every
// other explicit call.
const activationBypassOperations = new Set(['inspect', 'repair', 'plan', 'aggregate', 'report', 'partition', 'assemble', 'migration-validate', 'publish', 'admit']);

const forbiddenEffectKeys = ['deprecate', 'move', 'rename', 'rewrite'];

function boundedEffects(operation, payload) {
  const primary = primaryEffects.get(operation);
  if (!primary) return { invalid: true, effects: [] };
  if (payload.effects === undefined) return { effects: [primary] };
  if (!Array.isArray(payload.effects) || payload.effects.length === 0) return { invalid: true, effects: [] };
  const requested = payload.effects;
  const valid = requested.includes(primary) && requested.every((effect) => effect === primary || derivedEffects.has(effect));
  if (!valid || new Set(requested).size !== requested.length) return { invalid: true, effects: requested };
  return { effects: [primary, ...requested.filter((effect) => effect !== primary)] };
}

function scopeFor(request, requireScope) {
  const concept = request.payload.concept;
  const scope = request.scope;
  if (scope === undefined && !requireScope) return { scope: { concepts: [concept] } };
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).length !== 1 ||
    !Array.isArray(scope.concepts) || scope.concepts.length !== 1 || scope.concepts[0] !== concept) return { invalid: true, scope: scope || null };
  return { scope };
}

// #174/#167: write evidence is an observation binding between material the resolution
// actually read and this one mutation, never authored provenance and never a claim of
// semantic relevance. A binding is `{ path, sha256 }`, the path relative to the active
// Git worktree (so a migration source outside the bundle binds too), and the runtime
// checks only what it can observe: the file is a regular readable file whose real path
// is still inside the worktree, and its exact bytes still hash to the accepted digest.
// An empty list is valid everywhere except `machine-verify`: proposal-only evidence
// (a human statement, a non-file tool result) never crosses this seam, so there is no
// self-attested token to check here, only the limit reported in `evidence_limits`.
const DIGEST = /^[0-9a-f]{64}$/;

function malformedBinding(item) {
  return !item || typeof item !== 'object' || Array.isArray(item) ||
    typeof item.path !== 'string' || item.path === '' || path.isAbsolute(item.path) ||
    item.path.split(/[\\/]/).includes('..') ||
    typeof item.sha256 !== 'string' || !DIGEST.test(item.sha256);
}

function readEvidence(payload, operation, activeRoot, services) {
  const entries = payload.evidence === undefined ? [] : payload.evidence;
  if (!Array.isArray(entries)) return { code: 'UNSUPPORTED_INPUT', evidence: [] };
  const evidence = [];
  for (const item of entries) {
    if (malformedBinding(item)) return { code: 'UNSUPPORTED_INPUT', evidence };
    const file = path.resolve(activeRoot, item.path);
    if (!inside(activeRoot, file)) return { code: 'UNSUPPORTED_INPUT', evidence };
    if (validation.escapesBundle(file, activeRoot, services)) return { code: 'SYMLINK_ESCAPE', evidence };
    let bytes;
    try {
      if (!services.isFile(file) || !services.access(file)) return { code: 'EVIDENCE_UNAVAILABLE', evidence };
      bytes = services.readBuffer(file);
    } catch { return { code: 'EVIDENCE_UNAVAILABLE', evidence }; }
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
      return { code: 'EVIDENCE_CHANGED', evidence };
    }
    evidence.push({ path: item.path.split(path.sep).join('/'), sha256: item.sha256 });
  }
  if (operation === 'machine-verify' && evidence.length === 0) return { code: 'EVIDENCE_REQUIRED', evidence };
  return { evidence };
}

function unsupportedPayload(payload, operation) {
  const set = payload.set;
  if (set !== undefined && (set === null || typeof set !== 'object' || Array.isArray(set))) return true;
  if ([payload, set].some((value) => value && forbiddenEffectKeys.some((key) => Object.hasOwn(value, key)))) return true;
  if ([payload, set].some((value) => value && (value.effects === 'link-rewrite' || Array.isArray(value.effects) && value.effects.includes('link-rewrite')))) return true;
  if (['delete', 'status', 'redirect', 'alias', 'purge'].some((key) => Object.hasOwn(payload, key))) return true;
  if (set && (Object.hasOwn(set, 'status') || Object.hasOwn(set, 'stale_after'))) return true;
  if (set && Object.hasOwn(set, 'verified') && operation !== 'machine-verify') return true;
  if (operation === 'machine-verify' && set && Object.hasOwn(set, 'verified')) {
    const events = Array.isArray(set.verified) ? set.verified : [set.verified];
    if (events.some((event) => !event || typeof event !== 'object' || event.kind !== 'machine')) return true;
  }
  return false;
}

function derivativeLine(effect, operation, concept) {
  return effect === 'index-maintenance'
    ? `- [${concept}](${concept})`
    : `- ${operation}: [${concept}](${concept})`;
}

function appendDerivative(effect, operation, bundleRoot, concept, services) {
  const file = path.join(bundleRoot, effect === 'index-maintenance' ? 'index.md' : 'log.md');
  // #151: same realpath re-check the concept writers apply, reused rather than
  // copied, so a symlinked `index.md`/`log.md` cannot walk this append outside
  // the bundle root before any write happens.
  if (validation.escapesBundle(file, bundleRoot, services)) {
    const error = new Error('symlink escape');
    error.code = 'SYMLINK_ESCAPE';
    throw error;
  }
  if (!services.exists(file)) return { written: false };
  const current = services.readFile(file);
  const line = derivativeLine(effect, operation, concept);
  const parsed = current.split('\n', 1)[0].replace(/\r$/, '') === '---'
    ? validation.parseFrontmatter(current)
    : null;
  if (parsed) validation.parseYAML(parsed.frontmatter);
  const body = parsed ? parsed.body : current;
  if (body.split('\n').some((entry) => entry.replace(/\r$/, '') === line)) return { written: false };
  const rendered = `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${line}\n`;
  services.publishFile(file, rendered, current);
  if (parsed) validation.parseYAML(validation.parseFrontmatter(services.readFile(file)).frontmatter);
  return { written: true };
}

function executeBounded(request, services, operation, requireScope = false) {
  const effectsResult = boundedEffects(operation, request.payload);
  const provisionalEffects = effectsResult.effects.length ? effectsResult.effects : [primaryEffects.get(operation)];
  // Every gate below reports the same effects, scope and evidence; only the code,
  // the findings and the result differ. These two closures own the repetition.
  let scope = request.scope || null;
  let evidence = [];
  const refuse = (code, detail, findings = [suiteFinding(code, detail)]) => writeResponse(request, {
    result: 'blocked', effects: effectRecords(provisionalEffects, 'blocked'), evidence, findings, code, scope,
  });
  const settle = (result, findings, extra = {}) => writeResponse(request, {
    result, effects: effectRecords(provisionalEffects, 'notice'), evidence, findings, scope,
    completed: extra.completed, residue: extra.residue,
  });

  if (effectsResult.invalid || unsupportedPayload(request.payload, operation)) {
    return refuse('UNSUPPORTED_INPUT', { gate: 'effects', operation });
  }
  if (!lifecycle.isWritableTaskKind(request.task_kind)) {
    return refuse('TASK_KIND_NOT_WRITE_ELIGIBLE', {
      gate: 'task kind',
      task_kind: request.task_kind === undefined ? null : request.task_kind,
    });
  }
  const scoped = scopeFor(request, requireScope);
  scope = scoped.scope;
  if (scoped.invalid) return refuse('INVALID_SCOPE', { gate: 'scope' });
  const payload = request.payload;
  const bundleRoot = path.resolve(payload.cwd, payload.bundle);
  const activeRoot = services.gitRootOf(path.resolve(payload.cwd));
  const targetRoot = services.gitRootOf(bundleRoot);
  if (!activeRoot || !targetRoot) {
    return refuse('WRITE_OWNERSHIP_UNKNOWN', { gate: 'ownership', reason: 'unknown_or_non_local' });
  }
  if (activeRoot !== targetRoot) return targetOutsideWorktreeBlocked({ ...request, scope: scoped.scope }, provisionalEffects);

  const admitted = admission.admit({ ...request, scope: scoped.scope, payload: {
    ...payload,
    candidates: [{
      path: activeRoot,
      bundle: path.relative(activeRoot, bundleRoot) || '.',
      declared: true,
      named_by_user: true,
      requires_repository: true,
    }],
  } }, services);
  const candidate = admitted.data.candidates && admitted.data.candidates.find((item) => item.state === 'active' && item.bundle_root === bundleRoot);
  if (!candidate) return refuse('BUNDLE_NOT_ADMITTED', null, admitted.findings);
  // #197: `okf_version`/`project_mode` come from the selected manifest bundle
  // record, never from the bundle root's own `index.md` (that file is navigation
  // only now). `admitted.data.manifest` is always the manifest this same request
  // was just gated on -- the activation gate above already required a valid one --
  // so this is a lookup into data `admission.admit` already returned, not a second
  // manifest read.
  const bundleRecord = admitted.data.manifest && admitted.data.manifest.bundles.find((item) => item.alias === candidate.bundle_alias);
  const mode = validation.projectMode(bundleRecord && bundleRecord.project_mode);
  if (!mode) return refuse('PROJECT_MODE_INVALID', { gate: 'project mode' });
  if (mode === 'code-backed' && payload.code_recoverable === true) {
    return refuse('CODE_RECOVERABLE_MATERIAL', { gate: 'project mode' });
  }
  const observed = readEvidence(payload, operation, activeRoot, services);
  evidence = observed.evidence;
  if (observed.code) return refuse(observed.code, { gate: 'evidence' });

  let outcome;
  try {
    const writerRequest = {
      ...request, scope: scoped.scope,
      payload: { ...payload, bundle: bundleRoot, okf_version: bundleRecord && bundleRecord.okf_version },
    };
    outcome = operation === 'create' ? validation.evaluateCreate(writerRequest, services) : validation.evaluate(writerRequest, services);
  } catch (error) {
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: writeFailureReason(error) });
    return settle('failed/incomplete', [finding]);
  }
  if (outcome.result === 'blocked') return refuse(undefined, null, outcome.findings);
  if (outcome.result === 'failed/incomplete') return settle('failed/incomplete', outcome.findings);
  if (!outcome.data.written) return settle('no-op', outcome.findings);
  const completedEffects = new Set();
  try {
    services.publishFile(outcome.data.file, outcome.data.rendered, outcome.data.expected);
    completedEffects.add(primaryEffects.get(operation));
  } catch (error) {
    if (error && error.code === 'TARGET_CHANGED') {
      const finding = suiteFinding('TARGET_CHANGED', { gate: 'target', path: payload.concept, reason: writeFailureReason(error, 'target changed') });
      return refuse('TARGET_CHANGED', null, [...outcome.findings, finding]);
    }
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: writeFailureReason(error) });
    return settle('failed/incomplete', [...outcome.findings, finding], { completed: completedEffects });
  }
  const checked = validation.postWrite(bundleRoot, payload.concept, services, outcome.data.tree);
  if (!checked.valid) {
    return settle('failed/incomplete', [...outcome.findings, ...checked.findings], { completed: completedEffects });
  }
  for (const effect of provisionalEffects.filter((item) => item === 'index-maintenance' || item === 'log-append')) {
    try {
      if (appendDerivative(effect, operation, bundleRoot, payload.concept, services).written) {
        completedEffects.add(effect);
      }
    } catch (error) {
      if (error.code === 'SYMLINK_ESCAPE') {
        const finding = suiteFinding('SYMLINK_ESCAPE', { gate: 'derivative', effect, path: payload.concept });
        return settle('failed/incomplete', [...outcome.findings, ...checked.findings, finding], {
          completed: completedEffects, residue: [{ effect, reason: 'symlink escape' }],
        });
      }
      const reason = writeFailureReason(error, 'derivative write failed');
      const finding = suiteFinding('DERIVATIVE_WRITE_FAILED', { gate: 'derivative', effect, reason });
      return settle('failed/incomplete', [...outcome.findings, ...checked.findings, finding], {
        completed: completedEffects, residue: [{ effect, reason }],
      });
    }
  }
  return settle('applied', [...outcome.findings, ...checked.findings], { completed: completedEffects });
}


// Both routing operations admit first, then route the admitted data. redact() runs
// on the admission half only; routing results carry authorized paths already.
function admitAndRoute(request, services, router) {
  const admitted = admission.admit(request, services);
  const routed = router(admitted.data, request.payload, services);
  return respond(request, routed.result, { ...admission.redact(admitted.data), ...routed.data }, [...admitted.findings, ...routed.findings]);
}

function admitAndNavigate(request, services, router) {
  const admitted = admission.admitRead(request, services);
  const routed = router(admitted.data, request.payload, services);
  const { active, partial } = admission.completeness(admitted);
  const findings = [...routed.findings];
  let data = routed.data;
  let result = navigationResults.has(routed.result) ? routed.result : 'unavailable';
  if (active.length === 0) {
    result = 'unavailable';
    findings.push({
      code: 'unreadable',
      origin: 'suite',
      severity: 'error',
      blocks: false,
      detail: { gate: 'navigation', reason: 'no_admitted_bundle' },
    });
  } else if (partial) {
    result = 'degraded';
    if (data && typeof data === 'object' && Object.hasOwn(data, 'coverage')) {
      data = { ...data, coverage: 'non-exhaustive' };
    }
    findings.push({
      code: 'unreadable',
      origin: 'suite',
      severity: 'error',
      blocks: false,
      detail: { gate: 'navigation', reason: 'admission_incomplete' },
    });
  }
  return respond(request, result, data, findings);
}

function unknownOperation(request) {
  if (request.skill === 'okf-write' || request.skill === 'okf-lifecycle' || request.skill === 'okf' || request.skill === 'okf-setup') {
    return writeResponse(request, { result: 'blocked', code: 'UNKNOWN_OPERATION' });
  }
  return respond(request, 'blocked', { code: 'UNKNOWN_OPERATION' }, []);
}

function automaticMutation(skill, request) {
  return request.invocation === 'automatic' && (
    (skill === 'okf-write' && primaryEffects.has(request.operation)) ||
    (skill === 'okf-lifecycle' && request.operation === 'sync') ||
    (skill === 'okf-setup' && request.operation === 'init') ||
    (skill === 'okf' && (primaryEffects.has(request.operation) || request.operation === 'sync'))
  );
}

function automaticMutationBlocked(request) {
  // Nothing is planned yet at this gate, so the effect is named from the operation.
  // A sync would revise or create; it is reported as a revise. An operation with no
  // primary effect reports none rather than borrowing one.
  const effect = primaryEffects.get(request.operation) ?? (request.operation === 'sync' ? 'concept-revise' : null);
  return writeResponse(request, {
    result: 'blocked',
    effects: effect === null ? [] : effectRecords([effect], 'blocked'),
    findings: [{
      code: 'AUTOMATIC_MUTATION_BLOCKED',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'invocation', reason: 'automatic_mutation' },
    }],
    code: 'AUTOMATIC_MUTATION_BLOCKED',
  });
}

function validateRead(request, services) {
  const payload = request.payload;
  const hasBundle = typeof payload.bundle === 'string' && payload.bundle !== '';

  const admittedRequest = hasBundle
    ? {
      ...request,
      payload: {
        ...payload,
        candidates: [{ path: path.resolve(payload.cwd, payload.bundle), bundle: '.', declared: true, named_by_user: true }],
      },
    }
    : request;
  const admitted = admission.admitRead(admittedRequest, services);
  const requestedRoot = hasBundle ? path.resolve(payload.cwd, payload.bundle) : null;
  const candidate = admitted.data.candidates.find((item) => (
    item.state === 'active' && (requestedRoot === null || item.bundle_root === requestedRoot)
  ));
  if (!candidate) {
    return respond(request, hasBundle ? 'blocked' : admitted.result, admission.redact(admitted.data), admitted.findings);
  }
  const read = validation.validateRead(candidate.bundle_root, services, { today: request.payload.today });
  return respond(request, 'ok', { ...admission.redact(admitted.data), ...read.data }, [...admitted.findings, ...read.findings]);
}

function enumerateRead(request, services) {
  const payload = request.payload;
  const hasBundle = typeof payload.bundle === 'string' && payload.bundle !== '';
  const admittedRequest = hasBundle && payload.candidates === undefined
    ? {
      ...request,
      payload: {
        ...payload,
        candidates: [{ path: path.resolve(payload.cwd, payload.bundle), bundle: '.', declared: true, named_by_user: true }],
      },
    }
    : request;
  return admitAndNavigate(admittedRequest, services, routing.enumerate);
}

function orientRespond(request, services, marker) {
  const outcome = orientation.orient(request, services, marker);
  return outcome === null ? null : respond(request, outcome.result, outcome.data, outcome.findings, { next_action: outcome.next_action });
}

// #197: a valid manifest replaces the valid activation marker as the runtime
// condition below. Same three-state shape the marker gave `run()` --
// 'invalid-input' (unusable `cwd`, handled by the caller's own validation),
// 'absent' (no manifest discoverable from `cwd` up to the Git root -- OKF is
// simply not configured here), or the manifest's own tri-state resolved by
// `manifest.select()`/`validate()`: 'valid', or 'invalid' for anything
// discovered but malformed. An invalid manifest never falls through to
// 'absent': a broken declaration is refused as invalid configuration, not
// silently treated as no configuration at all.
function activationState(request, services) {
  const cwd = request.payload && request.payload.cwd;
  if (typeof cwd !== 'string' || cwd === '') return 'invalid-input';
  const root = services.gitRootOf(cwd);
  if (!root) return 'absent';
  const selected = manifest.select(request.payload, { cwd: path.resolve(cwd), gitRoot: root }, services);
  if (selected.finding) return 'invalid';
  return selected.manifest ? 'valid' : 'absent';
}

function isWriteOperation(skill, request) {
  return (skill === 'okf-write' || skill === 'okf' || skill === 'okf-setup') && primaryEffects.has(request.operation);
}

function routerRun(request, services) {
  const owner = routerOwners.get(request.operation);
  if (!owner) return unknownOperation(request);
  const routed = runActive(owner, { ...request, skill: owner }, services);
  return { ...routed, skill: request.skill };
}

function runActive(skill, request, services) {
  if (skill === 'okf-read') {
    if (request.operation === 'orient') return orientRespond(request, services, 'valid');
    if (request.operation === 'validate') return validateRead(request, services);
    if (request.operation === 'enumerate') return enumerateRead(request, services);
    if (request.operation === 'resolve') return admitAndRoute(request, services, routing.resolve);
    if (request.operation === 'read') return admitAndNavigate(request, services, routing.read);
    if (request.operation === 'search') return admitAndNavigate(request, services, routing.search);
    if (request.operation !== 'admit') return unknownOperation(request);
    const outcome = admission.admit(request, services);
    return respond(request, outcome.result, admission.redact(outcome.data), outcome.findings);
  }
  if (skill === 'okf') return routerRun(request, services);
  if (skill === 'okf-setup') {
    const operation = setup.operations.get(request.operation);
    return operation ? operation(request, services) : unknownOperation(request);
  }
  if (skill === 'okf-review') {
    if (request.operation === 'review') {
      const outcome = validation.evaluateReview(request, services);
      return respond(request, outcome.result, outcome.data, outcome.findings);
    }
    return unknownOperation(request);
  }
  if (skill === 'okf-lifecycle') {
    if (request.operation !== 'sync') return unknownOperation(request);
    const context = { bundle_root: path.resolve(request.payload.cwd, request.payload.bundle) };
    const planned = lifecycle.plan(request, context, services);
    if (planned.result === 'abstained') {
      const scoped = scopeFor(request, true);
      if (scoped.invalid) {
        const finding = suiteFinding('INVALID_SCOPE', { gate: 'scope' });
        return writeResponse(request, {
          result: 'blocked',
          effects: effectRecords([primaryEffects.get(planned.operation)], 'blocked'),
          findings: [finding],
          code: 'INVALID_SCOPE',
          scope: scoped.scope,
        });
      }
      return writeResponse(request, {
        result: 'abstained',
        effects: effectRecords([primaryEffects.get(planned.operation)], 'allowed'),
        scope: scoped.scope,
      });
    }
    return executeBounded(request, services, planned.operation, true);
  }
  if (!primaryEffects.has(request.operation)) return unknownOperation(request);
  return executeBounded(request, services, request.operation);
}

function run(skill, request, services) {
  if (!skills.has(skill)) return respond(request, 'blocked', { code: 'UNKNOWN_SKILL' }, []);

  // `inspect` and `repair` report and fix the manifest itself (#197: was the
  // activation marker), `plan` and `aggregate` plan and report around a workspace
  // that may not have one yet, and `report` only classifies caller-supplied
  // migration signals, so all five run ahead of the shared activation gate below
  // rather than being gated behind it, whether reached directly through
  // `okf-setup` or through the `okf` router; an automatic caller still gets
  // silence, matching every other operation's automatic behavior when OKF is not
  // yet active here (#138/#135/#136).
  if (activationBypassOperations.has(request.operation)) {
    if (skill === 'okf-setup') {
      if (request.invocation === 'automatic') return null;
      return runActive(skill, request, services);
    }
    if (skill === 'okf') {
      if (request.invocation === 'automatic') return null;
      return routerRun(request, services);
    }
    // `admit` (#197, see the bypass set's own comment above) is the one bypass
    // operation reached through `okf-read` rather than `okf-setup`/`okf` -- it is
    // not in `routerOwners`, so the generic router does not carry it at all.
    if (skill === 'okf-read') {
      if (request.invocation === 'automatic') return null;
      return runActive(skill, request, services);
    }
  }

  const activation = activationState(request, services);
  if (activation === 'absent') {
    if (request.invocation === 'automatic') return null;
    // The pre-manifest bootstrap exception (#166/#173, kept by #196/#197): an
    // explicit `init` may run while the manifest is *absent* (#197: was the
    // activation marker), because there is no bundle yet for a manifest to
    // declare active. The documented order is now
    // `inspect -> consent -> repair manifest -> init -> discover` (#196), which
    // writes the manifest before `init` ever runs, so a normal run no longer
    // needs this exception to reach `init` at all -- it stays so an explicit
    // `init` still works standalone on a repository that holds nothing but a
    // Git root, the explicit pre-manifest setup path #196 keeps alongside the
    // documented order (`test/issue-173.test.js`). It is narrower than the
    // bypass set above: an invalid manifest still blocks below, `init` still
    // creates only the bundle root, and the manifest still gets written by a
    // separate explicit `repair`.
    // A Git repository is still the precondition every operation shares: outside one,
    // `init` keeps answering `not-configured` rather than reaching ownership.
    if (request.operation === 'init' && (skill === 'okf-setup' || skill === 'okf') &&
      services.gitRootOf(request.payload.cwd)) {
      return skill === 'okf' ? routerRun(request, services) : runActive(skill, request, services);
    }
    if (request.operation === 'orient') return orientRespond(request, services, 'absent');
    if (request.operation === 'read' || request.operation === 'search') {
      return respond(request, 'not-configured', routing.notConfiguredData(request.operation), []);
    }
    return respond(request, 'not-configured', {}, []);
  }
  if (activation === 'invalid-input') return runActive(skill, request, services);
  if (activation !== 'valid') {
    if (request.operation === 'orient') return orientRespond(request, services, 'invalid');
    if (request.operation === 'read' || request.operation === 'search') {
      return respond(request, 'unavailable', routing.notConfiguredData(request.operation), [{
        code: 'unreadable',
        origin: 'suite',
        severity: 'error',
        blocks: false,
        detail: { gate: 'activation', reason: 'manifest_invalid' },
      }]);
    }
    if (isWriteOperation(skill, request)) {
      const effect = primaryEffects.get(request.operation);
      return writeResponse(request, {
        result: 'blocked',
        effects: effectRecords([effect], 'blocked'),
        findings: [{
          code: 'MANIFEST_INVALID',
          origin: 'suite',
          severity: 'error',
          blocks: true,
          detail: { gate: 'activation', reason: 'manifest_invalid' },
        }],
        code: 'MANIFEST_INVALID',
      });
    }
    return respond(request, 'blocked', { code: 'MANIFEST_INVALID' }, [{
      code: 'MANIFEST_INVALID',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'activation', reason: 'manifest_invalid' },
    }]);
  }
  if (automaticMutation(skill, request)) return automaticMutationBlocked(request);
  return runActive(skill, request, services);
}

module.exports = { run, respond, routerOwners, primaryEffects, derivedEffects };
