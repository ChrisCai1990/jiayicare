const TYPES = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});
const LIMIT = 10 * 1024 * 1024;

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

module.exports = { validate, TYPES, LIMIT };
