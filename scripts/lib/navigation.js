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
      if (parsed.status === 'deprecated') {
        if (payload.include_deprecated !== true) continue;
        addFinding(findings, navigationFinding('unreadable', {
          gate: 'navigation', path: guard.relative, reason: 'deprecated_concept',
        }, 'warning', false));
      }
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

function byteOffset(text, index) {
  return Buffer.byteLength(text.slice(0, index), 'utf8');
}

function localReference(value) {
  if (typeof value !== 'string' || value === '' || value.startsWith('#') || value.startsWith('?') ||
    value.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return null;
  const target = value.split(/[?#]/, 1)[0];
  if (target === '') return null;
  return path.posix.normalize(target);
}

function workspaceReference(value) {
  if (typeof value !== 'string' || !value.startsWith('okf-workspace://')) return null;
  const match = value.match(/^okf-workspace:\/\/([^/?#]+)\/([^?#]+)(?:[?#].*)?$/);
  if (!match || match[2].includes('..')) return null;
  return { alias: match[1], concept: match[2] };
}

function scalar(value) {
  try { return validation.parseYAML(`value: ${value}`).value; } catch { return null; }
}

function parsedFrontmatterLinks(frontmatter) {
  const links = [];
  const add = (carrier, value) => {
    if (typeof value === 'string' && value !== '') links.push({ carrier, value });
  };
  add('frontmatter.resource', frontmatter.resource);
  for (const source of Array.isArray(frontmatter.sources) ? frontmatter.sources : []) {
    if (source && typeof source === 'object') add('frontmatter.sources[].resource', source.resource);
  }
  add('frontmatter.computation', frontmatter.computation);
  if (frontmatter.executor && typeof frontmatter.executor === 'object') add('frontmatter.executor.resource', frontmatter.executor.resource);
  if (frontmatter.attester && typeof frontmatter.attester === 'object') add('frontmatter.attester.resource', frontmatter.attester.resource);
  return links;
}

function frontmatterLine(raw) {
  const line = raw.replace(/[\r\n]+$/, '');
  const match = line.match(/^( *)(-\s+)?(?:"(resource|computation)"|'(resource|computation)'|(resource|computation)):[ \t]*(.*)$/);
  if (!match) return null;
  const value = scalar(match[6]);
  return {
    indent: match[1].length,
    sequence: match[2] !== undefined,
    field: match[3] || match[4] || match[5],
    value,
    valueOffset: line.length - match[6].length,
  };
}

function mappingLine(raw) {
  const line = raw.replace(/[\r\n]+$/, '');
  const match = line.match(/^( *)(-\s+)?(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^ :][^:]*):(?:[ \t]|$)/);
  return match && { indent: match[1].length, sequence: match[2] !== undefined };
}

function sectionName(raw) {
  const line = raw.replace(/[\r\n]+$/, '');
  const match = line.match(/^(?:"(sources|executor|attester)"|'(sources|executor|attester)'|(sources|executor|attester)):[ \t]*(?:#.*)?$/);
  return match && (match[1] || match[2] || match[3]);
}

function frontmatterLinks(text, bodyStart, add, incomplete) {
  let extracted;
  let parsed;
  try {
    extracted = validation.parseFrontmatter(text);
    parsed = validation.parseYAML(extracted.frontmatter);
  } catch {
    incomplete('frontmatter_unparseable');
    return;
  }
  const expected = parsedFrontmatterLinks(parsed);
  const opening = text.indexOf('\n') + 1;
  const frontmatter = text.slice(opening, bodyStart);
  let section = null;
  let mapIndent = null;
  let sourcePropertyIndent = null;
  let offset = opening;
  for (const raw of frontmatter.split(/(?<=\n)/)) {
    const line = raw.replace(/[\r\n]+$/, '');
    const rootSection = sectionName(raw);
    if (rootSection) {
      section = rootSection;
      mapIndent = null;
      sourcePropertyIndent = null;
    } else if (/^\S/.test(line)) {
      section = null;
    }
    const item = frontmatterLine(raw);
    const mapping = mappingLine(raw);
    let carrier = null;
    if (item) {
      if (item.indent === 0) {
        if (item.field === 'resource') carrier = 'frontmatter.resource';
        if (item.field === 'computation') carrier = 'frontmatter.computation';
      } else if (section === 'sources') {
        if (item.sequence) {
          sourcePropertyIndent = item.indent + 2;
          if (item.field === 'resource') carrier = 'frontmatter.sources[].resource';
        } else if (item.indent === sourcePropertyIndent && item.field === 'resource') {
          carrier = 'frontmatter.sources[].resource';
        }
      } else if (section === 'executor' || section === 'attester') {
        if (mapping && !mapping.sequence && mapIndent === null) mapIndent = mapping.indent;
        if (!item.sequence && item.indent === mapIndent && item.field === 'resource') {
          carrier = `frontmatter.${section}.resource`;
        }
      }
    } else if (section === 'sources' && /^ *(?:-|#|$)/.test(line)) {
      const indent = line.match(/^ */)[0].length;
      if (line.trim().startsWith('-')) {
        sourcePropertyIndent = indent + 2;
      }
    }
    if (carrier && typeof item.value === 'string' && item.value !== '') {
      const index = expected.findIndex((link) => link.carrier === carrier && link.value === item.value);
      if (index >= 0) {
        const link = expected.splice(index, 1)[0];
        add(link.carrier, link.value, offset + item.valueOffset, 'bundle');
      }
    }
    offset += raw.length;
  }
  if (expected.length) incomplete('frontmatter_location_unobservable');
}

function visibleMarkdown(text) {
  let fence = null;
  const visible = text.split(/(?<=\n)/).map((raw) => {
    const line = raw.replace(/[\r\n]+$/, '');
    const marker = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && marker[2].trim() === '') fence = null;
      return raw.replace(/[^\r\n]/g, ' ');
    }
    if (fence) return raw.replace(/[^\r\n]/g, ' ');
    return raw;
  }).join('');
  const masked = visible.split('');
  for (let start = 0; start < visible.length; start++) {
    if (visible[start] !== '`') continue;
    let length = 1;
    while (visible[start + length] === '`') length++;
    let end = start + length;
    while (end < visible.length) {
      if (visible[end] !== '`') {
        end++;
        continue;
      }
      let closingLength = 1;
      while (visible[end + closingLength] === '`') closingLength++;
      if (closingLength === length) {
        for (let index = start; index < end + length; index++) {
          if (masked[index] !== '\r' && masked[index] !== '\n') masked[index] = ' ';
        }
        start = end + length - 1;
        break;
      }
      end += closingLength;
    }
    start += length - 1;
  }
  return masked.join('');
}

function inlineDestination(text, start) {
  if (text[start] === '<') {
    const end = text.indexOf('>', start + 1);
    return end < 0 || text.slice(start, end).includes('\n') ? null : { value: text.slice(start + 1, end), start: start + 1 };
  }
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (character === '\n' || /\s/.test(character)) return index === start ? null : { value: text.slice(start, index), start };
    if (character === '\\' && index + 1 < text.length) {
      index++;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')') {
      if (depth === 0) return { value: text.slice(start, index), start };
      depth--;
    }
  }
  return null;
}

function markdownLinks(text, start, add) {
  const visible = visibleMarkdown(text);
  for (const match of visible.matchAll(/\[[^\]\n]*\]\(\s*/g)) {
    if (visible[match.index - 1] === '!' || visible[match.index - 1] === '\\') continue;
    const destination = inlineDestination(visible, match.index + match[0].length);
    if (destination) add('markdown.inline', destination.value, start + destination.start, 'relative');
  }
  for (const match of visible.matchAll(/^[ \t]{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]*)>|([^\s\n]+))/gm)) {
    const value = match[1] === undefined ? match[2] : match[1];
    const startInMatch = match[0].lastIndexOf(value);
    if (startInMatch >= 0) add('markdown.reference-definition', value, start + match.index + startInMatch, 'relative');
  }
}

function enumerate(data, payload, services, getActiveCandidates) {
  const candidates = getActiveCandidates(data);
  const findings = [];
  const reasons = [];
  const links = [];
  let current;
  const addReason = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
  const add = (carrier, value, offset, base) => {
    const workspace = workspaceReference(value);
    const reference = workspace ? `okf-workspace://${workspace.alias}/${workspace.concept}` : localReference(value);
    if (!reference) return;
    let target = null;
    let targetRoot = current.root;
    if (workspace) {
      const candidate = candidates.find((item) => item.bundle_alias === workspace.alias);
      if (!candidate) addFinding(findings, navigationFinding('diagnostic', {
        gate: 'read routing', reason: 'workspace_alias_inactive_or_missing',
      }));
      const concept = workspace.concept.endsWith('.md') ? workspace.concept : `${workspace.concept}.md`;
      target = candidate && path.resolve(candidate.bundle_root, concept);
      targetRoot = candidate && candidate.bundle_root;
    } else {
      const root = current.root;
      target = base === 'bundle'
        ? path.resolve(root, reference.startsWith('/') ? `.${reference}` : reference)
        : path.resolve(path.dirname(current.file), reference);
    }
    let resolves = false;
    try { resolves = Boolean(target && targetRoot && contained(target, targetRoot) && safeExists(target, services) && services.isFile(target)); } catch {}
    const verdict = resolves ? 'resolves' : 'unexpectedly-broken';
    const record = {
      carrier,
      source: { bundle_alias: current.candidate.bundle_alias, path: current.path, byte_offset: byteOffset(current.text, offset) },
      reference,
      verdict,
    };
    links.push(record);
    if (verdict === 'unexpectedly-broken') {
      findings.push({
        code: 'UNRESOLVED_INTERNAL_LINK', origin: 'okf', severity: 'warning', blocks: false,
        detail: { path: current.path, resource: reference },
      });
    }
  };
  if (candidates.length === 0) addReason('no_admitted_bundle');
  for (const candidate of candidates) {
    const listing = listEntries(candidate, services, findings);
    if (!listing) {
      addReason('enumeration_unobservable');
      continue;
    }
    if (listing.entries.complete === false) addReason('enumeration_incomplete');
    for (const entry of listing.entries) {
      const file = listedFile(listing.root, entry);
      if (!file || !file.endsWith('.md')) continue;
      const guard = guardPath(candidate, file, services, listing.root);
      if (guard.state !== 'ok') {
        addReason(guard.state === 'invalid' ? 'scope_invalid' : 'scope_unobservable');
        continue;
      }
      if (guard.relative.split('/').includes('.git')) continue;
      const observation = readObservation(file, services);
      if (!observation.ok) {
        addReason('carrier_unreadable');
        continue;
      }
      if (!observation.complete) addReason('eof_unobservable');
      current = { candidate, file, root: listing.root, path: guard.relative, text: observation.content };
      let bodyStart = 0;
      try {
        const extracted = validation.parseFrontmatter(observation.content);
        bodyStart = observation.content.length - extracted.body.length;
        frontmatterLinks(observation.content, bodyStart, add, addReason);
        markdownLinks(extracted.body, bodyStart, add);
      } catch {
        addReason('frontmatter_unparseable');
        markdownLinks(observation.content, 0, add);
      }
    }
  }
  if (data.coverage === 'non-exhaustive') addReason('admission_incomplete');
  const inboundLinks = { complete: reasons.length === 0, incomplete_reasons: reasons, links };
  return {
    result: inboundLinks.complete ? 'ok' : 'degraded',
    data: {
      scope: navigationScope(candidates, 'enumeration'),
      coverage: inboundLinks.complete ? 'complete' : 'non-exhaustive',
      inbound_links: inboundLinks,
      archive_recommendations: [],
    },
    findings,
  };
}

module.exports = { read, search, enumerate, notConfiguredData };
