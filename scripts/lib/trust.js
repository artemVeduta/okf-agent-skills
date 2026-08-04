/*
 * PROVISIONAL (spec section 11 open item): trust grant and inspection
 * interface and the exact Git common metadata storage location are invented.
 * This slice inspects <commondir>/okf-instance and never mints trust.
 */

const path = require('node:path');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function commonDir(root, services) {
  const dotgit = path.join(root, '.git');
  try {
    if (!services.isFile(dotgit)) return dotgit;
    const line = services.readFile(dotgit).split(/\r?\n/).find((item) => item.startsWith('gitdir:'));
    if (!line) return dotgit;
    const gitdir = path.resolve(root, line.slice(7).trim());
    const commondir = path.join(gitdir, 'commondir');
    if (!services.exists(commondir)) return gitdir;
    const value = services.readFile(commondir).trim();
    return path.resolve(gitdir, value);
  } catch { return dotgit; }
}

function trusted(root, services) {
  try { return uuid.test(services.readFile(path.join(commonDir(root, services), 'okf-instance')).trim()); } catch { return false; }
}

module.exports = { trusted };
