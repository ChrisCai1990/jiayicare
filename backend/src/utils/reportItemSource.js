const crypto = require('crypto');

// 为报告项目补稳定来源标识。名称和数值被人工修正后，版本比较仍可引用同一原始位置。
function ensureReportItemSourceIds(items) {
  const occurrences = new Map();
  return (Array.isArray(items) ? items : []).map(item => {
    if (!item || typeof item !== 'object' || item.sourceItemId) return item;
    const base = [item.sourcePage || 0, item.sourceSection || '', item.orderName || '', item.itemType || 'lab'].join('|');
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    const sourceItemId = `ri_${crypto.createHash('sha1').update(`${base}|${occurrence}`).digest('hex').slice(0, 20)}`;
    return { ...item, sourceItemId };
  });
}

module.exports = { ensureReportItemSourceIds };
