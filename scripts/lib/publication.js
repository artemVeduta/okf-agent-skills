const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const discovery = require('./discovery');
const mappingRules = require('./mapping');
const monorepo = require('./monorepo');
const sections = require('./sections');
const validation = require('./validation');

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value !== '';
const SHA256 = /^sha256:[0-9a-f]{64}$/;

function exactFields(value, fields) {
  return object(value) && Object.keys(value).length === fields.length
    && Object.keys(value).every((field) => fields.includes(field));
}

function validSourceBinding(value) {
  return exactFields(value, ['path', 'sha256']) && monorepo.normalizeRelative(value.path) === value.path
    && /^[0-9a-f]{64}$/.test(value.sha256);
}

function validStaged(value) {
  if (!object(value)) return false;
  const split = value.output !== undefined || value.sections !== undefined;
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
  return Array.isArray(value) && value.every((item) => exactFields(item, ['path', 'concept', 'type', 'sources', 'body'])
    && monorepo.normalizeRelative(item.path) === item.path
    && monorepo.normalizeRelative(item.concept) === item.concept
    && text(item.type) && (item.sources === null || Array.isArray(item.sources)) && typeof item.body === 'string');
}

function exactSet(expected, actual) {
  const counts = new Map();
  for (const item of actual) counts.set(item, (counts.get(item) || 0) + 1);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((item) => !actualSet.has(item)).sort(),
    extra: [...actualSet].filter((item) => !expectedSet.has(item)).sort(),
    duplicate: [...counts].filter(([, count]) => count > 1).map(([item]) => item).sort(),
  };
}

function differs(value) {
  return value.missing.length > 0 || value.extra.length > 0 || value.duplicate.length > 0;
}

function headingAnchor(value) {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/[ _]+/g, '-');
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
    links: validation.markdownLinkOccurrences(body).map((item) => {
      const target = validation.bodyLinkPath(item.resource);
      return target ? mappingRules.resolveLinkTarget(candidatePath, target) : item.resource;
    }),
    anchors: heading_outline.map((item) => headingAnchor(item.text)),
  };
}

function expectedCandidates(mapping, splitReview) {
  const reviews = new Map(splitReview.map((item) => [item.path, item]));
  return mapping.flatMap((item) => {
    const review = reviews.get(item.path);
    if (!review || review.proposal === null) {
      return [{ source: item.path, concept: item.concept, path: `${item.concept}.md`, type: item.type, sources: item.sources || [] }];
    }
    return review.proposal.outputs.map((output) => ({
      source: item.path,
      concept: output.concept_id,
      path: output.path,
      type: output.type,
      output: output.output,
      accepted_output: output,
      sections: review.outputs.find((row) => row.output === output.output).sections
        .map(({ line_start, line_end }) => ({ line_start, line_end })),
      title: output.title,
      heading_outline: output.heading_outline,
      group: output.reader_purpose_group,
      sources: output.provenance_assignments.map((assignment) => assignment.source),
      links: output.link_routes.map((route) => route.target),
      anchors: output.anchor_routes.map((route) => route.target_anchor),
    }));
  });
}

function finding(code, detail = {}) {
  return { code, detail };
}

function proposalFinding(code, detail = {}) {
  return finding(code, { ...detail, new_proposal_required: true });
}

function changed(candidate, field, expected, actual) {
  return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_CHANGED', {
    path: candidate.path, field, expected, actual,
  }) };
}

function evaluateCandidate(expected, staged, stagingRoot, gitRoot, bundleRoot, services) {
  const relative = monorepo.normalizeRelative(staged.file);
  const file = relative ? path.resolve(gitRoot, relative) : null;
  const candidatePath = file ? path.relative(stagingRoot, file).split(path.sep).join('/') : null;
  if (!file || candidatePath !== expected.path) return changed(expected, 'path', expected.path, candidatePath);
  if (staged.path !== expected.source) return changed(expected, 'source', expected.source, staged.path);
  if (staged.concept !== expected.concept) return changed(expected, 'concept_id', expected.concept, staged.concept);
  if (staged.type !== expected.type) return changed(expected, 'type', expected.type, staged.type);
  if (expected.output === undefined && (staged.output !== undefined || staged.sections !== undefined)) {
    return changed(expected, 'source_section_assignments', null, { output: staged.output, sections: staged.sections });
  }
  if (expected.output !== undefined && (staged.output !== expected.output || !isDeepStrictEqual(staged.sections, expected.sections))) {
    return changed(expected, 'source_section_assignments', { output: expected.output, sections: expected.sections }, {
      output: staged.output, sections: staged.sections,
    });
  }
  if (expected.output !== undefined && !isDeepStrictEqual(staged.accepted_output, expected.accepted_output)) {
    return changed(expected, 'accepted_output', expected.accepted_output, staged.accepted_output);
  }

  let parsed;
  try {
    const textValue = services.readFile(file);
    const extracted = validation.parseFrontmatter(textValue);
    parsed = { tree: validation.parseYAML(extracted.frontmatter), body: extracted.body };
  } catch {
    return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_READ_FAILED', { path: expected.path }) };
  }
  if (parsed.tree.type !== expected.type) return changed(expected, 'type', expected.type, parsed.tree.type);
  if (parsed.tree.status !== 'draft') return changed(expected, 'status', 'draft', parsed.tree.status);
  const actualSources = parsed.tree.sources === undefined ? [] : parsed.tree.sources;
  if (!isDeepStrictEqual(actualSources, expected.sources)) return changed(expected, 'provenance', expected.sources, actualSources);

  if (expected.output !== undefined) {
    const bundlePath = path.relative(gitRoot, bundleRoot).split(path.sep).join('/');
    const facts = bodyFacts(parsed.body, path.posix.join(bundlePath, expected.path));
    if (facts.title !== expected.title) return changed(expected, 'title', expected.title, facts.title);
    if (!isDeepStrictEqual(facts.heading_outline, expected.heading_outline)) {
      return changed(expected, 'heading_outline', expected.heading_outline, facts.heading_outline);
    }
    if (!isDeepStrictEqual(facts.links, expected.links)) return changed(expected, 'links', expected.links, facts.links);
    const missingAnchors = expected.anchors.filter((anchor) => !facts.anchors.includes(anchor));
    if (missingAnchors.length > 0) return changed(expected, 'anchors', expected.anchors, facts.anchors);
  }
  return { ok: true };
}

function evaluate({ gitRoot, bundleRoot, stagingRoot, mapping, splitReview, staged, semanticReview, services }) {
  let listing;
  try { listing = services.listFiles(stagingRoot); } catch { listing = { files: [], complete: false }; }
  if (!listing.complete) return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_SCAN_INCOMPLETE') };
  const currentPaths = listing.files.filter(discovery.isMarkdownFile)
    .map((file) => path.relative(stagingRoot, file).split(path.sep).join('/')).sort();
  const expected = expectedCandidates(mapping, splitReview);
  const expectedPaths = expected.map((item) => item.path).sort();
  const stagedPaths = staged.map((item) => {
    const relative = monorepo.normalizeRelative(item.file);
    return relative ? path.relative(stagingRoot, path.resolve(gitRoot, relative)).split(path.sep).join('/') : item.file;
  });
  const pathSet = exactSet(expectedPaths, currentPaths);
  const stagedSet = exactSet(expectedPaths, stagedPaths);
  if (differs(pathSet) || differs(stagedSet)) {
    return { ok: false, finding: proposalFinding('PUBLISH_CANDIDATE_SET_MISMATCH', {
      files: pathSet, staged: stagedSet, expected_total: expected.length, actual_total: currentPaths.length,
    }) };
  }

  const stagedByPath = new Map(staged.map((item) => {
    const relative = monorepo.normalizeRelative(item.file);
    return [path.relative(stagingRoot, path.resolve(gitRoot, relative)).split(path.sep).join('/'), item];
  }));
  for (const candidate of expected) {
    const result = evaluateCandidate(candidate, stagedByPath.get(candidate.path), stagingRoot, gitRoot, bundleRoot, services);
    if (!result.ok) return result;
  }

  const reviewed = splitReview.filter((item) => item.proposal !== null).sort((a, b) => a.path.localeCompare(b.path));
  const sourceSet = exactSet(reviewed.map((item) => item.path), semanticReview.sources.map((item) => item.path));
  if (differs(sourceSet)) return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', { sources: sourceSet }) };
  for (const review of reviewed) {
    const submitted = semanticReview.sources.find((item) => item.path === review.path);
    const accepted = { sections: review.sections, outputs: review.outputs, proposal: review.proposal };
    let actual = null;
    try { actual = sections.identify(services.readFile(path.join(gitRoot, review.path))); } catch {}
    if (actual !== review.source_identity || submitted.source_identity !== review.source_identity) {
      return { ok: false, finding: proposalFinding('PUBLISH_SOURCE_CHANGED', {
        path: review.path, expected: review.source_identity, reviewed: submitted.source_identity, actual,
      }) };
    }
    if (!isDeepStrictEqual(submitted.accepted, accepted) || submitted.sections.some((item) => item.verdict !== 'preserved')) {
      return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', { path: review.path }) };
    }
  }

  const expectedReviewCandidates = reviewed.length === 0 ? [] : currentPaths;
  const reviewSet = exactSet(expectedReviewCandidates, semanticReview.candidates.map((item) => item.path));
  if (differs(reviewSet)) return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', { candidates: reviewSet }) };
  for (const submitted of semanticReview.candidates) {
    let actual = null;
    try { actual = `sha256:${crypto.createHash('sha256').update(services.readBuffer(path.join(stagingRoot, submitted.path))).digest('hex')}`; } catch {}
    if (actual !== submitted.identity) {
      return { ok: false, finding: finding('PUBLISH_SEMANTIC_REVIEW_STALE', {
        path: submitted.path, expected: submitted.identity, actual,
      }) };
    }
  }

  for (const binding of staged.flatMap((item) => item.sources)) {
    let actual = null;
    try { actual = crypto.createHash('sha256').update(services.readBuffer(path.join(gitRoot, binding.path))).digest('hex'); } catch {}
    if (actual !== binding.sha256) {
      return { ok: false, finding: proposalFinding('PUBLISH_SOURCE_CHANGED', {
        path: binding.path, expected: binding.sha256, actual,
      }) };
    }
  }
  return { ok: true };
}

module.exports = { evaluate, validCanonicalReview, validMapping, validPlan, validStaged };
