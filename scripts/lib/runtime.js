const path = require('node:path');
const crypto = require('node:crypto');
const validation = require('./validation');
const admission = require('./admission');
const manifest = require('./manifest');
const monorepo = require('./monorepo');
const routing = require('./routing');
const lifecycle = require('./lifecycle');
const orientation = require('./orientation');

const skills = new Set(['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review', 'okf-setup']);
const navigationResults = new Set(['ok', 'degraded', 'not-configured', 'unavailable']);
const routerOwners = new Map([
  ['enumerate', 'okf-read'], ['search', 'okf-read'], ['read', 'okf-read'], ['validate', 'okf-read'],
  ['orient', 'okf-read'],
  ['create', 'okf-write'], ['revise', 'okf-write'], ['format', 'okf-write'], ['machine-verify', 'okf-write'],
  ['relationship', 'okf-write'], ['sync', 'okf-lifecycle'], ['review', 'okf-review'],
  ['init', 'okf-setup'], ['inspect', 'okf-setup'], ['repair', 'okf-setup'],
  ['plan', 'okf-setup'], ['aggregate', 'okf-setup'],
]);

// `inspect`, `repair`, `plan` and `aggregate` all report on or plan around state that
// exists before or independently of the activation marker, so all four bypass the
// shared activation gate the same way (#133/#138/#135).
const activationBypassOperations = new Set(['inspect', 'repair', 'plan', 'aggregate']);

const primaryEffects = new Map([
  ['create', 'concept-create'], ['revise', 'concept-revise'], ['format', 'format'],
  ['relationship', 'relationship'], ['machine-verify', 'machine-verify'], ['init', 'init'],
]);
const derivedEffects = new Set(['index-maintenance', 'log-append']);
const forbiddenEffectKeys = ['deprecate', 'move', 'rename', 'rewrite'];
const writeLimits = { writes: 'not serialized', crash_recovery: 'not provided' };

function respond(request, result, data, findings, options = {}) {
  return {
    protocol: 'okf-wrapper/1',
    skill: request.skill,
    operation: request.operation,
    result,
    scope: options.scope === undefined ? request.scope || null : options.scope,
    evidence_limits: options.evidence_limits === undefined ? null : options.evidence_limits,
    data,
    findings,
    next_action: options.next_action === undefined ? null : options.next_action,
  };
}

function suiteFinding(code, detail) {
  return { code, origin: 'suite', severity: 'error', blocks: true, detail };
}

// A write result determines its own authorization and validation state, so callers
// name the result only and cannot desynchronise the trio.
const authorizationByResult = new Map([
  ['blocked', 'blocked'], ['abstained', 'allowed'], ['applied', 'notice'],
  ['no-op', 'notice'], ['failed/incomplete', 'notice'],
]);
const validationByResult = new Map([
  ['blocked', 'not-run'], ['abstained', 'not-run'], ['applied', 'valid'],
  ['no-op', 'not-needed'], ['failed/incomplete', 'failed'],
]);

function writeResponse(request, options) {
  const {
    result, effects = [], evidence = [], findings = [], code,
    scope = request.scope || null, completed: completedEffects = [], residue = [],
  } = options;
  const completed = new Set(completedEffects);
  const data = {
    authorization: authorizationByResult.get(result),
    effects,
    task_kind: request.task_kind === undefined ? null : request.task_kind,
    actual_effects: effectRecords(effects.filter(({ effect }) => completed.has(effect)).map(({ effect }) => effect), 'notice'),
    residue,
    evidence,
    validation: validationByResult.get(result),
  };
  if (code !== undefined) data.code = code;
  const nextAction = result === 'applied' || result === 'no-op' ? null : 'Correct the reported gate and submit one bounded request.';
  return respond(request, result, data, findings, { scope, evidence_limits: writeLimits, next_action: nextAction });
}

function effectRecords(effects, authorization) {
  return effects.map((effect, index) => ({ effect, authorization, inherited: index > 0 }));
}

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

// `init` is never combinable with a derived effect: an explicit `effects` array is
// valid only when it names exactly `['init']`.
function initEffects(payload) {
  if (payload.effects === undefined) return { effects: ['init'] };
  if (Array.isArray(payload.effects) && payload.effects.length === 1 && payload.effects[0] === 'init') {
    return { effects: ['init'] };
  }
  return { invalid: true, effects: Array.isArray(payload.effects) ? payload.effects : [] };
}

function scopeFor(request, requireScope) {
  const concept = request.payload.concept;
  const scope = request.scope;
  if (scope === undefined && !requireScope) return { scope: { concepts: [concept] } };
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).length !== 1 ||
    !Array.isArray(scope.concepts) || scope.concepts.length !== 1 || scope.concepts[0] !== concept) return { invalid: true, scope: scope || null };
  return { scope };
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function readEvidence(payload, operation, bundleRoot, services) {
  const required = ['create', 'revise', 'relationship', 'machine-verify'].includes(operation);
  if (!required) return { evidence: [] };
  if (!Array.isArray(payload.evidence) || payload.evidence.length === 0 || payload.evidence.some((item) => typeof item !== 'string' || item === '')) return { invalid: true, evidence: [] };
  const evidence = [];
  for (const relative of payload.evidence) {
    const file = path.resolve(bundleRoot, relative);
    if (!inside(bundleRoot, file)) return { invalid: true, evidence };
    try { services.readFile(file); } catch { return { unavailable: true, evidence }; }
    evidence.push(relative.split(path.sep).join('/'));
  }
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
  const mode = validation.projectMode(bundleRoot, services);
  if (!mode) return refuse('PROJECT_MODE_INVALID', { gate: 'project mode' });
  if (mode === 'code-backed' && payload.code_recoverable === true) {
    return refuse('CODE_RECOVERABLE_MATERIAL', { gate: 'project mode' });
  }
  const observed = readEvidence(payload, operation, bundleRoot, services);
  evidence = observed.evidence;
  if (observed.invalid || observed.unavailable) {
    return refuse(observed.unavailable ? 'EVIDENCE_UNAVAILABLE' : 'EVIDENCE_REQUIRED', { gate: 'evidence' });
  }

  let outcome;
  try {
    const writerRequest = { ...request, scope: scoped.scope, payload: { ...payload, bundle: bundleRoot } };
    outcome = operation === 'create' ? validation.evaluateCreate(writerRequest, services) : validation.evaluate(writerRequest, services);
  } catch (error) {
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: error.message || 'write failed' });
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
      const finding = suiteFinding('TARGET_CHANGED', { gate: 'target', path: payload.concept, reason: error.message });
      return refuse('TARGET_CHANGED', null, [...outcome.findings, finding]);
    }
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: error.message || 'write failed' });
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
      const reason = error.message || 'derivative write failed';
      const finding = suiteFinding('DERIVATIVE_WRITE_FAILED', { gate: 'derivative', effect, reason });
      return settle('failed/incomplete', [...outcome.findings, ...checked.findings, finding], {
        completed: completedEffects, residue: [{ effect, reason }],
      });
    }
  }
  return settle('applied', [...outcome.findings, ...checked.findings], { completed: completedEffects });
}

// `init` bootstraps the bundle root itself, so it cannot go through `executeBounded`:
// there is no bundle-root precondition to check yet, no evidence to cite, and no
// concept scope. Per #133/#134 it owns a slimmer admission of its own — ownership,
// REACH, TRUST, ACCESS and the activation-marker gate (run by `run()` before this is
// reached) — skipping PRESENCE (no bundle to find yet) and the evidence gate.
function executeInit(request, services) {
  const payload = request.payload;
  const effectsResult = initEffects(payload);
  const provisionalEffects = effectsResult.effects.length ? effectsResult.effects : ['init'];
  const scope = request.scope || null;
  const refuse = (code, detail, findings = [suiteFinding(code, detail)]) => writeResponse(request, {
    result: 'blocked', effects: effectRecords(provisionalEffects, 'blocked'), evidence: [], findings, code, scope,
  });
  const settle = (result, findings, extra = {}) => writeResponse(request, {
    result, effects: effectRecords(provisionalEffects, 'notice'), evidence: [], findings, scope,
    completed: extra.completed, residue: extra.residue,
  });

  if (effectsResult.invalid) return refuse('UNSUPPORTED_INPUT', { gate: 'effects', operation: 'init' });
  if (payload.project_mode !== undefined && payload.project_mode !== 'code-backed' && payload.project_mode !== 'knowledge-only') {
    return refuse('UNSUPPORTED_INPUT', { gate: 'project mode', operation: 'init' });
  }
  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return refuse('UNSUPPORTED_INPUT', { gate: 'bundle', operation: 'init' });
  }

  const bundleRoot = path.resolve(payload.cwd, bundleName);
  const activeRoot = services.gitRootOf(path.resolve(payload.cwd));
  const targetRoot = services.gitRootOf(bundleRoot);
  if (!activeRoot || !targetRoot) {
    return refuse('WRITE_OWNERSHIP_UNKNOWN', { gate: 'ownership', reason: 'unknown_or_non_local' });
  }
  if (activeRoot !== targetRoot) return targetOutsideWorktreeBlocked({ ...request, scope }, provisionalEffects);

  const admitted = admission.admitInit({ ...request, payload: {
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

  let outcome;
  try {
    outcome = validation.evaluateInit({ ...request, payload: { ...payload, bundle: bundleRoot } }, services);
  } catch (error) {
    return settle('failed/incomplete', [suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: error.message || 'write failed' })]);
  }
  if (outcome.result === 'blocked') return refuse(undefined, null, outcome.findings);
  if (outcome.result === 'failed/incomplete') return settle('failed/incomplete', outcome.findings);
  if (!outcome.data.written) return settle('no-op', outcome.findings);

  const completedEffects = new Set();
  try {
    services.mkdir(bundleRoot);
    services.publishFile(outcome.data.file, outcome.data.rendered, outcome.data.expected);
    completedEffects.add('init');
  } catch (error) {
    if (error && error.code === 'TARGET_CHANGED') {
      const finding = suiteFinding('TARGET_CHANGED', { gate: 'target', path: 'index.md', reason: error.message });
      return refuse('TARGET_CHANGED', null, [...outcome.findings, finding]);
    }
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: error.message || 'write failed' });
    return settle('failed/incomplete', [...outcome.findings, finding], { completed: completedEffects });
  }

  const checked = validation.postWriteInit(bundleRoot, services, outcome.data.tree);
  if (!checked.valid) {
    return settle('failed/incomplete', [...outcome.findings, ...checked.findings], { completed: completedEffects });
  }
  return settle('applied', [...outcome.findings, ...checked.findings], { completed: completedEffects });
}

// `/setup`'s deterministic state report for the three config files (#133/#138).
// Read-only: it never writes, and it runs even when the activation marker itself is
// what is being inspected, so `run()` reaches this directly rather than gating it
// behind the very marker it reports on. `okf-setup`'s procedure owns the consent
// prompts and the "fix all?" interaction; this function only reports state.
const repairTargets = new Set(['activation', 'manifest']);

function executeInspect(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const bundleRoot = path.resolve(payload.cwd, bundleName);

  const marker = services.activationMarker(gitRoot);
  const activation = marker === 'valid' ? { state: 'ok' }
    : marker === 'absent' ? { state: 'missing' }
      : { state: 'invalid', reason: 'not_zero_byte_regular_file' };

  return respond(request, 'ok', {
    index_md: validation.inspectIndex(bundleRoot, services),
    activation,
    manifest: manifest.inspect(path.join(gitRoot, '.okf-workspace.json'), gitRoot, services),
  }, []);
}

// `/setup`'s approved-repair executor for the two plain-filesystem config files
// (#133/#138). `.okf-active` and `.okf-workspace.json` are not OKF operations through
// the write gate — no REACH/TRUST/ACCESS admission, no evidence, no atomic publish,
// no `effects` vocabulary — they are exactly the plain filesystem actions #133 named.
// `index.md` repair is not here at all: it goes through `init`. Consent lives in
// `okf-setup`'s procedure, not here — reaching this function is itself the approval.
// Idempotent like `init`: a target already in state `ok` is always left untouched.
function executeRepair(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const targets = payload.targets;
  const validShape = Array.isArray(targets) && targets.length > 0 &&
    new Set(targets).size === targets.length && targets.every((target) => repairTargets.has(target));
  if (!validShape) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  if (payload.manifest !== undefined && !targets.includes('manifest')) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  let manifestContent = null;
  if (targets.includes('manifest')) {
    if (payload.manifest !== undefined) {
      if (!payload.manifest || typeof payload.manifest !== 'object' || Array.isArray(payload.manifest)) {
        return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
      }
      manifestContent = payload.manifest;
    } else {
      if (payload.workspace_id !== undefined && typeof payload.workspace_id !== 'string') {
        return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
      }
      manifestContent = manifest.template({
        repoName: path.basename(gitRoot),
        bundleAlias: bundleName,
        workspaceId: payload.workspace_id || crypto.randomUUID(),
      });
    }
    const finding = manifest.validate(manifestContent);
    if (finding) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [finding]);
  }

  if (!services.writable(gitRoot)) {
    return respond(request, 'blocked', {}, [suiteFinding('PARENT_DIRECTORY_NOT_WRITABLE', { gate: 'repair', path: gitRoot })]);
  }

  const data = {};
  let wrote = false;

  if (targets.includes('activation')) {
    if (services.activationMarker(gitRoot) === 'valid') {
      data.activation = { written: false };
    } else {
      services.writeFile(path.join(gitRoot, '.okf-active'), '');
      data.activation = { written: true };
      wrote = true;
    }
  }

  if (targets.includes('manifest')) {
    const manifestFile = path.join(gitRoot, '.okf-workspace.json');
    if (manifest.inspect(manifestFile, gitRoot, services).state === 'ok') {
      data.manifest = { written: false };
    } else {
      services.writeFile(manifestFile, `${JSON.stringify(manifestContent, null, 2)}\n`);
      data.manifest = { written: true, workspace_id: manifestContent.workspace_id };
      wrote = true;
    }
  }

  return respond(request, wrote ? 'applied' : 'no-op', data, []);
}

// `/setup`'s monorepo package-boundary report (#135, open points 1 and 2). Read-only,
// like `inspect`: it never writes, and it runs whether or not the workspace has a
// manifest, an activation marker, or a bundle root yet. `data.packages`/`data.briefs`
// are empty unless `monorepo.detect()` resolved a deterministic multi-package layout;
// an unresolved layout is reported through `data.ambiguous` and `data.question` for
// the user to settle, never guessed at by this function or its caller.
function executePlan(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.project_mode !== undefined && payload.project_mode !== 'code-backed' && payload.project_mode !== 'knowledge-only') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.mappings !== undefined && !Array.isArray(payload.mappings)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const detected = monorepo.detect(gitRoot, services);
  if (!detected.monorepo) {
    const packages = detected.packages.map((pkg) => ({ package: pkg.alias, path: pkg.path, separate_repo: pkg.separateRepo }));
    return respond(request, 'ok', { monorepo: false, ambiguous: false, signals: detected.signals, packages, briefs: [] }, []);
  }
  if (detected.ambiguous) {
    return respond(request, 'ok', {
      monorepo: true, ambiguous: true, signals: detected.signals, reason: detected.reason,
      question: 'Package boundaries could not be determined from workspace configuration. Name each package root explicitly.',
      packages: [], briefs: [],
    }, []);
  }
  const briefs = monorepo.buildBriefs(detected.packages, gitRoot, {
    bundleName, projectMode: payload.project_mode, mappings: payload.mappings,
  });
  return respond(request, 'ok', {
    monorepo: true,
    ambiguous: false,
    signals: detected.signals,
    packages: detected.packages.map((pkg) => ({ package: pkg.alias, path: pkg.path, separate_repo: pkg.separateRepo })),
    briefs,
  }, []);
}

// `/setup`'s per-package result aggregation and shared-manifest generation (#135,
// open points 3, 4, 5 and 6). Read-only: it never writes the manifest itself — the
// caller passes `data.manifest` on to `repair`'s existing `targets: ["manifest"]`
// path, the one place a manifest is ever written, once, after every worker has
// finished (open point 3: workers write only inside their own package bundle; the
// coordinator alone writes the shared root manifest). `payload.results` must name
// every package `monorepo.detect()` still reports and nothing else, so a failed
// package can never be silently dropped from the report (open point 5); `data.status`
// is `"complete"` only when every named package succeeded, `"partial"` otherwise —
// this function never reports overall success while a package failed.
function validResults(results) {
  if (!Array.isArray(results) || results.length === 0) return false;
  const seen = new Set();
  return results.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    if (typeof item.package !== 'string' || item.package === '' || seen.has(item.package)) return false;
    seen.add(item.package);
    if (item.status !== 'ok' && item.status !== 'failed') return false;
    if (item.status === 'failed' && (typeof item.reason !== 'string' || item.reason === '')) return false;
    if (item.status === 'ok' && item.reason !== undefined) return false;
    if (item.warnings !== undefined && (!Array.isArray(item.warnings) || item.warnings.some((w) => typeof w !== 'string'))) return false;
    return true;
  });
}

function executeAggregate(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!validResults(payload.results)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.workspace_id !== undefined && typeof payload.workspace_id !== 'string') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const detected = monorepo.detect(gitRoot, services);
  if (!detected.monorepo || detected.ambiguous) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const byAlias = new Map(detected.packages.map((pkg) => [pkg.alias, pkg]));
  const named = new Set(payload.results.map((item) => item.package));
  const coversExactly = detected.packages.every((pkg) => named.has(pkg.alias)) &&
    payload.results.every((item) => byAlias.has(item.package));
  if (!coversExactly) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);

  const ordered = detected.packages.map((pkg) => payload.results.find((item) => item.package === pkg.alias));
  const failed = ordered.filter((item) => item.status === 'failed').map((item) => item.package);
  const status = failed.length === 0 ? 'complete' : 'partial';

  const manifestContent = manifest.template({
    repoName: path.basename(gitRoot),
    bundleName,
    workspaceId: payload.workspace_id || crypto.randomUUID(),
    packages: detected.packages,
  });
  const finding = manifest.validate(manifestContent);
  if (finding) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [finding]);

  return respond(request, 'ok', {
    status,
    packages: ordered.map((item) => ({ package: item.package, status: item.status, reason: item.reason ?? null, warnings: item.warnings || [] })),
    failed,
    manifest: manifestContent,
  }, []);
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

function targetOutsideWorktreeBlocked(request, effects) {
  return writeResponse(request, {
    result: 'blocked',
    effects: effectRecords(effects, 'blocked'),
    findings: [{
      code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'write routing', reason: 'outside_active_worktree' },
    }],
    code: 'WRITE_TARGET_OUTSIDE_WORKTREE',
  });
}

function orientRespond(request, services, marker) {
  const outcome = orientation.orient(request, services, marker);
  return outcome === null ? null : respond(request, outcome.result, outcome.data, outcome.findings, { next_action: outcome.next_action });
}

function activationState(request, services) {
  const cwd = request.payload && request.payload.cwd;
  if (typeof cwd !== 'string' || cwd === '') return 'invalid-input';
  const root = services.gitRootOf(cwd);
  if (!root) return 'absent';
  return services.activationMarker(root);
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
    if (request.operation === 'init') return executeInit(request, services);
    if (request.operation === 'inspect') return executeInspect(request, services);
    if (request.operation === 'repair') return executeRepair(request, services);
    if (request.operation === 'plan') return executePlan(request, services);
    if (request.operation === 'aggregate') return executeAggregate(request, services);
    return unknownOperation(request);
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

  // `inspect` and `repair` report and fix the activation marker itself, and `plan`
  // and `aggregate` plan and report around a workspace that may not have one yet, so
  // all four run ahead of the shared activation gate below rather than being gated
  // behind it, whether reached directly through `okf-setup` or through the `okf`
  // router; an automatic caller still gets silence, matching every other operation's
  // automatic behavior when OKF is not yet active here (#138/#135).
  if (activationBypassOperations.has(request.operation)) {
    if (skill === 'okf-setup') {
      if (request.invocation === 'automatic') return null;
      return runActive(skill, request, services);
    }
    if (skill === 'okf') {
      if (request.invocation === 'automatic') return null;
      return routerRun(request, services);
    }
  }

  const activation = activationState(request, services);
  if (activation === 'absent') {
    if (request.invocation === 'automatic') return null;
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
        detail: { gate: 'activation', reason: 'marker_invalid' },
      }]);
    }
    if (isWriteOperation(skill, request)) {
      const effect = primaryEffects.get(request.operation);
      return writeResponse(request, {
        result: 'blocked',
        effects: effectRecords([effect], 'blocked'),
        findings: [{
          code: 'ACTIVATION_MARKER_INVALID',
          origin: 'suite',
          severity: 'error',
          blocks: true,
          detail: { gate: 'activation', reason: 'not_zero_byte_regular_file' },
        }],
        code: 'ACTIVATION_MARKER_INVALID',
      });
    }
    return respond(request, 'blocked', { code: 'ACTIVATION_MARKER_INVALID' }, [{
      code: 'ACTIVATION_MARKER_INVALID',
      origin: 'suite',
      severity: 'error',
      blocks: true,
      detail: { gate: 'activation', reason: 'not_zero_byte_regular_file' },
    }]);
  }
  if (automaticMutation(skill, request)) return automaticMutationBlocked(request);
  return runActive(skill, request, services);
}

module.exports = { run, respond, routerOwners, primaryEffects, derivedEffects };
