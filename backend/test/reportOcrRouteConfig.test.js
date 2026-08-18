const test = require('node:test');
const assert = require('node:assert/strict');

test('staff OCR routes load the shared OCR policy constants', () => {
  assert.doesNotThrow(() => require('../src/routes/staff'));
  const { OCR_POLICY_VERSION, OCR_V2_EXTRACTION_CONTRACT } = require('../src/config/ocrPolicy');
  assert.equal(OCR_POLICY_VERSION, 'v2.0');
  assert.ok(OCR_V2_EXTRACTION_CONTRACT);
});
