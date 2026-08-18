const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveExtractionPageCount } = require('../src/utils/reportExtractionSnapshot');

test('actual OCR page count overrides the legacy one-page default', () => {
  assert.equal(resolveExtractionPageCount({ pages: 1, ocrProgress: { totalPages: 28 } }), 28);
});

test('stored report page count remains the fallback for legacy snapshots', () => {
  assert.equal(resolveExtractionPageCount({ pages: 6 }), 6);
  assert.equal(resolveExtractionPageCount({ pages: 0, ocrProgress: {} }), 0);
});
