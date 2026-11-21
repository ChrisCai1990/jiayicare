const TYPES = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});
const LIMIT = 10 * 1024 * 1024;
const IMAGE_LIMIT = 5 * 1024 * 1024;
const IMAGE_TYPES = Object.freeze({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' });

function validate(input) {
  const name = String(input?.name || '').split(/[\\/]/).pop().trim().slice(0, 120);
  const extension = name.split('.').pop()?.toLowerCase();
  const mimeType = TYPES[extension];
  if (!mimeType || input?.mimeType !== mimeType) throw Object.assign(new Error('仅支持 PDF、Word、Excel、PPT 文件'), { status: 400 });
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input?.data || '');
  if (!match || match[1] !== mimeType || match[2].length > Math.ceil(LIMIT / 3) * 4)
    throw Object.assign(new Error('文件格式无效或超过 10 MB'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > LIMIT || (extension === 'pdf' ? buffer.subarray(0, 5).toString() !== '%PDF-' : buffer.subarray(0, 2).toString() !== 'PK'))
    throw Object.assign(new Error('文件内容无效或超过 10 MB'), { status: 400 });
  return { name, mimeType, buffer };
}

function validateGroupImage(input) {
  const name = String(input?.name || '').split(/[\\/]/).pop().trim().slice(0, 120);
  const extension = name.split('.').pop()?.toLowerCase();
  const mimeType = IMAGE_TYPES[extension];
  if (!mimeType || input?.mimeType !== mimeType) throw Object.assign(new Error('图片仅支持 JPG、PNG、WebP、GIF'), { status: 400 });
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input?.data || '');
  if (!match || match[1] !== mimeType || match[2].length > Math.ceil(IMAGE_LIMIT / 3) * 4)
    throw Object.assign(new Error('图片格式无效或超过 5 MB'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  const detected = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
        : buffer.toString('ascii', 0, 3) === 'GIF' ? 'image/gif' : '';
  if (!buffer.length || buffer.length > IMAGE_LIMIT || detected !== mimeType)
    throw Object.assign(new Error('图片内容无效或超过 5 MB'), { status: 400 });
  return { name, mimeType, buffer };
}

module.exports = { validate, validateGroupImage, TYPES, LIMIT, IMAGE_LIMIT };
