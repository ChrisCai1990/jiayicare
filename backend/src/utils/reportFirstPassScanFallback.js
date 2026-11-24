// Recover candidates only when a large annual PDF page has no usable text
// layer and the first visual pass returned no results. The caller must keep
// these rows pending for human review and must not treat count as accuracy.
async function recoverBlankScannedLabPage({ pdfBuffer, pageNum, existingItems, readLayout, renderPage, extractTable }) {
  if (existingItems.length) return [];
  const layout = await readLayout(pdfBuffer, pageNum);
  // A scanned page can still have a searchable header or footer. That alone
  // does not mean its result table has a usable text layer.
  if (String(layout || '').replace(/\s/g, '').length >= 120) return [];
  const image = await renderPage(pdfBuffer, pageNum, 300);
  if (!image) return [];
  const result = await extractTable(Buffer.from(image, 'base64'), pageNum);
  if (!result.supported || result.items.length < 6) return [];
  return result.items.map(item => ({ ...item, manualReviewStatus: 'pending' }));
}

module.exports = { recoverBlankScannedLabPage };
