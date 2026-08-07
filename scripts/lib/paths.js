// Path containment, the one rule both the write path (evidence must sit under the
// bundle root) and `setup.js` (a staged file must sit under the staging root) check
// before they read a caller-supplied relative path.

const path = require('node:path');

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

module.exports = { inside };
