// Older reports predate reviewRevision. MongoDB treats a null equality query as
// matching both an explicit null and a missing field; either is the initial revision.
function reviewRevisionMatch(revision) {
  const value = Number(revision || 0);
  return value === 0 ? { $in: [0, null] } : value;
}

module.exports = { reviewRevisionMatch };
