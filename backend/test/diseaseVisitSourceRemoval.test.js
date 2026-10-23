const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeVisitEntries, removeVisitSource } = require('../../shared/diseaseVisit.cjs');

test('撤销合并就医中的一份误入档资料，保留另一份及修订留痕', () => {
  const date = new Date('2025-01-22T00:00:00+08:00');
  const first = { _id:'entry-a', occurredAt:date, sourceReportId:'report-a', sourceTitle:'病历 A', sourceInstitution:'医院', verificationStatus:'source_verified', content:'原记录 A' };
  const second = { _id:'entry-b', occurredAt:date, sourceReportId:'report-b', sourceTitle:'病历 B', sourceInstitution:'医院', verificationStatus:'source_verified', content:'重复记录 B' };
  const merged = mergeVisitEntries(first, second, { at:new Date('2026-10-23T00:00:00Z'), name:'顾问' });
  const restored = removeVisitSource(merged, 'report-b', { at:new Date('2026-10-23T01:00:00Z'), name:'顾问', reason:'与已有病历重复' });
  assert.deepEqual(restored.sourceReportIds, ['report-a']);
  assert.equal(restored.sourceReportId, 'report-a');
  assert.equal(restored.content, '原记录 A');
  assert.equal(restored.visitDocuments.length, 1);
  assert.equal(restored.sourceRemovalHistory[0].reason, '与已有病历重复');
  assert.equal(restored.revisionHistory.at(-1).sourceReportIds.length, 2);
  assert.equal(removeVisitSource(first, 'report-a'), null);
});

test('撤销合并到历史病历的报告时，历史病历仍留在时间轴', () => {
  const date = new Date('2026-09-01T00:00:00+08:00');
  const legacy = { _id:'legacy', occurredAt:date, sourceType:'medical_record', sourceTitle:'历史病历', content:'原有病历' };
  const report = { _id:'new', occurredAt:date, sourceType:'medical_record', sourceReportId:'report-new', sourceTitle:'新增病历', content:'误入档内容' };
  const merged = mergeVisitEntries(legacy, report);
  const restored = removeVisitSource(merged, 'report-new', { reason:'与已有病历重复' });
  assert.equal(restored._id,'legacy');
  assert.equal(restored.content,'原有病历');
  assert.equal(restored.visitDocuments.length,1);
  assert.deepEqual(restored.sourceReportIds,[]);
});
