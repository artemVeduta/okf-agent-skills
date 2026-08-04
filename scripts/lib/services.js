/*
The default filesystem binding both wrappers inject. The runtime never calls `fs`
directly: every filesystem observation arrives through this object, so a test can
substitute one. Keeping the binding here stops the two wrapper entry points from
carrying separate copies of the same path-walking code.
*/

const fs = require('fs');
const path = require('path');

// Presence of `.git` marks a repository root, so a linked worktree, whose `.git` is a
// file rather than a directory, still resolves to its own root.
function gitRootOf(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// Access and link probes are fallible queries whose failure is a status, never a
// thrown exception, because the admission gates report them as findings.
module.exports = {
  exists: fs.existsSync,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  writeFile: (file, data) => fs.writeFileSync(file, data, 'utf8'),
  realpath: fs.realpathSync,
  isFile: (file) => fs.statSync(file).isFile(),
  isLink: (file) => { try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; } },
  access: (file) => { try { fs.accessSync(file, fs.constants.R_OK); return true; } catch { return false; } },
  gitRootOf,
};
