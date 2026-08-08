/*
The default filesystem binding all wrappers inject. The runtime never calls `fs`
directly: every filesystem observation arrives through this object, so a test can
substitute one. Keeping the binding here stops the wrapper entry points from
carrying separate copies of the same path-walking code.
*/

const fs = require('node:fs');
const path = require('node:path');

function targetChanged() {
  const error = new Error('target changed before publication');
  error.code = 'TARGET_CHANGED';
  return error;
}

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function publishFile(file, bytes, expected) {
  const directory = path.dirname(file);
  mkdir(directory);
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

// `skipDir(directory)`, when supplied, prunes a directory before descending into it:
// the directory is left out of `files` without being lstat'd or read, and without
// affecting `complete`. This is how a caller (e.g. `scripts/lib/discovery.js`, #142)
// excludes a subtree such as `node_modules` without paying for its own symlinks
// (pnpm's `node_modules` is symlink-heavy) or losing the honest `complete: false`
// signal to noise from a subtree it never intended to scan. The default skips
// nothing, so every existing caller's behavior is unchanged.
function listFiles(root, skipDir = () => false) {
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
          if (skipDir(file)) continue;
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
  return { files, complete };
}

// Access and link probes are fallible queries whose failure is a status, never a
// thrown exception, because the admission gates report them as findings.
module.exports = {
  exists: fs.existsSync,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  // Raw bytes, for the discovery classifier's UTF-8 validation and magic-number
  // sniffing (#142) — `readFile` above always decodes as UTF-8, which would hide
  // exactly the encoding and signature evidence that classification needs.
  readBuffer: (file) => fs.readFileSync(file),
  writeFile: (file, data) => fs.writeFileSync(file, data, 'utf8'),
  publishFile,
  realpath: fs.realpathSync,
  isFile: (file) => fs.statSync(file).isFile(),
  isLink: (file) => { try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; } },
  access: (file) => { try { fs.accessSync(file, fs.constants.R_OK); return true; } catch { return false; } },
  writable: (file) => { try { fs.accessSync(file, fs.constants.W_OK); return true; } catch { return false; } },
  listFiles,
  mkdir,
  remove: (file) => fs.rmSync(file, { force: true }),
  readdir: (dir) => fs.readdirSync(dir),
  removeEmptyDir: (dir) => { try { fs.rmdirSync(dir); return true; } catch { return false; } },
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
