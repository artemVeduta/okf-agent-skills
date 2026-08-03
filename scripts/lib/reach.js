/*
PROVISIONAL (spec section 11 open item): the exact REACH exclusion rule list,
and whether it is fixed or configurable, is a declared open item at
specification line 3661. This module therefore implements only the rules the
specification states normatively and ships no configurable directory-exclusion
list.
*/

const path = require('node:path');

function inside(target, root) {
  return target === root || target.startsWith(root === path.parse(root).root ? root : root + path.sep);
}

function detailFor(candidate, extra) {
  const detail = { gate: 'REACH', ...extra };
  if (candidate.named_by_user === true) detail.path = candidate.path;
  return detail;
}

function refusal(candidate, code, extra) {
  return {
    code,
    origin: 'suite',
    severity: 'error',
    blocks: true,
    detail: detailFor(candidate, extra),
  };
}

function anomaly(candidate, code, extra) {
  return {
    code,
    origin: 'suite',
    severity: 'warning',
    blocks: false,
    detail: detailFor(candidate, extra),
  };
}

function result(finding, anomalies = []) {
  return { passed: finding === null, finding, anomalies };
}

// A path that simply does not exist is not a reach failure: PRESENCE owns absence.
// Resolving the deepest existing ancestor keeps containment provable without turning
// a missing candidate into a symlink refusal. A cycle and a dangling symlink are
// symlink failures and stay here.
function resolve(target, services) {
  const suffix = [];
  let current = target;
  for (;;) {
    try {
      return path.join(services.realpath(current), ...suffix);
    } catch (error) {
      if ((error.code !== 'ENOENT' && error.code !== 'ENOTDIR') || services.isLink(current)) throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

function evaluate(candidate, context, services) {
  if (context.gitRoot === null && context.workspaceRoot === null) {
    return result(refusal(candidate, 'CWD_NOT_A_WORKSPACE'));
  }

  if (context.workspaceRoot !== null && !inside(candidate.path, context.workspaceRoot)) {
    return result(refusal(candidate, 'OUTSIDE_WORKSPACE'));
  }

  if (context.gitRoot !== null && context.gitRoot !== candidate.path && inside(context.gitRoot, candidate.path)) {
    return result(refusal(candidate, 'ABOVE_GIT_ROOT'));
  }

  if (candidate.declared === false && context.gitRoot !== null && !inside(candidate.path, context.gitRoot)) {
    return result(refusal(candidate, 'SIDEWAYS_SIBLING'));
  }

  let real;
  let boundary;
  let realGitRoot;
  try {
    real = resolve(candidate.path, services);
    boundary = services.realpath(context.workspaceRoot || context.gitRoot);
    realGitRoot = context.gitRoot === null ? null : services.realpath(context.gitRoot);
  } catch {
    // PROVISIONAL (spec section 11 open item): SYMLINK_UNRESOLVABLE is invented here.
    return result(refusal(candidate, 'SYMLINK_UNRESOLVABLE'));
  }

  if (!inside(real, boundary)) {
    // Only a link can leave a boundary the lexical rules above already accepted.
    return result(refusal(candidate, real === candidate.path ? 'OUTSIDE_WORKSPACE' : 'SYMLINK_ESCAPE'));
  }

  // The rules above test the requested path. A link inside the Git root can still
  // point above it or sideways out of it, so the canonical path meets them again.
  if (realGitRoot !== null && realGitRoot !== real && inside(realGitRoot, real)) {
    return result(refusal(candidate, 'ABOVE_GIT_ROOT'));
  }

  if (candidate.declared === false && realGitRoot !== null && !inside(real, realGitRoot)) {
    return result(refusal(candidate, 'SIDEWAYS_SIBLING'));
  }

  const owner = services.gitRootOf(real);
  if (
    owner !== null &&
    owner !== context.gitRoot &&
    context.gitRoot !== null &&
    inside(owner, context.gitRoot)
  ) {
    if (candidate.declared === false) {
      // PROVISIONAL (spec section 11 open item): SUBMODULE_EXCLUDED is invented here.
      return result(refusal(candidate, 'SUBMODULE_EXCLUDED'));
    }

    // Spec line 1281: an overlapping canonical path under a nested repository is
    // reported as an anomaly. The federation declared it, so it is not refused.
    const extra = { ownership: 'deepest containing Git root owns the canonical path' };
    if (candidate.named_by_user === true) extra.owner = owner;
    return result(null, [anomaly(candidate, 'OVERLAPPING_CANONICAL_PATH', extra)]);
  }

  return result(null);
}

module.exports = { evaluate, inside };
