// #200/#201 task 3: derive and validate one complete split proposal. This
// module is pure apart from the explicit inventory read in buildInventory.

const path = require('node:path');
const validation = require('./validation');
const mapping = require('./mapping');
const discovery = require('./discovery');
const sections = require('./sections');
const { normalizeRelative } = require('./monorepo');

const results = new Set(['keep_as_one', 'split']);
const headingActions = new Set(['changed', 'removed']);
const provenanceSupport = new Set(['supported', 'unclear']);

const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value !== '';
const positive = (value) => Number.isInteger(value) && value > 0;
const only = (value, fields) => Object.keys(value).every((field) => fields.includes(field));

function indexEntry(value) {
  return object(value) && text(value.path) && text(value.title) && value.path.endsWith('/index.md');
}

function childEntry(value) {
  return object(value) && text(value.concept_id) && text(value.path) && text(value.title)
    && value.path === `${value.concept_id}.md` && positive(value.order);
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
    && provenanceSupport.has(value.support)
    && (value.source === undefined || object(value.source));
}

function routeIdentity(value) {
  return object(value) && text(value.from) && positive(value.line) && positive(value.occurrence) && text(value.resource);
}

function linkRoute(value) {
  return routeIdentity(value) && text(value.target);
}

function anchorRoute(value) {
  return routeIdentity(value) && text(value.source_anchor) && positive(value.line_start)
    && positive(value.line_end) && value.line_start <= value.line_end && text(value.target_anchor);
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
  if (!object(value) || !positive(value.line) || !text(value.source_heading)
    || !headingActions.has(value.action) || !text(value.output)) return false;
  if (value.action === 'changed') {
    return text(value.target_heading) && positive(value.target_level) && text(value.target_anchor);
  }
  return value.target_heading === null && value.target_level === null && value.target_anchor === null;
}

function wholeSourceRoute(value) {
  if (!routeIdentity(value)) return false;
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

function validAccepted(value) {
  const responseOutput = (item) => output(item)
    && only(item, ['output', 'concept_id', 'path', 'type', 'title', 'heading_outline', 'reader_purpose_group', 'provenance_assignments', 'link_routes', 'anchor_routes'])
    && item.heading_outline.every((row) => only(row, ['level', 'text']))
    && item.provenance_assignments.every((row) => only(row, ['source_index', 'support', 'source'])
      && object(row.source))
    && item.link_routes.every((row) => only(row, ['from', 'line', 'occurrence', 'resource', 'target']))
    && item.anchor_routes.every((row) => only(row, ['from', 'line', 'occurrence', 'resource', 'source_anchor', 'line_start', 'line_end', 'target_anchor']));
  const knownRoute = (route) => routeIdentity(route) && only(route, [
    'from', 'line', 'occurrence', 'resource', 'source_anchor', 'line_start', 'line_end', 'candidate_lines',
  ]) && (route.source_anchor === undefined || text(route.source_anchor))
    && (route.line_start === undefined || positive(route.line_start))
    && (route.line_end === undefined || positive(route.line_end))
    && (route.line_start === undefined || route.line_end === undefined || route.line_start <= route.line_end)
    && (route.candidate_lines === undefined || Array.isArray(route.candidate_lines) && route.candidate_lines.every(positive));
  const knownHeading = (item) => object(item) && positive(item.line) && positive(item.level) && item.level <= 6
    && text(item.text) && text(item.anchor) && positive(item.line_start) && positive(item.line_end)
    && item.line_start <= item.line_end && text(item.output)
    && only(item, ['line', 'level', 'text', 'anchor', 'line_start', 'line_end', 'output']);
  const rootEntry = (item) => object(item) && text(item.concept_id) && item.path === `${item.concept_id}.md`
    && text(item.title) && only(item, ['concept_id', 'path', 'title']);
  const groupEntry = (item) => object(item) && text(item.key) && text(item.purpose) && indexEntry(item.index_entry)
    && only(item.index_entry, ['path', 'title']) && Array.isArray(item.child_entries)
    && item.child_entries.every((row) => childEntry(row) && only(row, ['concept_id', 'path', 'title', 'order']))
    && only(item, ['key', 'purpose', 'index_entry', 'child_entries']);
  const validTree = object(value.tree) && Array.isArray(value.tree.root) && Array.isArray(value.tree.groups)
    && Array.isArray(value.tree.unresolved) && value.tree.unresolved.every(text)
    && value.tree.root.every(rootEntry) && value.tree.groups.every(groupEntry)
    && only(value.tree, ['root', 'groups', 'unresolved']);
  return object(value) && value.status === 'accepted' && value.accepted === true
    && valid({
      path: '_',
      result: value.result,
      keep_as_one_reason: value.keep_as_one_reason,
      accepted: value.accepted,
      outputs: value.outputs,
      provenance_exclusions: value.provenance_exclusions,
      heading_changes: value.heading_changes,
      whole_source_link_routes: value.whole_source_link_routes,
    })
    && ((value.result === 'keep_as_one' && value.outputs.length === 1)
      || (value.result === 'split' && value.outputs.length >= 2))
    && value.outputs.every(responseOutput)
    && value.provenance_exclusions.every((row) => only(row, ['source_index', 'reason', 'source'])
      && object(row.source))
    && value.heading_changes.every((row) => only(row, [
      'line', 'source_heading', 'action', 'output', 'target_heading', 'target_level', 'target_anchor',
    ]))
    && value.whole_source_link_routes.every((row) => only(row, ['from', 'line', 'occurrence', 'resource', 'target']))
    && object(value.known_routes)
    && ['whole_source', 'heading_anchor', 'ordinary'].every((key) => Array.isArray(value.known_routes[key])
      && value.known_routes[key].every(knownRoute))
    && only(value.known_routes, ['whole_source', 'heading_anchor', 'ordinary'])
    && Array.isArray(value.known_headings) && value.known_headings.every(knownHeading)
    && validTree
    && only(value, [
      'status', 'result', 'keep_as_one_reason', 'accepted', 'outputs', 'provenance_exclusions',
      'heading_changes', 'whole_source_link_routes', 'known_routes', 'known_headings', 'tree',
    ]);
}

const finding = (code, detail = {}) => ({ code, detail });
const sameSet = (left, right) => left.size === right.size && [...left].every((item) => right.has(item));

function documentBody(raw) {
  try {
    const parsed = validation.parseFrontmatter(raw);
    const closing = raw.split('\n').findIndex((line, index) => index > 0 && line.replace(/\r$/, '') === '---');
    return { body: parsed.body, line_offset: closing + 1 };
  } catch {
    return { body: raw, line_offset: 0 };
  }
}

function headingAnchor(value) {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/[ _]+/g, '-');
}

function sourceHeadings(review, raw) {
  const lines = raw.split('\n').map((line) => line.replace(/\r$/, ''));
  return review.sections.filter((section) => section.kind === 'heading').flatMap((section) => {
    const heading = sections.parseAtxHeading(lines[section.line_start - 1] || '');
    if (!heading) return [];
    return [{
      line: section.line_start,
      level: heading.level,
      text: heading.text,
      anchor: headingAnchor(heading.text),
      line_start: section.line_start,
      line_end: section.line_end,
      output: section.output,
    }];
  });
}

function fileLinks(filePath, raw) {
  const document = documentBody(raw);
  return validation.markdownLinkOccurrences(document.body).map((item) => ({
    from: filePath,
    line: item.line + document.line_offset,
    occurrence: item.occurrence,
    resource: item.resource,
  }));
}

function fragment(resource) {
  const hash = resource.indexOf('#');
  if (hash < 0 || hash === resource.length - 1) return null;
  try {
    return decodeURIComponent(resource.slice(hash + 1));
  } catch {
    return resource.slice(hash + 1);
  }
}

function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function buildInventory(sourcePath, raw, review, gitRoot, bundleRoot, services) {
  const source = raw === null ? '' : raw;
  const headings = sourceHeadings(review, source);
  const ordinary = [];
  const whole_source = [];
  const heading_anchor = [];
  const findings = [];

  function classify(from, content) {
    for (const item of fileLinks(from, content)) {
      const targetPath = validation.bodyLinkPath(item.resource);
      const local = from === sourcePath && item.resource.startsWith('#');
      const targetsSource = local || (targetPath && mapping.resolveLinkTarget(from, targetPath) === sourcePath);
      if (!targetsSource) {
        if (from !== sourcePath || !targetPath) continue;
        const section = review.sections.find((candidate) => candidate.line_start <= item.line && item.line <= candidate.line_end);
        if (section && section.output !== null) {
          ordinary.push({ ...item, target: mapping.normalizedLinkTarget(from, item.resource), output: section.output });
        }
        continue;
      }
      const sourceAnchor = fragment(item.resource);
      if (sourceAnchor === null) {
        whole_source.push(item);
        continue;
      }
      const matches = headings.filter((heading) => heading.anchor === sourceAnchor);
      if (matches.length > 1) {
        const candidate_lines = matches.map((heading) => heading.line);
        heading_anchor.push({
          ...item, source_anchor: sourceAnchor, line_start: null, line_end: null, candidate_lines, output: null,
        });
        findings.push(finding('SPLIT_HEADING_ANCHOR_AMBIGUOUS', {
          ...item, source_anchor: sourceAnchor, candidate_lines,
        }));
        continue;
      }
      const owner = matches[0];
      if (!owner || owner.output === null) continue;
      heading_anchor.push({
        ...item,
        source_anchor: sourceAnchor,
        line_start: owner.line_start,
        line_end: owner.line_end,
        output: owner.output,
      });
    }
  }

  if (raw === null) findings.push(finding('SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE', {
    reason: 'read_failed', from: sourcePath,
  }));
  else classify(sourcePath, source);
  const excluded = new Set(['.git', 'node_modules', '.okf-staging']);
  const listing = services.listFiles(gitRoot, (dir) => excluded.has(path.basename(dir)));
  if (!listing.complete) findings.push(finding('SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE', { reason: 'walk_incomplete' }));
  for (const file of listing.files) {
    if (!discovery.isMarkdownFile(file) || !insideRoot(gitRoot, file)) continue;
    const from = path.relative(gitRoot, file).split(path.sep).join('/');
    if (from === sourcePath) continue;
    let content;
    try {
      content = services.readFile(file);
    } catch {
      findings.push(finding('SPLIT_PROPOSAL_ROUTE_INVENTORY_INCOMPLETE', { reason: 'read_failed', from }));
      continue;
    }
    classify(from, content);
  }
  const byIdentity = (left, right) => {
    const leftKey = routeKey('', left);
    const rightKey = routeKey('', right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  };
  whole_source.sort(byIdentity);
  heading_anchor.sort(byIdentity);
  ordinary.sort(byIdentity);
  return { headings, routes: { whole_source, heading_anchor, ordinary }, findings };
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
    const proposedGroup = item.reader_purpose_group;
    const expectedDirectory = proposedGroup === null ? '.' : proposedGroup.key;
    if (path.posix.dirname(item.path) !== expectedDirectory
      || (proposedGroup !== null && proposedGroup.index_entry.path !== `${proposedGroup.key}/index.md`)) {
      findings.push(finding('SPLIT_PROPOSAL_PLACEMENT_INVALID', {
        output: item.output, group: proposedGroup === null ? null : proposedGroup.key, target_path: item.path,
      }));
    }
    if (proposedGroup !== null) indexes.set(proposedGroup.key, proposedGroup.index_entry.path);
  }
  const seenIndexes = new Set();
  for (const [groupKey, indexPath] of indexes) {
    if (normalizeRelative(indexPath) !== indexPath || path.posix.basename(indexPath) !== 'index.md') {
      findings.push(finding('SPLIT_PROPOSAL_TARGET_INVALID', { group: groupKey, target_path: indexPath }));
    }
    if (paths.has(indexPath) || seenIndexes.has(indexPath)) {
      findings.push(finding('SPLIT_PROPOSAL_TARGET_COLLISION', { group: groupKey, target_path: indexPath }));
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
      findings.push(finding('SPLIT_PROPOSAL_GROUP_CONFLICT', { group: proposed.key, order: proposed.child_entry.order }));
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
    if (!decided.has(sourceIndex)) findings.push(finding('SPLIT_PROVENANCE_ASSIGNMENT_MISSING', { source_index: sourceIndex }));
  }
  return findings;
}

const routeKey = (kind, route, outputKey = '') => [
  kind, route.from, route.line, route.occurrence, route.resource, outputKey,
].join('\0');

function compareRoutes(kind, expected, actual) {
  const findings = [];
  const expectedByKey = new Map(expected.map((item) => [routeKey(kind, item, item.output || ''), item]));
  const counts = new Map();
  for (const item of actual) {
    const key = routeKey(kind, item, item.output || '');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count > 1) findings.push(finding('SPLIT_PROPOSAL_ROUTE_DUPLICATE', { route_kind: kind }));
    if (!expectedByKey.has(key)) findings.push(finding('SPLIT_PROPOSAL_ROUTE_EXTRA', { route_kind: kind }));
  }
  for (const [key, item] of expectedByKey) {
    if (!counts.has(key)) {
      findings.push(finding('SPLIT_PROPOSAL_ROUTE_MISSING', { route_kind: kind }));
      continue;
    }
    const proposed = actual.find((candidate) => routeKey(kind, candidate, candidate.output || '') === key);
    if (kind === 'ordinary' && proposed.target !== item.target) {
      findings.push(finding('SPLIT_PROPOSAL_ROUTE_TARGET_INVALID', { route_kind: kind }));
    }
  }
  return findings;
}

function headingFindings(supplied, inventory) {
  const findings = [];
  const changes = new Map();
  for (const change of supplied.heading_changes) {
    if (changes.has(change.line)) {
      findings.push(finding('SPLIT_HEADING_CHANGE_DUPLICATE', { line: change.line }));
    }
    changes.set(change.line, change);
  }
  const outlines = new Map(supplied.outputs.map((item) => [item.output, item.heading_outline.map((headingItem) => ({ ...headingItem, used: false }))]));
  for (const source of inventory.headings.filter((item) => item.output !== null)) {
    const change = changes.get(source.line);
    const outline = outlines.get(source.output) || [];
    if (!change) {
      const unchanged = outline.find((item) => !item.used && item.level === source.level && item.text === source.text);
      if (!unchanged) findings.push(finding('SPLIT_HEADING_CHANGE_MISSING', { output: source.output, line: source.line }));
      else unchanged.used = true;
      continue;
    }
    if (change.output !== source.output || change.source_heading !== source.text) {
      findings.push(finding('SPLIT_HEADING_CHANGE_NOT_OWNED', { output: change.output, line: change.line }));
      continue;
    }
    if (change.action === 'changed') {
      const changed = outline.find((item) => !item.used && item.level === change.target_level && item.text === change.target_heading);
      if (!changed || change.target_anchor !== headingAnchor(change.target_heading)) {
        findings.push(finding('SPLIT_HEADING_CHANGE_INVALID', { output: change.output, line: change.line }));
      } else changed.used = true;
    }
    changes.delete(source.line);
  }
  for (const change of changes.values()) {
    findings.push(finding('SPLIT_HEADING_CHANGE_NOT_OWNED', { output: change.output, line: change.line }));
  }
  return findings;
}

function routeFindings(supplied, inventory) {
  const findings = [];
  const outputs = new Set(supplied.outputs.map((item) => item.output));
  const groups = new Set(supplied.outputs.flatMap((item) => (
    item.reader_purpose_group === null ? [] : [item.reader_purpose_group.key]
  )));
  const whole = supplied.whole_source_link_routes;
  const ordinary = supplied.outputs.flatMap((item) => item.link_routes.map((route) => ({ ...route, output: item.output })));
  const anchors = supplied.outputs.flatMap((item) => item.anchor_routes.map((route) => ({ ...route, output: item.output })));
  findings.push(...compareRoutes('whole_source', inventory.routes.whole_source, whole));
  findings.push(...compareRoutes('ordinary', inventory.routes.ordinary, ordinary));
  findings.push(...compareRoutes('heading_anchor', inventory.routes.heading_anchor.filter((item) => item.output !== null), anchors));

  for (const route of whole) {
    if (route.target === null) findings.push(finding('SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS', { from: route.from }));
    else if ((route.target.kind === 'output' && !outputs.has(route.target.output))
      || (route.target.kind === 'group_index' && !groups.has(route.target.group))) {
      findings.push(finding('SPLIT_WHOLE_SOURCE_LINK_ROUTE_INVALID', { from: route.from }));
    }
  }
  for (const route of anchors) {
    const known = inventory.routes.heading_anchor.find((item) => routeKey('heading_anchor', item, item.output || '')
      === routeKey('heading_anchor', route, route.output));
    if (!known || !positive(known.line_start) || !positive(known.line_end)) continue;
    const change = supplied.heading_changes.find((item) => item.line === known.line_start);
    const outputRow = supplied.outputs.find((item) => item.output === route.output);
    const retainedAnchors = new Set((outputRow && outputRow.heading_outline || []).map((item) => headingAnchor(item.text)));
    const targetValid = change && change.action === 'changed'
      ? route.target_anchor === change.target_anchor
      : change && change.action === 'removed'
        ? retainedAnchors.has(route.target_anchor)
        : route.target_anchor === known.source_anchor;
    if (route.line_start !== known.line_start || route.line_end !== known.line_end || !targetValid) {
      findings.push(finding('SPLIT_PROPOSAL_ROUTE_TARGET_INVALID', { route_kind: 'heading_anchor' }));
    }
  }
  return findings;
}

function tree(outputs) {
  const root = outputs.filter((item) => item.reader_purpose_group === null).map((item) => ({
    concept_id: item.concept_id, path: item.path, title: item.title,
  })).sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const grouped = new Map();
  for (const item of outputs) {
    const proposed = item.reader_purpose_group;
    if (proposed === null || !text(proposed.key)) continue;
    if (!grouped.has(proposed.key)) {
      grouped.set(proposed.key, {
        key: proposed.key, purpose: proposed.purpose, index_entry: proposed.index_entry, child_entries: [],
      });
    }
    grouped.get(proposed.key).child_entries.push(proposed.child_entry);
  }
  const groups = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const item of groups) item.child_entries.sort((a, b) => a.order - b.order);
  const unresolved = outputs.filter((item) => !text(item.path)
    || (item.reader_purpose_group !== null && !text(item.reader_purpose_group.key)))
    .map((item) => item.output).sort();
  return { root, groups, unresolved };
}

function knownRoutes(inventory) {
  return {
    whole_source: inventory.routes.whole_source.map(({ from, line, occurrence, resource }) => ({ from, line, occurrence, resource })),
    heading_anchor: inventory.routes.heading_anchor.map((item) => ({
      from: item.from,
      line: item.line,
      occurrence: item.occurrence,
      resource: item.resource,
      source_anchor: item.source_anchor,
      line_start: item.line_start,
      line_end: item.line_end,
      ...(item.candidate_lines ? { candidate_lines: item.candidate_lines } : {}),
    })),
    ordinary: inventory.routes.ordinary.map(({ from, line, occurrence, resource }) => ({ from, line, occurrence, resource })),
  };
}

function withProvenance(supplied, authoredSources) {
  return supplied.outputs.map((item) => ({
    ...item,
    provenance_assignments: item.provenance_assignments.map((assignment) => ({
      ...assignment, source: authoredSources[assignment.source_index] ?? null,
    })),
  }));
}

function responseProposal(supplied, authoredSources, inventory, findings) {
  const accepted = findings.length === 0 && supplied.accepted;
  return {
    status: findings.length > 0 ? 'refused' : (accepted ? 'accepted' : 'ready'),
    result: supplied.result,
    keep_as_one_reason: supplied.keep_as_one_reason,
    accepted,
    outputs: withProvenance(supplied, authoredSources),
    provenance_exclusions: supplied.provenance_exclusions.map((item) => ({
      ...item, source: authoredSources[item.source_index] ?? null,
    })),
    heading_changes: supplied.heading_changes,
    whole_source_link_routes: supplied.whole_source_link_routes,
    known_routes: knownRoutes(inventory),
    known_headings: inventory.headings,
    tree: tree(supplied.outputs),
  };
}

function evaluate(review, supplied, authoredSources, inventory) {
  const findings = [...inventory.findings];
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
    ...provenanceFindings(supplied, authoredSources), ...headingFindings(supplied, inventory),
    ...routeFindings(supplied, inventory));
  return { proposal: responseProposal(supplied, authoredSources, inventory, findings), findings };
}

function initialGroup() {
  return {
    key: null,
    purpose: null,
    index_entry: { path: null, title: null },
    child_entry: { concept_id: null, path: null, title: null, order: null },
  };
}

function derive(review, mapped, authoredSources, inventory) {
  const one = review.outputs.length === 1;
  const outputs = review.outputs.map((accounted) => {
    const conceptId = one ? mapped.concept : null;
    return {
      output: accounted.output,
      concept_id: conceptId,
      path: conceptId === null ? null : `${conceptId}.md`,
      type: one ? mapped.type : null,
      title: null,
      heading_outline: [],
      reader_purpose_group: initialGroup(),
      provenance_assignments: authoredSources.map((source, source_index) => ({ source_index, support: 'unclear', source })),
      link_routes: inventory.routes.ordinary.filter((item) => item.output === accounted.output)
        .map(({ from, line, occurrence, resource, target }) => ({ from, line, occurrence, resource, target })),
      anchor_routes: inventory.routes.heading_anchor.filter((item) => item.output === accounted.output)
        .map(({ from, line, occurrence, resource, source_anchor, line_start, line_end }) => ({
          from, line, occurrence, resource, source_anchor, line_start, line_end, target_anchor: null,
        })),
    };
  });
  const proposal = {
    status: 'refused',
    result: one ? 'keep_as_one' : 'split',
    keep_as_one_reason: one ? null : null,
    accepted: false,
    outputs,
    provenance_exclusions: [],
    heading_changes: [],
    whole_source_link_routes: inventory.routes.whole_source.map(({ from, line, occurrence, resource }) => ({
      from, line, occurrence, resource, target: null,
    })),
    known_routes: knownRoutes(inventory),
    known_headings: inventory.headings,
    tree: tree(outputs),
  };
  const findings = [...inventory.findings];
  const unresolved = (field, outputKey) => findings.push(finding('SPLIT_PROPOSAL_VALUE_UNRESOLVED', {
    field, ...(outputKey === undefined ? {} : { output: outputKey }),
  }));
  if (one) unresolved('keep_as_one_reason');
  for (const item of outputs) {
    for (const field of ['concept_id', 'path', 'type', 'title']) if (!text(item[field])) unresolved(field, item.output);
    unresolved('reader_purpose_group', item.output);
    if (item.heading_outline.length === 0) unresolved('heading_outline', item.output);
    for (const route of item.anchor_routes) {
      unresolved('anchor_routes.target_anchor', item.output);
    }
    for (const assignment of item.provenance_assignments) {
      findings.push(finding('SPLIT_PROVENANCE_ASSIGNMENT_UNCLEAR', { output: item.output, source_index: assignment.source_index }));
    }
  }
  for (const route of proposal.whole_source_link_routes) {
    findings.push(finding('SPLIT_WHOLE_SOURCE_LINK_AMBIGUOUS', { from: route.from, line: route.line, occurrence: route.occurrence }));
  }
  return { proposal, findings };
}

function proposalClaims(sourcePath, proposal) {
  const groups = new Set();
  return proposal.outputs.flatMap((item) => {
    const claims = text(item.path)
      ? [{ source: sourcePath, target_path: item.path, concept_id: item.concept_id, output: item.output }]
      : [];
    const proposed = item.reader_purpose_group;
    if (proposed && proposed.index_entry && text(proposed.index_entry.path) && !groups.has(proposed.key)) {
      groups.add(proposed.key);
      claims.push({ source: sourcePath, target_path: proposed.index_entry.path, group: proposed.key });
    }
    return claims;
  });
}

function callTargetFindings(records, normalTargets, existingTargets) {
  const claims = records.flatMap((item) => proposalClaims(item.path, item.proposal));
  const reserved = new Map();
  for (const item of normalTargets) reserved.set(item.target_path, [{ kind: 'normal', ...item }]);
  for (const target_path of existingTargets) {
    if (!reserved.has(target_path)) reserved.set(target_path, []);
    reserved.get(target_path).push({ kind: 'existing', target_path });
  }
  for (const claim of claims) {
    if (!reserved.has(claim.target_path)) reserved.set(claim.target_path, []);
    reserved.get(claim.target_path).push({ kind: 'proposal', ...claim });
  }
  const findings = [];
  for (const [target_path, owners] of reserved) {
    const proposed = owners.filter((item) => item.kind === 'proposal');
    const sharedGroup = owners.length === proposed.length && proposed.every((item) => item.group)
      && new Set(proposed.map((item) => item.group)).size === 1;
    if (proposed.length === 0 || owners.length === 1 || sharedGroup) continue;
    for (const item of proposed) {
      findings.push({
        path: item.source,
        code: 'SPLIT_PROPOSAL_TARGET_COLLISION',
        detail: { target_path, claims: owners.map(({ kind, source, output, group }) => ({ kind, source, output, group })) },
      });
    }
  }
  return findings;
}

function refuse(proposal) {
  return { ...proposal, status: 'refused', accepted: false };
}

module.exports = {
  validPayload, validAccepted, buildInventory, derive, evaluate, callTargetFindings, refuse,
};
