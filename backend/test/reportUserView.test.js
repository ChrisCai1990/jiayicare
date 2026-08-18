const test = require('node:test');
const assert = require('node:assert/strict');
const { toUserReport } = require('../src/utils/reportUserView');

const baseReport = overrides => ({
  _id: 'report-1', title: '年度体检', audit_status: 'unaudited', aiStatus: 'pending',
  status: 'analyzed', reportItems: [{ name: '草稿血糖', value: '99' }], aiSummary: '草稿结论',
  currentExtractionId: 'extract-1', currentRevisionId: 'revision-1',
  ocrReviewMeta: { lastActionBy: { name: '审核员' } },
  ocrCorrectionLog: [{ oldValue: '1', newValue: '2' }],
  ...overrides,
});

test('未审核 OCR 草稿不向用户返回', () => {
  const result = toUserReport(baseReport());
  assert.deepEqual(result.reportItems, []);
  assert.equal(result.aiSummary, '');
  assert.equal(result.status, 'pending');
  assert.equal(result.derivedDataStatus, 'under_review');
  assert.equal('ocrReviewMeta' in result, false);
  assert.equal('ocrCorrectionLog' in result, false);
  assert.equal('currentRevisionId' in result, false);
});

test('存在发布版本时始终返回发布版本而非当前 OCR 工作副本', () => {
  const revision = {
    revisionNo: 3,
    items: [{
      name: '已审核血糖', value: '5.2', sourceItemId: 'internal-item-1', sourcePage: 9, sourcePages: [9, 10],
      sourceEvidence: [{ page: 9, text: '内部证据', method: 'text_layer' }],
      ocrConfidence: 0.61, evidenceText: '内部识别证据', qualityFlags: ['low_confidence'],
      screeningKey: 'chronic.diabetes', matchConfidence: 0.92,
    }],
    aiSummary: '已审核结论',
  };
  const result = toUserReport(baseReport({
    aiStatus: 'processing', tenantId: 'tenant-1', ossKey: 'private/object-key.pdf',
    ossKeys: ['private/object-key.pdf'], uploadedBy: 'staff-1', uploadRequestId: 'request-1',
    familyDoctorAudit: { status: 'audited', byName: '内部医生' },
  }), revision);
  assert.deepEqual(result.reportItems, [{ name: '已审核血糖', value: '5.2' }]);
  assert.equal(result.aiSummary, '已审核结论');
  assert.equal(result.aiStatus, 'reviewed');
  assert.equal(result.publishedRevisionNo, 3);
  for (const field of ['tenantId', 'ossKey', 'ossKeys', 'uploadedBy', 'uploadRequestId', 'familyDoctorAudit']) {
    assert.equal(field in result, false);
  }
});

test('版本回填前重新识别时使用原人工审核快照', () => {
  const snapshotItems = [{ name: '旧审核血糖', value: '5.1' }];
  const result = toUserReport(baseReport({
    currentRevisionId: null,
    staffAuditSnapshot: { snapshotAt: new Date(), reportItems: snapshotItems },
  }));
  assert.deepEqual(result.reportItems, snapshotItems);
  assert.equal(result.aiStatus, 'reviewed');
  assert.equal('staffAuditSnapshot' in result, false);
});

test('历史已审核报告在未回填版本前保持兼容', () => {
  const result = toUserReport(baseReport({
    currentRevisionId: null,
    audit_status: 'audited',
    aiStatus: 'reviewed',
    reportItems: [{ name: '历史血糖', value: '5.3', evidenceText: '旧内部证据', ocrConfidence: 0.5 }],
  }));
  assert.equal(result.reportItems.length, 1);
  assert.deepEqual(result.reportItems[0], { name: '历史血糖', value: '5.3' });
  assert.equal(result.derivedDataStatus, 'reviewed');
});
