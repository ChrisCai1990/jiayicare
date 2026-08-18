const test = require('node:test');
const assert = require('node:assert/strict');
const { areSchedulersDisabled, getReportUploadFolder, getMongoDatabaseName, assertDeploymentEnvironment } = require('../src/utils/runtimeSafety');

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

test('Mongo database name is parsed without exposing credentials', () => {
  assert.equal(getMongoDatabaseName('mongodb://user:secret@127.0.0.1:27017/jiayicare_staging?authSource=admin'), 'jiayicare_staging');
  assert.equal(getMongoDatabaseName('mongodb+srv://user:secret@example.test/jiayicare'), 'jiayicare');
  assert.equal(getMongoDatabaseName('not-a-uri'), '');
});

test('staging refuses production database, OSS prefix, public binding and schedulers', () => {
  const valid = {
    DEPLOYMENT_ENV: 'staging',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/jiayicare_staging',
    REPORT_UPLOAD_FOLDER: 'reports-staging/ocr2',
    DISABLE_SCHEDULERS: 'true',
    BIND_HOST: '127.0.0.1',
    PORT: '3100',
  };
  assert.equal(assertDeploymentEnvironment(valid).deploymentEnv, 'staging');
  assert.throws(() => assertDeploymentEnvironment({ ...valid, MONGODB_URI: 'mongodb://127.0.0.1:27017/jiayicare' }), /拒绝连接数据库/);
  assert.throws(() => assertDeploymentEnvironment({ ...valid, REPORT_UPLOAD_FOLDER: 'reports' }), /reports-staging/);
  assert.throws(() => assertDeploymentEnvironment({ ...valid, DISABLE_SCHEDULERS: 'false' }), /DISABLE_SCHEDULERS=true/);
  assert.throws(() => assertDeploymentEnvironment({ ...valid, BIND_HOST: '0.0.0.0' }), /127\.0\.0\.1/);
  assert.throws(() => assertDeploymentEnvironment({ ...valid, PORT: '3000' }), /非生产端口/);
});

test('production rejects staging resources when formal environment flag is enabled', () => {
  const valid = {
    DEPLOYMENT_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/jiayicare',
    REPORT_UPLOAD_FOLDER: 'reports',
    DISABLE_SCHEDULERS: 'false',
    PORT: '3000',
  };
  assert.equal(assertDeploymentEnvironment(valid).deploymentEnv, 'production');
  assert.throws(() => assertDeploymentEnvironment({ ...valid, MONGODB_URI: 'mongodb://127.0.0.1:27017/jiayicare_staging' }), /生产环境拒绝/);
  assert.throws(() => assertDeploymentEnvironment({ ...valid, REPORT_UPLOAD_FOLDER: 'reports-staging/ocr2' }), /必须为 reports/);
});
