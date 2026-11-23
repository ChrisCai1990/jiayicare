// Keep archive startup requests bounded: the page also loads the account,
// records, service state and family archive when it becomes visible.
export async function loadRecordTrends(types, fetchTrend) {
  const results = [];
  for (let index = 0; index < types.length; index += 2) {
    results.push(...await Promise.allSettled(types.slice(index, index + 2).map(fetchTrend)));
  }
  return results;
}
