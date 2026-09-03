const test = require('node:test');
const assert = require('node:assert/strict');
const Jimp = require('jimp-compact');
const { readJpegExifOrientation, rotateImageBuffer } = require('../src/utils/imageOrientation');

function getBuffer(image, mime) {
  return new Promise((resolve, reject) => image.getBuffer(mime, (error, data) => error ? reject(error) : resolve(data)));
}

function jpegWithExifOrientation(orientation, littleEndian = true) {
  const tiff = Buffer.alloc(26);
  tiff.write(littleEndian ? 'II' : 'MM', 0, 'ascii');
  if (littleEndian) {
    tiff.writeUInt16LE(0x2a, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(orientation, 18);
  } else {
    tiff.writeUInt16BE(0x2a, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(orientation, 18);
  }
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const length = Buffer.alloc(2); length.writeUInt16BE(app1.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, app1, Buffer.from([0xff, 0xd9])]);
}

test('reads JPEG EXIF orientation in both byte orders', () => {
  assert.equal(readJpegExifOrientation(jpegWithExifOrientation(6)), 6);
  assert.equal(readJpegExifOrientation(jpegWithExifOrientation(8, false)), 8);
  assert.equal(readJpegExifOrientation(Buffer.from('not-a-jpeg')), 1);
});

test('rotates a fallback image before orientation retry', async () => {
  const source = await getBuffer(new Jimp(2, 3, 0xffffffff), Jimp.MIME_PNG);
  const rotated = await rotateImageBuffer(source, 90);
  const image = await Jimp.read(rotated);
  assert.equal(image.bitmap.width, 3);
  assert.equal(image.bitmap.height, 2);
});
