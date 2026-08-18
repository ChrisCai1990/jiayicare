const ALLOWED_REPORT_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/bmp', 'application/pdf',
]);

function detectReportFileMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return '';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return '';
}

function assertReportFileBuffer(buffer, declaredMimeType) {
  const declared = String(declaredMimeType || '').toLowerCase();
  const detected = detectReportFileMime(buffer);
  if (!detected) throw new Error('文件内容无法识别，请上传真实的 PDF、JPG、PNG、GIF、WEBP、HEIC 或 BMP 文件');
  const heifEquivalent = detected === 'image/heic' && ['image/heic', 'image/heif'].includes(declared);
  if (declared !== detected && !heifEquivalent) throw new Error('文件内容与声明格式不一致，请重新选择原始文件');
  return declared === 'image/heif' && heifEquivalent ? 'image/heif' : detected;
}

function assertVerifiedReportOriginals(files) {
  if (!Array.isArray(files) || !files.length) throw new Error('请先上传报告原件，再创建报告记录');
  if (files.some(file => file.mimeType && !ALLOWED_REPORT_MIME_TYPES.has(file.mimeType))) {
    throw new Error('临时上传中包含不支持的文件格式');
  }
  return files;
}

module.exports = { ALLOWED_REPORT_MIME_TYPES, detectReportFileMime, assertReportFileBuffer, assertVerifiedReportOriginals };
