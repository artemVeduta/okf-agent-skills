/*
 * Recursive directory snapshot shared by tests that assert "nothing else
 * changed": every entry's name, type, and (for files) content, in a stable
 * order. Lives outside test/ so node --test's directory-based discovery
 * does not pick this helper up as a test file itself.
 */
const fs = require('node:fs');
const path = require('node:path');

function snapshot(root) {
  const entries = [];
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      const file = path.join(directory, entry.name);
      entries.push([name, entry.isDirectory() ? 'directory' : 'file', entry.isFile() ? fs.readFileSync(file, 'utf8') : '']);
      if (entry.isDirectory()) visit(file, name);
    }
  }
  visit(root);
  return entries;
}

module.exports = { snapshot };
