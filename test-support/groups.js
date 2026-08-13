/*
 * #203 (#202): accepted concept-group packages for a test migration.
 *
 * Every substantive concept now belongs to an approved reader-purpose group, and
 * `migration-plan` asks for that group rather than deriving one, so every test
 * that drives a migration has to carry an accepted package set and one placement
 * answer per source. This helper builds both from one plain `{source: group}` map
 * so a test states its placement once and nothing else has to restate the accepted
 * tree by hand.
 *
 * It runs `migration-plan` twice, deliberately: the first call is what tells the
 * caller which concept identity each accepted placement produced, and the second
 * carries the index children derived from exactly those identities -- the same
 * accepted rows the conformance gate proves against.
 */

const fs = require('node:fs');
const path = require('node:path');

function titleFor(conceptId) {
  return path.posix.basename(conceptId);
}

function packagesFor(root, bundle, placement, concepts, options) {
  const groups = [...new Set(Object.values(placement))].sort();
  const bundleRoot = path.join(root, ...bundle.split('/'));
  const parents = new Set();
  for (const group of groups) {
    const segments = group.split('/');
    for (let index = 1; index < segments.length; index += 1) parents.add(segments.slice(0, index).join('/'));
  }
  const all = [...new Set([...groups, ...parents])].sort();
  const packages = all.map((group) => {
    const direct = concepts.filter((item) => path.posix.dirname(item) === group).sort();
    const children = all.filter((item) => item !== group && path.posix.dirname(item) === group).sort();
    const indexExists = fs.existsSync(path.join(bundleRoot, ...group.split('/'), 'index.md'));
    return {
      group,
      purpose: options.purpose || `Reader purpose for ${group}`,
      index: { disposition: indexExists ? 'updated' : 'created', title: group },
      glossary: { disposition: direct.includes(`${group}/glossary`) ? 'created' : 'none' },
      guidance: { disposition: 'none' },
      log: { disposition: 'none' },
      children: [
        ...direct.map((conceptId) => ({ kind: 'concept', concept_id: conceptId, title: titleFor(conceptId), order: 0 })),
        ...children.map((child) => ({ kind: 'group', group: child, title: child, order: 0 })),
      ].map((child, index) => ({ ...child, order: index + 1 })),
    };
  });
  const top = all.filter((group) => !group.includes('/')).sort();
  // #203: the root index disposition is derived like the group one -- the root
  // gains the accepted top-level groups this migration, so an `unchanged` claim
  // would be the stale-index lie the suite refuses.
  const rootIndexExists = fs.existsSync(path.join(bundleRoot, 'index.md'));
  return {
    group_packages: packages,
    root_package: {
      purpose: options.root_purpose || 'Bundle root',
      index: {
        disposition: options.root_index
          || (top.length > 0 ? (rootIndexExists ? 'updated' : 'created') : (rootIndexExists ? 'unchanged' : 'created')),
        title: 'Bundle',
      },
      log: { disposition: 'none' },
      children: top.map((group, index) => ({ kind: 'group', group, title: group, order: index + 1 })),
    },
  };
}

/*
 * `run` is the caller's own wrapper runner, `request` builds a `migration-plan`
 * request from an extra payload object. `placement` maps each source path to its
 * accepted group; `answers` carries any other open answer (a type, a collision
 * decision) the same round needs.
 */
function planWithGroups(run, request, { root, bundle = 'okf', placement, answers = {}, payload = {}, options = {} }) {
  const merged = {};
  for (const [source, steps] of Object.entries(answers)) {
    merged[source] = steps !== null && typeof steps === 'object' && !Array.isArray(steps) ? { ...steps } : { type: steps };
  }
  for (const [source, group] of Object.entries(placement)) {
    merged[source] = { ...(merged[source] || {}), reader_purpose_group: group };
  }
  const first = packagesFor(root, bundle, placement, [], options);
  const probe = run(request({ ...first, ...payload, answers: merged }));
  const concepts = (probe.data?.plan?.entries || [])
    .filter((item) => item.disposition === 'migrate').map((item) => item.concept);
  const accepted = packagesFor(root, bundle, placement, concepts, options);
  return { accepted, response: run(request({ ...accepted, ...payload, answers: merged })) };
}

module.exports = { packagesFor, planWithGroups };
