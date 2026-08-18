const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TemporaryReportUpload = require('../src/models/TemporaryReportUpload');

test('temporary report uploads remain auditable instead of expiring their database evidence', () => {
  const indexes = TemporaryReportUpload.schema.indexes();
  const expiresIndex = indexes.find(([fields]) => fields.expiresAt === 1 && Object.keys(fields).length === 1);

  assert.ok(expiresIndex, 'expiresAt must be indexed for bounded cleanup scans');
  assert.equal(expiresIndex[1].expireAfterSeconds, undefined, 'Mongo TTL must not erase cleanup evidence before OSS deletion');
});

test('new report uploads start temporary and carry an explicit retention deadline', () => {
  const upload = new TemporaryReportUpload({
    staffId: new mongoose.Types.ObjectId(),
    ossKey: 'reports/test.pdf',
    fileUrl: 'https://private.example/reports/test.pdf',
    expiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal(upload.validateSync(), undefined);
  assert.equal(upload.status, 'temporary');
  assert.equal(upload.reportId, null);
});

test('failed original-file deletion remains in a retryable audited state', () => {
  const upload = new TemporaryReportUpload({
    staffId: new mongoose.Types.ObjectId(),
    ossKey: 'reports/delete-retry.pdf',
    fileUrl: 'https://private.example/reports/delete-retry.pdf',
    expiresAt: new Date(),
    status: 'cleanup_failed',
    cleanupError: 'temporary OSS failure',
  });

  assert.equal(upload.validateSync(), undefined);
  assert.equal(upload.status, 'cleanup_failed');
  assert.equal(upload.cleanupError, 'temporary OSS failure');
});
