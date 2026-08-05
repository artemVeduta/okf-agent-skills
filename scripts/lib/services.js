/*
The default filesystem binding all wrappers inject. The runtime never calls `fs`
directly: every filesystem observation arrives through this object, so a test can
substitute one. Keeping the binding here stops the wrapper entry points from
carrying separate copies of the same path-walking code.
*/

const fs = require('fs');
const path = require('path');

function targetChanged() {
  const error = new Error('target changed before publication');
  error.code = 'TARGET_CHANGED';
  return error;
}

function publishFile(file, bytes, expected) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, bytes);
    if (expected === null ? fs.existsSync(file) : !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) {
      throw targetChanged();
    }
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

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

function listFiles(root) {
  const files = [];
  let complete = true;

  function visit(directory) {
    try {
      if (fs.lstatSync(directory).isSymbolicLink()) {
        complete = false;
        return;
      }
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(file);
        } else if (entry.isFile()) {
          files.push(file);
        } else if (entry.isSymbolicLink()) {
          complete = false;
        }
      }
    } catch {
      complete = false;
    }
  }

  visit(path.resolve(root));
  files.sort();
  Object.defineProperty(files, 'complete', { value: complete, enumerable: false, writable: true });
  return files;
}

// Access and link probes are fallible queries whose failure is a status, never a
// thrown exception, because the admission gates report them as findings.
module.exports = {
  exists: fs.existsSync,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  writeFile: (file, data) => fs.writeFileSync(file, data, 'utf8'),
  publishFile,
  realpath: fs.realpathSync,
  isFile: (file) => fs.statSync(file).isFile(),
  isLink: (file) => { try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; } },
  access: (file) => { try { fs.accessSync(file, fs.constants.R_OK); return true; } catch { return false; } },
  listFiles,
  activationMarker: (root) => {
    try {
      const marker = fs.lstatSync(path.join(root, '.okf-active'));
      return marker.isFile() && marker.size === 0 ? 'valid' : 'invalid';
    } catch (error) {
      return error.code === 'ENOENT' ? 'absent' : 'invalid';
    }
  },
  gitRootOf,
};
