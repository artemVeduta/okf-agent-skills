// One data-driven case per row: dispatch a prompt, check which skills
// activated. `expected: []` is the negative case — none of the five OKF
// skills should activate.
const OKF_SKILLS = ['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review'];

export const CASES = [
  {
    id: 'okf-read-positive-activation',
    description: 'A read-only validation request activates okf, okf-read, or both.',
    prompt:
      'Validate the shape of the concept note.md in this bundle and report its title and type. Do not change anything.',
    expected: ['okf', 'okf-read'],
  },
  {
    id: 'okf-write-positive-activation',
    description: 'A bounded revise request, with evidence named, activates okf, okf-write, or both.',
    prompt: "Revise note.md: set its title to 'Renamed by eval'. Cite evidence.md as your evidence for the change.",
    expected: ['okf', 'okf-write'],
  },
  {
    id: 'okf-lifecycle-positive-activation',
    description: 'A request to synchronize after a concept changed activates okf, okf-lifecycle, or both.',
    prompt:
      "note.md's evidence just changed. Run incremental synchronization so any directly affected index or log entry stays current.",
    expected: ['okf', 'okf-lifecycle'],
  },
  {
    id: 'okf-review-positive-activation',
    description: 'A request to check human-verification staleness and trust tier activates okf, okf-review, or both.',
    prompt: "Check whether note.md's human verification is stale and report the bundle's current trust tier.",
    expected: ['okf', 'okf-review'],
  },
  {
    id: 'unrelated-negative-activation',
    description: 'A task with no connection to OKF activates none of the five OKF skills.',
    prompt: 'Convert 2 cups of flour to grams for a recipe.',
    expected: [],
  },
];

export function activationCaseModule(caseRow) {
  return {
    id: caseRow.id,
    kind: caseRow.expected.length > 0 ? 'activation-positive' : 'activation-negative',
    description: caseRow.description,
    async run({ dispatchAndCollect }) {
      const { activated } = await dispatchAndCollect(caseRow.prompt);
      if (caseRow.expected.length > 0) {
        if (!caseRow.expected.some((name) => activated.includes(name))) {
          throw new Error(
            `expected one of [${caseRow.expected.join(', ')}] among activated skills, got: [${activated.join(', ')}]`,
          );
        }
        return;
      }
      const unexpected = activated.filter((name) => OKF_SKILLS.includes(name));
      if (unexpected.length > 0) {
        throw new Error(`expected no OKF skill activated for an unrelated task, got: [${unexpected.join(', ')}]`);
      }
    },
  };
}
