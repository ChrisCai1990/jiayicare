const test = require('node:test');
const assert = require('node:assert/strict');
const Jimp = require('jimp-compact');
const { splitImageHorizontal } = require('../src/utils/pdf');

test('dense page crop splits into two overlapping readable images', async () => {
  const original = new Jimp(320, 240, 0xffffffff);
  const source = await original.getBufferAsync(Jimp.MIME_JPEG);
  const halves = await splitImageHorizontal(source);
  assert.equal(halves.length, 2);
  const decoded = await Promise.all(halves.map(value => Jimp.read(Buffer.from(value, 'base64'))));
  assert.deepEqual(decoded.map(image => image.bitmap.width), [320, 320]);
  assert.ok(decoded[0].bitmap.height > 120);
  assert.ok(decoded[1].bitmap.height > 120);
  assert.ok(decoded.every(image => image.bitmap.height < 180));
});
