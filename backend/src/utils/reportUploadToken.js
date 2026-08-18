const jwt = require('jsonwebtoken');

const REPORT_UPLOAD_SCOPE = 'staff-report-upload';
const MAX_REPORT_UPLOAD_FILES = 50;

function requireSecret(secret) {
  if (!secret) throw new Error('临时上传凭证服务不可用');
  return secret;
}

function createReportUploadToken({ staffId, uploadId, file, secret, expiresIn = '2h' }) {
  if (!staffId || !uploadId || !file?.ossKey || !file?.fileUrl) throw new Error('临时上传文件信息不完整');
  return jwt.sign({
    scope: REPORT_UPLOAD_SCOPE,
    staffId: String(staffId),
    uploadId: String(uploadId),
    key: file.ossKey,
    url: file.fileUrl,
    mimeType: file.mimeType || '',
    fileSize: Number(file.fileSize || 0),
  }, requireSecret(secret), { expiresIn });
}

function verifyReportUploadTokens(tokens, { staffId, secret, requireOne = false } = {}) {
  if (!Array.isArray(tokens) || !tokens.length) {
    if (requireOne) throw new Error('缺少临时上传凭证，请重新选择文件');
    return [];
  }
  if (tokens.length > MAX_REPORT_UPLOAD_FILES) throw new Error(`单次最多上传 ${MAX_REPORT_UPLOAD_FILES} 个文件`);
  const signingSecret = requireSecret(secret);
  try {
    return tokens.map(token => {
      const claim = jwt.verify(String(token), signingSecret);
      if (claim.scope !== REPORT_UPLOAD_SCOPE || claim.staffId !== String(staffId) || !claim.uploadId || !claim.key || !claim.url) {
        throw new Error('invalid upload claim');
      }
      return {
        uploadId: claim.uploadId,
        fileUrl: claim.url,
        ossKey: claim.key,
        mimeType: claim.mimeType || '',
        fileSize: Number(claim.fileSize || 0),
      };
    });
  } catch (error) {
    if (error.message === '临时上传凭证服务不可用' || /单次最多上传/.test(error.message)) throw error;
    throw new Error('临时上传凭证无效或已过期，请重新选择文件');
  }
}

module.exports = {
  MAX_REPORT_UPLOAD_FILES,
  createReportUploadToken,
  verifyReportUploadTokens,
};
