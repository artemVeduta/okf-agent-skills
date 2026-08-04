// A PRESENCE failure short-circuits TRUST and ACCESS; the caller enforces this. Those gates are outside this slice.

const path = require('node:path');
const { inside } = require('./reach');

function finding(code, candidate) {
  const detail = { gate: 'PRESENCE' };
  if (candidate.named_by_user === true) detail.path = candidate.path;
  return { code, origin: 'suite', severity: 'error', blocks: true, detail };
}

function evaluate(candidate, services, options = {}) {
  if (candidate.declared === true && !services.exists(candidate.path)) {
    return { passed: false, finding: finding('DECLARED_MISSING', candidate) };
  }

  if (
    candidate.declared === true &&
    candidate.requires_repository === true &&
    !services.exists(path.join(candidate.path, '.git'))
  ) {
    return { passed: false, finding: finding('NOT_A_REPOSITORY', candidate) };
  }

  const bundlePath = path.resolve(candidate.path, candidate.bundle);
  let realBundlePath;
  let realCandidatePath;
  try {
    realBundlePath = services.realpath(bundlePath);
    realCandidatePath = services.realpath(candidate.path);
  } catch {
    return { passed: false, finding: finding('BUNDLE_MISSING', candidate) };
  }
  if (
    realBundlePath !== realCandidatePath &&
    !inside(realBundlePath, realCandidatePath)
  ) {
    return { passed: false, finding: finding('BUNDLE_MISSING', candidate) };
  }

  /*
  PROVISIONAL (spec conflict): specification lines 1111 and 1156 make PRESENCE test whether a
  candidate "contains the declared bundle" and names "initialize the bundle" as the
  human fix, but specification line 841 forbids refusing a read for a missing
  `index.md`. A bundle root has no other marker, so `index.md` is the predicate here
  and the collision needs a specification decision.
  */
  const bundleIndex = path.join(bundlePath, 'index.md');
  const bundleMissing = options.allowMissingIndex === true
    ? typeof services.isFile === 'function' && services.isFile(bundlePath)
    : !services.exists(bundleIndex);
  if (bundleMissing) {
    return { passed: false, finding: finding('BUNDLE_MISSING', candidate) };
  }

  return { passed: true, finding: null };
}

module.exports = { evaluate };
