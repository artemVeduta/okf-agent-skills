// #200/#201 task 3: validate one complete split proposal and derive its target
// tree. This module does not transform content or retain acceptance between
// calls. The caller must submit the complete proposal again after any change.

const path = require('node:path');
const { normalizeRelative } = require('./monorepo');

const results = new Set(['keep_as_one', 'split']);
const headingActions = new Set(['changed', 'removed']);
const provenanceSupport = new Set(['supported', 'unclear']);

function object(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value !== '';
}

function indexEntry(value) {
  return object(value) && text(value.path) && text(value.title) && value.path.endsWith('/index.md');
}

function childEntry(value) {
  return object(value) && text(value.concept_id) && text(value.path) && text(value.title)
    && value.path === `${value.concept_id}.md` && Number.isInteger(value.order) && value.order > 0;
}

function group(value) {
  return value === null || (object(value) && text(value.key) && text(value.purpose)
    && indexEntry(value.index_entry) && childEntry(value.child_entry));
}

function heading(value) {
  return object(value) && Number.isInteger(value.level) && value.level >= 1 && value.level <= 6 && text(value.text);
}

function provenance(value) {
  return object(value) && Number.isInteger(value.source_index) && value.source_index >= 0
    && provenanceSupport.has(value.support);
}

function linkRoute(value) {
  return object(value) && text(value.from) && text(value.resource) && text(value.target);
}

function anchorRoute(value) {
  return object(value) && text(value.from) && text(value.source_anchor)
    && Number.isInteger(value.line_start) && Number.isInteger(value.line_end)
    && text(value.target_anchor);
}

function output(value) {
  return object(value) && text(value.output) && text(value.concept_id) && text(value.path)
    && value.path === `${value.concept_id}.md` && text(value.type) && text(value.title)
    && Array.isArray(value.heading_outline) && value.heading_outline.length > 0
    && value.heading_outline.every(heading) && group(value.reader_purpose_group)
    && Array.isArray(value.provenance_assignments) && value.provenance_assignments.every(provenance)
    && Array.isArray(value.link_routes) && value.link_routes.every(linkRoute)
    && Array.isArray(value.anchor_routes) && value.anchor_routes.every(anchorRoute);
}

function headingChange(value) {
  if (!object(value) || !Number.isInteger(value.line) || !text(value.source_heading)
    || !headingActions.has(value.action)) return false;
  if (value.action === 'changed') {
    return text(value.output) && text(value.target_heading) && text(value.target_anchor);
  }
  return text(value.output) && value.target_heading === null && value.target_anchor === null;
}

function wholeSourceRoute(value) {
  if (!object(value) || !text(value.from)) return false;
  if (value.target === null) return true;
  return object(value.target) && ((value.target.kind === 'output' && text(value.target.output))
    || (value.target.kind === 'group_index' && text(value.target.group)));
}

function exclusion(value) {
  return object(value) && Number.isInteger(value.source_index) && value.source_index >= 0 && text(value.reason);
}

function valid(value) {
  if (!object(value) || !text(value.path) || !results.has(value.result)
    || typeof value.accepted !== 'boolean' || !Array.isArray(value.outputs) || value.outputs.length === 0
    || !value.outputs.every(output) || !Array.isArray(value.heading_changes)
    || !value.heading_changes.every(headingChange) || !Array.isArray(value.whole_source_link_routes)
    || !value.whole_source_link_routes.every(wholeSourceRoute) || !Array.isArray(value.provenance_exclusions)
    || !value.provenance_exclusions.every(exclusion)) return false;
  if (value.result === 'keep_as_one') return text(value.keep_as_one_reason);
  return value.keep_as_one_reason === null;
}

function validPayload(value) {
  return Array.isArray(value) && value.every(valid)
    && new Set(value.map((item) => item.path)).size === value.length;
}

function finding(code, detail = {}) {
  return { code, detail };
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function targetFindings(supplied) {
  const findings = [];
  const ids = new Set();
  const paths = new Set();
  const indexes = new Map();
  for (const item of supplied.outputs) {
    if (ids.has(item.concept_id) || paths.has(item.path)) {
      findings.push(finding('SPLIT_PROPOSAL_TARGET_COLLISION', {
        output: item.output, concept_id: item.concept_id, target_path: item.path,
      }));
    }
    ids.add(item.concept_id);
    paths.add(item.path);
    if (normalizeRelative(item.path) !== item.path || ['index.md', 'log.md'].includes(path.posix.basename(item.path))) {
      findings.push(finding('SPLIT_PROPOSAL_TARGET_INVALID', { output: item.output, target_path: item.path }));
    }
    const group = item.reader_purpose_group;
    const expectedDirectory = group === null ? '.' : group.key;
    if (path.posix.dirname(item.path) !== expectedDirectory
      || (group !== null && group.index_entry.path !== `${group.key}/index.md`)) {
      findings.push(finding('SPLIT_PROPOSAL_PLACEMENT_INVALID', {
        output: item.output, group: group === null ? null : group.key, target_path: item.path,
      }));
    }
    if (group !== null) indexes.set(group.key, group.index_entry.path);
  }
  const seenIndexes = new Set();
  for (const [group, indexPath] of indexes) {
    if (normalizeRelative(indexPath) !== indexPath || path.posix.basename(indexPath) !== 'index.md') {
      findings.push(finding('SPLIT_PROPOSAL_TARGET_INVALID', { group, target_path: indexPath }));
    }
    if (paths.has(indexPath) || seenIndexes.has(indexPath)) {
      findings.push(finding('SPLIT_PROPOSAL_TARGET_COLLISION', { group, target_path: indexPath }));
    }
    seenIndexes.add(indexPath);
  }
  return findings;
}

function groupFindings(supplied) {
  const findings = [];
  const groups = new Map();
  for (const item of supplied.outputs) {
    const proposed = item.reader_purpose_group;
    if (proposed === null) continue;
    const known = groups.get(proposed.key);
    const definition = JSON.stringify({ purpose: proposed.purpose, index_entry: proposed.index_entry });
    if (known && known.definition !== definition) {
      findings.push(finding('SPLIT_PROPOSAL_GROUP_CONFLICT', { group: proposed.key }));
      continue;
    }
    if (!known) groups.set(proposed.key, { definition, orders: new Set() });
    const order = groups.get(proposed.key).orders;
    if (order.has(proposed.child_entry.order)) {
      findings.push(finding('SPLIT_PROPOSAL_GROUP_CONFLICT', {
        group: proposed.key, order: proposed.child_entry.order,
      }));
    }
    order.add(proposed.child_entry.order);
    if (proposed.child_entry.concept_id !== item.concept_id
      || proposed.child_entry.path !== item.path || proposed.child_entry.title !== item.title) {
      findings.push(finding('SPLIT_PROPOSAL_GROUP_CONFLICT', { group: proposed.key, output: item.output }));
    }
  }
  return findings;
}

function provenanceFindings(supplied, authoredSources) {
  const findings = [];
  const decided = new Set();
  const excluded = new Set();
  for (const item of supplied.provenance_exclusions) {
    if (item.source_index >= authoredSources.length || excluded.has(item.source_index)) {
      findings.push(finding('SPLIT_PROVENANCE_ASSIGNMENT_INVALID', { source_index: item.source_index }));
    }
    excluded.add(item.source_index);
    decided.add(item.source_index);
  }
  for (const item of supplied.outputs) {
    const seen = new Set();
    for (const assignment of item.provenance_assignments) {
      if (assignment.source_index >= authoredSources.length || seen.has(assignment.source_index)
        || excluded.has(assignment.source_index)) {
        findings.push(finding('SPLIT_PROVENANCE_ASSIGNMENT_INVALID', {
          output: item.output, source_index: assignment.source_index,
        }));
      }
      seen.add(assignment.source_index);
      decided.add(assignment.source_index);
      if (assignment.support === 'unclear') {
        findings.push(finding('SPLIT_PROVENANCE_ASSIGNMENT_UNCLEAR', {
          output: item.output, source_index: assignment.source_index,
        }));
      }
    }
  }
  for (let sourceIndex = 0; sourceIndex < authoredSources.length; sourceIndex++) {
    if (!decided.has(sourceIndex)) {
      findings.push(finding('SPLIT_PROVENANCE_ASSIGNMENT_MISSING', { source_index: sourceIndex }));
    }
  }
  return findings;
}

function routeFindings(supplied, review) {
  const findings = [];
  const outputs = new Set(supplied.outputs.map((item) => item.output));
  const groups = new Set(supplied.outputs.flatMap((item) => (
    item.reader_purpose_group === null ? [] : [item.reader_purpose_group.key]
  )));
  for (const route of supplied.whole_source_link_routes) {
    if (route.target === null) {
      findings.push(finding('SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS', { from: route.from }));
    } else if ((route.target.kind === 'output' && !outputs.has(route.target.output))
      || (route.target.kind === 'group_index' && !groups.has(route.target.group))) {
      findings.push(finding('SPLIT_WHOLE_SOURCE_LINK_ROUTE_INVALID', { from: route.from }));
    }
  }
  for (const item of supplied.outputs) {
    const owned = review.sections.filter((section) => section.output === item.output);
    for (const route of item.anchor_routes) {
      if (!owned.some((section) => section.line_start <= route.line_start && route.line_end <= section.line_end)) {
        findings.push(finding('SPLIT_ANCHOR_ROUTE_NOT_OWNED', {
          output: item.output, line_start: route.line_start, line_end: route.line_end,
        }));
      }
    }
  }
  for (const change of supplied.heading_changes) {
    const section = review.sections.find((item) => item.output === change.output
      && item.kind === 'heading' && item.line_start === change.line);
    const sourceHeading = section && section.heading_path[section.heading_path.length - 1];
    const proposedOutput = supplied.outputs.find((item) => item.output === change.output);
    const targetShown = change.action === 'removed' || (proposedOutput
      && proposedOutput.heading_outline.some((item) => item.text === change.target_heading));
    if (!outputs.has(change.output) || sourceHeading !== change.source_heading || !targetShown) {
      findings.push(finding('SPLIT_HEADING_CHANGE_NOT_OWNED', { output: change.output, line: change.line }));
    }
  }
  return findings;
}

function tree(outputs) {
  const root = outputs.filter((item) => item.reader_purpose_group === null).map((item) => ({
    concept_id: item.concept_id, path: item.path, title: item.title,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const grouped = new Map();
  for (const item of outputs) {
    const proposed = item.reader_purpose_group;
    if (proposed === null) continue;
    if (!grouped.has(proposed.key)) {
      grouped.set(proposed.key, {
        key: proposed.key,
        purpose: proposed.purpose,
        index_entry: proposed.index_entry,
        child_entries: [],
      });
    }
    grouped.get(proposed.key).child_entries.push(proposed.child_entry);
  }
  const groups = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const item of groups) item.child_entries.sort((a, b) => a.order - b.order);
  return { root, groups };
}

function withProvenance(supplied, authoredSources) {
  return supplied.outputs.map((item) => ({
    ...item,
    provenance_assignments: item.provenance_assignments.map((assignment) => ({
      ...assignment, source: authoredSources[assignment.source_index] ?? null,
    })),
  }));
}

function evaluate(review, supplied, authoredSources) {
  const findings = [];
  if (review.accounting_status !== 'complete') {
    findings.push(finding('SPLIT_PROPOSAL_ACCOUNTING_INCOMPLETE', { accounting_status: review.accounting_status }));
  }
  const accounted = new Set(review.outputs.map((item) => item.output));
  const proposed = new Set(supplied.outputs.map((item) => item.output));
  if (proposed.size !== supplied.outputs.length || !sameSet(accounted, proposed)) {
    findings.push(finding('SPLIT_PROPOSAL_OUTPUT_MISMATCH', {
      accounted: [...accounted].sort(), proposed: [...proposed].sort(),
    }));
  }
  if ((supplied.result === 'keep_as_one' && supplied.outputs.length !== 1)
    || (supplied.result === 'split' && supplied.outputs.length < 2)) {
    findings.push(finding('SPLIT_PROPOSAL_RESULT_INVALID', { result: supplied.result, outputs: supplied.outputs.length }));
  }
  findings.push(...targetFindings(supplied), ...groupFindings(supplied),
    ...provenanceFindings(supplied, authoredSources), ...routeFindings(supplied, review));

  const outputs = withProvenance(supplied, authoredSources);
  return {
    proposal: {
      status: findings.length > 0 ? 'refused' : (supplied.accepted ? 'accepted' : 'ready'),
      result: supplied.result,
      keep_as_one_reason: supplied.keep_as_one_reason,
      accepted: supplied.accepted,
      outputs,
      provenance_exclusions: supplied.provenance_exclusions.map((item) => ({
        ...item, source: authoredSources[item.source_index] ?? null,
      })),
      heading_changes: supplied.heading_changes,
      whole_source_link_routes: supplied.whole_source_link_routes,
      tree: tree(supplied.outputs),
    },
    findings,
  };
}

module.exports = { validPayload, evaluate };
