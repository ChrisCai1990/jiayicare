const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, TYPES } = require('../src/utils/chatFile');

test('chat file accepts a small PDF and removes path components from the displayed name', () => {
  const data = Buffer.from('%PDF-1.7\nexample').toString('base64');
  const result = validate({ name: 'folder\\summary.pdf', mimeType: TYPES.pdf,
    data: `data:${TYPES.pdf};base64,${data}` });
  assert.equal(result.name, 'summary.pdf');
  assert.equal(result.buffer.toString(), '%PDF-1.7\nexample');
});

test('chat file rejects a mismatched type, non-PDF content, and oversize payload', () => {
  const data = Buffer.from('not a pdf').toString('base64');
  assert.throws(() => validate({ name: 'summary.pdf', mimeType: TYPES.docx,
    data: `data:${TYPES.docx};base64,${data}` }), { status: 400 });
  assert.throws(() => validate({ name: 'summary.pdf', mimeType: TYPES.pdf,
    data: `data:${TYPES.pdf};base64,${data}` }), { status: 400 });
  assert.throws(() => validate({ name: 'summary.pdf', mimeType: TYPES.pdf,
    data: `data:${TYPES.pdf};base64,${'A'.repeat(14 * 1024 * 1024)}` }), { status: 400 });
});
