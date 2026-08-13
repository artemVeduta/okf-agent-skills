const { isDeepStrictEqual } = require('node:util');

function exactSet(expected, actual) {
  const expectedCounts = new Map();
  const actualCounts = new Map();
  for (const item of expected) expectedCounts.set(item, (expectedCounts.get(item) || 0) + 1);
  for (const item of actual) actualCounts.set(item, (actualCounts.get(item) || 0) + 1);
  return {
    missing: [...expectedCounts].filter(([item]) => !actualCounts.has(item)).map(([item]) => item).sort(),
    extra: [...actualCounts].filter(([item]) => !expectedCounts.has(item)).map(([item]) => item).sort(),
    duplicate_expected: [...expectedCounts].filter(([, count]) => count > 1).map(([item]) => item).sort(),
    duplicate: [...actualCounts].filter(([, count]) => count > 1).map(([item]) => item).sort(),
    expected_count: expected.length,
    actual_count: actual.length,
  };
}

function differs(diff) {
  return diff.missing.length > 0 || diff.extra.length > 0 || diff.duplicate_expected.length > 0
    || diff.duplicate.length > 0 || diff.expected_count !== diff.actual_count;
}

function acceptedReview(review) {
  return structuredClone({ sections: review.sections, outputs: review.outputs, proposal: review.proposal });
}

function canonicalCoverage(semanticReview, splitReview) {
  const reviewed = splitReview.filter((item) => item.proposal !== null).sort((a, b) => a.path.localeCompare(b.path));
  const sourceSet = exactSet(reviewed.map((item) => item.path), semanticReview.sources.map((item) => item.path));
  if (differs(sourceSet)) return { ok: false, detail: { sources: sourceSet } };

  for (const review of reviewed) {
    const submitted = semanticReview.sources.find((item) => item.path === review.path);
    if (submitted.source_identity !== review.source_identity) {
      return { ok: false, detail: { path: review.path, reason: 'source_identity' } };
    }
    if (!isDeepStrictEqual(submitted.accepted, acceptedReview(review))) {
      return { ok: false, detail: { path: review.path, reason: 'accepted_mismatch' } };
    }
    const rangeKey = (item) => `${item.line_start}:${item.line_end}`;
    const sections = exactSet(review.sections.map(rangeKey), submitted.sections.map(rangeKey));
    if (differs(sections)) return { ok: false, detail: { path: review.path, reason: 'section_set', sections } };
    const verdict = submitted.sections.find((item) => item.verdict !== 'preserved');
    if (verdict) return { ok: false, detail: { path: review.path, reason: 'verdict', ...verdict } };
  }
  return { ok: true, reviewed };
}

module.exports = { acceptedReview, canonicalCoverage, differs, exactSet };
