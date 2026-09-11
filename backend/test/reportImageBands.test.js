const test = require('node:test');
const assert = require('node:assert/strict');
const Jimp = require('jimp-compact');
const { splitImageHorizontalBands } = require('../src/utils/pdf');

function imageBuffer(width, height) {
  return new Promise((resolve, reject) => {
    new Jimp(width, height, 0xffffffff, (error, image) => {
      if (error) return reject(error);
      image.getBuffer(Jimp.MIME_PNG, (bufferError, buffer) => bufferError ? reject(bufferError) : resolve(buffer));
    });
  });
}

test('密集检验单按三个上下区域切分且每块保留完整宽度', async () => {
  const input = await imageBuffer(600, 840);
  const bands = await splitImageHorizontalBands(input, 3, 0.08);
  assert.equal(bands.length, 3);
  const dimensions = await Promise.all(bands.map(async base64 => {
    const image = await Jimp.read(Buffer.from(base64, 'base64'));
    return [image.bitmap.width, image.bitmap.height];
  }));
  assert.deepEqual(dimensions.map(item => item[0]), [600, 600, 600]);
  assert.ok(dimensions.every(item => item[1] > 280));
});
