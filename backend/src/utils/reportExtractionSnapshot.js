function positivePageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

function resolveExtractionPageCount(report = {}) {
  return positivePageCount(report.ocrProgress?.totalPages)
    || positivePageCount(report.pages)
    || 0;
}

module.exports = { resolveExtractionPageCount };
