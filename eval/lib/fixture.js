// Builds one fresh fixture repository per eval case.
//
// A Flue conversation reset does not reset files, so every case — mutating
// or not — gets its own temporary bundle root. The six real skills are
// mounted by copying `skills/<name>` from this checkout into
// `<root>/.agents/skills/<name>`, which is the layout Flue discovers
// workspace skills from (docs/research/flue-skill-evaluation.md). A copy,
// not a symlink or a move: `local()` binds the sandbox directly to the host
// filesystem with no isolation, so a symlink into the real `skills/`
// directory would let a live model turn write through to the real repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
const skillsRoot = path.join(repoRoot, 'skills');

export const SKILL_NAMES = ['okf', 'okf-read', 'okf-write', 'okf-lifecycle', 'okf-review', 'okf-setup'];

export function createFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'okf-flue-eval-')));

  // A minimal conforming bundle: declared okf_version, the activation
  // marker, one concept a case can read or revise, and an empty `.git` so the
  // wrapper's repository-root walk (scripts/lib/services.js) stops here.
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.okf-active'), '');
  fs.writeFileSync(
    path.join(root, 'index.md'),
    '---\nokf_version: "0.2"\nproject_mode: "knowledge-only"\n---\n# Bundle\n',
  );
  fs.writeFileSync(path.join(root, 'evidence.md'), 'observed evidence\n');
  fs.writeFileSync(path.join(root, 'note.md'), '---\ntype: Note\ntitle: Before\n---\n# Note\n');

  const skillsDir = path.join(root, '.agents', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const name of SKILL_NAMES) {
    fs.cpSync(path.join(skillsRoot, name), path.join(skillsDir, name), { recursive: true });
  }

  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
