const test = require('node:test');
const assert = require('node:assert/strict');

const { toImageDataUrl } = require('../src/utils/ai');

test('preserves supplied image data URL and detects rendered JPEG bytes', () => {
  const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2w==';
  assert.equal(toImageDataUrl(jpeg), `data:image/jpeg;base64,${jpeg}`);
  assert.equal(toImageDataUrl(`data:image/webp;base64,UklGRg==`), 'data:image/webp;base64,UklGRg==');
});
