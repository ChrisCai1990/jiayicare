const test = require('node:test');
const assert = require('node:assert/strict');
const { areSchedulersDisabled, getReportUploadFolder } = require('../src/utils/runtimeSafety');

test('test deployments can disable schedulers and startup repair', () => {
  assert.equal(areSchedulersDisabled({ DISABLE_SCHEDULERS: 'true' }), true);
  assert.equal(areSchedulersDisabled({ DISABLE_SCHEDULERS: 'TRUE' }), true);
  assert.equal(areSchedulersDisabled({}), false);
});

test('report uploads use an isolated, validated OSS prefix', () => {
  assert.equal(getReportUploadFolder({}), 'reports');
  assert.equal(getReportUploadFolder({ REPORT_UPLOAD_FOLDER: '/reports-test/ocr2/' }), 'reports-test/ocr2');
  assert.throws(() => getReportUploadFolder({ REPORT_UPLOAD_FOLDER: '../reports' }), /配置不安全/);
  assert.throws(() => getReportUploadFolder({ REPORT_UPLOAD_FOLDER: 'reports test' }), /配置不安全/);
});
