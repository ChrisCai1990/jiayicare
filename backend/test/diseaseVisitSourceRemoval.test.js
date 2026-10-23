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
