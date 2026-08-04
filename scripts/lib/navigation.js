const path = require('node:path');
const validation = require('./validation');

const NAVIGATION_CHANNEL_EXACT = 'exact path';
const NAVIGATION_CHANNEL_SEARCH = 'native search';
const MAX_SOURCE_FILES = 500;
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_DIRECTORY_DEPTH = 6;

function navigationFinding(code, detail, severity = 'warning', blocks = false) {
  return { code, origin: 'suite', severity, blocks, detail };
}

function navigationScope(candidates, channel) {
  return { bundles: candidates.map((candidate) => candidate.bundle_alias), channel };
}

function navigationData(match, scope, found = [], read = [], coverage = 'non-exhaustive') {
  return { match, scope, found, read, coverage };
}

function notConfiguredData(operation) {
  const channel = operation === 'search' ? NAVIGATION_CHANNEL_SEARCH : NAVIGATION_CHANNEL_EXACT;
  return navigationData('no match in searched scope', { bundles: [], channel });
}

function contained(target, root) {
  return target === root || target.startsWith(root === path.parse(root).root ? root : root + path.sep);
}

function safeExists(file, services) {
  try { return typeof services.exists === 'function' && services.exists(file); } catch { return false; }
}

function readValue(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return typeof value === 'string' ? value : null;
}

function readObservation(file, services) {
  let value;
  try {
    value = services.readFile(file);
  } catch (error) {
    return { ok: false, error };
  }

  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    return { ok: true, content: readValue(value), complete: true };
  }

  if (value !== null && typeof value === 'object' && Object.hasOwn(value, 'content')) {
    const content = readValue(value.content);
    return content === null
      ? { ok: false, error: new Error('read service returned no text') }
      : { ok: true, content, complete: value.complete === true };
  }

  return { ok: false, error: new Error('read service returned no text') };
}

function guardPath(candidate, file, services, envelopeRoot) {
  if (typeof services.realpath !== 'function') return { state: 'unobservable' };
  const absolute = path.resolve(file);
  try {
    const root = envelopeRoot || services.realpath(path.resolve(candidate.bundle_root));
    const real = services.realpath(absolute);
    if (typeof root !== 'string' || typeof real !== 'string') return { state: 'unobservable' };
    if (!contained(real, root)) {
      return {
        state: 'invalid',
        detail: {
          gate: 'navigation scope',
          reason: 'safety_contract_violation',
          path: path.relative(root, real).split(path.sep).join('/'),
        },
      };
    }
    const relative = path.relative(root, real).split(path.sep).join('/');
    return { state: 'ok', root, real, relative };
  } catch {
    return { state: 'unobservable' };
  }
}

function scopeEnvelope(candidate, services) {
  if (typeof services.realpath !== 'function') return { state: 'unobservable' };
  try {
    const root = services.realpath(path.resolve(candidate.bundle_root));
    return typeof root === 'string' && path.isAbsolute(root)
      ? { state: 'ok', root }
      : { state: 'unobservable' };
  } catch {
    return { state: 'unobservable' };
  }
}

function reference(candidate, relative) {
  const concept = relative.endsWith('.md') ? relative.slice(0, -3) : relative;
  return { path: relative, bundle_alias: candidate.bundle_alias, concept_id: concept };
}

function addFinding(findings, item) {
  const key = JSON.stringify(item);
  if (!findings.some((findingItem) => JSON.stringify(findingItem) === key)) findings.push(item);
}

function parseNavigationRecord(candidate, guard, observation, findings) {
  const record = { ...reference(candidate, guard.relative), content: observation.content };
  let parsed;
  try {
    const extracted = validation.parseFrontmatter(observation.content);
    parsed = { frontmatter: validation.parseYAML(extracted.frontmatter), body: extracted.body };
    record.frontmatter = parsed.frontmatter;
    record.body = parsed.body;
    if (Array.isArray(parsed.frontmatter.sources) && parsed.frontmatter.sources.length > 0) {
      record.provenance = parsed.frontmatter.sources;
    }
  } catch (error) {
    addFinding(findings, navigationFinding('unreadable', {
      gate: 'navigation',
      path: guard.relative,
      reason: error.reason || error.message || 'frontmatter_parse_failure',
    }, 'error', false));
  }
  return {
    record,
    status: parsed && parsed.frontmatter.status,
    statusObserved: parsed !== undefined && Object.hasOwn(parsed.frontmatter, 'status'),
  };
}

function inspectIndex(candidate, services, findings) {
  const index = path.join(candidate.bundle_root, 'index.md');
  const relative = 'index.md';
  if (!safeExists(index, services)) {
    addFinding(findings, navigationFinding('unreadable', {
      gate: 'navigation', path: relative, reason: 'missing_index', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
    return { complete: false };
  }

  const guard = guardPath(candidate, index, services);
  if (guard.state === 'invalid') {
    addFinding(findings, navigationFinding('invalid', guard.detail, 'error', true));
    return { complete: false, invalid: true };
  }
  if (guard.state !== 'ok') {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', path: relative, reason: 'scope_unobservable', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
    return { complete: false };
  }

  const observation = readObservation(index, services);
  if (!observation.ok) {
    addFinding(findings, navigationFinding('unreadable', {
      gate: 'navigation', path: relative, reason: 'index_read_failure', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
    return { complete: false };
  }
  if (!observation.complete) {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', path: relative, reason: 'eof_unobservable', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
  }
  return { complete: observation.complete };
}

function listedFile(root, entry) {
  const value = typeof entry === 'string' ? entry : entry && entry.path;
  if (typeof value !== 'string') return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

function listEntries(candidate, services, findings) {
  if (typeof services.listFiles !== 'function') {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', reason: 'enumeration_unobservable', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
    return null;
  }

  let root = path.resolve(candidate.bundle_root);
  try {
    if (typeof services.realpath === 'function') root = services.realpath(root);
  } catch {}

  let entries;
  try {
    entries = services.listFiles(root);
  } catch {
    entries = null;
  }
  if (!Array.isArray(entries)) {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', reason: 'enumeration_unobservable', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
    return null;
  }
  if (entries.complete === false) {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', reason: 'enumeration_incomplete', bundle_alias: candidate.bundle_alias,
    }, 'error', false));
  }
  return { root, entries };
}

function supportEvidence(candidates, services, findings, readMissingBodies) {
  let files = 0;
  let bytes = 0;
  let depth = 0;
  let observable = true;

  for (const candidate of candidates) {
    const listing = listEntries(candidate, services, findings);
    if (!listing) {
      observable = false;
      continue;
    }
    const { root, entries } = listing;
    if (entries.complete === false) observable = false;
    for (const entry of entries) {
      const file = listedFile(root, entry);
      if (!file) {
        observable = false;
        continue;
      }
      const relative = path.relative(root, file).split(path.sep).join('/');
      const parts = relative.split('/');
      if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('../')) {
        addFinding(findings, navigationFinding('invalid', {
          gate: 'navigation scope', reason: 'safety_contract_violation', path: relative,
        }, 'error', true));
        observable = false;
        continue;
      }
      if (parts.includes('.git') || relative === '.okf-active' || relative === '.okf-workspace.json') continue;
      const guard = guardPath(candidate, file, services);
      if (guard.state === 'invalid') {
        addFinding(findings, navigationFinding('invalid', guard.detail, 'error', true));
        observable = false;
        continue;
      }
      if (guard.state !== 'ok') {
        observable = false;
        continue;
      }
      files += 1;
      depth = Math.max(depth, Math.max(0, parts.length - 1));

      let size = null;
      if (readMissingBodies) {
        const observation = readObservation(file, services);
        if (observation.ok && observation.complete) size = Buffer.byteLength(observation.content, 'utf8');
        else {
          observable = false;
          if (!observation.ok) addFinding(findings, navigationFinding('unreadable', {
            gate: 'navigation', path: relative, reason: 'support_evidence_unreadable', bundle_alias: candidate.bundle_alias,
          }, 'error', false));
          else addFinding(findings, navigationFinding('unobservable', {
            gate: 'navigation', path: relative, reason: 'eof_unobservable', bundle_alias: candidate.bundle_alias,
          }, 'error', false));
        }
      }
      if (size === null) observable = false;
      else bytes += size;
    }
  }

  return {
    complete: observable && files <= MAX_SOURCE_FILES && bytes <= MAX_SOURCE_BYTES && depth <= MAX_DIRECTORY_DEPTH,
    observable,
    files,
    bytes,
    depth,
  };
}

function admissionSupport(data, support, getActiveCandidates) {
  return data.coverage === 'non-exhaustive' || getActiveCandidates(data).length === 0
    ? { ...support, complete: false }
    : support;
}

function routeScope(data, route, getActiveCandidates) {
  if (route && Array.isArray(route.eligible)) return route.eligible;
  return getActiveCandidates(data);
}

function resultState(findings, support, indexes, hasRead, unavailable = false) {
  if (unavailable && !hasRead) return 'unavailable';
  if (!support.complete || indexes.some((index) => !index.complete) || findings.some((item) => (
    item.code === 'invalid' || item.code === 'unobservable' || (item.code === 'unreadable' && item.severity === 'error')
  ))) return 'degraded';
  return 'ok';
}

function read(data, payload, services, locate, getActiveCandidates) {
  const route = locate(data, payload, services);
  const scopeCandidates = routeScope(data, route, getActiveCandidates);
  const scope = navigationScope(scopeCandidates, NAVIGATION_CHANNEL_EXACT);
  const findings = [];
  const found = [];
  const readRecords = [];
  const indexes = scopeCandidates.map((candidate) => inspectIndex(candidate, services, findings));

  if (route.findings.length) {
    const support = admissionSupport(data, supportEvidence(scopeCandidates, services, findings, false), getActiveCandidates);
    const missingFinding = route.findings.find((item) => item.code === 'missing');
    addFinding(findings, navigationFinding('missing', {
      gate: 'navigation', reason: missingFinding ? missingFinding.detail.reason : 'concept_not_found',
    }, 'error', false));
    const state = scopeCandidates.length === 0
      ? 'unavailable'
      : resultState(findings, support, indexes, false);
    return {
      result: state,
      data: navigationData('no match in searched scope', scope, found, readRecords, state === 'ok' ? 'complete' : 'non-exhaustive'),
      findings,
    };
  }

  const support = admissionSupport(data, supportEvidence(scopeCandidates, services, findings, true), getActiveCandidates);
  const selectedItem = route.unique[0];
  const selectedGuard = guardPath(selectedItem.candidate, selectedItem.file, services);
  if (selectedGuard.state === 'invalid') {
    addFinding(findings, navigationFinding('invalid', selectedGuard.detail, 'error', true));
    return {
      result: 'unavailable',
      data: navigationData('found', scope, found, readRecords, 'non-exhaustive'),
      findings,
    };
  }
  if (selectedGuard.state !== 'ok') {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', path: path.relative(selectedItem.candidate.bundle_root, selectedItem.file).split(path.sep).join('/'), reason: 'scope_unobservable',
    }, 'error', false));
    return {
      result: 'unavailable',
      data: navigationData('found', scope, found, readRecords, 'non-exhaustive'),
      findings,
    };
  }
  const safeMatches = [{ ...selectedItem, guard: selectedGuard }];
  found.push(reference(selectedItem.candidate, selectedGuard.relative));
  for (const item of route.unique.slice(1)) {
    if (!safeExists(item.file, services)) continue;
    const guard = guardPath(item.candidate, item.file, services);
    if (guard.state === 'invalid') {
      addFinding(findings, navigationFinding('invalid', guard.detail, 'error', true));
      continue;
    }
    if (guard.state !== 'ok') {
      addFinding(findings, navigationFinding('unobservable', {
        gate: 'navigation', path: path.relative(item.candidate.bundle_root, item.file).split(path.sep).join('/'), reason: 'scope_unobservable',
      }, 'error', false));
      continue;
    }
    safeMatches.push({ ...item, guard });
    found.push(reference(item.candidate, guard.relative));
  }

  const selected = safeMatches[0];
  const observation = readObservation(selected.file, services);
  if (!observation.ok) {
    addFinding(findings, navigationFinding('unreadable', {
      gate: 'navigation', path: selected.guard.relative, reason: 'concept_read_failure',
    }, 'error', false));
    return {
      result: 'unavailable',
      data: navigationData('found', scope, found, readRecords, 'non-exhaustive'),
      findings,
    };
  }
  if (!observation.complete) {
    addFinding(findings, navigationFinding('unobservable', {
      gate: 'navigation', path: selected.guard.relative, reason: 'eof_unobservable',
    }, 'error', false));
  }
  const parsed = parseNavigationRecord(selected.candidate, selected.guard, observation, findings);
  readRecords.push(parsed.record);
  if (parsed.status === 'deprecated') {
    addFinding(findings, navigationFinding('unreadable', {
      gate: 'navigation', path: selected.guard.relative, reason: 'deprecated_concept',
    }, 'warning', false));
  }

  const state = resultState(findings, support, indexes, true);
  return {
    result: state,
    data: navigationData('found', scope, found, readRecords, state === 'ok' ? 'complete' : 'non-exhaustive'),
    findings,
  };
}

function nativePath(item) {
  return typeof item === 'string' ? item : item && (item.path || item.file);
}

function nativeSearchResults(value) {
  const results = Array.isArray(value)
    ? value
    : value !== null && typeof value === 'object' && typeof nativePath(value) === 'string'
      ? [value]
      : null;
  if (results === null) return { results: [], observable: false };
  return {
    results,
    observable: results.every((item) => typeof nativePath(item) === 'string' && nativePath(item) !== ''),
  };
}

function search(data, payload, services, getActiveCandidates) {
  const candidates = getActiveCandidates(data);
  const scope = navigationScope(candidates, NAVIGATION_CHANNEL_SEARCH);
  const findings = [];
  const found = [];
  const readRecords = [];
  const indexes = [];
  const searchCandidates = [];
  const seenRoots = new Set();
  let searchUnavailable = false;
  let searched = 0;
  let archiveUnevaluated = false;

  for (const candidate of candidates) {
    const envelope = scopeEnvelope(candidate, services);
    if (envelope.state !== 'ok') {
      indexes.push({ complete: false });
      addFinding(findings, navigationFinding('unobservable', {
        gate: 'navigation', reason: 'scope_unobservable', bundle_alias: candidate.bundle_alias,
      }, 'error', false));
      continue;
    }
    if (seenRoots.has(envelope.root)) continue;
    seenRoots.add(envelope.root);
    searchCandidates.push({ candidate, root: envelope.root });
  }

  if (candidates.length === 0) {
    return {
      result: 'unavailable',
      data: navigationData('no match in searched scope', scope, found, readRecords, 'non-exhaustive'),
      findings,
    };
  }

  for (const { candidate, root } of searchCandidates) {
    indexes.push(inspectIndex(candidate, services, findings));
    if (typeof services.search !== 'function') {
      searchUnavailable = true;
      addFinding(findings, navigationFinding('unreadable', {
        gate: 'navigation', reason: 'search_service_unavailable', bundle_alias: candidate.bundle_alias,
      }, 'error', false));
      continue;
    }

    let native;
    try {
      native = services.search(root, payload.query);
      searched += 1;
    } catch {
      searchUnavailable = true;
      addFinding(findings, navigationFinding('unreadable', {
        gate: 'navigation', reason: 'search_service_unavailable', bundle_alias: candidate.bundle_alias,
      }, 'error', false));
      continue;
    }
    const nativeResult = nativeSearchResults(native);
    if (!nativeResult.observable) {
      archiveUnevaluated = true;
      addFinding(findings, navigationFinding('unobservable', {
        gate: 'navigation', reason: 'native_result_unobservable', bundle_alias: candidate.bundle_alias,
      }, 'error', false));
    }
    if (nativeResult.results.length === 0) archiveUnevaluated = true;

    for (const item of nativeResult.results) {
      const value = nativePath(item);
      if (typeof value !== 'string' || value === '') continue;
      const file = path.isAbsolute(value) ? path.resolve(value) : path.resolve(candidate.bundle_root, value);
      const guard = guardPath(candidate, file, services, root);
      if (guard.state === 'invalid') {
        addFinding(findings, navigationFinding('invalid', guard.detail, 'error', true));
        continue;
      }
      if (guard.state !== 'ok') {
        addFinding(findings, navigationFinding('unobservable', {
          gate: 'navigation', path: value, reason: 'scope_unobservable', bundle_alias: candidate.bundle_alias,
        }, 'error', false));
        continue;
      }
      const basename = path.posix.basename(guard.relative);
      if (!guard.relative.endsWith('.md') || basename === 'index.md' || basename === 'log.md') {
        archiveUnevaluated = true;
        continue;
      }
      if (!safeExists(file, services)) {
        addFinding(findings, navigationFinding('unreadable', {
          gate: 'navigation', path: value, reason: 'native_path_unreadable', bundle_alias: candidate.bundle_alias,
        }, 'error', false));
        continue;
      }

      const observation = readObservation(file, services);
      if (!observation.ok) {
        addFinding(findings, navigationFinding('unreadable', {
          gate: 'navigation', path: guard.relative, reason: 'concept_read_failure', bundle_alias: candidate.bundle_alias,
        }, 'error', false));
        continue;
      }
      if (!observation.complete) {
        addFinding(findings, navigationFinding('unobservable', {
          gate: 'navigation', path: guard.relative, reason: 'eof_unobservable', bundle_alias: candidate.bundle_alias,
        }, 'error', false));
      }
      const parsed = parseNavigationRecord(candidate, guard, observation, findings);
      if (!parsed.statusObserved) archiveUnevaluated = true;
      if (parsed.status === 'deprecated') continue;
      found.push(reference(candidate, guard.relative));
      readRecords.push(parsed.record);
    }
  }

  const support = admissionSupport(data, supportEvidence(candidates, services, findings, true), getActiveCandidates);
  const match = found.length ? 'found' : 'no match in searched scope';
  const state = searchUnavailable && readRecords.length === 0
    ? 'unavailable'
    : archiveUnevaluated
      ? 'degraded'
      : resultState(findings, support, indexes, readRecords.length > 0, searched === 0);
  const extra = archiveUnevaluated ? { archive_predicate: 'unevaluated' } : {};
  return {
    result: state,
    data: { ...navigationData(match, scope, found, readRecords, state === 'ok' ? 'complete' : 'non-exhaustive'), ...extra },
    findings,
  };
}

module.exports = { read, search, notConfiguredData };
