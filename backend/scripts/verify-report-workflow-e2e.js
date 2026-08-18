/*
 * Isolated report workflow verification.
 * Uses only mongodb://127.0.0.1 and a random database whose name starts with
 * jiayicare_report_e2e_. It never calls OSS/OCR and drops only that database.
 */
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
// 防止异步索引构建在 finally 的 dropDatabase 之后重新创建空测试库。
mongoose.set('autoIndex', false);

const databaseName = `jiayicare_report_e2e_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
if (!/^jiayicare_report_e2e_[a-z0-9_]+$/.test(databaseName)) throw new Error('测试数据库名称不安全');
const mongoUri = `mongodb://127.0.0.1:27017/${databaseName}`;
process.env.JWT_SECRET = `local-e2e-${crypto.randomBytes(24).toString('hex')}`;
process.env.NODE_ENV = 'test';

const Admin = require('../src/models/Admin');
const User = require('../src/models/User');
const MedicalReport = require('../src/models/MedicalReport');
const TemporaryReportUpload = require('../src/models/TemporaryReportUpload');
const ReportRevision = require('../src/models/ReportRevision');
const ReportReviewEvent = require('../src/models/ReportReviewEvent');
const ReportScreeningCandidate = require('../src/models/ReportScreeningCandidate');
const UserScreeningItem = require('../src/models/UserScreeningItem');
const { createReportUploadToken } = require('../src/utils/reportUploadToken');
const staffRouter = require('../src/routes/staff');
const reportsRouter = require('../src/routes/reports');

async function request(baseUrl, path, token, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${body.message || JSON.stringify(body)}`);
  return body;
}

async function main() {
  let server;
  await mongoose.connect(mongoUri);
  try {
    const tenantId = new mongoose.Types.ObjectId();
    const [staff, user] = await Promise.all([
      Admin.create({ username: `e2e_${Date.now()}`, password: crypto.randomBytes(16).toString('hex'), name: 'E2E审核员', role: 'healthManager', tenantId }),
      User.create({ name: 'E2E会员', gender: '未知', tenantId }),
    ]);
    const staffToken = jwt.sign({ id: staff._id, type: 'admin', role: staff.role }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const userToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const upload = await TemporaryReportUpload.create({
      staffId: staff._id,
      tenantId,
      ossKey: `reports/e2e/${crypto.randomUUID()}.pdf`,
      fileUrl: 'https://e2e.invalid/report.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      status: 'temporary',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const uploadToken = createReportUploadToken({
      staffId: staff._id,
      uploadId: upload._id,
      file: upload,
      secret: process.env.JWT_SECRET,
    });

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/staff', staffRouter);
    app.use('/api/reports', reportsRouter);
    server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const created = await request(baseUrl, '/api/staff/medical-reports', staffToken, {
      method: 'POST',
      body: JSON.stringify({
        patientId: String(user._id),
        title: 'E2E年度体检报告',
        type: 'annual',
        date: '2026-08-19',
        uploadRequestId: crypto.randomUUID(),
        uploadTokens: [uploadToken],
      }),
    });
    const reportId = created.data._id;
    assert.ok(reportId);
    const attachedUpload = await TemporaryReportUpload.findById(upload._id).lean();
    assert.equal(attachedUpload.status, 'attached');
    assert.equal(String(attachedUpload.reportId), String(reportId));

    const reviewRequestId = crypto.randomUUID();
    await request(baseUrl, `/api/staff/medical-reports/${reportId}`, staffToken, {
      method: 'PATCH',
      body: JSON.stringify({
        aiStatus: 'reviewed',
        reviewAction: 'submit',
        reviewRequestId,
        reportItems: [
          { sourceItemId: 'e2e-item-1', name: '空腹血糖', value: '5.2', unit: 'mmol/L', matchStatus: 'matched', screeningKey: 'chronic|糖尿病|空腹血糖' },
          { sourceItemId: 'e2e-item-2', name: '待归类检查', findings: '未见明显异常', itemType: 'imaging', matchStatus: 'unclassified' },
        ],
      }),
    });

    const [report, revision, event, candidate, projection] = await Promise.all([
      MedicalReport.findById(reportId).lean(),
      ReportRevision.findOne({ reportId }).lean(),
      ReportReviewEvent.findOne({ reportId, requestId: reviewRequestId }).lean(),
      ReportScreeningCandidate.findOne({ reportId, sourceItemId: 'e2e-item-2' }).lean(),
      UserScreeningItem.findOne({ reportId, itemId: 'chronic|糖尿病|空腹血糖' }).lean(),
    ]);
    assert.equal(report.audit_status, 'audited');
    assert.ok(revision && event && candidate && projection);
    assert.equal(String(report.currentRevisionId), String(revision._id));
    assert.equal(String(projection.reportRevisionId), String(revision._id));

    const integrityBefore = await request(baseUrl, `/api/staff/medical-reports/${reportId}/review-integrity`, staffToken);
    assert.equal(integrityBefore.data.consistent, true, JSON.stringify(integrityBefore.data));

    await UserScreeningItem.deleteOne({ _id: projection._id });
    const brokenIntegrity = await request(baseUrl, `/api/staff/medical-reports/${reportId}/review-integrity`, staffToken);
    assert.equal(brokenIntegrity.data.consistent, false);
    assert.deepEqual(brokenIntegrity.data.missingProjectionKeys, ['chronic|糖尿病|空腹血糖']);

    const reconciled = await request(baseUrl, `/api/staff/medical-reports/${reportId}/review-integrity/reconcile`, staffToken, {
      method: 'POST',
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    assert.equal(reconciled.data.consistent, true);

    const userReports = await request(baseUrl, '/api/reports', userToken);
    assert.equal(userReports.data.length, 1);
    assert.equal(userReports.data[0].reportItems[0].name, '空腹血糖');
    assert.equal('evidenceText' in userReports.data[0].reportItems[0], false);
    assert.equal('ossKey' in userReports.data[0], false);
    assert.equal('currentRevisionId' in userReports.data[0], false);

    console.log(JSON.stringify({
      success: true,
      database: databaseName,
      checks: ['verified_original_attached', 'revision_published', 'review_event_recorded', 'candidate_created', 'projection_created', 'integrity_detected_and_reconciled', 'user_view_sanitized'],
    }, null, 2));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState) {
      if (!mongoose.connection.name.startsWith('jiayicare_report_e2e_')) throw new Error('拒绝删除非 E2E 数据库');
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
