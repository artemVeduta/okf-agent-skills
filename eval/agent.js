// The one Flue agent this eval slice drives. It attaches the local sandbox
// to a fresh fixture repository (see lib/fixture.js) so Flue discovers the
// five real workspace skills under `<fixture>/.agents/skills/<name>/SKILL.md`.
//
// The model specifier is copied verbatim from @flue/runtime's own bundled
// docs (docs/guide/sandboxes.md:35,81). It needs ANTHROPIC_API_KEY to
// actually run a turn.
import { useInitialData, useModel, useSandbox } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const MODEL = 'anthropic/claude-haiku-4-5';

export function OkfEvalAgent() {
  useModel(MODEL);
  const initial = useInitialData();
  useSandbox(local({ cwd: initial && initial.cwd }));
  return [
    'You work inside a checkout of the okf-agent-skills repository.',
    'Activate a workspace skill only when its description matches the task at hand.',
    'Take only the action the user asks for. Do not invent extra changes.',
  ].join('\n');
}
