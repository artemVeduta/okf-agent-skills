// Every `okf-setup` operation, and nothing else. `runtime.js` keeps the skill/operation
// routing, the activation gate, and the read/write path; it reaches this file through
// the `operations` table at the bottom, so a new setup operation is added here alone.

const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { dispatchWrapper } = require('./wrapper-dispatch');
const validation = require('./validation');
const admission = require('./admission');
const manifest = require('./manifest');
const monorepo = require('./monorepo');
const discovery = require('./discovery');
const migration = require('./migration');
const words = require('./words');
const sections = require('./sections');
const splitProposal = require('./split-proposal');
const partition = require('./partition');
const assembly = require('./assembly');
const publication = require('./publication');
const canonicalReview = require('./semantic-review');
const acceptedGroups = require('./accepted-groups');
const lifecycle = require('./lifecycle');
const { inside } = require('./paths');
const {
  respond, suiteFinding, writeFailureReason, writeResponse, effectRecords, targetOutsideWorktreeBlocked,
} = require('./response');

// #149: the one process boundary `publish` invokes as a caller (never a target --
// `okf-setup` still carries no role in `scripts/lib/delegation.js`'s `ROLES` map and
// still is not in any adapter manifest's `bridge.skills`, see `executePublish` below).
// Spawning the sibling delegation wrapper from a `scripts/lib/*` module already has a
// precedent: `scripts/lib/adapters.js` spawns `okf-read.js` the same way, for the same
// reason -- reuse the one shared contract seam instead of re-deriving admission,
// evidence, or write-gate logic here a second time.
const DELEGATE_WRAPPER = path.join(__dirname, '..', 'okf-delegate.js');

// `init` is never combinable with a derived effect: an explicit `effects` array is
// valid only when it names exactly `['init']`.
function initEffects(payload) {
  if (payload.effects === undefined) return { effects: ['init'] };
  if (Array.isArray(payload.effects) && payload.effects.length === 1 && payload.effects[0] === 'init') {
    return { effects: ['init'] };
  }
  return { invalid: true, effects: Array.isArray(payload.effects) ? payload.effects : [] };
}

// `init` bootstraps the bundle root itself, so it cannot go through `executeBounded`:
// there is no bundle-root precondition to check yet, no evidence to cite, and no
// concept scope. Per #133/#134 it owns a slimmer admission of its own — ownership,
// REACH, TRUST, ACCESS and the activation gate (run by `run()` before this is
// reached, over the manifest now -- #197: was the activation marker) — skipping
// PRESENCE (no bundle to find yet) and the evidence gate.
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
  // #197: `project_mode` moved entirely to the manifest bundle record, `repair`'s
  // to write -- the navigation-only root `init` creates has no field left to put
  // it in, so a caller still naming it here is refused, not silently ignored.
  if (payload.project_mode !== undefined) {
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
    return settle('failed/incomplete', [suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: writeFailureReason(error) })]);
  }
  if (outcome.result === 'blocked') return refuse(undefined, null, outcome.findings);
  if (outcome.result === 'failed/incomplete') return settle('failed/incomplete', outcome.findings);
  if (!outcome.data.written) return settle('no-op', outcome.findings);

  const completedEffects = new Set();
  let publishing = 'index.md';
  try {
    // publishFile already mkdir's the parent of index.md (the bundle root).
    services.publishFile(outcome.data.file, outcome.data.rendered, outcome.data.expected);
    // #170: a bundle root created for the first time carries the agent connector, so
    // the navigation chain `index.md -> agents/index.md -> agents/okf.md` exists in
    // every new bundle. `outcome.data.connector` is empty for an existing root.
    // `outcome.data.connector` already excludes any connector file present on disk,
    // so `expected: null` here only ever refuses a file that appeared between the
    // evaluation and this write -- never the repair case, which leaves it untouched.
    for (const file of outcome.data.connector || []) {
      publishing = path.relative(bundleRoot, file.file);
      services.publishFile(file.file, file.rendered, null);
    }
    completedEffects.add('init');
  } catch (error) {
    if (error && error.code === 'TARGET_CHANGED') {
      const finding = suiteFinding('TARGET_CHANGED', { gate: 'target', path: publishing, reason: writeFailureReason(error, 'target changed') });
      return writeResponse(request, {
        result: 'blocked',
        effects: effectRecords(provisionalEffects, 'blocked'),
        evidence: [],
        findings: [...outcome.findings, finding],
        code: 'TARGET_CHANGED',
        scope,
        completed: completedEffects,
      });
    }
    const finding = suiteFinding('POST_WRITE_VALIDATION_FAILED', { gate: 'write', reason: writeFailureReason(error) });
    return settle('failed/incomplete', [...outcome.findings, finding], { completed: completedEffects });
  }

  const checked = validation.postWriteInit(bundleRoot, services, outcome.data.rendered);
  if (!checked.valid) {
    return settle('failed/incomplete', [...outcome.findings, ...checked.findings], { completed: completedEffects });
  }
  return settle('applied', [...outcome.findings, ...checked.findings], { completed: completedEffects });
}

// Every `okf-setup` operation below resolves the same two things before it does its own
// work: the Git root of `cwd`, and the bundle the request names under it. Both refusals
// are the ones each operation already reported for itself — an unresolvable Git root is
// `not-configured`, an ill-formed `bundle` is `UNSUPPORTED_INPUT` — so this returns the
// refusal response itself rather than a code the caller has to translate a second time.
function setupContext(request, services) {
  const payload = request.payload;
  const gitRoot = services.gitRootOf(path.resolve(payload.cwd));
  if (!gitRoot) return { refusal: respond(request, 'not-configured', {}, []) };
  const bundleName = payload.bundle === undefined ? 'okf' : payload.bundle;
  if (typeof bundleName !== 'string' || bundleName === '') {
    return { refusal: respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []) };
  }
  return { gitRoot, bundleName, bundleRoot: path.resolve(payload.cwd, bundleName) };
}

// `/setup`'s deterministic state report for the two config files (#133/#138).
// Read-only: it never writes, and it runs even when the manifest itself is
// what is being inspected, so `run()` reaches this directly rather than gating it
// behind the very manifest it reports on. `okf-setup`'s procedure owns the consent
// prompts and the "fix all?" interaction; this function only reports state.
// #197: `manifest` is the only repair target left -- the activation-marker
// target this once shared the set with is gone, not made a permanent no-op.
const repairTargets = new Set(['manifest']);

// #197: the same valid/missing/invalid resolution `runtime.js`'s `activationState()`
// computes for the shared activation gate, reused here so `/setup`'s own report of
// "would OKF run normally here" can never drift from what the gate itself decides --
// `runtime.js` cannot be required back from here (it requires this file), so this is
// the same three calls (`gitRootOf`, `manifest.select`, the finding/manifest check),
// not a second gate with its own rules.
function manifestActivation(payload, gitRoot, services) {
  const selected = manifest.select(payload, { cwd: path.resolve(payload.cwd), gitRoot }, services);
  if (selected.finding) return { state: 'invalid', reason: 'manifest_invalid' };
  return { state: selected.manifest ? 'ok' : 'missing' };
}

// The activation gate resolves `.okf-workspace.json` by walking `cwd` upward to
// the Git root (`manifest.select()`'s own `discover()`), so a manifest living in
// an intermediate directory activates the bundle from there, not from a
// hardcoded `<gitRoot>/.okf-workspace.json` that may not exist at all. Every
// caller that reports on, or reads settings out of, "the manifest" must resolve
// the same file the gate just activated against -- this is that one resolution,
// reused rather than re-derived, so the two halves of one response can never
// disagree about which file is "the manifest" (fix round 2, Important 3).
function resolveManifestFile(payload, gitRoot, services) {
  const selected = manifest.select(payload, { cwd: path.resolve(payload.cwd), gitRoot }, services);
  return selected.path || path.join(gitRoot, '.okf-workspace.json');
}

function executeInspect(request, services) {
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleRoot } = context;

  return respond(request, 'ok', {
    index_md: validation.inspectIndex(bundleRoot, services),
    activation: manifestActivation(request.payload, gitRoot, services),
    manifest: manifest.inspect(resolveManifestFile(request.payload, gitRoot, services), gitRoot, services),
  }, []);
}

// `/setup`'s approved-repair executor for the plain-filesystem config file
// (#133/#138). `.okf-workspace.json` is not an OKF operation through the write
// gate — no REACH/TRUST/ACCESS admission, no evidence, no atomic publish, no
// `effects` vocabulary — it is exactly the plain filesystem action #133 named.
// `index.md` repair is not here at all: it goes through `init`. Consent lives in
// `okf-setup`'s procedure, not here — reaching this function is itself the approval.
// Idempotent like `init`: a target already in state `ok` is always left untouched.
function executeRepair(request, services) {
  const payload = request.payload;
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleRoot, bundleName } = context;

  const targets = payload.targets;
  const validShape = Array.isArray(targets) && targets.length > 0 &&
    new Set(targets).size === targets.length && targets.every((target) => repairTargets.has(target));
  if (!validShape) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  // `manifest` is the only target left, so `validShape` already forces `targets`
  // to be exactly `['manifest']` -- there is no other target left to name a
  // `manifest` payload without.
  if (payload.project_mode !== undefined && payload.project_mode !== 'code-backed' && payload.project_mode !== 'knowledge-only') {
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
        projectMode: payload.project_mode,
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
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleName } = context;

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
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleName } = context;

  if (!validResults(payload.results)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.workspace_id !== undefined && typeof payload.workspace_id !== 'string') {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.project_mode !== undefined && payload.project_mode !== 'code-backed' && payload.project_mode !== 'knowledge-only') {
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
    projectMode: payload.project_mode,
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

function validSemanticReview(value, evidence = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.performed !== 'boolean') return false;
  const rich = value.sources !== undefined || value.candidates !== undefined;
  if (!rich) return true;
  return evidence && Object.keys(value).every((field) => ['performed', 'sources', 'candidates'].includes(field))
    && Array.isArray(value.sources) && Array.isArray(value.candidates);
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

function exactFields(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && Object.keys(value).every((field) => fields.includes(field));
}

function reportArtifactRefusal(request, code, artifact, reason) {
  return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [
    suiteFinding(code, { artifact, reason }),
  ]);
}

function validReportFlag(value, field) {
  return exactFields(value, [field]) && typeof value[field] === 'boolean';
}

function validateReportPublication(value) {
  if (!exactFields(value, ['status', 'published', 'failed', 'skipped', 'results', 'candidate_conformance'])
    || !['complete', 'partial'].includes(value.status)
    || !Array.isArray(value.published) || value.published.some((item) => typeof item !== 'string' || item === '')
    || !Array.isArray(value.failed) || !Array.isArray(value.skipped) || !Array.isArray(value.results)
    || !exactFields(value.candidate_conformance, ['passed', 'concepts', 'navigation_indexes'])
    || value.candidate_conformance.passed !== true
    || !Array.isArray(value.candidate_conformance.concepts)
    || !Array.isArray(value.candidate_conformance.navigation_indexes)) {
    return { ok: false, code: 'REPORT_ARTIFACT_MALFORMED', artifact: 'publication', reason: 'shape' };
  }
  const concepts = value.candidate_conformance.concepts;
  const indexes = value.candidate_conformance.navigation_indexes;
  if (concepts.some((item) => !exactFields(item, ['source', 'concept', 'path'])
      || monorepo.normalizeRelative(item.source) !== item.source
      || monorepo.normalizeRelative(item.concept) !== item.concept
      || item.path !== `${item.concept}.md`)
    || indexes.some((item) => !exactFields(item, ['path']) || monorepo.normalizeRelative(item.path) !== item.path)
    || value.failed.some((item) => !exactFields(item, ['concept', 'status'])
      || typeof item.concept !== 'string' || item.concept === '' || typeof item.status !== 'string' || item.status === ''
      || item.status === 'clean' || item.status === 'not-attempted')
    || value.skipped.some((item) => !exactFields(item, ['concept', 'status'])
      || typeof item.concept !== 'string' || item.concept === '' || item.status !== 'not-attempted')
    || value.results.some((item) => !exactFields(item, ['concept', 'status', 'findings'])
      || typeof item.concept !== 'string' || item.concept === '' || typeof item.status !== 'string' || item.status === ''
      || !Array.isArray(item.findings))) {
    return { ok: false, code: 'REPORT_ARTIFACT_MALFORMED', artifact: 'publication', reason: 'row_shape' };
  }

  const candidateIds = [...concepts.map((item) => item.concept), ...indexes.map((item) => item.path)];
  const resultIds = value.results.map((item) => item.concept);
  const candidateSet = canonicalReview.exactSet(candidateIds, resultIds);
  const clean = value.results.filter((item) => item.status === 'clean').map((item) => item.concept);
  const failed = value.results.filter((item) => item.status !== 'clean' && item.status !== 'not-attempted')
    .map((item) => ({ concept: item.concept, status: item.status }));
  const skipped = value.results.filter((item) => item.status === 'not-attempted')
    .map((item) => ({ concept: item.concept, status: item.status }));
  const expectedStatus = failed.length === 0 ? 'complete' : 'partial';
  if (canonicalReview.differs(candidateSet) || !isDeepStrictEqual(value.published, clean)
    || !isDeepStrictEqual(value.failed, failed) || !isDeepStrictEqual(value.skipped, skipped)
    || value.status !== expectedStatus) {
    return { ok: false, code: 'REPORT_ARTIFACT_MISMATCH', artifact: 'publication', reason: 'results' };
  }
  return { ok: true, concepts, indexes };
}

function executeMigrationReport(request, migrationReport) {
  const splitReviewFields = [
    'path', 'word_count', 'review_required', 'review_reason', 'source_identity', 'line_count',
    'sections', 'outputs', 'accounting_status', 'proposal',
  ];
  if (!exactFields(migrationReport, ['settings', 'split_review', 'validation', 'publication'])
    || !exactFields(migrationReport.settings, ['max_words_per_file'])
    || !Number.isInteger(migrationReport.settings.max_words_per_file)
    || migrationReport.settings.max_words_per_file < 1
    || !Array.isArray(migrationReport.split_review)) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MALFORMED', 'migration', 'shape');
  }
  const splitReview = partition.validateSplitReviews(
    migrationReport.split_review.map((item) => ({ path: item && item.path })), migrationReport.split_review,
  );
  if (!splitReview.ok) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MALFORMED', 'split_review', splitReview.code);
  }
  const reviewedShape = migrationReport.split_review.every((item) => {
    if (!exactFields(item, splitReviewFields)
      || !Number.isInteger(item.word_count) || item.word_count < 0
      || typeof item.review_required !== 'boolean'
      || !/^sha256:[0-9a-f]{64}$/.test(item.source_identity)) return false;
    if (item.proposal === null) {
      return item.word_count <= migrationReport.settings.max_words_per_file
        && item.review_required === false && item.review_reason === null
        && item.line_count === 0 && item.sections.length === 0 && item.outputs.length === 0;
    }
    const aboveTarget = item.word_count > migrationReport.settings.max_words_per_file;
    return aboveTarget
      ? item.review_required === true && item.review_reason === 'above_target'
      : item.review_required === false && ['user_requested', 'semantic_boundaries'].includes(item.review_reason);
  });
  if (!reviewedShape) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MALFORMED', 'split_review', 'report_fields');
  }

  const checked = migrationReport.validation;
  if (!exactFields(checked, ['structural_coverage', 'agent_semantic_review', 'semantic_fidelity', 'semantic_review'])
    || !validReportFlag(checked.structural_coverage, 'passed')
    || !validReportFlag(checked.agent_semantic_review, 'passed')
    || !validReportFlag(checked.semantic_fidelity, 'assessed')
    || !publication.validCanonicalReview(checked.semantic_review)) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MALFORMED', 'validation', 'shape');
  }
  const semantic = canonicalReview.canonicalCoverage(checked.semantic_review, migrationReport.split_review);
  if (!semantic.ok && semantic.detail.reason !== 'verdict') {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MISMATCH', 'validation', 'semantic_review');
  }
  const semanticPassed = semantic.ok;
  if (checked.agent_semantic_review.passed !== semanticPassed
    || checked.semantic_fidelity.assessed !== checked.semantic_review.human_assessed) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MISMATCH', 'validation', 'flags');
  }
  if (!checked.structural_coverage.passed || !checked.agent_semantic_review.passed) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MISMATCH', 'validation', 'publication_gate');
  }

  const publicationResult = validateReportPublication(migrationReport.publication);
  if (!publicationResult.ok) {
    return reportArtifactRefusal(
      request, publicationResult.code, publicationResult.artifact, publicationResult.reason,
    );
  }
  const accepted = acceptedGroups.collect(migrationReport.split_review);
  if (!accepted.ok) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MALFORMED', 'split_review', 'groups');
  }
  const expectedIndexes = accepted.groups.map((group) => ({ path: group.index_entry.path }));
  const planned = migrationReport.split_review.filter((item) => item.proposal !== null)
    .flatMap((review) => review.proposal.outputs.map((output) => ({
      source: review.path, concept: output.concept_id, path: output.path,
    })));
  const plannedSet = canonicalReview.exactSet(
    planned.map((item) => `${item.source}\0${item.concept}\0${item.path}`),
    publicationResult.concepts.filter((item) => planned.some((output) => output.source === item.source))
      .map((item) => `${item.source}\0${item.concept}\0${item.path}`),
  );
  const indexSet = canonicalReview.exactSet(
    expectedIndexes.map((item) => item.path), publicationResult.indexes.map((item) => item.path),
  );
  if (canonicalReview.differs(plannedSet) || canonicalReview.differs(indexSet)) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MISMATCH', 'candidate_conformance', 'accepted_plan');
  }
  const candidatePaths = canonicalReview.exactSet(
    publicationResult.concepts.map((item) => item.path).concat(publicationResult.indexes.map((item) => item.path)),
    checked.semantic_review.candidates.map((item) => item.path),
  );
  if (canonicalReview.differs(candidatePaths)) {
    return reportArtifactRefusal(request, 'REPORT_ARTIFACT_MISMATCH', 'candidate_conformance', 'semantic_candidates');
  }

  const published = new Set(migrationReport.publication.published);
  const reviewedSources = migrationReport.split_review.filter((item) => item.proposal !== null).map((review) => {
    const semanticSource = checked.semantic_review.sources.find((item) => item.path === review.path);
    const outputIds = new Set(review.proposal.outputs.map((item) => item.concept_id));
    return {
      path: review.path,
      max_words_per_file: migrationReport.settings.max_words_per_file,
      word_count: review.word_count,
      review_reason: review.review_reason,
      accepted_result: review.proposal.result,
      reason: review.proposal.keep_as_one_reason,
      sections: review.sections,
      planned_outputs: review.proposal.outputs,
      actual_outputs: review.proposal.outputs.filter((item) => published.has(item.concept_id)),
      conformance_result: { passed: migrationReport.publication.candidate_conformance.passed },
      semantic_review_result: { passed: semanticPassed, sections: semanticSource.sections },
      failed_writes: migrationReport.publication.failed.filter((item) => outputIds.has(item.concept)),
      skipped_writes: migrationReport.publication.skipped.filter((item) => outputIds.has(item.concept)),
    };
  });
  const conceptIds = new Set(publicationResult.concepts.map((item) => item.concept));
  const indexIds = new Set(publicationResult.indexes.map((item) => item.path));
  const actualConcepts = migrationReport.publication.published.filter((item) => conceptIds.has(item));
  const sourceCount = new Set(publicationResult.concepts.map((item) => item.source)).size;
  const findings = checked.semantic_fidelity.assessed ? [] : [
    reportFinding('semantic_fidelity_not_assessed', 'warning', { scope: 'bundle' }),
  ];
  return respond(request, 'ok', {
    status: migrationReport.publication.status,
    summary: {
      sources_total: sourceCount,
      concepts_created: actualConcepts.length,
      concepts_planned: publicationResult.concepts.length,
      writes_failed: migrationReport.publication.failed.filter((item) => conceptIds.has(item.concept)).length,
      writes_skipped: migrationReport.publication.skipped.filter((item) => conceptIds.has(item.concept)).length,
    },
    reviewed_sources: reviewedSources,
    writes: {
      published: actualConcepts,
      failed: migrationReport.publication.failed.filter((item) => conceptIds.has(item.concept)),
      skipped: migrationReport.publication.skipped.filter((item) => conceptIds.has(item.concept)),
    },
    navigation_writes: {
      published: migrationReport.publication.published.filter((item) => indexIds.has(item)),
      failed: migrationReport.publication.failed.filter((item) => indexIds.has(item.concept)),
      skipped: migrationReport.publication.skipped.filter((item) => indexIds.has(item.concept)),
    },
    structural_coverage: checked.structural_coverage,
    agent_semantic_review: checked.agent_semantic_review,
    semantic_fidelity: checked.semantic_fidelity,
  }, findings);
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
  const hasMigration = Object.hasOwn(payload, 'migration');
  if ([hasSources, hasPackages, hasMigration].filter(Boolean).length !== 1) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  if (hasMigration) return executeMigrationReport(request, payload.migration);

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
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleRoot } = context;

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

// #201 task 2: one accounted source section of a split under review. Line
// numbers are 1-based and inclusive at both ends; the range's fit against the
// real file is `sections.js`'s job (this only settles the shape). #200's "each
// source section has exactly one disposition: assignment to one output
// concept, or migration residue left at the source path" -- so `output` names
// the receiving output for `assigned` and must be absent for `residue`, and an
// explicit output position is meaningful only for an assigned section.
function validSplitSection(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (!Number.isInteger(item.line_start) || !Number.isInteger(item.line_end)) return false;
  if (item.disposition === 'assigned') {
    if (typeof item.output !== 'string' || item.output === '') return false;
    return item.order === undefined || Number.isInteger(item.order);
  }
  if (item.disposition !== 'residue') return false;
  return item.output === undefined && item.order === undefined;
}

function validSplitAccounting(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.path !== 'string' || item.path === '') return false;
  if (item.source_identity !== undefined && (typeof item.source_identity !== 'string' || item.source_identity === '')) return false;
  return Array.isArray(item.sections) && item.sections.length > 0 && item.sections.every(validSplitSection);
}

function validSplitSections(value) {
  if (!Array.isArray(value) || !value.every(validSplitAccounting)) return false;
  return new Set(value.map((item) => item.path)).size === value.length;
}

/*
 * #201 task 1 (#200): "a source above the effective file-word target must
 * receive split review... a smaller source can receive split review when setup
 * finds clear semantic boundaries or when the user requests it -- never
 * automatically". Decided per `migrate` source only: `skip`/`residue`/
 * `blocked_pending_decision` never produce a concept, so the target does not
 * apply to them. `review_required` is `true` only for `above_target` (the one
 * mandatory case); `user_requested` is a *permitted* review, never forced.
 * `semantic_boundaries` is named for tasks 2-7 to carry forward verbatim, but
 * nothing detects it yet, so it is never produced here. Word count is the raw
 * file exactly as `readFile` returns it -- frontmatter and code included, per
 * `words.js`'s own rule -- not `data.mapping[].body`, which is the parsed body
 * with frontmatter stripped and links rewritten. An unreadable source (already
 * impossible for a `migrate` entry, which only exists once this same file was
 * read successfully during classification) counts as empty rather than
 * throwing, the same defensive shape `publish` already uses for a re-read.
 *
 * #201 task 2 (#200's "Source accounting" and "Validation and publication")
 * extends each entry with the source side of a split: the source content
 * identity the proposal binds, the derived sections of a source that is under
 * review, and -- once the caller supplies its own accounting in
 * `payload.split_sections` -- whether those ranges cover the complete source
 * once, with one disposition each and one accepted output order. Deriving and
 * validating both live in `scripts/lib/sections.js`; nothing here repairs,
 * moves, or drops a range, and `accounting_status` says exactly which of the
 * four states a source is in.
 *
 * Returns `{ reviews, findings }`: `data.split_review`'s own array, and the
 * blocking findings a broken accounting produced (none of which ever touches
 * the plan itself).
 */
function accountSplits(entries, payload, maxWords, gitRoot, services) {
  const requested = new Set(payload.split_requested || []);
  const supplied = new Map((payload.split_sections || []).map((item) => [item.path, item]));
  const findings = [];
  const refuse = (source, code, detail = {}) => findings.push(suiteFinding(code, { path: source, ...detail }));

  const reviews = entries.filter((item) => item.disposition === 'migrate').map((item) => {
    let raw;
    try {
      raw = services.readFile(path.join(gitRoot, item.path));
    } catch {
      raw = '';
    }
    const wordCount = words.countWords(raw);
    const aboveTarget = wordCount > maxWords;
    const accounting = supplied.get(item.path);
    const review = {
      path: item.path,
      word_count: wordCount,
      review_required: aboveTarget,
      review_reason: aboveTarget ? 'above_target' : (requested.has(item.path) ? 'user_requested' : null),
      source_identity: sections.identify(raw),
      line_count: 0,
      sections: [],
      outputs: [],
      accounting_status: 'not_required',
    };

    // #200 opens a split only through review. A source no trigger ever opened
    // stays one concept, so nothing is sectioned for it -- and an accounting
    // supplied for it is refused rather than blessing a split #200 never
    // allowed (symmetrical with `SPLIT_SOURCE_UNKNOWN` below).
    if (review.review_reason === null) {
      if (accounting !== undefined) {
        refuse(item.path, 'SPLIT_SOURCE_NOT_UNDER_REVIEW');
        review.accounting_status = 'refused';
      }
      return review;
    }

    // #200: "A source change invalidates the proposal before transformation or
    // publication" -- reported alone, with the accounting dropped rather than
    // measured, because ranges built against the old bytes say nothing at all
    // about the new ones.
    const stale = accounting !== undefined && accounting.source_identity !== undefined
      && accounting.source_identity !== review.source_identity;
    if (stale) {
      refuse(item.path, 'SPLIT_SOURCE_CHANGED', { expected: accounting.source_identity, actual: review.source_identity });
    }

    const accounted = sections.account(raw, accounting === undefined || stale ? null : accounting.sections);
    review.line_count = accounted.line_count;
    review.sections = accounted.sections;
    review.outputs = accounted.outputs;
    for (const { code, detail } of accounted.findings) refuse(item.path, code, detail);
    review.accounting_status = accounting === undefined
      ? 'derived'
      : (stale || accounted.findings.length > 0 ? 'refused' : 'complete');
    return review;
  });

  // An accounting for a path this plan has no `migrate` entry for is refused,
  // not quietly discarded: silently dropping it would let a caller believe a
  // split it proposed was validated.
  const accounted = new Set(reviews.map((item) => item.path));
  for (const unknown of supplied.keys()) {
    if (!accounted.has(unknown)) refuse(unknown, 'SPLIT_SOURCE_UNKNOWN');
  }
  return { reviews, findings };
}

function applySplitProposals(reviews, payload, mapped, entries, gitRoot, bundleRoot, services) {
  const supplied = new Map((payload.split_proposals || []).map((item) => [item.path, item]));
  const mappings = new Map(mapped.map((item) => [item.path, item]));
  const findings = [];
  const records = reviews.map((review) => {
    const mappedSource = mappings.get(review.path);
    let raw;
    try { raw = services.readFile(path.join(gitRoot, review.path)); } catch { raw = null; }
    const inventory = splitProposal.buildInventory(review.path, raw, review, gitRoot, bundleRoot, services);
    const proposal = supplied.get(review.path);
    const evaluated = proposal === undefined && review.accounting_status === 'complete'
      ? splitProposal.derive(review, mappedSource, mappedSource.sources || [], inventory)
      : proposal === undefined
        ? { proposal: null, findings: [] }
        : splitProposal.evaluate(review, proposal, mappedSource.sources || [], inventory);
    findings.push(...evaluated.findings.map((item) => suiteFinding(item.code, { path: review.path, ...item.detail })));
    return { path: review.path, review: { ...review, proposal: evaluated.proposal }, proposal: evaluated.proposal };
  });
  const known = new Set(reviews.map((item) => item.path));
  for (const source of supplied.keys()) {
    if (!known.has(source)) findings.push(suiteFinding('SPLIT_PROPOSAL_SOURCE_UNKNOWN', { path: source }));
  }
  const proposedSources = new Set(records.filter((item) => item.proposal !== null).map((item) => item.path));
  const normalTargets = entries.filter((item) => item.disposition === 'migrate' && !proposedSources.has(item.path))
    .map((item) => ({ source: item.path, target_path: `${item.concept}.md` }));
  const existingTargets = services.listFiles(bundleRoot).files.map((file) => path.relative(bundleRoot, file).split(path.sep).join('/'));
  const collisions = splitProposal.callTargetFindings(records.filter((item) => item.proposal !== null), normalTargets, existingTargets);
  for (const collision of collisions) {
    findings.push(suiteFinding(collision.code, { path: collision.path, ...collision.detail }));
    const record = records.find((item) => item.path === collision.path);
    record.proposal = splitProposal.refuse(record.proposal);
    record.review.proposal = record.proposal;
  }
  const groups = acceptedGroups.collect(records.map((item) => item.review));
  if (!groups.ok) {
    const participants = records.filter((item) => item.proposal?.outputs.some(
      (output) => output.reader_purpose_group?.key === groups.detail.group,
    ));
    for (const record of participants) {
      findings.push(suiteFinding('SPLIT_PROPOSAL_GROUP_CONFLICT', { path: record.path, ...groups.detail }));
      record.proposal = splitProposal.refuse(record.proposal);
      record.review.proposal = record.proposal;
    }
  }
  return { reviews: records.map((item) => item.review), findings };
}

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
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleRoot } = context;

  if (!Array.isArray(payload.sources) || !payload.sources.every(validPlanSource)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.answers !== undefined && (!payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers))) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  // #201 task 1: the caller's own explicit split-review request, one of #200's
  // two ways a source at or below the target can still receive review (the
  // other, `semantic_boundaries`, has no detector yet -- a later task's job).
  // Validated the same strict way `payload.answers` already is: garbage input
  // is refused before anything is computed, never silently ignored.
  if (payload.split_requested !== undefined) {
    const requestedOk = Array.isArray(payload.split_requested)
      && payload.split_requested.every((item) => typeof item === 'string' && item !== '');
    if (!requestedOk) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  // #201 task 2: the caller's own accounting of a source under split review --
  // one entry per source, each carrying that source's exact section ranges and
  // their dispositions, and optionally the source identity the accounting was
  // built against. Same strict posture: a malformed accounting is refused
  // before anything is computed, never partially honoured.
  if (payload.split_sections !== undefined && !validSplitSections(payload.split_sections)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.split_proposals !== undefined && !splitProposal.validPayload(payload.split_proposals)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }

  const outcome = migration.derivePlan(payload.sources, gitRoot, bundleRoot, services, payload.answers);
  if (outcome.invalid) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);

  // #197 (#200): `migration-plan` is the proposal `/setup`'s migration flow builds,
  // so the effective `max_words_per_file` and any settings finding are exposed here
  // the same way `inspect` already exposes them for the manifest itself (#197 task
  // 1) -- `migration-plan` is never bypass-gated (see `runtime.js`'s
  // `activationBypassOperations`), so a valid manifest is already guaranteed by the
  // time this line runs and `inspect` always reports `state: 'ok'` here. Resolved
  // through the same upward-walking `manifest.select()` the activation gate itself
  // used, not a hardcoded `<gitRoot>/.okf-workspace.json` (fix round 2, Important 3).
  const settingsReport = manifest.inspect(resolveManifestFile(payload, gitRoot, services), gitRoot, services);

  const split = accountSplits(outcome.entries, payload, settingsReport.settings.max_words_per_file, gitRoot, services);
  const proposed = applySplitProposals(
    split.reviews, payload, outcome.mapping, outcome.entries, gitRoot, bundleRoot, services,
  );

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
    // #188: a migrating body's link that resolves to nothing -- neither another
    // source this same call is migrating nor a real file staying in the project --
    // reported before anything is written, never blocking (a broken link is a
    // tolerated warning here, same tier as an open question or a duplicate).
    ...outcome.unresolvedLinks.map((l) => ({
      code: 'plan_link_unresolved',
      origin: 'suite',
      severity: 'warning',
      blocks: false,
      detail: { path: l.path, resource: l.resource, class: l.class },
    })),
    // #201 task 2: a broken source accounting blocks -- it is the one part of
    // this operation that refuses. The word target itself still never blocks
    // (#200), and neither does a blocked accounting rewrite the plan: the
    // entry keeps its own `migrate` disposition and `data.plan.executable`
    // keeps its own meaning (every source has a disposition).
    ...split.findings,
    ...proposed.findings,
  ];
  return respond(request, 'ok', {
    plan: { entries: outcome.entries, executable: outcome.executable, duplicates: outcome.duplicates },
    questions: outcome.questions,
    mapping: outcome.mapping,
    references: outcome.references,
    settings: settingsReport.settings,
    settings_findings: settingsReport.settings_findings,
    split_review: proposed.reviews,
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
  if (item.source_identity !== undefined && item.source_identity !== null
    && (typeof item.source_identity !== 'string' || !SHA256_IDENTITY.test(item.source_identity))) return false;
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
  const splitReview = partition.validateSplitReviews(payload.mapping, payload.split_review);
  if (!splitReview.ok) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [
      partitionFinding(splitReview.code, true, splitReview.detail),
    ]);
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

  const outcome = partition.computePartition(payload.plan, payload.mapping, payload.references, payload.split_review, {
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
  if (!Array.isArray(brief.split_review)) return false;
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
// #174: the observation binding a staged concept carries into `publish`. The
// concept's own accepted source file (`item.path`, the path the mapping was
// approved for) with the SHA-256 of its exact current bytes -- never `index.md`
// filler. One source hashed once serves every concept split out of it; an
// unreadable source yields no binding at all rather than an invented one.
function sourceBinding(gitRoot, sourcePath, identities, services) {
  const rel = monorepo.normalizeRelative(sourcePath);
  if (!rel) return [];
  if (!identities.has(rel)) {
    let digest = null;
    try {
      digest = crypto.createHash('sha256').update(services.readBuffer(path.join(gitRoot, rel))).digest('hex');
    } catch { digest = null; }
    identities.set(rel, digest);
  }
  const sha256 = identities.get(rel);
  return sha256 ? [{ path: rel, sha256 }] : [];
}

function executeAssemble(request, services) {
  const payload = request.payload;
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleName } = context;

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
  const identities = new Map();
  const staged = outcome.concepts.map((item) => {
    const file = path.join(stagingRoot, `${item.concept}.md`);
    services.mkdir(path.dirname(file));
    services.writeFile(file, item.rendered);
    return {
      path: item.path, concept: item.concept, type: item.type, shard: item.shard,
      file: path.relative(gitRoot, file),
      sources: sourceBinding(gitRoot, item.path, identities, services),
      ...(item.output === undefined ? {} : {
        output: item.output, sections: item.sections, accepted_output: item.accepted_output,
      }),
    };
  });
  for (const item of outcome.indexes) {
    const file = path.join(stagingRoot, item.path);
    services.mkdir(path.dirname(file));
    services.writeFile(file, item.rendered);
    staged.push({
      kind: 'index', path: item.path, file: path.relative(gitRoot, file), group: item.group,
    });
  }

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
 *
 * #149 audit note: this in-process call to `validation.validateRead` is not the
 * private read path the audit was looking for. `okf-read`'s own `validate`
 * operation (see `validateRead(request, services)` below, the router-level
 * function of the same name) calls the exact same shared function against the
 * live bundle; this operation calls it against the staging directory instead,
 * because staging is not an admitted OKF bundle at all -- it carries no
 * activation marker and sits beside the bundle, not inside it, so `okf-read`'s
 * own admission could never resolve it as a candidate in the first place.
 * Delegating this read through `okf-read` is therefore not merely unneeded
 * here, it is impossible without first admitting staging as a bundle, which it
 * deliberately is not (#131, #147). One implementation, two callers, one of
 * them reachable only in-process because its target is outside what the
 * bundle-shaped seam can even name.
 */
function validSelectedPath(item) {
  return typeof item === 'string' && item !== '';
}

const SEMANTIC_VERDICTS = new Set(['preserved', 'missing', 'duplicated', 'uncertain']);
const SHA256_IDENTITY = /^sha256:[0-9a-f]{64}$/;

function semanticRefusal(code, detail) {
  return { ok: false, finding: suiteFinding(code, detail) };
}

function contentIdentity(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

// Task 5 extends the existing semantic-review seam. It validates submitted
// read-only review evidence; it does not perform a model call or prompt.
function evaluateSemanticReview(semanticReview, splitReview, gitRoot, stagingRoot, services) {
  const reviewed = splitReview.filter((item) => item.proposal !== null).sort((a, b) => a.path.localeCompare(b.path));
  const rich = semanticReview.sources !== undefined || semanticReview.candidates !== undefined;
  if (reviewed.length === 0 && !rich) return {
    ok: true,
    passed: true,
    findings: [],
    result: { human_assessed: semanticReview.performed, candidates: [], sources: [] },
  };
  if (!rich) return semanticRefusal('SEMANTIC_REVIEW_MALFORMED', { reason: 'review_missing' });

  const sourceRows = semanticReview.sources;
  const candidateRows = semanticReview.candidates;
  const sourceShape = sourceRows.every((item) => item && typeof item === 'object' && !Array.isArray(item)
    && Object.keys(item).every((field) => ['path', 'source_identity', 'accepted', 'sections'].includes(field))
    && typeof item.path === 'string' && item.path !== ''
    && typeof item.source_identity === 'string' && SHA256_IDENTITY.test(item.source_identity)
    && item.accepted && typeof item.accepted === 'object' && !Array.isArray(item.accepted)
    && Array.isArray(item.sections));
  const candidateShape = candidateRows.every((item) => item && typeof item === 'object' && !Array.isArray(item)
    && Object.keys(item).length === 2 && typeof item.path === 'string' && item.path !== ''
    && typeof item.identity === 'string' && SHA256_IDENTITY.test(item.identity));
  if (!sourceShape || !candidateShape) {
    return semanticRefusal('SEMANTIC_REVIEW_MALFORMED', { reason: 'row_shape' });
  }

  const expectedSources = reviewed.map((item) => item.path);
  const sourceSet = canonicalReview.exactSet(expectedSources, sourceRows.map((item) => item.path));
  if (canonicalReview.differs(sourceSet)) return semanticRefusal('SEMANTIC_REVIEW_SOURCE_SET_MISMATCH', sourceSet);

  let listing;
  try { listing = services.listFiles(stagingRoot); } catch { listing = { files: [], complete: false }; }
  if (!listing.complete) return semanticRefusal('SEMANTIC_REVIEW_CANDIDATE_SCAN_INCOMPLETE', {});
  const currentCandidates = listing.files
    .filter(discovery.isMarkdownFile)
    .map((file) => path.relative(stagingRoot, file).split(path.sep).join('/'))
    .sort();
  const candidateSet = canonicalReview.exactSet(currentCandidates, candidateRows.map((item) => item.path));
  if (canonicalReview.differs(candidateSet)) return semanticRefusal('SEMANTIC_REVIEW_CANDIDATE_MISMATCH', candidateSet);

  for (const review of reviewed) {
    const submitted = sourceRows.find((item) => item.path === review.path);
    let currentSourceIdentity;
    try { currentSourceIdentity = sections.identify(services.readFile(path.join(gitRoot, review.path))); } catch { currentSourceIdentity = null; }
    if (submitted.source_identity !== review.source_identity || submitted.source_identity !== currentSourceIdentity) {
      return semanticRefusal('SEMANTIC_REVIEW_SOURCE_MISMATCH', {
        path: review.path, expected: review.source_identity, submitted: submitted.source_identity, actual: currentSourceIdentity,
      });
    }
    if (!isDeepStrictEqual(submitted.accepted, canonicalReview.acceptedReview(review))) {
      return semanticRefusal('SEMANTIC_REVIEW_ACCEPTED_MISMATCH', { path: review.path });
    }

    const sectionShape = submitted.sections.every((item) => item && typeof item === 'object' && !Array.isArray(item)
      && Object.keys(item).length === 3 && Number.isInteger(item.line_start) && Number.isInteger(item.line_end)
      && SEMANTIC_VERDICTS.has(item.verdict));
    if (!sectionShape) return semanticRefusal('SEMANTIC_REVIEW_MALFORMED', { reason: 'section_shape', path: review.path });
    const rangeKey = (item) => `${item.line_start}:${item.line_end}`;
    const sectionSet = canonicalReview.exactSet(review.sections.map(rangeKey), submitted.sections.map(rangeKey));
    if (canonicalReview.differs(sectionSet)) {
      return semanticRefusal('SEMANTIC_REVIEW_SECTION_SET_MISMATCH', { path: review.path, ...sectionSet });
    }
  }

  const candidates = [];
  for (const candidatePath of currentCandidates) {
    const submitted = candidateRows.find((item) => item.path === candidatePath);
    let actual;
    try { actual = contentIdentity(services.readBuffer(path.join(stagingRoot, candidatePath))); } catch {
      return semanticRefusal('SEMANTIC_REVIEW_CANDIDATE_READ_FAILED', { path: candidatePath });
    }
    if (submitted.identity !== actual) {
      return semanticRefusal('SEMANTIC_REVIEW_CANDIDATE_MISMATCH', {
        path: candidatePath, expected: submitted.identity, actual,
      });
    }
    candidates.push({ path: candidatePath, identity: actual });
  }

  const sourcesResult = reviewed.map((review) => {
    const submitted = sourceRows.find((item) => item.path === review.path);
    const verdicts = new Map(submitted.sections.map((item) => [`${item.line_start}:${item.line_end}`, item.verdict]));
    return {
      path: review.path,
      source_identity: review.source_identity,
      accepted: canonicalReview.acceptedReview(review),
      sections: review.sections.map((section) => ({
        line_start: section.line_start,
        line_end: section.line_end,
        verdict: verdicts.get(`${section.line_start}:${section.line_end}`),
      })),
    };
  });
  const findings = sourcesResult.flatMap((source) => source.sections
    .filter((section) => section.verdict !== 'preserved')
    .map((section) => suiteFinding(`SEMANTIC_SECTION_${section.verdict.toUpperCase()}`, {
      path: source.path, line_start: section.line_start, line_end: section.line_end,
    })));
  return {
    ok: true,
    passed: findings.length === 0,
    findings,
    result: { human_assessed: semanticReview.performed, candidates, sources: sourcesResult },
  };
}

function executeMigrationValidate(request, services) {
  const payload = request.payload;
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleName } = context;

  const selected =payload.selected === undefined ? [] : payload.selected;
  if (!Array.isArray(selected) || !selected.every(validSelectedPath)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!validPartitionPlan(payload.plan)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!validSemanticReview(payload.semantic_review, true)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.split_review !== undefined && !Array.isArray(payload.split_review)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (payload.split_review !== undefined) {
    const splitReview = partition.validateSplitReviews(
      payload.plan.entries.filter((item) => item.disposition === 'migrate').map((item) => ({ path: item.path })),
      payload.split_review,
    );
    if (!splitReview.ok) {
      return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [
        partitionFinding(splitReview.code, true, splitReview.detail),
      ]);
    }
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

  const semantic = evaluateSemanticReview(
    payload.semantic_review, payload.split_review || [], gitRoot, stagingRoot, services,
  );
  if (!semantic.ok) {
    const scanIncomplete = semantic.finding.code === 'SEMANTIC_REVIEW_CANDIDATE_SCAN_INCOMPLETE';
    return respond(request, 'blocked', {
      code: 'UNSUPPORTED_INPUT',
      ...(scanIncomplete ? { structural_coverage: { passed: false } } : {}),
    }, [semantic.finding]);
  }
  findings.push(...semantic.findings);

  const assessed = payload.semantic_review.performed === true;
  if (!assessed) findings.push(reportFinding('semantic_fidelity_not_assessed', 'warning', { scope: 'bundle' }));

  const structuralPassed = !findings.some((item) => item.blocks && !item.code.startsWith('SEMANTIC_SECTION_'));
  const publishable = structuralPassed && semantic.passed;
  return respond(request, 'ok', {
    status: publishable ? 'complete' : 'partial',
    publishable,
    missing_disposition: missingDisposition,
    concepts_checked: structural.data.concepts.map((item) => item.path),
    structural_coverage: { passed: structuralPassed },
    agent_semantic_review: { passed: semantic.passed },
    semantic_fidelity: { assessed },
    semantic_review: semantic.result,
  }, findings);
}

function validPublishStagedRef(item) {
  return publication.validStaged(item);
}

function dispatchBrief(brief) {
  return dispatchWrapper(DELEGATE_WRAPPER, brief);
}

// Distinguishes a truncated response (`dispatched.truncated`) from every other reason
// `dispatched.ok` came back false -- a crashed wrapper, a killed process, a non-JSON
// reply -- in the reported finding, rather than collapsing both into one opaque code.
function dispatchFailure(role, dispatched) {
  return {
    status: 'indeterminate',
    findings: [suiteFinding('PUBLISH_DISPATCH_FAILED', { gate: 'publish', role, truncated: !!(dispatched && dispatched.truncated) })],
  };
}

// #149: the one delegation brief `publish` issues as a *reader*, a fail-fast
// recheck of the target bundle's own current state through the identical
// seam a delegated write already uses (#132: read delegation is the same
// model as write), rather than a second, private admission implementation
// inside this operation. No concept-level data is requested or needed:
// `scripts/lib/delegation.js`'s own receipt shape deliberately never forwards
// an operation's `data` back to a caller (only `evidence`, `validation`,
// `residue`, and `actual_effects` -- see `delegation.receipt`), so this
// call's only usable signal is `status`/`findings`, which is exactly enough
// to answer the one question this step needs answered: is the target bundle
// currently in a state `okf-write` could actually create into.
function publishPrecheckBrief(cwd, bundle, taskKind) {
  return {
    role: 'okf-reader',
    task_kind: taskKind,
    operation_class: 'validate',
    cwd,
    bundle,
    paths: [bundle],
    allowed_effects: [],
    forbidden_effects: ['concept-create', 'concept-revise', 'format', 'relationship', 'machine-verify'],
    // #174: a read cites nothing, and `index.md` was never evidence for anything --
    // it was filler that satisfied an existence check.
    evidence: [],
    required_checks: ['runtime-preflight'],
    settings: { read_execution: 'delegated', write_execution: 'delegated' },
    expected_result: `${bundle} current bundle state confirmed before publish`,
  };
}

// The one delegation brief `publish` issues as a *writer*, once per staged
// concept: a `create` brief carrying the staged frontmatter tree (`status`
// stripped -- the write gate assigns its own `status: "draft"` and refuses a
// `set` that already names one, see `unsupportedPayload`) and the staged
// Markdown body, forwarded through the #149 extension to `buildRequest` in
// `scripts/lib/delegation.js`.
function publishWriteBrief(cwd, bundle, taskKind, concept, tree, body, sources) {
  return {
    role: 'okf-writer',
    task_kind: taskKind,
    operation_class: 'create',
    cwd,
    bundle,
    paths: [`${concept}.md`],
    changes: tree,
    body,
    allowed_effects: ['concept-create'],
    forbidden_effects: ['concept-revise', 'format', 'relationship', 'machine-verify'],
    // #174: the accepted migration proposal binds this concept to the actual source
    // file or files it was migrated from, each with its SHA-256 identity. One source
    // may appear under several concepts (a split); one concept may carry several
    // sources (a synthesis). The delegated `create` rechecks every binding itself.
    evidence: sources,
    required_checks: ['runtime-preflight'],
    settings: { read_execution: 'delegated', write_execution: 'delegated' },
    expected_result: `${concept}.md created from staged migration content`,
  };
}

// A staged file's own frontmatter tree, minus `status` (see `publishWriteBrief`
// above), plus its body. Reuses the exact reader `readTree`/`validateRead`
// already use internally (`parseFrontmatter` + `parseYAML`), never a second
// parser for the same staged shape `assembly.js`'s own `renderConcept` wrote.
function stagedConceptContent(text) {
  const extracted = validation.parseFrontmatter(text);
  const tree = validation.parseYAML(extracted.frontmatter);
  delete tree.status;
  return { tree, body: extracted.body };
}

/*
 * #149: the publication step -- staged concepts becoming real bundle concepts
 * -- through the write gate, never around it. `assemble` (#147) already
 * staged one Markdown file per concept outside the bundle; `publish` is the
 * only thing allowed to promote that staged content into the bundle itself,
 * and it does so exactly the way any other caller would: by building an
 * `okf-writer` delegation brief per concept and dispatching it through
 * `scripts/okf-delegate.js`, the identical process boundary a delegated
 * sub-agent's own `create` call would use (`agents/okf-writer.md`). `publish`
 * never calls `validation.evaluateCreate` itself, never calls
 * `services.publishFile` itself, and never requires `scripts/lib/delegation`
 * directly -- that would be a real circular require, since `delegation.js`
 * already requires this file for `primaryEffects`/`routerOwners`. It only
 * knows how to build a brief object and hand it to the one process that
 * already validates, admits, and writes with authority; see `DELEGATE_WRAPPER`
 * above for why spawning that sibling wrapper from here has precedent.
 *
 * `okf-setup` gains no role in `scripts/lib/delegation.js`'s `ROLES` map and
 * no entry in any adapter manifest's `bridge.skills` by doing this: it is
 * invoking the delegation bridge as a caller, the same way a human or an
 * agent typing `node scripts/okf-delegate.js` would, never registering itself
 * as a delegation target another caller could address. `okf-setup` still
 * accepts no delegation brief of its own (#134).
 *
 * `publish` is in `activationBypassOperations` above (it never touches the
 * bundle directly, so the outer activation gate has nothing of its own to
 * check), which means the one delegated `okf-reader` `validate` precheck
 * below is not optional defense-in-depth on top of some other admission --
 * it is the only thing standing between an explicit `publish` call and an
 * entirely inactive or invalid bundle. Its `okf-read` dispatch runs the
 * ordinary activation gate on its own copy of the request (`cwd`/`bundle`
 * unchanged), so an absent or invalid marker is caught there, honestly,
 * before any per-concept `create` is even attempted.
 */
function executePublish(request, services) {
  const payload = request.payload;
  const context = setupContext(request, services);
  if (context.refusal) return context.refusal;
  const { gitRoot, bundleRoot, bundleName } = context;

  if (!lifecycle.isWritableTaskKind(payload.task_kind)) {
    return respond(request, 'blocked', { code: 'TASK_KIND_NOT_WRITE_ELIGIBLE' }, []);
  }
  if (!Array.isArray(payload.staged) || payload.staged.length === 0 || !payload.staged.every(validPublishStagedRef)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  if (!publication.validPlan(payload.plan) || !publication.validMapping(payload.mapping)
    || !Array.isArray(payload.split_review)
    || !publication.validCanonicalReview(payload.semantic_review)) {
    return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, []);
  }
  const planMapping = publication.planMappingCoverage(payload.plan, payload.mapping);
  if (!planMapping.ok) {
    return respond(request, 'blocked', { code: 'PUBLISH_PRECHECK_FAILED' }, [
      suiteFinding(planMapping.finding.code, planMapping.finding.detail),
    ]);
  }
  const splitReview = partition.validateSplitReviews(payload.mapping, payload.split_review);
  if (!splitReview.ok) return respond(request, 'blocked', { code: 'UNSUPPORTED_INPUT' }, [
    partitionFinding(splitReview.code, true, splitReview.detail),
  ]);

  const cwd = payload.cwd;
  const stagingRoot = path.join(gitRoot, '.okf-staging', bundleName);

  const precheckDispatch = dispatchBrief(publishPrecheckBrief(cwd, bundleName, payload.task_kind));
  const precheck = precheckDispatch.ok ? precheckDispatch.response : dispatchFailure('okf-reader', precheckDispatch);
  if (precheck.status !== 'ok') {
    return respond(request, 'blocked', { code: 'PUBLISH_PRECHECK_FAILED' }, precheck.findings || []);
  }

  const checked = publication.evaluate({
    gitRoot, bundleRoot, stagingRoot, plan: payload.plan, mapping: payload.mapping, splitReview: payload.split_review,
    staged: payload.staged, semanticReview: payload.semantic_review, services,
  });
  if (!checked.ok) {
    return respond(request, 'blocked', { code: 'PUBLISH_PRECHECK_FAILED' }, [suiteFinding(checked.finding.code, checked.finding.detail)]);
  }

  const results = [];
  for (const item of checked.checked) {
    const target = path.join(bundleRoot, item.target);
    if (!publication.safePath(bundleRoot, target, services)) {
      results.push({ concept: item.concept || item.path, status: 'blocked: target-symlink', findings: [suiteFinding('PUBLISH_TARGET_SYMLINK', { path: item.target })] });
      break;
    }
    if (item.kind === 'index') {
      try {
        services.publishFile(target, item.text, null);
        results.push({ concept: item.path, status: 'clean', findings: [] });
      } catch (error) {
        results.push({ concept: item.path, status: 'failed', findings: [suiteFinding('PUBLISH_INDEX_WRITE_FAILED', {
          path: item.path, reason: writeFailureReason(error),
        })] });
        break;
      }
      continue;
    }
    const tree = { ...item.tree };
    delete tree.status;
    const brief = publishWriteBrief(cwd, bundleName, payload.task_kind, item.concept, tree, item.body, item.sources);
    const writeDispatch = dispatchBrief(brief);
    const outcome = writeDispatch.ok ? writeDispatch.response : dispatchFailure('okf-writer', writeDispatch);
    results.push({ concept: item.concept, status: outcome.status, findings: outcome.findings || [] });
    if (outcome.status !== 'clean') break;
  }
  const attempted = new Set(results.map((item) => item.concept));
  const skipped = checked.checked.filter((item) => !attempted.has(item.concept || item.path))
    .map((item) => ({ concept: item.concept || item.path, status: 'not-attempted' }));

  const published = results.filter((item) => item.status === 'clean').map((item) => item.concept);
  const failed = results.filter((item) => item.status !== 'clean');
  const findings = failed.flatMap((item) => item.findings.map((finding) => (
    { ...finding, detail: { ...finding.detail, concept: item.concept } }
  )));

  return respond(request, 'ok', {
    status: failed.length === 0 ? 'complete' : 'partial',
    candidate_conformance: {
      passed: true,
      concepts: checked.checked.filter((item) => item.kind === 'concept')
        .map((item) => ({ source: item.source, concept: item.concept, path: item.path })),
      navigation_indexes: checked.checked.filter((item) => item.kind === 'index')
        .map((item) => ({ path: item.path })),
    },
    published,
    failed: failed.map((item) => ({ concept: item.concept, status: item.status })),
    skipped,
    results: [...results, ...skipped.map((item) => ({ ...item, findings: [] }))],
  }, findings);
}

// The one dispatch table for `okf-setup`'s operations: `runtime.js` looks an operation
// up here instead of carrying a second cascade that has to be edited in step with this
// file every time an operation is added.
const operations = new Map([
  ['init', executeInit], ['inspect', executeInspect], ['repair', executeRepair],
  ['plan', executePlan], ['aggregate', executeAggregate], ['report', executeReport],
  ['discover', executeDiscover], ['migration-plan', executeMigrationPlan],
  ['partition', executePartition], ['assemble', executeAssemble],
  ['migration-validate', executeMigrationValidate], ['publish', executePublish],
]);

module.exports = { operations };
