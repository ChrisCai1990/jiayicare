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
const ProjectCategory = require('../src/models/ProjectCategory');
const MedicalReport = require('../src/models/MedicalReport');
const TemporaryReportUpload = require('../src/models/TemporaryReportUpload');
const ReportExtraction = require('../src/models/ReportExtraction');
const ReportRevision = require('../src/models/ReportRevision');
const ReportReviewEvent = require('../src/models/ReportReviewEvent');
const ReportScreeningCandidate = require('../src/models/ReportScreeningCandidate');
const ReportScreeningProjectionEvent = require('../src/models/ReportScreeningProjectionEvent');
const UserScreeningItem = require('../src/models/UserScreeningItem');
const { createReportUploadToken } = require('../src/utils/reportUploadToken');
const { buildFullOcrClaimFilter, buildPageOcrClaimFilter, buildOcrRunOwnerFilter } = require('../src/utils/reportOcrRun');
const { buildReviewSubmissionClaimFilter, buildReviewSubmissionOwnerFilter } = require('../src/utils/reportReviewRun');
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

    const uploadRequestId = crypto.randomUUID();
    const created = await request(baseUrl, '/api/staff/medical-reports', staffToken, {
      method: 'POST',
      body: JSON.stringify({
        patientId: String(user._id),
        title: 'E2E年度体检报告',
        type: 'annual',
        date: '2026-08-19',
        uploadRequestId,
        uploadTokens: [uploadToken],
      }),
    });
    const reportId = created.data._id;
    assert.ok(reportId);
    const attachedUpload = await TemporaryReportUpload.findById(upload._id).lean();
    assert.equal(attachedUpload.status, 'attached');
    assert.equal(String(attachedUpload.reportId), String(reportId));

    // 模拟服务端已成功建档、客户端却未收到响应后的重试。即使原上传凭证已失效，
    // 同一医护、会员和请求标识也只能取回原报告，不能重复建档。
    const replayed = await request(baseUrl, '/api/staff/medical-reports', staffToken, {
      method: 'POST',
      body: JSON.stringify({
        patientId: String(user._id),
        title: 'E2E年度体检报告',
        type: 'annual',
        date: '2026-08-19',
        uploadRequestId,
        uploadTokens: ['expired-or-invalid-upload-token'],
      }),
    });
    assert.equal(String(replayed.data._id), String(reportId));
    assert.equal(replayed.meta?.deduplicated, true);
    assert.equal(await MedicalReport.countDocuments({ user: user._id, uploadedBy: staff._id, uploadRequestId }), 1);

    const [firstFullClaim, secondFullClaim] = await Promise.all([
      MedicalReport.findOneAndUpdate(
        buildFullOcrClaimFilter(reportId),
        { $set: { aiStatus: 'processing', ocrProgress: { runId: 'e2e-full-1', updatedAt: new Date() } } },
        { new: true },
      ),
      MedicalReport.findOneAndUpdate(
        buildFullOcrClaimFilter(reportId),
        { $set: { aiStatus: 'processing', ocrProgress: { runId: 'e2e-full-2', updatedAt: new Date() } } },
        { new: true },
      ),
    ]);
    assert.equal(Number(Boolean(firstFullClaim)) + Number(Boolean(secondFullClaim)), 1);
    const activeFullRunId = firstFullClaim?.ocrProgress?.runId || secondFullClaim?.ocrProgress?.runId;
    const staleFullRunId = activeFullRunId === 'e2e-full-1' ? 'e2e-full-2' : 'e2e-full-1';
    const staleWrite = await MedicalReport.updateOne(buildOcrRunOwnerFilter(reportId, staleFullRunId), { $set: { aiSummary: 'must-not-win' } });
    assert.equal(staleWrite.modifiedCount, 0);

    await MedicalReport.updateOne({ _id: reportId }, { $set: { aiStatus: 'pending', ocrProgress: null, pageParseStatus: null } });
    const [firstPageClaim, secondPageClaim] = await Promise.all([
      MedicalReport.findOneAndUpdate(
        buildPageOcrClaimFilter(reportId),
        { $set: { pageParseStatus: { runId: 'e2e-page-1', status: 'processing', startedAt: new Date() } } },
        { new: true },
      ),
      MedicalReport.findOneAndUpdate(
        buildPageOcrClaimFilter(reportId),
        { $set: { pageParseStatus: { runId: 'e2e-page-2', status: 'processing', startedAt: new Date() } } },
        { new: true },
      ),
    ]);
    assert.equal(Number(Boolean(firstPageClaim)) + Number(Boolean(secondPageClaim)), 1);
    await MedicalReport.updateOne({ _id: reportId }, { $set: { pageParseStatus: null } });

    const extraction = await ReportExtraction.create({
      reportId,
      user: user._id,
      tenantId,
      version: 1,
      engine: { ocrVersion: 'v2.0', templateId: 'e2e' },
      source: {
        ossKeys: [upload.ossKey],
        files: [{ ossKey: upload.ossKey, mimeType: upload.mimeType, fileSize: upload.fileSize }],
        pageCount: 1,
      },
      items: [],
    });
    await MedicalReport.updateOne(
      { _id: reportId },
      { $set: { aiStatus: 'pending', ocrVersion: 'v2.0', currentExtractionId: extraction._id } },
    );

    const [firstReviewClaim, secondReviewClaim] = await Promise.all([
      MedicalReport.findOneAndUpdate(
        buildReviewSubmissionClaimFilter(reportId, extraction._id, new Date(), null),
        { $set: { reviewSubmission: { claimId: 'e2e-review-1', status: 'processing', startedAt: new Date() } } },
        { new: true },
      ),
      MedicalReport.findOneAndUpdate(
        buildReviewSubmissionClaimFilter(reportId, extraction._id, new Date(), null),
        { $set: { reviewSubmission: { claimId: 'e2e-review-2', status: 'processing', startedAt: new Date() } } },
        { new: true },
      ),
    ]);
    assert.equal(Number(Boolean(firstReviewClaim)) + Number(Boolean(secondReviewClaim)), 1);
    const activeReviewClaimId = firstReviewClaim?.reviewSubmission?.claimId || secondReviewClaim?.reviewSubmission?.claimId;
    const staleReviewClaimId = activeReviewClaimId === 'e2e-review-1' ? 'e2e-review-2' : 'e2e-review-1';
    const staleReviewCleanup = await MedicalReport.updateOne(
      buildReviewSubmissionOwnerFilter(reportId, staleReviewClaimId),
      { $unset: { reviewSubmission: 1 } },
    );
    assert.equal(staleReviewCleanup.modifiedCount, 0);
    assert.equal(await MedicalReport.findOneAndUpdate(
      buildFullOcrClaimFilter(reportId),
      { $set: { aiStatus: 'processing', ocrProgress: { runId: 'must-not-start', updatedAt: new Date() } } },
      { new: true },
    ), null);
    assert.equal(await MedicalReport.findOneAndUpdate(
      buildPageOcrClaimFilter(reportId),
      { $set: { pageParseStatus: { runId: 'must-not-start', status: 'processing', startedAt: new Date() } } },
      { new: true },
    ), null);
    await MedicalReport.updateOne(
      buildReviewSubmissionOwnerFilter(reportId, activeReviewClaimId),
      { $unset: { reviewSubmission: 1 } },
    );

    const savedDraft = await request(baseUrl, `/api/staff/medical-reports/${reportId}`, staffToken, {
      method: 'PATCH',
      body: JSON.stringify({
        aiStatus: 'pending',
        reviewAction: 'save_draft',
        reviewExtractionId: String(extraction._id),
        reviewBaseRevisionId: null,
        reportItems: [{ sourceItemId: 'e2e-draft-item', name: 'Draft item', value: 'draft' }],
      }),
    });
    assert.equal(savedDraft.data.ocrReviewMeta.lastAction, 'save_draft');
    const reportAfterDraft = await MedicalReport.findById(reportId).select('reviewSubmission currentExtractionId currentRevisionId dataEditLog ocrCorrectionLog').lean();
    assert.equal(reportAfterDraft.reviewSubmission ?? null, null);
    assert.equal(String(reportAfterDraft.currentExtractionId), String(extraction._id));
    assert.equal(reportAfterDraft.currentRevisionId ?? null, null);
    assert.ok(reportAfterDraft.dataEditLog.some(entry => entry.sourceItemId === 'e2e-draft-item' && entry.field === '__item_added__'));
    assert.ok(reportAfterDraft.ocrCorrectionLog.some(entry => entry.sourceItemId === 'e2e-draft-item' && entry.field === '__item_added__'));

    const reviewRequestId = crypto.randomUUID();
    await request(baseUrl, `/api/staff/medical-reports/${reportId}`, staffToken, {
      method: 'PATCH',
      body: JSON.stringify({
        aiStatus: 'reviewed',
        reviewAction: 'submit',
        reviewRequestId,
        reviewExtractionId: String(extraction._id),
        reviewBaseRevisionId: null,
        reportItems: [
          { sourceItemId: 'e2e-item-1', name: '空腹血糖', value: '5.2', unit: 'mmol/L', matchStatus: 'matched', screeningKey: 'chronic|糖尿病|空腹血糖' },
          { sourceItemId: 'e2e-item-2', name: '待归类检查', findings: '未见明显异常', itemType: 'imaging', matchStatus: 'unclassified' },
        ],
      }),
    });

    // Simulate interruption after the immutable revision and review event were stored,
    // but before the mutable report status was finalized. Retrying the same request
    // must repair the status without creating a second revision.
    await MedicalReport.updateOne(
      { _id: reportId },
      { $set: { audit_status: 'unaudited' }, $unset: { audited_by: 1, audited_at: 1, staffAuditSnapshot: 1 } },
    );
    const recoveredReview = await request(baseUrl, `/api/staff/medical-reports/${reportId}`, staffToken, {
      method: 'PATCH',
      body: JSON.stringify({ aiStatus: 'reviewed', reviewAction: 'submit', reviewRequestId }),
    });
    assert.equal(recoveredReview.meta.deduplicatedReview, true);
    const reportAfterReviewRecovery = await MedicalReport.findById(reportId).lean();
    assert.equal(reportAfterReviewRecovery.audit_status, 'audited');
    assert.ok(reportAfterReviewRecovery.staffAuditSnapshot?.snapshotAt);
    assert.equal(await ReportRevision.countDocuments({ reportId }), 1);

    const staleReviewResponse = await fetch(`${baseUrl}/api/staff/medical-reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        aiStatus: 'reviewed',
        reviewAction: 'submit',
        reviewRequestId: crypto.randomUUID(),
        reviewExtractionId: String(extraction._id),
        reviewBaseRevisionId: null,
        reportItems: [{ sourceItemId: 'stale-item', name: '过期审核内容', value: '不得覆盖' }],
      }),
    });
    const staleReviewBody = await staleReviewResponse.json();
    assert.equal(staleReviewResponse.status, 409);
    assert.equal(staleReviewBody.code, 'REPORT_REVIEW_VERSION_CHANGED');

    const staleDraftResponse = await fetch(`${baseUrl}/api/staff/medical-reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        aiStatus: 'pending',
        reviewAction: 'save_draft',
        reviewExtractionId: String(extraction._id),
        reviewBaseRevisionId: null,
        reportItems: [{ sourceItemId: 'stale-draft-item', name: 'Stale draft', value: 'must-not-win' }],
      }),
    });
    const staleDraftBody = await staleDraftResponse.json();
    assert.equal(staleDraftResponse.status, 409);
    assert.equal(staleDraftBody.code, 'REPORT_REVIEW_VERSION_CHANGED');

    const stalePageParseResponse = await fetch(`${baseUrl}/api/staff/medical-reports/${reportId}/parse-page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        pageNum: 1,
        expectedExtractionId: String(extraction._id),
        expectedBaseRevisionId: null,
      }),
    });
    const stalePageParseBody = await stalePageParseResponse.json();
    assert.equal(stalePageParseResponse.status, 409);
    assert.equal(stalePageParseBody.code, 'REPORT_REVIEW_VERSION_CHANGED');

    const [report, revision, event, candidate, projection, automaticProjectionEvent] = await Promise.all([
      MedicalReport.findById(reportId).lean(),
      ReportRevision.findOne({ reportId }).lean(),
      ReportReviewEvent.findOne({ reportId, requestId: reviewRequestId }).lean(),
      ReportScreeningCandidate.findOne({ reportId, sourceItemId: 'e2e-item-2' }).lean(),
      UserScreeningItem.findOne({ reportId, itemId: 'chronic|糖尿病|空腹血糖' }).lean(),
      ReportScreeningProjectionEvent.findOne({ reportId, itemId: 'chronic|糖尿病|空腹血糖', action: 'activated' }).lean(),
    ]);
    assert.equal(report.audit_status, 'audited');
    assert.ok(revision && event && candidate && projection && automaticProjectionEvent);
    assert.equal(revision.review.auditStatus, 'audited');
    assert.equal(String(revision.review.reviewerId), String(staff._id));
    assert.ok(revision.review.reviewedAt);
    assert.equal(String(report.currentRevisionId), String(revision._id));
    assert.equal(String(projection.reportRevisionId), String(revision._id));
    assert.equal(automaticProjectionEvent.source, 'automatic_match');
    assert.equal(String(automaticProjectionEvent.actor.id), String(staff._id));

    const integrityBefore = await request(baseUrl, `/api/staff/medical-reports/${reportId}/review-integrity`, staffToken);
    assert.equal(integrityBefore.data.consistent, true, JSON.stringify(integrityBefore.data));

    const screeningRoot = await ProjectCategory.create({ tenantId, name: 'E2E专项检查', status: 'active' });
    const screeningParent = await ProjectCategory.create({ tenantId, name: '其他检查', parent: screeningRoot._id, status: 'active' });
    await ProjectCategory.create({ tenantId, name: '待归类检查', parent: screeningParent._id, status: 'active' });
    const resolvedScreeningKey = `${screeningRoot._id}|其他检查|待归类检查`;
    const resolvedCandidate = await request(
      baseUrl,
      `/api/staff/medical-reports/${reportId}/screening-candidates/${candidate._id}`,
      staffToken,
      { method: 'PATCH', body: JSON.stringify({ action: 'resolve', screeningKey: resolvedScreeningKey }) },
    );
    assert.equal(resolvedCandidate.data.status, 'resolved');
    const storedResolvedCandidate = await ReportScreeningCandidate.findById(candidate._id).lean();
    assert.equal(storedResolvedCandidate.status, 'resolved');
    assert.equal(storedResolvedCandidate.resolvedScreeningKey, resolvedScreeningKey);
    const candidateProjection = await UserScreeningItem.findOne({ reportId, itemId: resolvedScreeningKey }).lean();
    const candidateProjectionEvent = await ReportScreeningProjectionEvent.findOne({
      reportRevisionId: revision._id,
      itemId: resolvedScreeningKey,
      action: 'activated',
    }).lean();
    assert.equal(String(candidateProjection.reportRevisionId), String(revision._id));
    assert.equal(candidateProjectionEvent.source, 'candidate_resolution');
    assert.equal(String(candidateProjectionEvent.actor.id), String(staff._id));
    const reportAfterCandidate = await MedicalReport.findById(reportId).select('reviewSubmission currentRevisionId').lean();
    assert.equal(reportAfterCandidate.reviewSubmission ?? null, null);
    assert.equal(String(reportAfterCandidate.currentRevisionId), String(revision._id));

    await Promise.all([
      UserScreeningItem.deleteOne({ _id: projection._id }),
      ReportScreeningProjectionEvent.deleteOne({ _id: automaticProjectionEvent._id }),
    ]);
    const brokenIntegrity = await request(baseUrl, `/api/staff/medical-reports/${reportId}/review-integrity`, staffToken);
    assert.equal(brokenIntegrity.data.consistent, false);
    assert.deepEqual(brokenIntegrity.data.missingProjectionKeys, ['chronic|糖尿病|空腹血糖']);

    const reconciled = await request(baseUrl, `/api/staff/medical-reports/${reportId}/review-integrity/reconcile`, staffToken, {
      method: 'POST',
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    assert.equal(reconciled.data.consistent, true, JSON.stringify(reconciled.data));
    const reconciledProjectionEvent = await ReportScreeningProjectionEvent.findOne({
      reportRevisionId: revision._id,
      itemId: 'chronic|糖尿病|空腹血糖',
      action: 'activated',
    }).lean();
    assert.equal(reconciledProjectionEvent.source, 'version_reconcile');
    assert.equal(String(reconciledProjectionEvent.actor.id), String(staff._id));

    const userReports = await request(baseUrl, '/api/reports', userToken);
    assert.equal(userReports.data.length, 1);
    assert.equal(userReports.data[0].reportItems[0].name, '空腹血糖');
    assert.equal('evidenceText' in userReports.data[0].reportItems[0], false);
    assert.equal('ossKey' in userReports.data[0], false);
    assert.equal('currentRevisionId' in userReports.data[0], false);

    console.log(JSON.stringify({
      success: true,
      database: databaseName,
      checks: ['verified_original_attached', 'upload_retry_deduplicated', 'ocr_run_claim_is_atomic', 'late_ocr_write_rejected', 'page_ocr_claim_is_atomic', 'review_submission_claim_is_atomic', 'draft_version_bound', 'draft_correction_traced', 'review_finalize_recovered', 'stale_review_version_rejected', 'stale_draft_version_rejected', 'stale_page_parse_rejected', 'revision_published', 'review_event_recorded', 'candidate_created', 'candidate_resolution_serialized', 'projection_created', 'integrity_detected_and_reconciled', 'user_view_sanitized'],
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
