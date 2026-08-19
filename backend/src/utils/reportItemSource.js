const crypto = require('crypto');

// 为报告项目补稳定来源标识。名称和数值被人工修正后，版本比较仍可引用同一原始位置。
function ensureReportItemSourceIds(items) {
  const occurrences = new Map();
  const usedIds = new Set((Array.isArray(items) ? items : []).map(item => item?.sourceItemId).filter(Boolean));
  return (Array.isArray(items) ? items : []).map(item => {
    if (!item || typeof item !== 'object' || item.sourceItemId) return item;
    const base = [item.sourcePage || 0, item.sourceSection || '', item.orderName || '', item.itemType || 'lab'].join('|');
    let occurrence = (occurrences.get(base) || 0) + 1;
    let sourceItemId = '';
    do {
      sourceItemId = `ri_${crypto.createHash('sha1').update(`${base}|${occurrence}`).digest('hex').slice(0, 20)}`;
      occurrence += 1;
    } while (usedIds.has(sourceItemId));
    occurrences.set(base, occurrence - 1);
    usedIds.add(sourceItemId);
    return { ...item, sourceItemId };
  });
}

module.exports = { ensureReportItemSourceIds };
