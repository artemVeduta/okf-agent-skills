/*
 * #197 (#200): the shared file-word rule. A word is one continuous run of
 * letters or numbers; headings, prose, tables, frontmatter, and code all
 * count. Markdown's own punctuation marks (`#`, `*`, `|`, backticks, and the
 * rest) are never letters or numbers, so a run-based count already excludes
 * them without stripping or special-casing any region of the text.
 *
 * This module owns the definition only. It never compares a count against a
 * target and never decides anything from one -- exposing the effective
 * `max_words_per_file` value and deciding what, if anything, a count over it
 * means is the caller's job (#197 scopes only the setting's exposure; a
 * later ticket owns split review).
 */

const WORD = /[\p{L}\p{N}]+/gu;

function countWords(text) {
  const matches = text.match(WORD);
  return matches ? matches.length : 0;
}

module.exports = { countWords };
