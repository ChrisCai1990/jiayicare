const crypto = require('crypto');
const oss = require('./oss');
function normalizeName(value) {
  const name = String(value || '附件');
  // Multipart header filenames were decoded as Latin-1 by the upload parser.
  // Only reverse this when the bytes are valid UTF-8; preserve real Unicode names.
  if (!/[^\x00-\xff]/.test(name)) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1')); } catch {}
  }
  return name;
}
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
module.exports = { normalizeName, fileType, store, stream: key => oss.getObjectStream(key), remove: key => oss.deleteFile(key) };
