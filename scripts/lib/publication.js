const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const discovery = require('./discovery');
const acceptedGroups = require('./accepted-groups');
const mappingRules = require('./mapping');
const monorepo = require('./monorepo');
const sections = require('./sections');
const semanticReview = require('./semantic-review');
const validation = require('./validation');

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value !== '';
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_FILE = '.okf-publication-receipt.json';

function exactFields(value, fields) {
  return object(value) && Object.keys(value).length === fields.length
    && Object.keys(value).every((field) => fields.includes(field));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function artifactIdentity(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function buildReceipt(checked, artifacts, results, classification) {
  return {
    protocol: 'okf-publication-receipt/1',
    artifacts: {
      plan: artifactIdentity(artifacts.plan),
      mapping: artifactIdentity(artifacts.mapping),
      split_review: artifactIdentity(artifacts.splitReview),
      semantic_review: artifactIdentity(artifacts.semanticReview),
    },
    candidate_conformance: {
      passed: true,
      concepts: checked.filter((item) => item.kind === 'concept')
        .map((item) => ({ source: item.source, concept: item.concept, path: item.path, type: item.tree.type })),
      navigation_indexes: checked.filter((item) => item.kind === 'index').map((item) => ({ path: item.path })),
    },
    checked_candidates: checked.map((item) => item.kind === 'concept'
      ? { kind: 'concept', source: item.source, concept: item.concept, path: item.path, type: item.tree.type, identity: item.identity }
      : { kind: 'index', path: item.path, identity: item.identity }),
    results,
    classification,
  };
}

function validSourceBinding(value) {
  return exactFields(value, ['path', 'sha256']) && monorepo.normalizeRelative(value.path) === value.path
    && /^[0-9a-f]{64}$/.test(value.sha256);
}

function validStaged(value) {
  if (!object(value)) return false;
  if (value.kind === 'index') {
    return exactFields(value, ['kind', 'path', 'file', 'group'])
      && monorepo.normalizeRelative(value.path) === value.path
      && monorepo.normalizeRelative(value.file) === value.file && object(value.group);
  }
  const split = value.output !== undefined || value.sections !== undefined || value.accepted_output !== undefined;
  const fields = ['path', 'concept', 'type', 'shard', 'file', 'sources', ...(split ? ['output', 'sections', 'accepted_output'] : [])];
  return exactFields(value, fields) && fields.slice(0, 5).every((field) => text(value[field]))
    && monorepo.normalizeRelative(value.path) === value.path
    && monorepo.normalizeRelative(value.concept) === value.concept
    && monorepo.normalizeRelative(value.file) === value.file
    && Array.isArray(value.sources) && value.sources.every(validSourceBinding)
    && (!split || text(value.output) && object(value.accepted_output) && Array.isArray(value.sections)
      && value.sections.length > 0 && value.sections.every((item) => exactFields(item, ['line_start', 'line_end'])
        && Number.isInteger(item.line_start) && Number.isInteger(item.line_end)
        && item.line_start > 0 && item.line_start <= item.line_end));
}

function validCanonicalReview(value) {
  if (!exactFields(value, ['human_assessed', 'candidates', 'sources'])
    || typeof value.human_assessed !== 'boolean' || !Array.isArray(value.candidates) || !Array.isArray(value.sources)) return false;
  return value.candidates.every((item) => exactFields(item, ['path', 'identity'])
      && monorepo.normalizeRelative(item.path) === item.path && SHA256.test(item.identity))
    && value.sources.every((item) => exactFields(item, ['path', 'source_identity', 'accepted', 'sections'])
      && monorepo.normalizeRelative(item.path) === item.path && SHA256.test(item.source_identity)
      && exactFields(item.accepted, ['sections', 'outputs', 'proposal'])
      && Array.isArray(item.accepted.sections) && Array.isArray(item.accepted.outputs) && object(item.accepted.proposal)
      && Array.isArray(item.sections)
      && item.sections.every((row) => exactFields(row, ['line_start', 'line_end', 'verdict'])
        && Number.isInteger(row.line_start) && Number.isInteger(row.line_end)
        && row.line_start > 0 && row.line_start <= row.line_end
        && ['preserved', 'missing', 'duplicated', 'uncertain'].includes(row.verdict)));
}

function validPlan(value) {
  if (!exactFields(value, ['entries', 'executable', 'duplicates']) || value.executable !== true
    || !Array.isArray(value.entries) || !Array.isArray(value.duplicates)) return false;
  return value.entries.every((item) => exactFields(item, ['path', 'disposition', 'reason', 'concept', 'type']))
    && value.duplicates.every((item) => exactFields(item, ['paths']) && Array.isArray(item.paths)
      && item.paths.length > 1 && item.paths.every((source) => monorepo.normalizeRelative(source) === source));
}

function validMapping(value) {
  return Array.isArray(value) && value.every((item) => exactFields(item, [
    'path', 'concept', 'type', 'sources', 'source_identity', 'body',
  ]) && monorepo.normalizeRelative(item.path) === item.path
    && monorepo.normalizeRelative(item.concept) === item.concept
    && text(item.type) && (item.sources === null || Array.isArray(item.sources))
    && SHA256.test(item.source_identity) && typeof item.body === 'string');
}

function finding(code, detail = {}) {
  return { code, detail };
}

function proposalFinding(code, detail = {}) {
  return finding(code, { ...detail, new_proposal_required: true });
}

function planMappingCoverage(plan, mapping) {
  const migrating = plan.entries.filter((item) => item.disposition === 'migrate');
  const paths = semanticReview.exactSet(migrating.map((item) => item.path), mapping.map((item) => item.path));
  const planConcepts = migrating.map((item) => item.concept);
  const mappingConcepts = mapping.map((item) => item.concept);
  const concepts = semanticReview.exactSet(planConcepts, mappingConcepts);
  const changed = mapping.filter((item) => {
    const entry = migrating.find((candidate) => candidate.path === item.path);
    return !entry || entry.concept !== item.concept || entry.type !== item.type;
  }).map((item) => item.path).sort();
  if (semanticReview.differs(paths) || semanticReview.differs(concepts) || changed.length > 0) {
    return { ok: false, finding: proposalFinding('PUBLISH_PLAN_MAPPING_MISMATCH', { paths, concepts, changed }) };
  }
  return { ok: true };
}

function headingAnchor(value) {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/[ _]+/g, '-');
}

function normalizedLink(candidatePath, resource) {
  return mappingRules.normalizedLinkTarget(candidatePath, resource);
}

function bodyFacts(body, candidatePath) {
  const lines = body.split('\n');
  const fenced = validation.fencedLines(body);
  const heading_outline = [];
  for (let index = 0; index < lines.length; index++) {
    if (fenced[index]) continue;
    const heading = sections.parseAtxHeading(lines[index].replace(/\r$/, ''));
    if (heading) heading_outline.push(heading);
  }
  return {
    title: heading_outline.find((item) => item.level === 1)?.text || null,
    heading_outline,
    links: validation.markdownLinkOccurrences(body).map((item) => normalizedLink(candidatePath, item.resource)).filter(Boolean),
    anchors: heading_outline.map((item) => headingAnchor(item.text)),
  };
}

function expectedCandidates(mapping, splitReview, groups, bundlePath) {
  const reviews = new Map(splitReview.map((item) => [item.path, item]));
  const concepts = mapping.flatMap((item) => {
    const review = reviews.get(item.path);
    if (!review || review.proposal === null) {
      return [{
        kind: 'concept', source: item.path, source_identity: item.source_identity,
        concept: item.concept, path: `${item.concept}.md`, type: item.type, sources: item.sources || [],
        expected_links: bodyFacts(item.body, path.posix.join(bundlePath, `${item.concept}.md`)).links,
      }];
    }
    return review.proposal.outputs.map((output) => ({
      kind: 'concept', source: item.path, source_identity: review.source_identity,
      concept: output.concept_id, path: output.path, type: output.type,
      output: output.output, accepted_output: output,
      sections: review.outputs.find((row) => row.output === output.output).sections
        .map(({ line_start, line_end }) => ({ line_start, line_end })),
      title: output.title, heading_outline: output.heading_outline,
      sources: output.provenance_assignments.map((assignment) => assignment.source),
      expected_links: output.link_routes.map((route) => route.target),
    }));
  });
  const indexes = groups.map((group) => ({
    kind: 'index', path: group.index_entry.path, group,
  }));
  return [...concepts, ...indexes];
}

function safePath(root, file, services) {
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(file);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) return false;
  let current = absolute;
  while (current !== absoluteRoot) {
    if (services.isLink(current)) return false;
    current = path.dirname(current);
  }
  return !services.isLink(absoluteRoot);
}

function checkedFile(expected, staged, stagingRoot, gitRoot, bundleRoot, services) {
  const relative = monorepo.normalizeRelative(staged.file);
  const file = relative ? path.resolve(gitRoot, relative) : null;
  const candidatePath = file ? path.relative(stagingRoot, file).split(path.sep).join('/') : null;
  if (!file || candidatePath !== expected.path || !safePath(stagingRoot, file, services)) {
    return { ok: false, finding: proposalFinding('PUBLISH_STAGING_SYMLINK', { path: expected.path }) };
  }
  let bytes;
  try { bytes = services.readBuffer(file); } catch {
    return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_READ_FAILED', { path: expected.path }) };
  }
  const identity = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const reviewBinding = staged.semantic_identity;
  return { ok: true, bytes, identity, text: bytes.toString('utf8'), file, candidatePath, reviewBinding };
}

function changed(expected, field, wanted, actual) {
  return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_CHANGED', {
    path: expected.path, field, expected: wanted, actual,
  }) };
}

function checkIndex(expected, staged, checked, gitRoot, bundleRoot) {
  if (staged.kind !== 'index' || !isDeepStrictEqual(staged.group, expected.group)) {
    return changed(expected, 'group_index', expected.group, staged.group);
  }
  const expectedText = `# ${expected.group.index_entry.title}\n\n${expected.group.purpose}\n\n${expected.group.child_entries.map((child) => {
    const target = path.posix.relative(path.posix.dirname(expected.group.index_entry.path), child.path);
    return `- [${child.title}](${target})`;
  }).join('\n')}\n`;
  if (checked.text !== expectedText) {
    return { ok: false, finding: proposalFinding('PUBLISH_INDEX_CHANGED', {
      path: expected.path, field: 'content', expected: expectedText, actual: checked.text,
    }) };
  }
  const bundlePath = path.relative(gitRoot, bundleRoot).split(path.sep).join('/');
  const facts = bodyFacts(checked.text, path.posix.join(bundlePath, expected.path));
  if (facts.title !== expected.group.index_entry.title) {
    return { ok: false, finding: proposalFinding('PUBLISH_INDEX_CHANGED', {
      path: expected.path, field: 'title', expected: expected.group.index_entry.title, actual: facts.title,
    }) };
  }
  const expectedLinks = expected.group.child_entries.map((child) => path.posix.join(bundlePath, child.path));
  if (!isDeepStrictEqual(facts.links, expectedLinks)) {
    return { ok: false, finding: proposalFinding('PUBLISH_INDEX_CHANGED', {
      path: expected.path, field: 'children', expected: expectedLinks, actual: facts.links,
    }) };
  }
  return { ok: true, checked: { ...checked, kind: 'index', path: expected.path, target: expected.path } };
}

function checkConcept(expected, staged, checked, gitRoot, bundleRoot) {
  if (staged.kind === 'index' || staged.path !== expected.source || staged.concept !== expected.concept
    || staged.type !== expected.type) return changed(expected, 'identity', expected, staged);
  const wantedBinding = [{ path: expected.source, sha256: expected.source_identity.slice('sha256:'.length) }];
  if (!isDeepStrictEqual(staged.sources, wantedBinding)) {
    return { ok: false, finding: proposalFinding('PUBLISH_SOURCE_CHANGED', {
      path: expected.source, expected: wantedBinding, actual: staged.sources,
    }) };
  }
  if (expected.output === undefined && (staged.output !== undefined || staged.sections !== undefined)) {
    return changed(expected, 'source_section_assignments', null, { output: staged.output, sections: staged.sections });
  }
  if (expected.output !== undefined && (staged.output !== expected.output || !isDeepStrictEqual(staged.sections, expected.sections)
    || !isDeepStrictEqual(staged.accepted_output, expected.accepted_output))) {
    return changed(expected, 'accepted_output', expected.accepted_output, staged.accepted_output);
  }
  let parsed;
  try {
    const extracted = validation.parseFrontmatter(checked.text);
    parsed = { tree: validation.parseYAML(extracted.frontmatter), body: extracted.body };
  } catch {
    return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_READ_FAILED', { path: expected.path }) };
  }
  if (parsed.tree.type !== expected.type || parsed.tree.status !== 'draft') {
    return changed(expected, 'frontmatter', { type: expected.type, status: 'draft' }, parsed.tree);
  }
  const actualSources = parsed.tree.sources === undefined ? [] : parsed.tree.sources;
  if (!isDeepStrictEqual(actualSources, expected.sources)) {
    return { ok: false, finding: proposalFinding('PUBLISH_PROVENANCE_MISMATCH', {
      path: expected.path, expected: expected.sources, actual: actualSources,
    }) };
  }
  const bundlePath = path.relative(gitRoot, bundleRoot).split(path.sep).join('/');
  const facts = bodyFacts(parsed.body, path.posix.join(bundlePath, expected.path));
  if (expected.output !== undefined && (facts.title !== expected.title
    || !isDeepStrictEqual(facts.heading_outline, expected.heading_outline))) {
    return changed(expected, 'headings', { title: expected.title, outline: expected.heading_outline }, facts);
  }
  return { ok: true, checked: {
    ...checked, kind: 'concept', path: expected.path, target: expected.path,
    source: expected.source, concept: expected.concept, sources: staged.sources, tree: parsed.tree, body: parsed.body, facts,
  } };
}

function routeTargets(splitReview, bundlePath) {
  const targets = [];
  for (const review of splitReview.filter((item) => item.proposal !== null)) {
    const outputs = new Map(review.proposal.outputs.map((item) => [item.output, item]));
    for (const output of review.proposal.outputs) {
      targets.push(...output.link_routes.map((route) => `${output.path}\0${route.target}`));
      targets.push(...output.anchor_routes.map((route) => (
        `${output.path}\0${path.posix.join(bundlePath, output.path)}#${route.target_anchor}`
      )));
    }
    for (const route of review.proposal.whole_source_link_routes) {
      const targetPath = route.target.kind === 'output'
        ? outputs.get(route.target.output).path : `${route.target.group}/index.md`;
      targets.push(`${targetPath}\0${path.posix.join(bundlePath, targetPath)}`);
    }
  }
  return targets.sort();
}

function evaluate({ gitRoot, bundleRoot, stagingRoot, plan, mapping, splitReview, staged, semanticReview: review, services }) {
  const coverage = planMappingCoverage(plan, mapping);
  if (!coverage.ok) return coverage;
  if (!safePath(gitRoot, stagingRoot, services)) {
    return { ok: false, finding: proposalFinding('PUBLISH_STAGING_SYMLINK', { path: path.relative(gitRoot, stagingRoot) }) };
  }
  for (const item of staged) {
    const file = path.resolve(gitRoot, item.file);
    if (!safePath(stagingRoot, file, services)) {
      return { ok: false, finding: proposalFinding('PUBLISH_STAGING_SYMLINK', { path: item.file }) };
    }
  }
  let listing;
  try { listing = services.listFiles(stagingRoot); } catch { listing = { files: [], complete: false }; }
  if (!listing.complete) {
    return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_SCAN_INCOMPLETE') };
  }
  const currentPaths = listing.files.filter(discovery.isMarkdownFile)
    .map((file) => path.relative(stagingRoot, file).split(path.sep).join('/')).sort();
  const accepted = acceptedGroups.collect(splitReview);
  if (!accepted.ok) {
    return { ok: false, finding: proposalFinding('PUBLISH_INDEX_CHANGED', accepted.detail) };
  }
  const bundlePath = path.relative(gitRoot, bundleRoot).split(path.sep).join('/');
  const expected = expectedCandidates(mapping, splitReview, accepted.groups, bundlePath);
  const expectedPaths = expected.map((item) => item.path).sort();
  const stagedPaths = staged.map((item) => path.relative(stagingRoot, path.resolve(gitRoot, item.file)).split(path.sep).join('/'));
  const files = semanticReview.exactSet(expectedPaths, currentPaths);
  const metadata = semanticReview.exactSet(expectedPaths, stagedPaths);
  if (semanticReview.differs(files) || semanticReview.differs(metadata)) {
    const missingIndex = files.missing.find((item) => item.endsWith('/index.md'));
    return { ok: false, finding: proposalFinding(missingIndex ? 'PUBLISH_INDEX_MISSING' : 'PUBLISH_CANDIDATE_SET_MISMATCH', {
      files, staged: metadata,
    }) };
  }

  const stagedByPath = new Map(staged.map((item) => [
    path.relative(stagingRoot, path.resolve(gitRoot, item.file)).split(path.sep).join('/'), item,
  ]));
  const checked = [];
  for (const candidate of expected) {
    const stagedRow = stagedByPath.get(candidate.path);
    const read = checkedFile(candidate, stagedRow, stagingRoot, gitRoot, bundleRoot, services);
    if (!read.ok) return read;
    const result = candidate.kind === 'index'
      ? checkIndex(candidate, stagedRow, read, gitRoot, bundleRoot)
      : checkConcept(candidate, stagedRow, read, gitRoot, bundleRoot);
    if (!result.ok) return result;
    checked.push(result.checked);
  }

  const canonical = semanticReview.canonicalCoverage(review, splitReview);
  if (!canonical.ok) return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', canonical.detail) };
  const reviewedCandidates = canonical.reviewed.length === 0 ? [] : currentPaths;
  const candidates = semanticReview.exactSet(reviewedCandidates, review.candidates.map((item) => item.path));
  if (semanticReview.differs(candidates)) {
    return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', { candidates }) };
  }
  for (const candidate of checked.filter((item) => reviewedCandidates.includes(item.path))) {
    const submitted = review.candidates.find((item) => item.path === candidate.path);
    if (!submitted || submitted.identity !== candidate.identity) {
      return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', {
        path: candidate.path, expected: submitted?.identity, actual: candidate.identity,
      }) };
    }
  }
  for (const candidate of expected.filter((item) => item.kind === 'concept')) {
    let actual = null;
    try { actual = sections.identify(services.readBuffer(path.join(gitRoot, candidate.source))); } catch {}
    if (actual !== candidate.source_identity) {
      return { ok: false, finding: proposalFinding('PUBLISH_SOURCE_CHANGED', {
        path: candidate.source, expected: candidate.source_identity, actual,
      }) };
    }
  }

  const expectedRoutes = [
    ...routeTargets(splitReview, bundlePath),
    ...expected.filter((item) => item.kind === 'concept' && item.output === undefined)
      .flatMap((item) => item.expected_links.map((target) => `${item.path}\0${target}`)),
  ].sort();
  const actualRoutes = checked.filter((item) => item.kind === 'concept')
    .flatMap((item) => item.facts.links.map((target) => `${item.path}\0${target}`)).sort();
  const routes = semanticReview.exactSet(expectedRoutes, actualRoutes);
  if (semanticReview.differs(routes)) {
    return { ok: false, finding: proposalFinding('PUBLISH_ROUTE_MISMATCH', { routes }) };
  }

  const checkedByPath = new Map(checked.map((item) => [item.path, item]));
  return { ok: true, checked: stagedPaths.map((item) => checkedByPath.get(item)) };
}

module.exports = {
  RECEIPT_FILE, artifactIdentity, buildReceipt, evaluate, planMappingCoverage, safePath,
  validCanonicalReview, validMapping, validPlan, validStaged,
};
