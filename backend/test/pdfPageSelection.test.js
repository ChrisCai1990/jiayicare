const test = require('node:test');
const assert = require('node:assert/strict');
const { groupPdfPageNumbers } = require('../src/utils/pdf');

test('selective PDF rendering batches sparse requested pages for parallel fallback', () => {
  assert.deepEqual(groupPdfPageNumbers([9, 3, 2, 9, 10, 15], 3), [[2, 3, 9], [10, 15]]);
});

test('selective PDF rendering respects the batch size inside long runs', () => {
  assert.deepEqual(groupPdfPageNumbers([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('selective PDF rendering rejects invalid page numbers', () => {
  assert.deepEqual(groupPdfPageNumbers([0, -1, 1.5, '2', 3], 8), [[2, 3]]);
});
