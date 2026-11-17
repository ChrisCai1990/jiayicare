const test = require('node:test');
const assert = require('node:assert/strict');
const { isImageReport } = require('../src/utils/reportImageType');

test('recognizes legacy JPG report without a stored MIME type', () => {
  assert.equal(isImageReport({ mimeType: '', fileUrl: 'https://storage.example/reports/record.jpg' }), true);
  assert.equal(isImageReport({ fileUrls: ['https://storage.example/record.JPEG?token=abc'] }), true);
});

test('does not infer image type from unrelated or conflicting files', () => {
  assert.equal(isImageReport({ mimeType: '', fileUrl: 'https://storage.example/record.pdf' }), false);
  assert.equal(isImageReport({ mimeType: 'application/pdf', fileUrl: 'https://storage.example/record.jpg' }), false);
});
