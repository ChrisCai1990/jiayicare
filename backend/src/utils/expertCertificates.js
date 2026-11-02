const crypto = require('crypto');
const oss = require('./oss');
function fileType(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return { mimeType: 'application/pdf', ext: 'pdf' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { mimeType: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mimeType: 'image/png', ext: 'png' };
  if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return { mimeType: 'image/webp', ext: 'webp' };
  throw new Error('请上传 JPG、PNG、WebP 图片或 PDF 文件');
}
async function store(file, row) {
  const { mimeType, ext } = fileType(file.buffer);
  const key = `expert-certificates/${row.tenantId}/${row._id}/${crypto.randomUUID()}.${ext}`;
  await oss.getClient().put(key, file.buffer, { mime: mimeType, headers: { 'x-oss-object-acl': 'private' } });
  return { key, mimeType, size: file.buffer.length };
}
module.exports = { fileType, store, stream: key => oss.getObjectStream(key), remove: key => oss.deleteFile(key) };
