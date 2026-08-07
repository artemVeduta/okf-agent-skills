const path = require('node:path');
const crypto = require('node:crypto');
const validation = require('./validation');
const admission = require('./admission');
const manifest = require('./manifest');
const monorepo = require('./monorepo');
const discovery = require('./discovery');
const migration = require('./migration');
const partition = require('./partition');
const assembly = require('./assembly');
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
  ['plan', 'okf-setup'], ['aggregate', 'okf-setup'], ['report', 'okf-setup'],
  ['discover', 'okf-setup'], ['migration-plan', 'okf-setup'], ['partition', 'okf-setup'],
  ['assemble', 'okf-setup'], ['migration-validate', 'okf-setup'],
]);

// `inspect`, `repair`, `plan`, `aggregate`, `report`, `partition`, and `assemble` all
// report on or compute around state that exists before or independently of the
// activation marker, so all seven bypass the shared activation gate the same way
// (#133/#138/#135/#136/#146/#147). `discover` (#142) and `migration-plan` (#144)
// deliberately do NOT: unlike those seven, each needs a bundle root to already exist
// -- `discover` to exclude it from the scan, `migration-plan` to check a candidate
// target path for a collision -- and each runs as a step of an already-active setup
// session rather than something that inspects or repairs the marker itself.
// `partition` (#146) needs no bundle root at all: it only groups an already-determined
// plan the caller supplies (or validates a worker's returned shard against the brief
// the caller supplies), never touching the bundle or the filesystem beyond resolving
// `cwd`'s own Git root for the briefs it builds. `assemble` (#147) writes only the
// staging area alongside the bundle, never the bundle itself, so it shares the same
// bypass for the same reason. `migration-validate` (#148) only ever reads that same
// staging area back, never the bundle itself either, so it bypasses for the identical
// reason `assemble` does. An automatic caller gets the same silence every other
// operation on an inactive bundle gets; only an explicit call after `init`/`repair`
// have run reaches `discover`/`migration-plan`.
const activationBypassOperations = new Set(['inspect', 'repair', 'plan', 'aggregate', 'report', 'partition', 'assemble', 'migration-validate']);

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

/*
 * `/setup`'s post-migration analytics report (#136). Read-only and purely
 * computational, the same grain as `plan`/`aggregate`: the caller (the setup
 * procedure, once its own migration work or its dispatched package
 * sub-agents finish) supplies the migration's own signals — what was
 * migrated, what was skipped or left ambiguous and why, link and provenance
 * facts — and this function only classifies and totals them. It never reads
 * the bundle itself and never writes anything; the six open points this
 * closes are recorded, not invented, in `skills/okf-setup/SKILL.md`:
 *
 * 1. Format: this function returns structured JSON only; the SKILL.md
 *    procedure renders it as Markdown prose and decides where to show it.
 * 2/3/4. Signals, per-concept detail, and summary statistics are exactly
 *    `computeSignals()`'s return shape.
 * 5. Output location: nothing here writes to the bundle or a separate file;
 *    the response only ever reaches stdout, as every other wrapper response
 *    does. A report written into the bundle would itself need to conform to
 *    the OKF model, a cost this operation does not pay.
 * 6. Warning/error thresholds: a `skipped` source is a `warning` finding (an
 *    intentional, safe disposition, e.g. #131's code-recoverable filtering);
 *    an `ambiguous` source is an `error` finding and the one threshold with a
 *    boundary — `migration_status` flips from `"complete"` to `"partial"` the
 *    moment any `ambiguous` source exists, the same "unresolved work is never
 *    silently complete" rule `aggregate` already applies to a failed package.
 *    A broken link is a `warning` (#131: missing link targets are tolerated).
 *    Semantic fidelity not assessed is always a `warning` disclosure, never
 *    silently omitted (#131: a structural report must never imply it).
 */
const dispositions = new Set(['migrated', 'skipped', 'ambiguous', 'residue']);

function validSourceItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.path !== 'string' || item.path === '') return false;
  if (!dispositions.has(item.disposition)) return false;
  if (item.disposition === 'migrated') {
    if (typeof item.concept !== 'string' || item.concept === '') return false;
    if (item.reason !== undefined) return false;
    if (item.sources_declared !== undefined && typeof item.sources_declared !== 'boolean') return false;
  } else {
    if (typeof item.reason !== 'string' || item.reason === '') return false;
    if (item.concept !== undefined || item.sources_declared !== undefined) return false;
  }
  return true;
}

function validLinkItem(item) {
  return !!item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.from === 'string' && item.from !== '' &&
    typeof item.target === 'string' && item.target !== '' &&
    typeof item.resolved === 'boolean';
}

function validSemanticReview(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.performed === 'boolean';
}

function reportFinding(code, severity, detail) {
  return { code, origin: 'suite', severity, blocks: false, detail };
}

// One package's (or, in single-project mode, the whole run's) signal set:
// summary counts, source-path -> concept-path mapping, per-skip/ambiguity/
// residue reason, provenance coverage, link integrity, and the
// semantic-fidelity disclosure (open points 2, 3, 4, 6).
function computeSignals(sources, links, semanticReview) {
  const migrated = sources.filter((item) => item.disposition === 'migrated');
  const skipped = sources.filter((item) => item.disposition === 'skipped');
  const ambiguous = sources.filter((item) => item.disposition === 'ambiguous');
  const residue = sources.filter((item) => item.disposition === 'residue');
  const withSources = migrated.filter((item) => item.sources_declared === true).length;
  const resolvedLinks = links.filter((item) => item.resolved);
  const brokenLinks = links.filter((item) => !item.resolved);

  return {
    summary: {
      sources_total: sources.length,
      concepts_created: migrated.length,
      sources_skipped: skipped.length,
      sources_ambiguous: ambiguous.length,
      sources_residue: residue.length,
    },
    concepts: migrated.map((item) => ({ source: item.path, concept: item.concept, sources_declared: item.sources_declared === true })),
    skipped: skipped.map((item) => ({ source: item.path, reason: item.reason })),
    ambiguous: ambiguous.map((item) => ({ source: item.path, reason: item.reason })),
    residue: residue.map((item) => ({ source: item.path, reason: item.reason })),
    provenance: { total: migrated.length, with_sources: withSources, without_sources: migrated.length - withSources },
    links: {
      total: links.length, resolved: resolvedLinks.length, broken: brokenLinks.length,
      broken_detail: brokenLinks.map((item) => ({ from: item.from, target: item.target })),
    },
    semantic_fidelity: { assessed: semanticReview.performed === true },
    migration_status: ambiguous.length === 0 ? 'complete' : 'partial',
  };
}

function signalFindings(prefix, signals) {
  const findings = [];
  for (const item of signals.skipped) findings.push(reportFinding('source_skipped', 'warning', { path: `${prefix}${item.source}`, reason: item.reason }));
  for (const item of signals.ambiguous) findings.push(reportFinding('source_ambiguous', 'error', { path: `${prefix}${item.source}`, reason: item.reason }));
  for (const item of signals.links.broken_detail) findings.push(reportFinding('link_broken', 'warning', { from: `${prefix}${item.from}`, target: item.target }));
  if (!signals.semantic_fidelity.assessed) findings.push(reportFinding('semantic_fidelity_not_assessed', 'warning', { scope: prefix === '' ? 'project' : prefix.slice(0, -1) }));
  return findings;
}

// `data.status` replaces `computeSignals()`'s `migration_status` key so a
// single-project response and a per-package entry never collide: a
// per-package entry already carries the worker's own `status` ("ok"/"failed"
// from `aggregate`'s vocabulary), so it keeps `migration_status` as written.
function reportData(signals) {
  const { migration_status, ...rest } = signals;
  return { status: migration_status, ...rest };
}

// Combines every "ok" package's signals into one whole-workspace picture, the
// way `aggregate` combines worker outcomes into one manifest (open point 4).
// Semantic fidelity is assessed overall only when every "ok" package assessed
// it — one unreviewed package withholds the claim for the whole run, the same
// "never overstate from a partial check" rule #131 requires.
function mergeSignals(okSignals) {
  const summary = { sources_total: 0, concepts_created: 0, sources_skipped: 0, sources_ambiguous: 0, sources_residue: 0 };
  const provenance = { total: 0, with_sources: 0, without_sources: 0 };
  const links = { total: 0, resolved: 0, broken: 0 };
  let assessed = okSignals.length > 0;
  for (const item of okSignals) {
    for (const key of Object.keys(summary)) summary[key] += item.summary[key];
    for (const key of Object.keys(provenance)) provenance[key] += item.provenance[key];
    for (const key of Object.keys(links)) links[key] += item.links[key];
    if (!item.semantic_fidelity.assessed) assessed = false;
  }
  return { summary, provenance, links, semantic_fidelity: { assessed } };
}

function validPackageResult(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.package !== 'string' || item.package === '') return false;
  if (item.status !== 'ok' && item.status !== 'failed') return false;
  if (item.warnings !== undefined && (!Array.isArray(item.warnings) || item.warnings.some((w) => typeof w !== 'string'))) return false;
  if (item.status === 'failed') {
    if (typeof item.reason !== 'string' || item.reason === '') return false;
    return item.sources === undefined && item.links === undefined && item.semantic_review === undefined;
  }
  if (item.reason !== undefined) return false;
  if (!Array.isArray(item.sources) || !item.sources.every(validSourceItem)) return false;
  if (item.links !== undefined && (!Array.isArray(item.links) || !item.links.every(validLinkItem))) return false;
  return validSemanticReview(item.semantic_review);
}

// `payload.sources` (single-project mode, open points 1-6 directly) or
// `payload.packages` (multi-package mode, composed from `aggregate`'s own
// per-package `status`/`reason`/`warnings` plus each succeeded package's own
// signal set) — never both, never neither, matching the sealed-router
// discipline of rejecting a combination rather than silently picking one.
function executeReport(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const hasSources = Object.hasOwn(payload, 'sources');
  const hasPackages = Object.hasOwn(payload, 'packages');
  if (hasSources === hasPackages) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);

  if (hasSources) {
    if (!Array.isArray(payload.sources) || !payload.sources.every(validSourceItem)) {
      return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
    }
    const links = payload.links === undefined ? [] : payload.links;
    if (!Array.isArray(links) || !links.every(validLinkItem)) {
      return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
    }
    if (!validSemanticReview(payload.semantic_review)) {
      return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
    }
    const signals = computeSignals(payload.sources, links, payload.semantic_review);
    return respond(request, 'ok', reportData(signals), signalFindings('', signals));
  }

  if (!Array.isArray(payload.packages) || payload.packages.length === 0 || !payload.packages.every(validPackageResult)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const seen = new Set();
  for (const item of payload.packages) {
    if (seen.has(item.package)) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
    seen.add(item.package);
  }

  const findings = [];
  const packages = [];
  const okSignals = [];
  let anyUnresolved = false;
  for (const item of payload.packages) {
    if (item.status === 'failed') {
      anyUnresolved = true;
      packages.push({ package: item.package, status: 'failed', reason: item.reason, warnings: item.warnings || [] });
      continue;
    }
    const signals = computeSignals(item.sources, item.links || [], item.semantic_review);
    if (signals.migration_status === 'partial') anyUnresolved = true;
    okSignals.push(signals);
    findings.push(...signalFindings(`${item.package}:`, signals));
    packages.push({ package: item.package, status: 'ok', reason: null, warnings: item.warnings || [], ...signals });
  }

  const merged = mergeSignals(okSignals);
  return respond(request, 'ok', {
    status: anyUnresolved ? 'partial' : 'complete',
    summary: merged.summary,
    provenance: merged.provenance,
    links: merged.links,
    semantic_fidelity: merged.semantic_fidelity,
    packages,
  }, findings);
}

// `/setup`'s discovery scan and source classifier (#142). Read-only: it never writes,
// and it runs against an already-active bundle (see `activationBypassOperations`
// above for why this one is not in that set) so it can exclude the bundle root from
// its own scan. `data.sources` is `discovery.discover()`'s classification, one entry
// per file: `category` is `markdown` (a direct parse target), `unsupported` (a
// recognised format the migration will not interpret), `other` (not a candidate
// document format), or `ambiguous` (the evidence does not settle it, carrying a
// `question` for the user rather than a guess). `data.complete` mirrors
// `services.listFiles()`'s own field name and meaning exactly: `false` means the scan
// itself was partial (a symlink or an unreadable directory), reported here as a
// non-blocking `unreadable` finding -- the same code/shape `admitAndNavigate` already
// uses for a degraded read -- rather than silently dropped from the response.
function executeDiscover(request, services) {
  // `discover` is not in `activationBypassOperations` (it needs the bundle root to
  // already exist), but it still shares the rest of `okf-setup`'s family invariant
  // that none of its operations runs automatically (#134) -- silence, not a report,
  // for a caller other than an explicit `/setup` session, the same outcome the other
  // six reach through the bypass block above.
  if (request.invocation === 'automatic') return null;
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const bundleRoot = path.resolve(payload.cwd, bundleName);

  // #146: the per-package scan scope #142 deferred. `package_root`, when supplied,
  // must be a safe `gitRoot`-relative directory -- the same path-safety rule
  // `monorepo.js` already enforces for a package path, reused rather than
  // reimplemented -- so a caller cannot walk outside the repository it resolved.
  let scanRoot;
  if (payload.package_root !== undefined) {
    if (typeof payload.package_root !== 'string' || payload.package_root === '') {
      return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
    }
    scanRoot = monorepo.normalizeRelative(payload.package_root);
    if (!scanRoot) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const { sources, complete } = discovery.discover(gitRoot, bundleRoot, services, scanRoot);
  const findings = complete ? [] : [{
    code: 'unreadable',
    origin: 'suite',
    severity: 'error',
    blocks: false,
    detail: { gate: 'discovery', reason: 'incomplete_walk' },
  }];
  return respond(request, 'ok', { complete, sources }, findings);
}

// `discover`'s own source shape, unmodified (#142) -- `migration-plan` never
// re-walks or re-classifies the filesystem, it only consumes this exact shape.
const DISCOVER_CATEGORIES = new Set(['markdown', 'unsupported', 'other', 'ambiguous']);

function validPlanSource(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.path !== 'string' || item.path === '') return false;
  if (!DISCOVER_CATEGORIES.has(item.category)) return false;
  if (typeof item.format !== 'string' || item.format === '') return false;
  if (typeof item.reason !== 'string' || item.reason === '') return false;
  if (item.category === 'ambiguous') return typeof item.question === 'string' && item.question !== '';
  return item.question === undefined;
}

// `/setup`'s migration plan derivation and batched-question round (#144), plus the
// source-to-concept mapping engine, provenance extraction, reference-path
// derivation, and link rewriting (#145). Turns `discover`'s (#142) source inventory
// into a fully-determined migration plan: every source gets an intentional
// disposition -- `migrate`, `skip`, `residue`, or `blocked_pending_decision` -- a
// concept path derived from its type's own canonical directory (not a mechanical
// mirror of the source path), and `data.plan.executable` is `false` whenever any
// entry is still `blocked_pending_decision`, so an executor cannot run a
// half-decided plan by accident. `data.mapping` carries, for every `migrate` entry,
// the provenance its own frontmatter already declared (verbatim, never fabricated)
// and its body with unambiguous internal links rewritten to their new concept
// paths; `data.references` carries the deterministic `references/` path for every
// `residue` entry's raw evidence; `data.plan.duplicates` surfaces, never merges, an
// exact content duplicate among the sources this call is migrating. Read-only and
// purely derivational, like `discover`: it reads each markdown source's own
// frontmatter and body (through the same reader `discover` and the write path both
// use) and checks the bundle for a file already at the candidate target path, and
// nothing else -- it never prompts a human; rendering the batch and asking the
// question is `skills/okf-setup/SKILL.md`'s job. Like `discover`, it needs the
// bundle root to already exist (to check for a target collision), so it is not in
// `activationBypassOperations`, and it shares the same "no automatic caller" family
// invariant through its own explicit guard below.
function executeMigrationPlan(request, services) {
  if (request.invocation === 'automatic') return null;
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!Array.isArray(payload.sources) || !payload.sources.every(validPlanSource)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.answers !== undefined && (!payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers))) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const bundleRoot = path.resolve(payload.cwd, bundleName);
  const outcome = migration.derivePlan(payload.sources, gitRoot, bundleRoot, services, payload.answers);
  if (outcome.invalid) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);

  const findings = [
    ...outcome.questions.map((q) => ({
      code: 'plan_question_open',
      origin: 'suite',
      severity: 'warning',
      blocks: false,
      detail: { path: q.path, kind: q.kind },
    })),
    // #145: an exact content duplicate among sources this call is migrating is
    // surfaced, never silently merged and never blocking -- #131's "exact
    // duplicates may be surfaced as candidates".
    ...outcome.duplicates.map((d) => ({
      code: 'plan_duplicate_candidate',
      origin: 'suite',
      severity: 'warning',
      blocks: false,
      detail: { paths: d.paths },
    })),
  ];
  return respond(request, 'ok', {
    plan: { entries: outcome.entries, executable: outcome.executable, duplicates: outcome.duplicates },
    questions: outcome.questions,
    mapping: outcome.mapping,
    references: outcome.references,
  }, findings);
}

// `/setup`'s dynamic semantic partitioner and delegated worker protocol (#146).
// Its own upstream, unmodified, is exactly `migration-plan`'s response shape:
// `payload.plan` (`{entries, executable}`), `payload.mapping`, and
// `payload.references`. Read-only and purely derivational, like `migration-plan`
// itself: it never reads a source file, never writes anything, and never spawns or
// prompts anything -- launching the fresh-context worker a brief describes is
// `skills/okf-setup/SKILL.md`'s job, not this one's (#131: "the runtime never
// spawns an agent and never prompts").
const PLAN_DISPOSITIONS = new Set(['migrate', 'skip', 'residue', 'blocked_pending_decision']);

function validPartitionPlanEntry(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.path !== 'string' || item.path === '') return false;
  if (!PLAN_DISPOSITIONS.has(item.disposition)) return false;
  if (typeof item.reason !== 'string' || item.reason === '') return false;
  if (item.disposition === 'migrate') {
    return typeof item.concept === 'string' && item.concept !== '' && typeof item.type === 'string' && item.type !== '';
  }
  return item.concept === null && item.type === null;
}

function validPartitionPlan(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Array.isArray(value.entries) && value.entries.every(validPartitionPlanEntry) &&
    value.executable === true;
}

function validPartitionMappingItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.path !== 'string' || item.path === '') return false;
  if (typeof item.concept !== 'string' || item.concept === '') return false;
  if (typeof item.type !== 'string' || item.type === '') return false;
  if (item.sources !== null && !Array.isArray(item.sources)) return false;
  return typeof item.body === 'string';
}

function validPartitionReferenceItem(item) {
  return !!item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.path === 'string' && item.path !== '' &&
    typeof item.reference_path === 'string' && item.reference_path !== '';
}

// A caller cannot hand this operation a `mapping`/`references` array that does not
// correspond, one-for-one, to `plan.entries`' own `migrate`/`residue` sources --
// exactly the invariant `migration-plan` itself always produces, checked here
// rather than trusted blindly, since nothing stops a caller from tampering with or
// hand-assembling the three pieces separately.
function partitionInputConsistent(plan, mapping, references) {
  const migrating = plan.entries.filter((entry) => entry.disposition === 'migrate');
  const residue = plan.entries.filter((entry) => entry.disposition === 'residue');
  if (mapping.length !== migrating.length || references.length !== residue.length) return false;
  const migratingByPath = new Map(migrating.map((entry) => [entry.path, entry]));
  const residueByPath = new Map(residue.map((entry) => [entry.path, entry]));
  for (const item of mapping) {
    const entry = migratingByPath.get(item.path);
    if (!entry || entry.concept !== item.concept || entry.type !== item.type) return false;
  }
  for (const item of references) {
    if (!residueByPath.has(item.path)) return false;
  }
  return true;
}

function partitionFinding(code, blocks, detail) {
  return { code, origin: 'suite', severity: blocks ? 'error' : 'warning', blocks, detail };
}

function executePartitionCompute(request) {
  const payload = request.payload;
  if (!validPartitionPlan(payload.plan)) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  if (!Array.isArray(payload.mapping) || !payload.mapping.every(validPartitionMappingItem)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!Array.isArray(payload.references) || !payload.references.every(validPartitionReferenceItem)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!partitionInputConsistent(payload.plan, payload.mapping, payload.references)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.project_mode !== undefined && payload.project_mode !== 'code-backed' && payload.project_mode !== 'knowledge-only') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.max_sources_per_shard !== undefined && (!Number.isInteger(payload.max_sources_per_shard) || payload.max_sources_per_shard < 1)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const outcome = partition.computePartition(payload.plan, payload.mapping, payload.references, {
    cwd: path.resolve(payload.cwd),
    bundle: bundleName,
    projectMode: payload.project_mode,
    maxSourcesPerShard: payload.max_sources_per_shard,
  });
  const findings = outcome.crossShardLinks.map((link) => partitionFinding('cross_shard_link', false, link));
  return respond(request, 'ok', {
    max_sources_per_shard: outcome.maxSourcesPerShard,
    shards: outcome.shards,
    cross_shard_links: outcome.crossShardLinks,
  }, findings);
}

function executePartitionValidate(request) {
  const payload = request.payload;
  if (!payload.brief || typeof payload.brief !== 'object' || Array.isArray(payload.brief)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const outcome = partition.validateShard(payload.brief, payload.shard);
  if (!outcome.ok) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [partitionFinding(outcome.code, true, outcome.detail)]);
  }
  return respond(request, 'ok', { valid: true }, []);
}

// `partition` bypasses the activation gate exactly like `plan`/`aggregate`/`report`
// (see `activationBypassOperations` above), so the shared bypass block in `run()`
// already turns an automatic invocation into silence before this ever runs -- no
// second check is needed here, matching those three siblings' own convention.
function executePartition(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const hasPlan = Object.hasOwn(payload, 'plan');
  const hasShard = Object.hasOwn(payload, 'shard');
  if (hasPlan === hasShard) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);

  return hasPlan ? executePartitionCompute(request) : executePartitionValidate(request);
}

// `payload.partition.shards[]` is exactly one `partition` compute-mode
// `data.shards[]` entry (`{shard, sources, brief}`), unmodified -- reusing
// `validPartitionMappingItem`/`validPartitionReferenceItem` for the brief's
// own `mapping`/`references` arrays rather than a second shape check, since
// a brief's `mapping`/`references` are exactly those two shapes already.
function validAssemblyPartitionShard(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.shard !== 'string' || item.shard === '') return false;
  if (!Array.isArray(item.sources) || item.sources.length === 0 || item.sources.some((s) => typeof s !== 'string' || s === '')) {
    return false;
  }
  const brief = item.brief;
  if (!brief || typeof brief !== 'object' || Array.isArray(brief) || brief.shard !== item.shard) return false;
  if (!Array.isArray(brief.mapping) || !brief.mapping.every(validPartitionMappingItem)) return false;
  if (!Array.isArray(brief.references) || !brief.references.every(validPartitionReferenceItem)) return false;
  if (!Array.isArray(brief.sources) || brief.sources.some((s) => typeof s !== 'string' || s === '')) return false;
  return true;
}

function validCrossShardLink(item) {
  return !!item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.from === 'string' && item.from !== '' && typeof item.to === 'string' && item.to !== '' &&
    typeof item.from_shard === 'string' && item.from_shard !== '' && typeof item.to_shard === 'string' && item.to_shard !== '';
}

function validAssemblyPartition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Array.isArray(value.shards) || value.shards.length === 0) return false;
  const seen = new Set();
  for (const item of value.shards) {
    if (!validAssemblyPartitionShard(item) || seen.has(item.shard)) return false;
    seen.add(item.shard);
  }
  if (value.cross_shard_links === undefined) return true;
  return Array.isArray(value.cross_shard_links) && value.cross_shard_links.every(validCrossShardLink);
}

function validAssemblyShardRef(item) {
  return !!item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.shard === 'string' && item.shard !== '' && typeof item.path === 'string' && item.path !== '';
}

// Every shard `payload.partition.shards` names must have exactly one entry in
// `payload.shards`, and nothing in `payload.shards` may name a shard
// `payload.partition` never produced -- `aggregate`'s own "coversExactly"
// discipline (#135), extended to shard identity instead of package identity,
// so a shard missing from the set is refused rather than silently assembled
// as if the corpus were smaller than it is.
function assemblyShardCoverage(partitionShards, gathered) {
  const expected = new Set(partitionShards.map((item) => item.shard));
  const named = new Set(gathered.map((item) => item.shard));
  return {
    missing: [...expected].filter((id) => !named.has(id)).sort(),
    unknown: [...named].filter((id) => !expected.has(id)).sort(),
  };
}

// `assemble` (#147) bypasses the activation gate exactly like `partition`
// (see `activationBypassOperations` above): it never touches the bundle
// itself, only the staging area beside it, so the shared bypass block in
// `run()` already turns an automatic invocation into silence before this
// ever runs.
function executeAssemble(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!validAssemblyPartition(payload.partition)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!Array.isArray(payload.shards) || payload.shards.length === 0 || !payload.shards.every(validAssemblyShardRef)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const gatheredIds = new Set(payload.shards.map((item) => item.shard));
  if (gatheredIds.size !== payload.shards.length) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const partitionShards = payload.partition.shards;
  const crossShardLinks = payload.partition.cross_shard_links || [];

  const coverage = assemblyShardCoverage(partitionShards, payload.shards);
  if (coverage.missing.length > 0 || coverage.unknown.length > 0) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT', missing_shards: coverage.missing, unknown_shards: coverage.unknown }, [
      partitionFinding('ASSEMBLY_SHARD_SET_MISMATCH', true, coverage),
    ]);
  }

  const gatheredByShard = new Map(payload.shards.map((item) => [item.shard, item]));
  const shardContents = new Map();
  for (const shard of partitionShards) {
    const ref = gatheredByShard.get(shard.shard);
    const rel = monorepo.normalizeRelative(ref.path);
    let content;
    if (rel) {
      try {
        content = JSON.parse(services.readFile(path.join(gitRoot, rel)));
      } catch {
        content = undefined;
      }
    }
    if (content === undefined) {
      return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT', shard: shard.shard }, [
        partitionFinding('ASSEMBLY_SHARD_UNREADABLE', true, { shard: shard.shard, path: ref.path }),
      ]);
    }
    shardContents.set(shard.shard, content);
  }

  const outcome = assembly.computeAssembly(partitionShards, shardContents);
  if (!outcome.ok) {
    if (outcome.code === 'CONCEPT_TARGET_COLLISION') {
      return respond(request, 'blocked', { code: 'CONCEPT_TARGET_COLLISION', collisions: outcome.collisions },
        outcome.collisions.map((collision) => partitionFinding('CONCEPT_TARGET_COLLISION', true, collision)));
    }
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT', shard: outcome.shard }, [
      partitionFinding(outcome.code, true, { shard: outcome.shard, ...outcome.detail }),
    ]);
  }

  const links = assembly.resolveCrossShardLinks(crossShardLinks, outcome.concepts);
  const findings = [
    ...outcome.duplicates.map((duplicate) => partitionFinding('ASSEMBLY_DUPLICATE_CANDIDATE', false, duplicate)),
    ...links.lost.map((link) => partitionFinding('MIGRATION_LINK_LOST', false, link)),
    ...outcome.blockers.map((blocker) => partitionFinding('ASSEMBLY_SOURCE_BLOCKED', false, { path: blocker.path, reason: blocker.reason, shard: blocker.shard })),
  ];

  const stagingRoot = path.join(gitRoot, '.okf-staging', bundleName);
  const staged = outcome.concepts.map((item) => {
    const file = path.join(stagingRoot, `${item.concept}.md`);
    services.mkdir(path.dirname(file));
    services.writeFile(file, item.rendered);
    return { path: item.path, concept: item.concept, type: item.type, shard: item.shard, file: path.relative(gitRoot, file) };
  });

  return respond(request, 'ok', {
    status: outcome.blockers.length > 0 ? 'partial' : 'complete',
    publishable: outcome.blockers.length === 0,
    staged,
    references: outcome.references,
    blockers: outcome.blockers,
    duplicates: outcome.duplicates,
    links,
    staging_dir: path.relative(gitRoot, stagingRoot),
  }, findings);
}

/*
 * #148: the pre-publish validation gate for whatever `assemble` (#147) staged
 * at `.okf-staging/<bundle>`, plus the completeness and semantic-fidelity
 * disclosure #131 requires before that staged content may ever reach the real
 * bundle. Three legs, each reused rather than reimplemented:
 *
 *   - structural/conformance and link integrity: `validation.validateRead`
 *     itself, given `strict: true` (added by this same ticket) so every
 *     staged concept is checked against `checkConcept` -- the identical
 *     conditional-obligation checks (`sources[].resource`, `generated[].by`,
 *     `Attested Computation` needing `runtime`, human-prefix) the write gate
 *     already runs on a fresh concept, because staged content is exactly that:
 *     about to become a first-time write, not an already-published document
 *     upstream tolerates having drifted. The reserved-navigation rule (a
 *     nested `index.md`/`log.md` must never carry concept frontmatter -- the
 *     exact defect #131 records for this repo's own `okf/releases/index.md`)
 *     is unconditional inside `validateRead` regardless of `strict`, so it is
 *     caught here the same way an ordinary `okf-read validate` call would
 *     catch it once the bundle is live. Broken links stay warnings, never
 *     blockers, because #131 says upstream permits them.
 *   - completeness: never a file-count comparison (#131: raw parity is not a
 *     success measure, most visibly for `code-backed` filtering, where
 *     code-recoverable material is deliberately never migrated). Instead,
 *     `payload.plan` is exactly `migration-plan`'s own `data.plan` shape,
 *     reused as-is via this same file's own `validPartitionPlan` (`partition`
 *     already demands the identical shape for the identical reason: every
 *     entry already carries its own intentional disposition and a non-empty
 *     reason, or the whole payload is refused before anything is computed).
 *     What that reuse cannot see on its own is a source that fell off the
 *     plan entirely -- an entry simply never recorded for it -- so
 *     `payload.selected` (the full set `discover` actually found this run)
 *     is cross-checked against `plan.entries`' own paths independently; a
 *     `skip`-disposition entry with a real reason (a `code-backed` filter,
 *     for example) satisfies completeness exactly as intentionally as a
 *     `migrate` one, while a `selected` path with no entry at all is the one
 *     thing this leg refuses to let pass unnoticed.
 *   - semantic fidelity: `payload.semantic_review` is `report`'s own shape
 *     and is mandatory here for the same reason it is mandatory there --
 *     never inferred true from a clean structural pass. This is deliberately
 *     the loudest rule in the whole operation: even a bundle with zero
 *     structural findings and zero missing dispositions still reports
 *     `semantic_fidelity: { assessed: false }`, with its own warning finding,
 *     unless a human review was actually declared. This operation never
 *     recomputes `report`'s own summary statistics; a caller who wants those
 *     still calls `report` itself, separately, once this gate is satisfied.
 */
function validSelectedPath(item) {
  return typeof item === 'string' && item !== '';
}

function executeMigrationValidate(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return respond(request, 'not-configured', {}, []);

  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const selected = payload.selected === undefined ? [] : payload.selected;
  if (!Array.isArray(selected) || !selected.every(validSelectedPath)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!validPartitionPlan(payload.plan)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!validSemanticReview(payload.semantic_review)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const disposed = new Set(payload.plan.entries.map((item) => item.path));
  const missingDisposition = [...new Set(selected.filter((item) => !disposed.has(item)))].sort();
  const findings = missingDisposition.map((item) => suiteFinding('SOURCE_DISPOSITION_MISSING', { path: item }));

  // A migration with nothing to `migrate`/`residue` never gives `assemble` a
  // reason to create the staging root at all (it only ever `mkdir`s a staged
  // concept's own directory), so an absent staging directory is an empty,
  // not a broken, bundle -- never the `realpath` failure `validateRead` would
  // otherwise throw on a path that does not exist.
  const stagingRoot = path.join(gitRoot, '.okf-staging', bundleName);
  const structural = services.exists(stagingRoot)
    ? validation.validateRead(stagingRoot, services, { strict: true, today: payload.today })
    : { data: { concepts: [] }, findings: [] };
  findings.push(...structural.findings);

  const assessed = payload.semantic_review.performed === true;
  if (!assessed) findings.push(reportFinding('semantic_fidelity_not_assessed', 'warning', { scope: 'bundle' }));

  const publishable = !findings.some((item) => item.blocks);
  return respond(request, 'ok', {
    status: publishable ? 'complete' : 'partial',
    publishable,
    missing_disposition: missingDisposition,
    concepts_checked: structural.data.concepts.map((item) => item.path),
    semantic_fidelity: { assessed },
  }, findings);
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
    if (request.operation === 'report') return executeReport(request, services);
    if (request.operation === 'discover') return executeDiscover(request, services);
    if (request.operation === 'migration-plan') return executeMigrationPlan(request, services);
    if (request.operation === 'partition') return executePartition(request, services);
    if (request.operation === 'assemble') return executeAssemble(request, services);
    if (request.operation === 'migration-validate') return executeMigrationValidate(request, services);
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

  // `inspect` and `repair` report and fix the activation marker itself, `plan` and
  // `aggregate` plan and report around a workspace that may not have one yet, and
  // `report` only classifies caller-supplied migration signals, so all five run
  // ahead of the shared activation gate below rather than being gated behind it,
  // whether reached directly through `okf-setup` or through the `okf` router; an
  // automatic caller still gets silence, matching every other operation's automatic
  // behavior when OKF is not yet active here (#138/#135/#136).
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
