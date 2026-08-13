/*
 * #201 Task 3/4: a source ATX heading that lands in a residue section.
 *
 * `sourceHeadings` builds `known_headings` from the accepted accounting and
 * carries each heading's own owning output, which is `null` for a heading inside
 * a `residue` section -- `headingChangeFindings` already assumes exactly that,
 * filtering `item.output !== null` before it asks for a change row. `validAccepted`
 * disagreed with both: it required a non-empty `output` on every known heading, so
 * `migration-plan` accepted such a proposal and `partition` then refused the same
 * value as `proposal_shape`, leaving every source with a residue heading
 * unpublishable at that seam.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runWrapper, temporaryRoot, writeManifest } = require('../test-support/snapshot');
const { packagesFor, planWithGroups } = require('../test-support/groups');
const splitProposal = require('../scripts/lib/split-proposal');

const wrapper = path.join(__dirname, '..', 'scripts', 'okf-setup.js');
const SOURCE = 'docs/guide.md';
const GROUP = 'content';
const CONTENT = [
  '---',
  'type: Note',
  '---',
  '# Install',
  '',
  'Install the tool.',
  '',
  '# Operate',
  '',
  'Operate the tool.',
].join('\n');

// `# Install` (line 4) stays at the source as residue; only `# Operate` migrates,
// so the accepted proposal is a keep-as-one carrying one residue-owned heading.
const SECTIONS = [
  { line_start: 1, line_end: 3, disposition: 'residue' },
  { line_start: 4, line_end: 7, disposition: 'residue' },
  { line_start: 8, line_end: 10, disposition: 'assigned', output: 'operate' },
];

function repo(t) {
  const root = temporaryRoot(t, 'okf-201-residue-heading-');
  fs.mkdirSync(path.join(root, '.git'));
  writeManifest(root, '.');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, SOURCE), CONTENT);
  return root;
}

function run(operation, root, payload) {
  return runWrapper(wrapper, {
    protocol: 'okf-wrapper/1', skill: 'okf-setup', operation, payload: { cwd: root, ...payload },
  });
}

function proposal() {
  return {
    path: SOURCE,
    result: 'keep_as_one',
    keep_as_one_reason: 'Only the operating instructions carry durable context.',
    accepted: true,
    outputs: [{
      output: 'operate',
      concept_id: `${GROUP}/operate`,
      path: `${GROUP}/operate.md`,
      type: 'Playbook',
      title: 'Operate',
      heading_outline: [{ level: 1, text: 'Operate' }],
      reader_purpose_group: {
        key: GROUP,
        purpose: `Reader purpose for ${GROUP}.`,
        index_entry: { path: `${GROUP}/index.md`, title: `${GROUP} index` },
        child_entry: {
          concept_id: `${GROUP}/operate`, path: `${GROUP}/operate.md`, title: 'Operate', order: 1,
        },
      },
      provenance_assignments: [],
      link_routes: [],
      anchor_routes: [],
    }],
    provenance_exclusions: [],
    heading_changes: [],
    whole_source_link_routes: [],
  };
}

function acceptedPlan(root) {
  const sources = run('discover', root, {}).data.sources.filter((item) => item.path === SOURCE);
  const payload = {
    split_requested: [SOURCE],
    split_sections: [{ path: SOURCE, sections: SECTIONS }],
    split_proposals: [proposal()],
  };
  const placement = { [SOURCE]: GROUP };
  const request = (extra) => ({
    protocol: 'okf-wrapper/1',
    skill: 'okf-setup',
    operation: 'migration-plan',
    payload: { cwd: root, sources, ...extra },
  });
  const { response } = planWithGroups(
    (value) => runWrapper(wrapper, value),
    request,
    { root, bundle: 'okf', placement, payload },
  );
  const concepts = response.data.split_review[0].proposal.outputs.map((item) => item.concept_id);
  const accepted = packagesFor(root, 'okf', placement, concepts, {});
  return run('migration-plan', root, {
    ...accepted,
    ...payload,
    sources,
    answers: { [SOURCE]: { reader_purpose_group: GROUP } },
  }).data;
}

test('an accepted proposal keeps a residue-owned source heading and still partitions', (t) => {
  const root = repo(t);
  const plan = acceptedPlan(root);
  const review = plan.split_review[0];

  assert.equal(review.accounting_status, 'complete');
  assert.equal(review.proposal.status, 'accepted');

  const residue = review.proposal.known_headings.find((item) => item.line === 4);
  assert.equal(residue.output, null, 'a heading inside a residue section owns no output');
  assert.ok(splitProposal.validAccepted(review.proposal), 'the accepted proposal must stay shape-valid');

  const partitioned = run('partition', root, {
    plan: plan.plan, mapping: plan.mapping, split_review: plan.split_review,
  });
  assert.equal(partitioned.result, 'ok', JSON.stringify(partitioned.findings));
  assert.equal(partitioned.data.shards.length, 1);
});
