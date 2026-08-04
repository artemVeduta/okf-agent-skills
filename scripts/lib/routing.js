/*
 * PROVISIONAL (spec section 11 open item): diagnostic and READ_ONLY_BUNDLE
 * finding vocabularies are invented. Resource collision scanning is deliberately
 * a line-wise frontmatter scan, not a YAML parser.
 */

const path = require('node:path');
const navigation = require('./navigation');

const WORKSPACE = 'okf-workspace://';

function finding(code, severity, blocks, detail) {
  return { code, origin: 'suite', severity, blocks, detail };
}

function missing(reason) {
  return finding('missing', 'error', true, { gate: 'read routing', reason });
}

function diagnostic(reason) {
  return finding('diagnostic', 'warning', false, { gate: 'read routing', reason });
}

function refuse(...findings) {
  return { result: 'blocked', data: { selected: null, lower_precedence: [] }, findings };
}

function resource(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
    const match = lines[i].match(/^resource:\s*(.*)$/);
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2').trim() || null;
  }
  return null;
}

function shape(candidate, concept, file) {
  return { bundle_alias: candidate.bundle_alias, bundle_root: candidate.bundle_root, concept_id: concept, path: path.relative(candidate.bundle_root, file) };
}

function activeCandidates(data) {
  return (data.candidates || []).filter((item) => item.state === 'active');
}

// data.candidates is built in manifest order and every step between is map or filter,
// which preserve it, so tier 4 needs no re-sorting.
function ordered(data, payload) {
  const all = activeCandidates(data);
  const explicit = payload.explicit_bundle;
  if (explicit !== undefined) {
    const match = all.find((x) => x.bundle_alias === explicit);
    return match ? [match, ...all.filter((x) => x !== match)] : [];
  }
  const cwd = path.resolve(payload.cwd);
  const containing = all
    .filter((x) => cwd === x.bundle_root || cwd.startsWith(x.bundle_root + path.sep))
    .sort((a, b) => b.bundle_root.length - a.bundle_root.length);
  // Tier 2 is the nearest containing bundle; tier 3 is its current-repository ancestors.
  const tiered = containing.slice(0, 1)
    .concat(containing.slice(1).filter((x) => x.owner === data.current_repository));
  return [...tiered, ...all.filter((x) => !tiered.includes(x))];
}

function locate(data, payload, services) {
  const candidates = activeCandidates(data);
  const target = payload.target;
  const workspace = typeof target === 'string' && target.startsWith(WORKSPACE);
  let concept = target;
  let eligible = candidates;
  if (workspace) {
    const slash = target.indexOf('/', WORKSPACE.length);
    const alias = slash < 0 ? target.slice(WORKSPACE.length) : target.slice(WORKSPACE.length, slash);
    concept = slash < 0 ? '' : target.slice(slash + 1);
    const declared = (data.manifest && data.manifest.bundles || []).find((x) => x.alias === alias);
    const match = candidates.find((x) => x.bundle_alias === alias);
    if (!declared || !match) return { eligible, findings: [missing('workspace_alias'), diagnostic('workspace_alias_inactive_or_missing')] };
    eligible = [match];
  } else if (payload.link_from_bundle !== undefined) {
    eligible = candidates.filter((x) => x.bundle_alias === payload.link_from_bundle);
  } else {
    eligible = ordered(data, payload);
  }
  if (!concept || concept.endsWith('.md') || concept.includes('..')) return { eligible, findings: [missing('invalid_concept')] };
  if (!workspace && payload.explicit_bundle !== undefined && eligible.length === 0) return { eligible, findings: [missing('explicit_bundle')] };
  const found = [];
  for (const candidate of eligible) {
    const file = path.join(candidate.bundle_root, `${concept}.md`);
    if (services.exists(file)) found.push({ candidate, file });
  }
  const unique = [];
  const seenRoots = new Set();
  for (const item of found) {
    let root;
    try { root = services.realpath(item.candidate.bundle_root); } catch { root = item.candidate.bundle_root; }
    if (seenRoots.has(root)) continue;
    seenRoots.add(root); unique.push(item);
  }
  return { concept, eligible, unique, workspace, findings: unique.length ? [] : [missing('concept_not_found')] };
}

function resolve(data, payload, services) {
  const route = locate(data, payload, services);
  if (route.findings.length) return refuse(...route.findings);
  const { concept, unique } = route;
  const findings = [];
  const selected = shape(unique[0].candidate, concept, unique[0].file);
  const lower = unique.slice(1).map((item) => shape(item.candidate, concept, item.file));
  if (lower.length) findings.push(diagnostic('duplicate_concept_id'));
  const values = [];
  for (const item of unique) {
    try { const value = resource(services.readFile(item.file)); if (value) values.push(value); } catch {}
  }
  if (new Set(values).size !== values.length) findings.push(diagnostic('duplicate_resource'));
  for (let i = 0; i < unique.length && !findings.some((item) => item.detail.reason === 'identical_document'); i++) for (let j = i + 1; j < unique.length; j++) {
    if (unique[i].candidate.owner === unique[j].candidate.owner) continue;
    try { if (services.readFile(unique[i].file) === services.readFile(unique[j].file)) { findings.push(diagnostic('identical_document')); break; } } catch {}
  }
  return { result: 'ok', data: { selected, lower_precedence: lower }, findings };
}

// Read-only is a property of the manifest declaration, not of admission, so the
// nearest containing bundle is chosen among every declared candidate. Selecting only
// admitted ones would let an inactive read-only bundle fall through and be refused
// for the wrong reason.
function readOnlyReason(target, currentRepository) {
  if (target.owner === null) return 'workspace_root';
  if (target.owner !== currentRepository) return 'federated_peer';
  if (target.mode !== 'source') return target.mode;
  return null;
}

function blockedWrite(findings) {
  return { result: 'blocked', data: { target: null }, findings };
}

function routeWrite(data, payload) {
  const cwd = path.resolve(payload.cwd);
  const declared = data.candidates || [];
  const containing = declared
    .filter((x) => cwd === x.bundle_root || cwd.startsWith(x.bundle_root + path.sep))
    .sort((a, b) => b.bundle_root.length - a.bundle_root.length);
  const target = containing[0] || declared.find((x) => x.bundle_alias === '.');
  if (!target) return blockedWrite([finding('READ_ONLY_BUNDLE', 'error', true, { gate: 'write routing', reason: 'federated_peer' })]);

  const reason = readOnlyReason(target, data.current_repository);
  if (reason) return blockedWrite([finding('READ_ONLY_BUNDLE', 'error', true, { gate: 'write routing', reason })]);

  // Writable by declaration, so admission decides. Its own gate findings say why.
  if (target.state !== 'active') return blockedWrite(target.findings);

  const file = path.join(target.bundle_root, `${payload.concept}.md`);
  return { result: 'ok', data: { target: { bundle_alias: target.bundle_alias, bundle_root: target.bundle_root, path: path.relative(target.bundle_root, file) } }, findings: [] };
}

function read(data, payload, services) {
  return navigation.read(data, payload, services, locate, activeCandidates);
}

function search(data, payload, services) {
  return navigation.search(data, payload, services, activeCandidates);
}

module.exports = { resolve, routeWrite, read, search, notConfiguredData: navigation.notConfiguredData };
