const { isDeepStrictEqual } = require('node:util');

function collect(splitReview) {
  const groups = new Map();
  for (const review of splitReview.filter((item) => item.proposal?.status === 'accepted' && item.proposal.accepted === true)) {
    for (const output of review.proposal.outputs) {
      const accepted = output.reader_purpose_group;
      if (accepted === null) continue;
      const definition = { purpose: accepted.purpose, index_entry: accepted.index_entry };
      if (!groups.has(accepted.key)) {
        groups.set(accepted.key, { key: accepted.key, ...definition, child_entries: [] });
      } else if (!isDeepStrictEqual(definition, {
        purpose: groups.get(accepted.key).purpose,
        index_entry: groups.get(accepted.key).index_entry,
      })) {
        return { ok: false, detail: { group: accepted.key, reason: 'definition' } };
      }
      groups.get(accepted.key).child_entries.push(accepted.child_entry);
    }
  }
  for (const group of groups.values()) {
    for (const field of ['order', 'path', 'title', 'concept_id']) {
      const values = group.child_entries.map((item) => item[field]);
      if (new Set(values).size !== values.length) {
        return { ok: false, detail: { group: group.key, reason: `child_${field}` } };
      }
    }
    group.child_entries.sort((left, right) => left.order - right.order);
  }
  return {
    ok: true,
    groups: [...groups.values()].sort((left, right) => left.index_entry.path.localeCompare(right.index_entry.path)),
  };
}

module.exports = { collect };
