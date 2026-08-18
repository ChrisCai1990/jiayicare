const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_REPORT_UPLOAD_FILES,
  createReportUploadToken,
  verifyReportUploadTokens,
} = require('../src/utils/reportUploadToken');

const secret = 'unit-test-report-upload-secret';
const staffId = 'staff-a';
const uploadId = '64b000000000000000000001';
const file = {
  ossKey: 'reports/example.pdf',
  fileUrl: 'https://private-bucket.example/reports/example.pdf',
  mimeType: 'application/pdf',
  fileSize: 12345,
};

test('report upload token binds the original file to the uploading staff member', () => {
  const token = createReportUploadToken({ staffId, uploadId, file, secret });
  const [verified] = verifyReportUploadTokens([token], { staffId, secret, requireOne: true });

  assert.deepEqual(verified, {
    uploadId,
    fileUrl: file.fileUrl,
    ossKey: file.ossKey,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
  });
});

test('another staff member cannot consume or inspect the temporary upload', () => {
  const token = createReportUploadToken({ staffId, uploadId, file, secret });

  assert.throws(
    () => verifyReportUploadTokens([token], { staffId: 'staff-b', secret, requireOne: true }),
    /无效或已过期/,
  );
});

test('expired upload tokens fail closed with a stable user-facing error', () => {
  const token = createReportUploadToken({ staffId, uploadId, file, secret, expiresIn: -1 });

  assert.throws(
    () => verifyReportUploadTokens([token], { staffId, secret, requireOne: true }),
    /无效或已过期/,
  );
});

test('quick metadata extraction can require exactly an authenticated temporary upload', () => {
  assert.throws(
    () => verifyReportUploadTokens([], { staffId, secret, requireOne: true }),
    /缺少临时上传凭证/,
  );
});

test('a single report upload has a bounded file count', () => {
  const tokens = Array.from({ length: MAX_REPORT_UPLOAD_FILES + 1 }, () => 'unused');

  assert.throws(
    () => verifyReportUploadTokens(tokens, { staffId, secret }),
    new RegExp(`最多上传 ${MAX_REPORT_UPLOAD_FILES} 个文件`),
  );
});
