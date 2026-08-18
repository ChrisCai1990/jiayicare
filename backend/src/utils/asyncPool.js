async function mapWithConcurrency(items, limit, mapper) {
  const list = Array.from(items || []);
  if (!list.length) return [];
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await mapper(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

module.exports = { mapWithConcurrency };
