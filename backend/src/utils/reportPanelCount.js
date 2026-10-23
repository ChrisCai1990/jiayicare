const text = value => String(value || '').trim();
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseExpectedCount(title) {
  const match = text(title).match(/([0-9]+|[一二两三四五六七八九十]+)\s*项/);
  if (!match) return null;
  const raw = match[1];
  if (/^[0-9]+$/.test(raw)) return Number(raw);
  if (raw.length === 1) return CN_NUM[raw] || null;
  if (raw.length === 2 && raw[0] === '十') return 10 + (CN_NUM[raw[1]] || 0);
  if (raw.length === 2 && raw[1] === '十') return (CN_NUM[raw[0]] || 0) * 10;
  return null;
}

// Use the printed panel title supplied by OCR. Some labs put it in sourceSection
// and leave orderName empty; no item names or abnormal-value rules are inferred.
function findUnderExtractedPages(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (item.itemType !== 'lab' && item.itemType !== 'data') continue;
    const title = [item.orderName, item.sourceSection].map(text).find(parseExpectedCount);
    if (!title) continue;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(item);
  }
  const pagesToRetry = new Set();
  const underOrders = [];
  for (const [orderName, group] of groups) {
    const expected = parseExpectedCount(orderName);
    if (group.length >= expected) continue;
    const pages = [...new Set(group.map(item => Number(item._page || item.sourcePage)).filter(Boolean))];
    if (!pages.length) continue;
    pages.forEach(page => pagesToRetry.add(page));
    underOrders.push({ orderName, expected, actual: group.length, pages });
  }
  return { pagesToRetry: [...pagesToRetry].sort((a, b) => a - b), underOrders };
}

module.exports = { parseExpectedCount, findUnderExtractedPages };
