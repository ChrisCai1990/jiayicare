const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, validateGroupImage, TYPES } = require('../src/utils/chatFile');

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

test('group chat accepts a real PNG image and rejects a disguised file', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const data = `data:image/png;base64,${png.toString('base64')}`;
  const image = validateGroupImage({ name: '粘贴图片.png', mimeType: 'image/png', data });
  assert.equal(image.mimeType, 'image/png');
  assert.deepEqual(image.buffer, png);
  assert.throws(() => validateGroupImage({ name: 'photo.jpg', mimeType: 'image/jpeg', data }), { status: 400 });
  assert.throws(() => validateGroupImage({ name: 'photo.png', mimeType: 'image/png', data: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}` }), { status: 400 });
});
