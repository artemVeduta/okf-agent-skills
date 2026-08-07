/*
 * #142: setup discovery and source classifier.
 *
 * Scans the active project for candidate source documents and classifies each
 * one deterministically. The direct parse target this classifier looks for is
 * exactly the #131 migration contract's narrow target: UTF-8 Markdown with
 * compatible optional YAML frontmatter and standard Markdown links/reference
 * definitions. Everything the migration will not interpret -- HTML, PDF, Word,
 * MediaWiki, and Obsidian wikilinks/callouts/Dataview -- is named `unsupported`
 * rather than silently skipped or converted. A file this classifier cannot
 * place on the evidence it has is `ambiguous`, carrying a `question` for the
 * user, never a guess.
 *
 * Reuses `services.listFiles` (no second tree walker) and the shared
 * frontmatter/YAML reader from `validation.js` (no second parser), so this
 * module's classification and the writer's own notion of "valid frontmatter"
 * can never quietly disagree.
 */

const path = require('node:path');
const validation = require('./validation');

// Discovery-scope exclusions ONLY -- this is not a REACH exclusion rule.
// scripts/lib/reach.js is explicit (see its own PROVISIONAL header) that the exact
// REACH exclusion rule list is a declared open specification item and that no
// configurable directory-exclusion list may ship. This set is fixed, in code, not
// configurable through any request payload, and used only to decide which
// subtree a discovery scan walks -- it does not gate REACH, TRUST, ACCESS, or any
// admission decision. The three names #142 calls "obvious": version-control
// internals and vendored dependencies are never authored source documents, and
// the OKF bundle itself must not be re-discovered as a candidate source for its
// own migration.
const EXCLUDED_DIR_NAMES = new Set(['.git', 'node_modules']);

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const WORD_EXTENSIONS = new Set(['.doc', '.docx']);

const PDF_MAGIC = Buffer.from('%PDF-');
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Wiki-markup detectors. MediaWiki's markers are checked first because a MediaWiki
// export can also contain a bare `[[Page]]` wikilink, which is the one construct it
// shares with Obsidian; a stronger, more specific marker settles the format rather
// than the first pattern encountered. Both lists run against the text with fenced
// code blocks stripped, so a document merely showing wiki syntax as an example in a
// code fence is not misclassified by it.
const MEDIAWIKI_PATTERNS = [
  /'''[^'\n]+'''/, // bold
  /^={2,}[^=\n]+={2,}\s*$/m, // == Heading ==
  /<ref[ >]/i, // <ref>citation</ref>
  /\[\[Category:[^\]]+\]\]/i, // [[Category:Foo]]
];
const OBSIDIAN_PATTERNS = [
  /!?\[\[[^\]|\n]+(\|[^\]\n]+)?\]\]/, // [[Wikilink]], [[Wikilink|Alias]], ![[Embed]]
  /^\s*>\s*\[!\w+\]/m, // > [!note] callout
  /^```dataview\b/m, // ```dataview code fence
  // ponytail: dataview inline-field heuristic, `key:: value` at line start. This can
  // still false-positive on an unusual prose line; upgrade to a real Dataview grammar
  // if that shows up in practice.
  /^\s*[-*]?\s*[A-Za-z_][\w \t-]*::\s+\S/m,
];

function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

function wikiFormat(text) {
  const stripped = stripFencedCode(text);
  if (MEDIAWIKI_PATTERNS.some((pattern) => pattern.test(stripped))) return 'mediawiki';
  if (OBSIDIAN_PATTERNS.some((pattern) => pattern.test(stripped))) return 'obsidian';
  return null;
}

function isValidUtf8(buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

// Reuses validation.js's own frontmatter/YAML reader rather than a second one, so
// "compatible frontmatter" here means exactly what the writer would accept, never a
// looser or stricter guess (#131: "widen the shared reader ... rather than silently
// changing meaning" -- #143's job -- so this module reads through the same seam
// instead of pre-empting it). A file with no frontmatter block at all is a plain,
// compatible direct parse target: the migration contract calls frontmatter optional.
function frontmatterStatus(text) {
  let extracted;
  try {
    extracted = validation.parseFrontmatter(text);
  } catch (error) {
    if (error.reason === 'missing opening frontmatter delimiter') return { present: false, compatible: true };
    return { present: true, compatible: false, reason: error.reason || 'unterminated frontmatter block' };
  }
  try {
    validation.parseYAML(extracted.frontmatter);
    return { present: true, compatible: true };
  } catch (error) {
    return { present: true, compatible: false, reason: error.reason || error.message };
  }
}

function relPosix(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function classifyMarkdown(rel, buffer) {
  if (!isValidUtf8(buffer)) {
    return {
      path: rel,
      category: 'ambiguous',
      format: 'markdown',
      reason: 'not_utf8',
      question: `${rel} is not valid UTF-8 text. Confirm how to handle its encoding, or exclude it, before migration.`,
    };
  }
  const text = buffer.toString('utf8');
  const wiki = wikiFormat(text);
  if (wiki) {
    return {
      path: rel,
      category: 'unsupported',
      format: wiki,
      reason: wiki === 'mediawiki' ? 'mediawiki_markup' : 'obsidian_construct',
    };
  }
  const frontmatter = frontmatterStatus(text);
  if (!frontmatter.compatible) {
    return {
      path: rel,
      category: 'ambiguous',
      format: 'markdown',
      reason: `incompatible_frontmatter:${frontmatter.reason}`,
      question: `${rel}'s frontmatter block could not be parsed (${frontmatter.reason}). Confirm how to handle it before migration.`,
    };
  }
  return {
    path: rel,
    category: 'markdown',
    format: 'markdown',
    reason: frontmatter.present ? 'utf8_markdown_with_frontmatter' : 'utf8_markdown',
  };
}

function magicMatches(buffer, magic) {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, 4096).toString('utf8').toLowerCase();
  return /<!doctype html|<html[\s>]/.test(head);
}

function ambiguousSignature(rel, expected) {
  return {
    path: rel,
    category: 'ambiguous',
    format: expected,
    reason: `extension_signature_mismatch:${expected}`,
    question: `${rel} has a "${expected}" extension but its content does not carry a ${expected} signature. Confirm what this file actually is before migration.`,
  };
}

// Extension names the expected format; content signature confirms or refuses it
// (#142: "a file extension alone is weak evidence"). A mismatch is `ambiguous`,
// never guessed past.
function classifyByExtension(rel, ext, buffer) {
  if (PDF_EXTENSIONS.has(ext)) {
    return magicMatches(buffer, PDF_MAGIC)
      ? { path: rel, category: 'unsupported', format: 'pdf', reason: 'pdf_signature' }
      : ambiguousSignature(rel, 'pdf');
  }
  if (WORD_EXTENSIONS.has(ext)) {
    return magicMatches(buffer, OLE_MAGIC) || magicMatches(buffer, ZIP_MAGIC)
      ? { path: rel, category: 'unsupported', format: 'word', reason: 'word_signature' }
      : ambiguousSignature(rel, 'word');
  }
  return looksLikeHtml(buffer)
    ? { path: rel, category: 'unsupported', format: 'html', reason: 'html_markup' }
    : ambiguousSignature(rel, 'html');
}

function classifyOther(rel, ext) {
  return {
    path: rel,
    category: 'other',
    format: ext ? ext.slice(1) : 'no_extension',
    reason: 'not_a_candidate_document_format',
  };
}

function classify(file, rel, services) {
  const ext = path.extname(file).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return classifyMarkdown(rel, services.readBuffer(file));
  }
  if (HTML_EXTENSIONS.has(ext) || PDF_EXTENSIONS.has(ext) || WORD_EXTENSIONS.has(ext)) {
    return classifyByExtension(rel, ext, services.readBuffer(file));
  }
  return classifyOther(rel, ext);
}

// The scan root is the active repository root (`gitRoot`), not the raw `cwd` a
// caller supplies: discovery scans "the project", per #142, and a caller's `cwd`
// may be a subdirectory. The bundle itself is pruned during the walk (not filtered
// afterward), so a symlink or an unreadable directory inside an already-migrated
// bundle never taints the `complete` signal for a scan that was never scoped to
// re-discover it.
function shouldSkipDir(bundleRoot, dir) {
  return EXCLUDED_DIR_NAMES.has(path.basename(dir)) || dir === bundleRoot;
}

function discover(gitRoot, bundleRoot, services) {
  const { files, complete } = services.listFiles(gitRoot, (dir) => shouldSkipDir(bundleRoot, dir));
  const sources = files.map((file) => classify(file, relPosix(gitRoot, file), services));
  return { sources, complete };
}

module.exports = { discover, classify };
