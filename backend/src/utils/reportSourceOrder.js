const asPositiveInteger = value => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const sectionKey = item => String(item?.sourceSection || item?.orderName || '未识别原件栏目')
  .trim()
  .replace(/\s+/g, ' ');

// The OCR model can occasionally return rows from two sections interleaved.  Keep
// its explicit visual coordinates when present; otherwise give every section a
// stable page-local position so a later row from an earlier section cannot jump
// ahead of that section in the reviewer.
function tagReportPageItems(items, pageNum) {
  const sectionOrders = new Map();
  const nextRowOrders = new Map();
  let nextSectionOrder = 1;

  return (items || [])
    .filter(item => item?.name && String(item.name).trim())
    .map((item, index) => {
      const key = sectionKey(item);
      const explicitSectionOrder = asPositiveInteger(item.sourceSectionOrder);
      if (!sectionOrders.has(key)) {
        sectionOrders.set(key, explicitSectionOrder || nextSectionOrder);
        nextSectionOrder = Math.max(nextSectionOrder, sectionOrders.get(key) + 1);
      }
      const sourceSectionOrder = sectionOrders.get(key);
      const explicitRowOrder = asPositiveInteger(item.sourceRowOrder);
      const sourceRowOrder = explicitRowOrder || ((nextRowOrders.get(key) || 0) + 1);
      nextRowOrders.set(key, Math.max(nextRowOrders.get(key) || 0, sourceRowOrder));

      return {
        ...item,
        sourcePage: pageNum,
        sourceSectionOrder,
        sourceRowOrder,
        _page: pageNum,
        _order: index,
      };
    });
}

function sortReportItemsBySource(items) {
  return (items || []).sort((left, right) => {
    const pageDelta = (Number(left._page || left.sourcePage) || 0) - (Number(right._page || right.sourcePage) || 0);
    if (pageDelta) return pageDelta;
    const sectionDelta = (asPositiveInteger(left.sourceSectionOrder) || Number.MAX_SAFE_INTEGER)
      - (asPositiveInteger(right.sourceSectionOrder) || Number.MAX_SAFE_INTEGER);
    if (sectionDelta) return sectionDelta;
    const rowDelta = (asPositiveInteger(left.sourceRowOrder) || Number.MAX_SAFE_INTEGER)
      - (asPositiveInteger(right.sourceRowOrder) || Number.MAX_SAFE_INTEGER);
    if (rowDelta) return rowDelta;
    return (Number(left._order) || 0) - (Number(right._order) || 0);
  });
}

function stripReportSourceOrder(items) {
  return (items || []).map(({ _page, _order, ...rest }) => rest);
}

module.exports = { tagReportPageItems, sortReportItemsBySource, stripReportSourceOrder };
