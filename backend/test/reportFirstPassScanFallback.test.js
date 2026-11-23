const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverBlankScannedLabPage } = require('../src/utils/reportFirstPassScanFallback');

test('blank scanned page recovers only review candidates from local table OCR', async () => {
  const calls = [];
  const rows = await recoverBlankScannedLabPage({ pdfBuffer: Buffer.from('pdf'), pageNum: 9,
    existingItems: [], readLayout: async () => '', renderPage: async (_, page, dpi) => {
      calls.push([page, dpi]); return Buffer.from('image').toString('base64');
    }, extractTable: async (_, page) => ({ supported: true, items: Array.from({ length: 6 }, (_, i) =>
      ({ name: `项目${i}`, value: String(i), sourcePage: page })) }) });
  assert.deepEqual(calls, [[9, 300]]);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.manualReviewStatus === 'pending'));
});

test('text pages, existing results and weak OCR cannot enter the fallback', async () => {
  const base = { pdfBuffer: Buffer.from('pdf'), pageNum: 1,
    readLayout: async () => '', renderPage: async () => Buffer.from('image').toString('base64'),
    extractTable: async () => ({ supported: true, items: [{ name: '项目', value: '1' }] }) };
  assert.deepEqual(await recoverBlankScannedLabPage({ ...base, existingItems: [{}],
    readLayout: async () => { throw Error('should not read'); } }), []);
  const headerRows = await recoverBlankScannedLabPage({ ...base, existingItems: [], readLayout: async () => '报告页眉',
    extractTable: async () => ({ supported: true, items: Array.from({ length: 6 }, (_, i) => ({ name: `项目${i}`, value: String(i) })) }) });
  assert.equal(headerRows.length, 6);
  assert.deepEqual(await recoverBlankScannedLabPage({ ...base, existingItems: [],
    readLayout: async () => '完整可搜索正文'.repeat(25) }), []);
  assert.deepEqual(await recoverBlankScannedLabPage({ ...base, existingItems: [] }), []);
});
