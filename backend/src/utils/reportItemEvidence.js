const text = value => String(value == null ? '' : value).trim();

function positivePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function reportItemSourcePages(item = {}) {
  return [...new Set([
    positivePage(item.sourcePage),
    ...(Array.isArray(item.sourcePages) ? item.sourcePages.map(positivePage) : []),
    ...(Array.isArray(item.sourceEvidence) ? item.sourceEvidence.map(row => positivePage(row?.page)) : []),
  ].filter(Boolean))].sort((a, b) => a - b);
}

function normalizeEvidenceRows(item, pages) {
  const rows = Array.isArray(item.sourceEvidence) ? item.sourceEvidence : [];
  const byPage = new Map();
  for (const rawRow of rows) {
    const row = rawRow?.toObject ? rawRow.toObject() : rawRow;
    const page = positivePage(row?.page);
    if (!page) continue;
    const previous = byPage.get(page) || {};
    byPage.set(page, {
      ...previous,
      ...row,
      page,
      text: text(row?.text) || text(previous.text),
      method: text(row?.method) || text(previous.method) || 'unknown',
    });
  }
  for (const page of pages) {
    if (!byPage.has(page)) {
      byPage.set(page, {
        page,
        text: page === positivePage(item.sourcePage) ? text(item.evidenceText) : '',
        method: item.textLayerEvidence === 'verified' ? 'text_layer' : 'unknown',
      });
    } else if (page === positivePage(item.sourcePage)) {
      const row = byPage.get(page);
      if (!text(row.text) && text(item.evidenceText)) row.text = text(item.evidenceText);
      if (row.method === 'unknown' && item.textLayerEvidence === 'verified') row.method = 'text_layer';
    }
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function normalizeReportItemEvidence(items = []) {
  return (Array.isArray(items) ? items : []).map(rawItem => {
    if (!rawItem || typeof rawItem !== 'object') return rawItem;
    const item = rawItem.toObject ? rawItem.toObject() : rawItem;
    const pages = reportItemSourcePages(item);
    if (!pages.length) return item;
    return {
      ...item,
      sourcePage: pages[0],
      sourcePages: pages,
      sourceEvidence: normalizeEvidenceRows(item, pages),
    };
  });
}

function itemTouchesPage(item, page) {
  const target = positivePage(page);
  return Boolean(target && reportItemSourcePages(item).includes(target));
}

function linkedReportItemPages(items = [], page) {
  const target = positivePage(page);
  if (!target) return [];
  return [...new Set((Array.isArray(items) ? items : []).flatMap(item => {
    const pages = reportItemSourcePages(item);
    return pages.length > 1 && pages.includes(target) ? pages : [];
  }).filter(linkedPage => linkedPage !== target))].sort((a, b) => a - b);
}

function mergeText(left, right) {
  const first = text(left);
  const second = text(right);
  if (!first) return second;
  if (!second || first === second || first.includes(second)) return first;
  if (second.includes(first)) return second;
  return `${first}\n${second}`;
}

function identity(value) {
  return text(value).toLowerCase().replace(/[\s，,、:：;；()（）\[\]【】\-_/]/g, '');
}

function contextCompatible(left, right) {
  const leftSection = identity(left.sourceSection);
  const rightSection = identity(right.sourceSection);
  const leftOrder = identity(left.orderName);
  const rightOrder = identity(right.orderName);
  return (leftSection && rightSection && leftSection === rightSection)
    || (leftOrder && rightOrder && leftOrder === rightOrder)
    || (!leftSection && !rightSection && !leftOrder && !rightOrder);
}

function statusPriority(status) {
  return ({ abnormal: 4, attention: 3, normal: 2, unknown: 1 })[status] || 0;
}

// Only merge exact, adjacent imaging/data continuations. Numeric lab rows are
// deliberately excluded because the same analyte can legitimately recur.
function mergeAdjacentReportItemEvidence(items = []) {
  const result = [];
  for (const normalized of normalizeReportItemEvidence(items)) {
    if (!normalized || typeof normalized !== 'object') continue;
    const pages = reportItemSourcePages(normalized);
    const previous = result[result.length - 1];
    const previousPages = reportItemSourcePages(previous);
    const canMerge = previous
      && ['imaging', 'data'].includes(normalized.itemType)
      && normalized.itemType === previous.itemType
      && identity(normalized.name)
      && identity(normalized.name) === identity(previous.name)
      && pages[0] === previousPages[previousPages.length - 1] + 1
      && contextCompatible(previous, normalized);

    if (!canMerge) {
      result.push(normalized);
      continue;
    }

    const mergedPages = [...new Set([...previousPages, ...pages])].sort((a, b) => a - b);
    const merged = {
      ...previous,
      sourcePage: mergedPages[0],
      sourcePages: mergedPages,
      sourceEvidence: normalizeEvidenceRows({
        sourceEvidence: [...(previous.sourceEvidence || []), ...(normalized.sourceEvidence || [])],
      }, mergedPages),
    };
    for (const field of ['findings', 'diagnosis', 'conclusion', 'pathologyFindings', 'pathologyDiagnosis']) {
      merged[field] = mergeText(previous[field], normalized[field]);
    }
    if (statusPriority(normalized.status) > statusPriority(previous.status)) merged.status = normalized.status;
    result[result.length - 1] = merged;
  }
  return result;
}

module.exports = {
  itemTouchesPage,
  linkedReportItemPages,
  mergeAdjacentReportItemEvidence,
  normalizeReportItemEvidence,
  reportItemSourcePages,
};
