// Watches what a live model actually sends on the wrapper's stdin, not only
// which skill activated. A bounded write prompt gives no hint about field
// placement; the model must still put `task_kind` at the top level of the
// `okf-wrapper/1` request it composes — a sibling of `payload`, never a key
// inside it. Non-gating, like the activation cases: see README.md.
import { extractWrapperRequests } from '../lib/wrapper-request.js';
import { BlockedCase } from '../lib/report.js';

// Deliberately not imported from activation.eval.js: that file's obligation
// is the activation prompt, not this case's "no hint about field placement"
// requirement. The wording mirrors okf-write-positive-activation's prompt on
// purpose — same bounded revise task, so the two cases measure the same
// model behavior from different angles — but this case owns its own copy so
// a future edit to the activation prompt cannot silently add a
// field-placement hint here unreviewed.
const PROMPT = "Revise note.md: set its title to 'Renamed by eval'. Cite evidence.md as your evidence for the change.";

async function run({ dispatchAndCollect }) {
  const { shellCommands } = await dispatchAndCollect(PROMPT);
  const requests = shellCommands.flatMap(extractWrapperRequests);

  if (requests.length === 0) {
    throw new BlockedCase('no okf-wrapper/1 request observed in any shell command the model ran');
  }

  // Score the first request, not the last. The ticket's requirement is "no
  // hint about field placement" — if a first attempt was rejected, the
  // wrapper's own stderr becomes a hint for a retried second attempt, so
  // scoring the last request would pass a model that only got it right
  // after being told. The first request is the one made with no hint.
  const request = requests[0];
  const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};

  if (!('task_kind' in request)) {
    throw new Error(
      `expected a top-level "task_kind" on the okf-wrapper/1 request, got keys: [${Object.keys(request).join(', ')}]`,
    );
  }
  if ('task_kind' in payload) {
    throw new Error('expected "task_kind" only at the top level of the okf-wrapper/1 request, but found it inside payload too');
  }
}

export const CASE = {
  id: 'okf-write-task-kind-top-level',
  kind: 'field-placement',
  description:
    'A bounded write prompt with no field-placement hint still gets the model to put task_kind at the top level of its okf-wrapper/1 request, not inside payload.',
  run,
};
