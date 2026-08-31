function cleanPart(value) {
  return String(value || '').toLowerCase().replace(/[\s，,、:：;；()（）\[\]【】\-_/]/g, '');
}

function reportItemIdentityKey(item) {
  return [item?.itemType || '', cleanPart(item?.name), cleanPart(item?.orderName), cleanPart(item?.sourceSection), cleanPart(item?.bodyPart)].join('|');
}

function describeExistingReportItems(items) {
  return (items || []).filter(item => cleanPart(item?.name)).map(item => {
    const context = item.orderName || item.sourceSection || item.bodyPart || '';
    return `${item.name}${context ? `（${context}）` : ''}`;
  }).join('、');
}

// 模型偶尔会忽略“只输出遗漏项”，服务端再按项目身份硬过滤。
// 不比较 value，避免已有项目因 OCR 数值或单位细微差异被当成新项。
function filterMissingReportItems(existingItems, candidates) {
  const existingKeys = new Set((existingItems || []).map(reportItemIdentityKey));
  const acceptedKeys = new Set();
  return (candidates || []).filter(item => {
    if (!cleanPart(item?.name)) return false;
    const key = reportItemIdentityKey(item);
    if (existingKeys.has(key) || acceptedKeys.has(key)) return false;
    acceptedKeys.add(key);
    return true;
  });
}

module.exports = { describeExistingReportItems, filterMissingReportItems, reportItemIdentityKey };
