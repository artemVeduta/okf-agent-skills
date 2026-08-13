---
status: draft
type: Glossary
---
# Evidence and Review Glossary

**Provenance source**:
An authored OKF `sources` entry identifying evidence that supports a concept.
It does not by itself assert that a change to the source makes the concept
semantically stale.
_Avoid_: Freshness dependency, watched file

**Observed evidence**:
A file, path, or tool result actually read during a resolution. It supports an
answer only to the extent observed; it is not authored provenance, a review
baseline, or a freshness claim.
_Avoid_: Provenance source, source-of-truth claim, review dependency

**Write evidence**:
An observation binding between material used during a resolution and one exact
proposed mutation. It is either a file observation that the write path can
recheck or a non-file observation frozen in the accepted proposal. It does not
prove semantic relevance or create authored provenance.
_Avoid_: Provenance source, semantic proof, readable-file token

**Review dependency**:
An operationally tracked artifact or scope whose change is evidence that a
concept may need review. It is distinct from authored provenance and does not
make a semantic-freshness claim.
_Avoid_: Provenance source, proof of staleness

**Review baseline**:
The accepted content identity of a concept's review dependencies at the time of
an evidence-backed review. Later observations are compared with this baseline;
repository history and file timestamps do not define it.
_Avoid_: Git baseline, last concept edit
