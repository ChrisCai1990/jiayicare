const Jimp = require('jimp-compact');

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function readJpegExifOrientation(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if (marker === 0xe1 && length >= 10 && buffer.toString('ascii', offset + 4, offset + 10) === 'Exif\0\0') {
      const tiff = offset + 10;
      const littleEndian = buffer.toString('ascii', tiff, tiff + 2) === 'II';
      if (!littleEndian && buffer.toString('ascii', tiff, tiff + 2) !== 'MM') return 1;
      const read16 = pos => littleEndian ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos);
      const read32 = pos => littleEndian ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos);
      if (read16(tiff + 2) !== 0x2a) return 1;
      const ifd = tiff + read32(tiff + 4);
      if (ifd + 2 > buffer.length) return 1;
      const count = read16(ifd);
      for (let index = 0; index < count; index++) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > buffer.length) return 1;
        if (read16(entry) === 0x0112) {
          const orientation = read16(entry + 8);
          return orientation >= 1 && orientation <= 8 ? orientation : 1;
        }
      }
      return 1;
    }
    offset += length + 2;
  }
  return 1;
}

function createImage(width, height) {
  return new Promise((resolve, reject) => {
    new Jimp(width, height, 0xffffffff, (error, image) => error ? reject(error) : resolve(image));
  });
}

async function transformForExifOrientation(image, orientation) {
  const sourceWidth = image.bitmap.width;
  const sourceHeight = image.bitmap.height;
  const swapsDimensions = [5, 6, 7, 8].includes(orientation);
  const output = await createImage(swapsDimensions ? sourceHeight : sourceWidth, swapsDimensions ? sourceWidth : sourceHeight);
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      let targetX = x;
      let targetY = y;
      switch (orientation) {
        case 2: targetX = sourceWidth - 1 - x; break;
        case 3: targetX = sourceWidth - 1 - x; targetY = sourceHeight - 1 - y; break;
        case 4: targetY = sourceHeight - 1 - y; break;
        case 5: targetX = y; targetY = x; break;
        case 6: targetX = sourceHeight - 1 - y; targetY = x; break;
        case 7: targetX = sourceHeight - 1 - y; targetY = sourceWidth - 1 - x; break;
        case 8: targetX = y; targetY = sourceWidth - 1 - x; break;
        default: break;
      }
      const sourceOffset = (y * sourceWidth + x) * 4;
      const targetOffset = (targetY * output.bitmap.width + targetX) * 4;
      image.bitmap.data.copy(output.bitmap.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return output;
}

function toBuffer(image, mimeType) {
  const outputMime = mimeType === 'image/png' ? Jimp.MIME_PNG : Jimp.MIME_JPEG;
  return new Promise((resolve, reject) => {
    image.getBuffer(outputMime, (error, data) => error ? reject(error) : resolve(data));
  });
}

async function normalizeImageOrientation(buffer, mimeType) {
  if (!IMAGE_MIME_TYPES.has(mimeType)) return { buffer, mimeType, corrected: false };
  const orientation = readJpegExifOrientation(buffer);
  if (orientation === 1) return { buffer, mimeType, corrected: false };
  const image = await Jimp.read(buffer);
  const correctedBuffer = await toBuffer(await transformForExifOrientation(image, orientation), mimeType);
  return { buffer: correctedBuffer, mimeType, corrected: true };
}

async function rotateImageBuffer(buffer, degrees) {
  const image = await Jimp.read(buffer);
  const normalizedDegrees = ((degrees % 360) + 360) % 360;
  const orientation = ({ 0: 1, 90: 6, 180: 3, 270: 8 })[normalizedDegrees];
  if (!orientation) throw new Error(`仅支持90度倍数旋转，当前为${degrees}`);
  return toBuffer(await transformForExifOrientation(image, orientation), 'image/png');
}

module.exports = { normalizeImageOrientation, readJpegExifOrientation, rotateImageBuffer };
